import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import { XMLParser } from 'fast-xml-parser';
import JsBarcode from 'jsbarcode';
import { CTe, CTeRoot } from '../types/cte';

interface PDFStructure {
    doc: PDFDocument;
    pages: any[];
    width: number;
    height: number;
    mtBlock: number;
    barCode: string | null;
}

async function DACTE(data: { xml: string; logo?: any; consulta?: string; imgDemo?: any }): Promise<Uint8Array> {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });
    const xmlNormalized = data.xml.replace(/\r?\n|\r/g, "");
    const jsonObj: CTeRoot = parser.parse(xmlNormalized);

    function getCaseInsensitiveKey(obj: any, key: string): any {
        if (!obj) return undefined;
        const lowerKey = key.toLowerCase();
        const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowerKey);
        return foundKey ? obj[foundKey] : undefined;
    }

    const cteProc = getCaseInsensitiveKey(jsonObj, "cteProc");
    const cteObj = getCaseInsensitiveKey(jsonObj, "CTe") || (cteProc ? getCaseInsensitiveKey(cteProc, "CTe") : undefined);

    if (!cteObj) {
        throw new Error("Não foi possível localizar a tag <CTe> no XML fornecido.");
    }

    const cte: CTe = cteObj;
    const protCTe = cteProc ? getCaseInsensitiveKey(cteProc, "protCTe") : undefined;

    var PDF: PDFStructure = {
        doc: await PDFDocument.create(),
        pages: [],
        width: 0,
        height: 0,
        mtBlock: 0,
        barCode: null
    },
        consulta = typeof data.consulta != "undefined" ? parser.parse(data.consulta) : {},
        logo = data.logo,
        imgDemo = data.imgDemo;

    // Configuração do PDF
    PDF.pages.push(PDF.doc.addPage());
    PDF.width = (PDF.pages[0]).getWidth();
    PDF.height = (PDF.pages[0]).getHeight();

    // ------------------------ FUNÇÕES AUXILIARES ------------------------------

    async function addRet(page: any, x: number, y: number, w: number, h: number) {
        page.drawRectangle({
            x: x + 4,
            y: (PDF.height - h) - (y + 4),
            width: (x + w + 8) >= PDF.width ? (PDF.width - x) - 8 : w,
            height: h,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
    }

    async function addTXT({
        page,
        text,
        x,
        y,
        maxWidth,
        fontStyle = 'normal',
        size = 7,
        lineHeight,
        align = 'left',
        cacl = false,
        opacity = 1
    }: {
        page: any;
        text: string;
        x: number;
        y: number;
        opacity?: number;
        maxWidth: number;
        fontStyle?: 'normal' | 'negrito' | 'italic';
        size?: number;
        lineHeight?: number;
        align?: 'left' | 'center' | 'right';
        cacl?: boolean;
    }): Promise<number> {
        let font: PDFFont;
        switch (fontStyle) {
            case 'negrito':
                font = await PDF.doc.embedFont(StandardFonts.HelveticaBold);
                break;
            case 'italic':
                font = await PDF.doc.embedFont(StandardFonts.HelveticaOblique);
                break;
            default:
                font = await PDF.doc.embedFont(StandardFonts.Helvetica);
        }

        if (maxWidth + x > PDF.width) maxWidth = PDF.width - x - 5;
        const effectiveLineHeight = lineHeight ?? size * .9;

        const lines = wrapText(text || "", maxWidth, font, size);
        if (cacl) return lines.length;

        lines.forEach((line, index) => {
            const textWidth = font.widthOfTextAtSize(line, size);
            let drawX = x + 4;

            if (align === 'center') {
                drawX = x + (maxWidth - textWidth) / 2;
            } else if (align === 'right') {
                drawX = x + maxWidth - textWidth;
            }

            page.drawText(line, {
                x: drawX,
                y: ((PDF.height - effectiveLineHeight) - (y + 4)) - index * effectiveLineHeight,
                size,
                font,
                opacity: opacity || 1
            });
        });
        return lines.length;
    }

    function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
        const paragraphs = text.split('\n');
        const lines: string[] = [];
        for (const paragraph of paragraphs) {
            const words = paragraph.split(' ');
            let line = '';
            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                const testLine = line + word + ' ';
                const testWidth = font.widthOfTextAtSize(testLine, fontSize);
                if (testWidth > maxWidth && line !== '') {
                    lines.push(line.trim());
                    line = word + ' ';
                } else {
                    line = testLine;
                }
            }
            if (line.trim() !== '') {
                lines.push(line.trim());
            }
        }
        return lines;
    }

    function embCNPJCPF(valor: any) {
        if (!valor) return "";
        const str = String(valor);
        const numeros = str.replace(/\D/g, '');
        if (numeros.length === 11) {
            return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        } else if (numeros.length === 14) {
            return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        }
        return str;
    }

    async function barCode(): Promise<string> {
        if (PDF.barCode != null) return PDF.barCode;
        const id = cte.infCte["@Id"].replace("CTe", "");
        
        // Mocking canvas for browser/node compatibility as in danfe.ts
        const isNode = typeof window === 'undefined';
        if (isNode) {
            const { createCanvas } = await import('canvas');
            const canvas = createCanvas(400, 100);
            JsBarcode(canvas, id, { format: 'CODE128', displayValue: false });
            PDF.barCode = canvas.toDataURL('image/png');
        } else {
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, id, { format: 'CODE128', displayValue: false });
            PDF.barCode = canvas.toDataURL('image/png');
        }
        return PDF.barCode!;
    }

    async function addIMG({ page, img, x, y, w, h }: { page: any; img: any; x: number; y: number; w: number; h: number }) {
        if (img) {
            const isBase64 = typeof img === 'string' && img.startsWith('data:image');
            let base64 = img;
            if (!isBase64 && typeof img === 'string') {
                base64 = await fetch(img).then(res => res.blob()).then(blob => blob2base64(blob));
            }
            
            const bytes = Uint8Array.from(atob(base64.split(',')[1]), c => c.charCodeAt(0));
            const isPng = base64.startsWith('data:image/png');
            const image = isPng ? await PDF.doc.embedPng(bytes) : await PDF.doc.embedJpg(bytes);

            page.drawImage(image, {
                x: x + 4,
                y: PDF.height - y - h - 4,
                width: w,
                height: h,
            });
        }
    }

    async function blob2base64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
        });
    }

    // --------------------- BLOCOS DO DACTE ------------------------

    async function gerarBlocos() {
        await blocoHeader();
        await blocoEmitente();
        await blocoParticipantes();
        await blocoServico();
        await blocoImpostos();
        await blocoInformacoesCarga();
        await blocoDocumentos();
        await blocoObservacoes();
    }

    async function blocoHeader(page = PDF.pages[0]) {
        addRet(page, 0, 0, PDF.width, 100);
        // Logo
        if (logo) {
            await addIMG({ page, img: logo, x: 5, y: 10, w: 80, h: 80 });
        }
        
        addTXT({ page, text: "DACTE", x: 90, y: 10, maxWidth: 100, size: 14, fontStyle: 'negrito', align: 'center' });
        addTXT({ page, text: "Documento Auxiliar do Conhecimento de Transporte Eletrônico", x: 90, y: 25, maxWidth: 100, size: 7, align: 'center' });
        
        const id = cte.infCte["@Id"].replace("CTe", "");
        await addIMG({ page, img: await barCode(), x: 200, y: 5, w: 350, h: 40 });
        addTXT({ page, text: "CHAVE DE ACESSO", x: 200, y: 45, maxWidth: 350, size: 8 });
        addTXT({ page, text: id.replace(/(\d{4})(?=\d)/g, "$1 "), x: 200, y: 55, maxWidth: 350, size: 9, fontStyle: 'negrito', align: 'center' });

        addTXT({ page, text: "PROTOCOLO DE AUTORIZAÇÃO DE USO", x: 200, y: 75, maxWidth: 350, size: 8 });
        const dhRecbto = protCTe?.infProt?.dhRecbto ? new Date(protCTe.infProt.dhRecbto).toLocaleString('pt-BR') : "";
        addTXT({ page, text: `${protCTe?.infProt?.nProt || ""} - ${dhRecbto}`, x: 200, y: 85, maxWidth: 350, size: 10, fontStyle: 'negrito', align: 'center' });

        PDF.mtBlock = 105;
    }

    async function blocoEmitente(page = PDF.pages[0]) {
        addRet(page, 0, PDF.mtBlock, PDF.width, 40);
        addTXT({ page, text: cte.infCte.emit.xNome, x: 5, y: PDF.mtBlock + 2, maxWidth: PDF.width - 10, size: 10, fontStyle: 'negrito' });
        const end = cte.infCte.emit.enderEmit || {} as any;
        addTXT({ page, text: `${end.xLgr || ""}, ${end.nro || ""} - ${end.xBairro || ""} - ${end.xMun || ""}/${end.UF || ""} - CEP: ${end.CEP || ""}`, x: 5, y: PDF.mtBlock + 15, maxWidth: PDF.width - 10 });
        addTXT({ page, text: `CNPJ: ${embCNPJCPF(cte.infCte.emit.CNPJ)} - IE: ${cte.infCte.emit.IE}`, x: 5, y: PDF.mtBlock + 25, maxWidth: PDF.width - 10 });
        PDF.mtBlock += 45;
    }

    async function blocoParticipantes(page = PDF.pages[0]) {
        const h = 60;
        addRet(page, 0, PDF.mtBlock, PDF.width / 2, h); // Remetente
        addRet(page, PDF.width / 2, PDF.mtBlock, PDF.width / 2, h); // Destinatário
        
        // Remetente
        addTXT({ page, text: "REMETENTE", x: 2, y: PDF.mtBlock, maxWidth: 100, size: 6 });
        if (cte.infCte.rem) {
            const end = cte.infCte.rem.enderRem || {} as any;
            addTXT({ page, text: cte.infCte.rem.xNome, x: 5, y: PDF.mtBlock + 8, maxWidth: PDF.width / 2 - 10, size: 8, fontStyle: 'negrito' });
            addTXT({ page, text: `${end.xLgr || ""}, ${end.nro || ""}`, x: 5, y: PDF.mtBlock + 18, maxWidth: PDF.width / 2 - 10 });
            addTXT({ page, text: `${end.xMun || ""} - ${end.UF || ""}`, x: 5, y: PDF.mtBlock + 28, maxWidth: PDF.width / 2 - 10 });
            addTXT({ page, text: `CNPJ/CPF: ${embCNPJCPF(cte.infCte.rem.CNPJ || cte.infCte.rem.CPF)} - IE: ${cte.infCte.rem.IE}`, x: 5, y: PDF.mtBlock + 38, maxWidth: PDF.width / 2 - 10 });
        }

        // Destinatário
        addTXT({ page, text: "DESTINATÁRIO", x: PDF.width / 2 + 2, y: PDF.mtBlock, maxWidth: 100, size: 6 });
        if (cte.infCte.dest) {
            const end = cte.infCte.dest.enderDest || {} as any;
            addTXT({ page, text: cte.infCte.dest.xNome, x: PDF.width / 2 + 5, y: PDF.mtBlock + 8, maxWidth: PDF.width / 2 - 10, size: 8, fontStyle: 'negrito' });
            addTXT({ page, text: `${end.xLgr || ""}, ${end.nro || ""}`, x: PDF.width / 2 + 5, y: PDF.mtBlock + 18, maxWidth: PDF.width / 2 - 10 });
            addTXT({ page, text: `${end.xMun || ""} - ${end.UF || ""}`, x: PDF.width / 2 + 5, y: PDF.mtBlock + 28, maxWidth: PDF.width / 2 - 10 });
            addTXT({ page, text: `CNPJ/CPF: ${embCNPJCPF(cte.infCte.dest.CNPJ || cte.infCte.dest.CPF)} - IE: ${cte.infCte.dest.IE}`, x: PDF.width / 2 + 5, y: PDF.mtBlock + 38, maxWidth: PDF.width / 2 - 10 });
        }

        PDF.mtBlock += h + 5;
    }

    async function blocoServico(page = PDF.pages[0]) {
        addRet(page, 0, PDF.mtBlock, PDF.width, 30);
        addTXT({ page, text: "PRESTAÇÃO DO SERVIÇO", x: 2, y: PDF.mtBlock, maxWidth: 200, size: 6 });
        addTXT({ page, text: `ORIGEM: ${cte.infCte.ide.xMunIni || ""}/${cte.infCte.ide.UFIni || ""}`, x: 5, y: PDF.mtBlock + 10, maxWidth: PDF.width / 2 });
        addTXT({ page, text: `DESTINO: ${cte.infCte.ide.xMunFim || ""}/${cte.infCte.ide.UFFim || ""}`, x: PDF.width / 2, y: PDF.mtBlock + 10, maxWidth: PDF.width / 2 });
        PDF.mtBlock += 35;
    }

    async function blocoImpostos(page = PDF.pages[0]) {
        addRet(page, 0, PDF.mtBlock, PDF.width, 30);
        addTXT({ page, text: "VALORES DA PRESTAÇÃO", x: 2, y: PDF.mtBlock, maxWidth: 200, size: 6 });
        const v = cte.infCte.vPrest || {} as any;
        addTXT({ page, text: "VALOR TOTAL", x: 5, y: PDF.mtBlock + 10, maxWidth: 100 });
        addTXT({ page, text: parseFloat(v.vTPrest || "0").toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), x: 5, y: PDF.mtBlock + 18, maxWidth: 100, fontStyle: 'negrito' });
        
        addTXT({ page, text: "VALOR A RECEBER", x: PDF.width / 2, y: PDF.mtBlock + 10, maxWidth: 100 });
        addTXT({ page, text: parseFloat(v.vRec || "0").toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), x: PDF.width / 2, y: PDF.mtBlock + 18, maxWidth: 100, fontStyle: 'negrito' });
        
        PDF.mtBlock += 35;
    }

    async function blocoInformacoesCarga(page = PDF.pages[0]) {
        if (!cte.infCte.infCTeNorm?.infCarga) return;
        const carga = cte.infCte.infCTeNorm.infCarga;
        const qRaw = carga.infQ;
        const qs = Array.isArray(qRaw) ? qRaw : [qRaw];

        addRet(page, 0, PDF.mtBlock, PDF.width, 10 + (qs.length * 10));
        addTXT({ page, text: "INFORMAÇÕES DA CARGA", x: 2, y: PDF.mtBlock, maxWidth: 200, size: 6 });
        addTXT({ page, text: `PRODUTO PREDOMINANTE: ${carga.proPred || ""}`, x: 5, y: PDF.mtBlock + 10, maxWidth: PDF.width - 10 });
        
        let subY = PDF.mtBlock + 20;
        for (const q of qs) {
            const label = q.tpMed || "Qtde";
            addTXT({ page, text: `${label}: ${q.qMed} ${q.cUnid}`, x: 5, y: subY, maxWidth: PDF.width / 2 });
            subY += 10;
        }

        addTXT({ page, text: `VALOR DA CARGA: ${parseFloat(carga.vCarga || "0").toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, x: PDF.width / 2, y: PDF.mtBlock + 10, maxWidth: PDF.width / 2 });
        PDF.mtBlock += 20 + (qs.length * 10);
    }

    async function blocoDocumentos(page = PDF.pages[PDF.pages.length - 1]) {
        const infDoc = cte.infCte.infCTeNorm?.infDoc;
        if (!infDoc) return;

        addRet(page, 0, PDF.mtBlock, PDF.width, 10);
        addTXT({ page, text: "DOCUMENTOS ORIGINÁRIOS", x: 2, y: PDF.mtBlock, maxWidth: 200, size: 6, fontStyle: 'negrito' });
        PDF.mtBlock += 12;

        const checkPage = () => {
            if (PDF.mtBlock > PDF.height - 100) {
                PDF.pages.push(PDF.doc.addPage());
                PDF.mtBlock = 20;
                page = PDF.pages[PDF.pages.length - 1];
            }
        };

        // NFes
        if (infDoc.infNFe) {
            const nfesRaw = infDoc.infNFe;
            const nfes = Array.isArray(nfesRaw) ? nfesRaw : [nfesRaw];
            for (const nfeItem of nfes) {
                checkPage();
                const chave = String(nfeItem.chave || "").replace(/(\d{4})(?=\d)/g, "$1 ");
                addTXT({ page, text: `NFe Chave: ${chave}`, x: 5, y: PDF.mtBlock, maxWidth: PDF.width - 10, size: 7 });
                PDF.mtBlock += 10;
            }
        }

        // Outros documentos (infNF)
        if (infDoc.infNF) {
            const nfsRaw = infDoc.infNF as any;
            const nfs = Array.isArray(nfsRaw) ? nfsRaw : [nfsRaw];
            for (const nf of nfs) {
                checkPage();
                addTXT({ page, text: `Nota Fiscal: Série ${nf.serie || ""} nº ${nf.nDoc || ""}`, x: 5, y: PDF.mtBlock, maxWidth: PDF.width - 10, size: 7 });
                PDF.mtBlock += 10;
            }
        }
    }

    async function blocoObservacoes(page = PDF.pages[0]) {
        addRet(page, 0, PDF.mtBlock, PDF.width, 60);
        addTXT({ page, text: "OBSERVAÇÕES", x: 2, y: PDF.mtBlock, maxWidth: 200, size: 6 });
        if (cte.infCte.compl?.xObs) {
            addTXT({ page, text: cte.infCte.compl.xObs, x: 5, y: PDF.mtBlock + 10, maxWidth: PDF.width - 10 });
        }
        PDF.mtBlock += 65;
    }

    await gerarBlocos();
    
    // Marca d'água demo
    if (imgDemo) {
        for (const page of PDF.pages) {
            // Logica simplificada de marca d'agua
        }
    }

    return await PDF.doc.save();
}

export { DACTE };
