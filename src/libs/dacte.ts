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
    addPage: () => Promise<any>;
}

async function DACTE(data: { xml: string; logo?: any; consulta?: string; imgDemo?: any }): Promise<Uint8Array> {
    const parser = new XMLParser({ 
        ignoreAttributes: false, 
        attributeNamePrefix: "@",
        parseTagValue: false // Garante que números longos (como chaves de acesso) sejam lidos como string
    });
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
        barCode: null,
        addPage: async () => {}
    },
        consulta = typeof data.consulta != "undefined" ? parser.parse(data.consulta) : {},
        logo = data.logo,
        imgDemo = data.imgDemo;
    
    // Identificação do Tomador
    let tomador: any = null;
    if (cte.infCte.ide.toma3) {
        const t3 = cte.infCte.ide.toma3.toma;
        if (String(t3) === "0") tomador = cte.infCte.rem;
        if (String(t3) === "1") tomador = cte.infCte.exped;
        if (String(t3) === "2") tomador = cte.infCte.receb;
        if (String(t3) === "3") tomador = cte.infCte.dest;
    } else if (cte.infCte.ide.toma4) {
        tomador = cte.infCte.ide.toma4;
    }

    // Configuração do PDF
    PDF.pages.push(PDF.doc.addPage());
    PDF.width = (PDF.pages[0]).getWidth();
    PDF.height = (PDF.pages[0]).getHeight();

    PDF.addPage = async () => {
        const newPage = PDF.doc.addPage();
        PDF.pages.push(newPage);
        return newPage;
    };

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
        text: any;
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
        const textStr = String(text || "");
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

        const lines = wrapText(textStr, maxWidth, font, size);
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

    // Helper para garantir espaço e trocar de página se necessário
    async function ensureSpace(h: number) {
        if (PDF.mtBlock + h > PDF.height - 40) {
            const newPage = await PDF.addPage();
            PDF.mtBlock = 20;
            return newPage;
        }
        return PDF.pages[PDF.pages.length - 1];
    }

    // --------------------- BLOCOS DO DACTE ------------------------

    async function gerarBlocos() {
        await blocoHeaderSuperior();
        await blocoTipoCteServico();
        await blocoDadosGerais();
        await blocoParticipantes();
        await blocoTomador();
        await blocoCarga();
        await blocoQuantidades();
        await blocoComponentesValor();
        await blocoImpostos();
        await blocoDocumentosOriginais();
        await blocoFluxoCarga();
        await blocoObservacao();
        await blocoCteGlobalizado();
        await blocoUsoFisco();
    }


    async function blocoParticipantes() {
        const page = await ensureSpace(180);
        const padding = 2;
        const w = PDF.width / 2;

        const renderBox = async (participant: any, label: string, x: number, height: number) => {
            addRet(page, x, PDF.mtBlock, w, height);
            const mid = w / 2;
            
            // Header label (REMETENTE, DESTINATÁRIO, etc)
            addTXT({ page, text: label, x: x + padding, y: PDF.mtBlock + padding, maxWidth: 50, size: 6, fontStyle: 'negrito' });
            
            let lY = PDF.mtBlock + padding;
            // Nome
            if (participant?.xNome) {
                addTXT({ page, text: participant.xNome, x: x + 50, y: lY, maxWidth: w - 55, size: 7, fontStyle: 'normal' });
            }

            lY += 12;
            const end = participant?.enderRem || participant?.enderDest || participant?.enderExped || participant?.enderReceb || {} as any;
            
            // Endereço (Otimizado com rótulo curto e fonte dinâmica)
            addTXT({ page, text: "End.:", x: x + padding, y: lY, maxWidth: 25, size: 5, fontStyle: 'negrito' });
            if (participant) {
                const address = [end.xLgr, end.nro].filter(Boolean).join(", ");
                const fSize = address.length > 45 ? 5 : address.length > 35 ? 6 : 7;
                addTXT({ page, text: address, x: x + 25, y: lY - 1, maxWidth: w - 30, size: fSize, fontStyle: 'normal' });
            }
            
            lY += 10;
            // Município e CEP (50/50)
            addTXT({ page, text: "Município:", x: x + padding, y: lY, maxWidth: 35, size: 5, fontStyle: 'negrito' });
            if (participant) {
                addTXT({ page, text: end.xMun || "", x: x + 35, y: lY - 1, maxWidth: mid - 40, size: 7, fontStyle: 'normal' });
            }
            addTXT({ page, text: "CEP:", x: x + mid + padding, y: lY, maxWidth: 20, size: 5, fontStyle: 'negrito' });
            if (participant) {
                addTXT({ page, text: end.CEP || "", x: x + mid + 20, y: lY - 1, maxWidth: mid - 25, size: 7, fontStyle: 'normal' });
            }

            lY += 10;
            // Documentos (CNPJ/CPF e IE dividindo 50/50)
            addTXT({ page, text: "CNPJ/CPF:", x: x + padding, y: lY, maxWidth: 35, size: 5, fontStyle: 'negrito' });
            if (participant) {
                const docVal = embCNPJCPF(participant.CNPJ || participant.CPF);
                addTXT({ page, text: docVal, x: x + 35, y: lY - 1, maxWidth: mid - 40, size: 7, fontStyle: 'normal' });
            }
            
            addTXT({ page, text: "IE:", x: x + mid + padding, y: lY, maxWidth: 15, size: 5, fontStyle: 'negrito' });
            if (participant) {
                addTXT({ page, text: participant.IE || "ISENTO", x: x + mid + 15, y: lY - 1, maxWidth: mid - 20, size: 7, fontStyle: 'normal' });
            }

            lY += 10;
            // UF, País e Fone (UF pequeno, restante dividido)
            addTXT({ page, text: "UF:", x: x + padding, y: lY, maxWidth: 12, size: 5, fontStyle: 'negrito' });
            if (participant) {
                addTXT({ page, text: end.UF || "", x: x + padding + 10, y: lY - 1, maxWidth: 15, size: 7, fontStyle: 'normal' });
            }
            
            addTXT({ page, text: "País:", x: x + 25, y: lY, maxWidth: 20, size: 5, fontStyle: 'negrito' });
            if (participant) {
                addTXT({ page, text: end.xPais || "BRASIL", x: x + 40, y: lY - 1, maxWidth: mid - 45, size: 7, fontStyle: 'normal' });
            }

            addTXT({ page, text: "Fone:", x: x + mid + padding, y: lY, maxWidth: 20, size: 5, fontStyle: 'negrito' });
            if (participant) {
                addTXT({ page, text: participant.fone || "", x: x + mid + 20, y: lY - 1, maxWidth: mid - 25, size: 7, fontStyle: 'normal' });
            }
        };

        // Linha 1: Percurso
        const h1 = 25;
        const ide = cte.infCte.ide;
        addRet(page, 0, PDF.mtBlock, w, h1);
        addTXT({ page, text: "INÍCIO DA PRESTAÇÃO", x: padding, y: PDF.mtBlock + padding, maxWidth: w - padding * 2, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: `${ide.UFIni} - ${ide.cMunIni} - ${ide.xMunIni}`, x: padding, y: PDF.mtBlock + 12, maxWidth: w - padding * 2, size: 7, fontStyle: 'normal' });

        addRet(page, w, PDF.mtBlock, w, h1);
        addTXT({ page, text: "TÉRMINO DA PRESTAÇÃO", x: w + padding, y: PDF.mtBlock + padding, maxWidth: w - padding * 2, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: `${ide.UFFim} - ${ide.cMunFim} - ${ide.xMunFim}`, x: w + padding, y: PDF.mtBlock + 12, maxWidth: w - padding * 2, size: 7, fontStyle: 'normal' });
        PDF.mtBlock += h1;

        // Linha 2: Atores Principais
        await renderBox(cte.infCte.rem, "REMETENTE", 0, 60);
        await renderBox(cte.infCte.dest, "DESTINATÁRIO", w, 60);
        PDF.mtBlock += 60;

        // Linha 3: Atores Secundários
        await renderBox(cte.infCte.exped, "EXPEDIDOR", 0, 60);
        await renderBox(cte.infCte.receb, "RECEBEDOR", w, 60);
        PDF.mtBlock += 60;
    }
    async function blocoTomador() {
        const page = await ensureSpace(60);
        const padding = 2;
        const h = 45; // 3 linhas de ~15px
        const w1 = PDF.width * 0.5;
        const w2 = PDF.width * 0.25;
        const w3 = PDF.width * 0.25;

        addRet(page, 0, PDF.mtBlock, PDF.width, h);
        
        // Separadores verticais
        [w1, w1 + w2].forEach(xSep => {
            page.drawLine({
                start: { x: xSep + 4, y: PDF.height - PDF.mtBlock - 4 },
                end: { x: xSep + 4, y: PDF.height - PDF.mtBlock - h - 4 },
                thickness: 1,
                color: rgb(0, 0, 0),
            });
        });

        let lY = PDF.mtBlock + padding;
        const end = tomador?.enderToma || tomador?.enderRem || tomador?.enderDest || tomador?.enderExped || tomador?.enderReceb || {} as any;

        // LINHA 1: Tomador | Município | CEP
        addTXT({ page, text: "TOMADOR:", x: padding, y: lY, maxWidth: 35, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: tomador?.xNome || "", x: 40, y: lY - 1, maxWidth: w1 - 45, size: 7, fontStyle: 'normal' });

        addTXT({ page, text: "Município:", x: w1 + padding, y: lY, maxWidth: 35, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: end.xMun || "", x: w1 + 35 + padding, y: lY - 1, maxWidth: w2 - 40, size: 7, fontStyle: 'normal' });

        addTXT({ page, text: "CEP:", x: w1 + w2 + padding, y: lY, maxWidth: 20, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: end.CEP || "", x: w1 + w2 + 20 + padding, y: lY - 1, maxWidth: w3 - 25, size: 7, fontStyle: 'normal' });

        lY += 13;
        // LINHA 2: Endereço | UF | País
        addTXT({ page, text: "End.:", x: padding, y: lY, maxWidth: 30, size: 6, fontStyle: 'negrito' });
        const address = [end.xLgr, end.nro].filter(Boolean).join(", ");
        addTXT({ page, text: address, x: 35, y: lY - 1, maxWidth: w1 - 40, size: 7, fontStyle: 'normal' });

        addTXT({ page, text: "UF:", x: w1 + padding, y: lY, maxWidth: 15, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: end.UF || "", x: w1 + 15 + padding, y: lY - 1, maxWidth: w2 - 20, size: 7, fontStyle: 'normal' });

        addTXT({ page, text: "País:", x: w1 + w2 + padding, y: lY, maxWidth: 20, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: end.xPais || "BRASIL", x: w1 + w2 + 20 + padding, y: lY - 1, maxWidth: w3 - 25, size: 7, fontStyle: 'normal' });

        lY += 13;
        // LINHA 3: CNPJ/CPF | IE | Fone
        addTXT({ page, text: "CNPJ/CPF:", x: padding, y: lY, maxWidth: 40, size: 6, fontStyle: 'negrito' });
        const docVal = tomador ? embCNPJCPF(tomador.CNPJ || tomador.CPF) : "";
        addTXT({ page, text: docVal, x: 45, y: lY - 1, maxWidth: w1 - 50, size: 7, fontStyle: 'normal' });

        addTXT({ page, text: "IE:", x: w1 + padding, y: lY, maxWidth: 15, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: tomador?.IE || "ISENTO", x: w1 + 15 + padding, y: lY - 1, maxWidth: w2 - 20, size: 7, fontStyle: 'normal' });

        addTXT({ page, text: "Fone:", x: w1 + w2 + padding, y: lY, maxWidth: 20, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: tomador?.fone || "", x: w1 + w2 + 20 + padding, y: lY - 1, maxWidth: w3 - 25, size: 7, fontStyle: 'normal' });

        PDF.mtBlock += h ;
    }

    async function blocoCarga() {
        const page = await ensureSpace(25);
        const padding = 2;
        const h = 25;
        const wCol = PDF.width / 3;
        const infoCarga = cte.infCte.infCTeNorm?.infCarga;

        addRet(page, 0, PDF.mtBlock, PDF.width, h);

        // Separadores verticais
        [wCol, wCol * 2].forEach(xSep => {
            page.drawLine({
                start: { x: xSep + 4, y: PDF.height - PDF.mtBlock - 4 },
                end: { x: xSep + 4, y: PDF.height - PDF.mtBlock - h - 4 },
                thickness: 1,
                color: rgb(0, 0, 0),
            });
        });

        const lY = PDF.mtBlock + padding;
        const vY = lY + 10;

        // Coluna 1: PRODUTO PREDOMINANTE
        addTXT({ page, text: "PRODUTO PREDOMINANTE", x: padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: infoCarga?.proPred || "", x: padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });

        // Coluna 2: OUTRAS CARACTERÍSTICAS DA CARGA
        addTXT({ page, text: "OUTRAS CARACTERÍSTICAS DA CARGA", x: wCol + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: infoCarga?.xOutCat || "", x: wCol + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });

        // Coluna 3: VALOR TOTAL DA MERCADORIA
        addTXT({ page, text: "VALOR TOTAL DA MERCADORIA", x: wCol * 2 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        const vCarga = parseFloat(infoCarga?.vCarga || "0").toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        addTXT({ page, text: vCarga, x: wCol * 2 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });

        PDF.mtBlock += h ;
    }

    async function blocoQuantidades() {
        const page = await ensureSpace(25);
        const padding = 2;
        const h = 25;
        const wCol = PDF.width / 5;
        const infoCarga = cte.infCte.infCTeNorm?.infCarga;
        const qsRaw = infoCarga?.infQ;
        const qs = Array.isArray(qsRaw) ? qsRaw : qsRaw ? [qsRaw] : [];

        // Mapeador de unidades (01 -> KG, etc)
        const getU = (code: any) => {
            const map: any = { "00": "M3", "01": "KG", "1": "KG", "02": "TON", "2": "TON", "03": "UN", "3": "UN", "04": "LTS", "4": "LTS", "05": "M3", "5": "M3" };
            return map[String(code).padStart(2, '0')] || map[String(code)] || code || "";
        };

        addRet(page, 0, PDF.mtBlock, PDF.width, h);

        // Separadores verticais
        [1, 2, 3, 4].forEach(i => {
            const xSep = wCol * i;
            page.drawLine({
                start: { x: xSep + 4, y: PDF.height - PDF.mtBlock - 4 },
                end: { x: xSep + 4, y: PDF.height - PDF.mtBlock - h - 4 },
                thickness: 1,
                color: rgb(0, 0, 0),
            });
        });

        const lY = PDF.mtBlock + padding;
        const vY = lY + 10;

        // Linha horizontal abaixo das labels (da 2ª coluna em diante)
        page.drawLine({
            start: { x: wCol + 4, y: PDF.height - (lY + 9) - 4 },
            end: { x: PDF.width - 4, y: PDF.height - (lY + 9) - 4 },
            thickness: 1,
            color: rgb(0, 0, 0),
        });

        // Coluna 1: QUANTIDADE CARGA (Rótulo fixo)
        addTXT({ page, text: "QUANTIDADE\nCARGA", x: padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });

        // Helper para buscar valor por tpMed
        const getQ = (tipo: string) => qs.find(q => String(q.tpMed).toUpperCase().includes(tipo.toUpperCase()));

        // Coluna 2: PESO BRUTO
        const pb = getQ("REAL");
        addTXT({ page, text: "PESO BRUTO", x: wCol + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        if (pb) {
            const val = parseFloat(pb.qCarga || pb.qMed || "0").toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
            addTXT({ page, text: `${val} ${getU(pb.cUnid)}`, x: wCol + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });
        }

        // Coluna 3: PESO LIQUIDO
        const pl = getQ("LIQUIDO");
        addTXT({ page, text: "PESO LÍQUIDO", x: wCol * 2 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        if (pl) {
            const val = parseFloat(pl.qCarga || pl.qMed || "0").toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
            addTXT({ page, text: `${val} ${getU(pl.cUnid)}`, x: wCol * 2 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });
        }

        // Coluna 4: VOLUME
        const vol = getQ("M3") || getQ("VOLUME");
        addTXT({ page, text: "VOLUME", x: wCol * 3 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        if (vol) {
            const val = parseFloat(vol.qCarga || vol.qMed || "0").toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
            addTXT({ page, text: `${val} ${getU(vol.cUnid)}`, x: wCol * 3 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });
        }

        // Coluna 5: UNIDADES
        const und = getQ("UNIDADE");
        addTXT({ page, text: "UNIDADES", x: wCol * 4 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        if (und) {
            const val = parseFloat(und.qCarga || und.qMed || "0").toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
            addTXT({ page, text: `${val} ${getU(und.cUnid)}`, x: wCol * 4 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });
        }

        PDF.mtBlock += h ;
    }

    async function blocoComponentesValor() {
        const page = await ensureSpace(60);
        const padding = 2;
        const hTitle = 12;
        const hContent = 45;
        const hTotal = hTitle + hContent;
        const wCol = PDF.width / 4;
        
        const vPrest = cte.infCte.vPrest;
        const compsRaw = vPrest?.Comp;
        const components = Array.isArray(compsRaw) ? compsRaw : compsRaw ? [compsRaw] : [];

        // Título Centralizado
        addRet(page, 0, PDF.mtBlock, PDF.width, hTitle);
        addTXT({ 
            page, 
            text: "COMPONENTES DO VALOR DA PRESTAÇÃO DE SERVIÇO", 
            x: 0, 
            y: PDF.mtBlock + 3, 
            maxWidth: PDF.width, 
            size: 7, 
            fontStyle: 'negrito',
            align: 'center' 
        });

        const cY = PDF.mtBlock + hTitle;
        addRet(page, 0, cY, PDF.width, hContent);

        // Separadores verticais
        [1, 2, 3].forEach(i => {
            page.drawLine({
                start: { x: (wCol * i) + 4, y: PDF.height - cY - 4 },
                end: { x: (wCol * i) + 4, y: PDF.height - cY - hContent - 4 },
                thickness: 1,
                color: rgb(0, 0, 0),
            });
        });

        // Coluna 4 tem uma linha horizontal no meio
        page.drawLine({
            start: { x: (wCol * 3) + 4, y: PDF.height - (cY + hContent / 2) - 4 },
            end: { x: PDF.width - 4, y: PDF.height - (cY + hContent / 2) - 4 },
            thickness: 1,
            color: rgb(0, 0, 0),
        });

        const fmtV = (v: any) => parseFloat(v || "0").toLocaleString('pt-BR', { minimumFractionDigits: 2 });

        // Coluna 1: Itens específicos
        const col1Labels = ["Frete Peso", "Frete Valor", "Taxa de Coleta", "Taxa de Entrega"];
        let lY = cY + padding;
        col1Labels.forEach(label => {
            const comp = components.find(c => String(c.xNome).toUpperCase().includes(label.toUpperCase()));
            addTXT({ page, text: label.toUpperCase(), x: padding, y: lY, maxWidth: wCol / 2, size: 6, fontStyle: 'normal' });
            addTXT({ page, text: fmtV(comp?.vComp), x: (wCol * 1 - 50), y: lY, maxWidth: 45, size: 7, fontStyle: 'normal', align: 'right' });
            lY += 10;
        });

        // Colunas 2 e 3: Outros componentes (descontando os das colunas 1)
        const others = components.filter(c => !col1Labels.some(l => String(c.xNome).toUpperCase().includes(l.toUpperCase())));
        
        // Distribuir "others" entre Col 2 e Col 3
        const col2 = others.slice(0, 4);
        const col3 = others.slice(4, 8);

        [col2, col3].forEach((colItems, idx) => {
            let colX = (wCol * (idx + 1)) + padding;
            let itemY = cY + padding;
            colItems.forEach(item => {
                addTXT({ page, text: String(item.xNome).toUpperCase(), x: colX, y: itemY, maxWidth: wCol / 2, size: 6, fontStyle: 'normal' });
                addTXT({ page, text: fmtV(item.vComp), x: colX + (wCol - 50), y: itemY, maxWidth: 45, size: 7, fontStyle: 'normal', align: 'right' });
                itemY += 10;
            });
        });

        // Coluna 4: Totais
        const col4X = (wCol * 3) + padding;
        addTXT({ page, text: "VALOR TOTAL DO SERVIÇO", x: col4X, y: cY + 5, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: `R$ ${fmtV(vPrest?.vTPrest)}`, x: col4X, y: cY + 13, maxWidth: wCol - padding, size: 8, fontStyle: 'normal' });
        
        addTXT({ page, text: "VALOR A RECEBER", x: col4X, y: cY + 28, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        addTXT({ page, text: `R$ ${fmtV(vPrest?.vRec)}`, x: col4X, y: cY + 36, maxWidth: wCol - padding, size: 8, fontStyle: 'normal' });

        PDF.mtBlock += hTotal ;
    }

    async function blocoImpostos() {
        const page = await ensureSpace(40);
        const padding = 2;
        const hTitle = 12;
        const hContent = 25;
        const hTotal = hTitle + hContent;
        const wCol = PDF.width / 5;

        const imp = cte.infCte.imp;
        const icms = imp?.ICMS;
        
        let data: any = {};
        if (icms) {
            const dataKey = Object.keys(icms).find(k => k.startsWith('ICMS') && k !== 'ICMS');
            data = dataKey ? icms[dataKey] : icms;
        }

        const getDesc = (code: string) => {
            const map: any = {
                "00": "Tributação normal ICMS",
                "20": "Tributação com redução de BC",
                "40": "ICMS isento",
                "41": "ICMS não tributado",
                "45": "ICMS Diferido",
                "60": "ICMS cobrado por ST",
                "90": "ICMS outros",
                "101": "Simples Nacional com crédito",
                "102": "Simples Nacional sem crédito",
                "201": "Simples Nacional com ST e crédito",
                "202": "Simples Nacional com ST sem crédito",
                "900": "Simples Nacional outros"
            };
            const desc = map[String(code).padStart(2, '0')] || map[String(code)] || "";
            return desc ? `${code} - ${desc}` : code;
        };

        // Título Centralizado
        addRet(page, 0, PDF.mtBlock, PDF.width, hTitle);
        addTXT({ 
            page, 
            text: "INFORMAÇÕES RELATIVA AO IMPOSTO", 
            x: 0, 
            y: PDF.mtBlock + 3, 
            maxWidth: PDF.width, 
            size: 7, 
            fontStyle: 'negrito',
            align: 'center' 
        });

        const cY = PDF.mtBlock + hTitle;
        addRet(page, 0, cY, PDF.width, hContent);

        // Separadores verticais
        [1, 2, 3, 4].forEach(i => {
            page.drawLine({
                start: { x: (wCol * i) + 4, y: PDF.height - cY - 4 },
                end: { x: (wCol * i) + 4, y: PDF.height - cY - hContent - 4 },
                thickness: 1,
                color: rgb(0, 0, 0),
            });
        });

        const fmtV = (v: any) => parseFloat(v || "0").toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const lY = cY + padding;
        const vY = lY + 10;

        // Coluna 1: CLASSIFICAÇÃO TRIBUTÁRIA DO SERVIÇO (CST ou CSOSN)
        addTXT({ page, text: "CLASSIFICAÇÃO TRIBUTÁRIA DO SERVIÇO", x: padding, y: lY, maxWidth: wCol - padding, size: 5, fontStyle: 'negrito' });
        const cst = data?.CST !== undefined ? data.CST : (data?.CSOSN !== undefined ? data.CSOSN : "");
        const txtCST = getDesc(String(cst));
        addTXT({ page, text: txtCST, x: padding, y: vY, maxWidth: wCol - padding, size: 6, fontStyle: 'normal' });

        // Coluna 2: BASE DE CÁLCULO
        addTXT({ page, text: "BASE DE CÁLCULO", x: wCol + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        const vBC = data?.vBC !== undefined ? data.vBC : "0.00";
        addTXT({ page, text: fmtV(vBC), x: wCol + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });

        // Coluna 3: ALÍQ. ICMS
        addTXT({ page, text: "ALÍQ. ICMS", x: (wCol * 2) + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        const pICMS = data?.pICMS !== undefined ? data.pICMS : "0.00";
        addTXT({ page, text: `${fmtV(pICMS)}%`, x: (wCol * 2) + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });

        // Coluna 4: % RED. BC.
        addTXT({ page, text: "% RED. BC.", x: (wCol * 3) + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        const pRedBC = data?.pRedBC !== undefined ? data.pRedBC : "0.00";
        addTXT({ page, text: `${fmtV(pRedBC)}%`, x: (wCol * 3) + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });

        // Coluna 5: V. CRÉDITO
        addTXT({ page, text: "V. CRÉDITO", x: (wCol * 4) + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: 'negrito' });
        const vCred = data?.vCred !== undefined ? data.vCred : (data?.vICMSOutraUF !== undefined ? data.vICMSOutraUF : "0.00");
        addTXT({ page, text: fmtV(vCred), x: (wCol * 4) + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: 'normal' });

        PDF.mtBlock += hTotal ;
    }

    async function blocoDocumentosOriginais() {
        let page = PDF.pages[PDF.pages.length - 1];
    const padding = 2;
    const hHeader = 12;
    const hRow = 15;
    const w1 = 60;
    const w2 = 250;
    const w3 = 100;
    const w4 = PDF.width - w1 - w2 - w3;

    const infDoc = cte.infCte.infCTeNorm?.infDoc;
    if (!infDoc) return;

    const docs = [];
    const dhEmi = cte.infCte.ide.dhEmi; // Data do CTe
    
    // Formata data ISO para DD/MM/AAAA
    const fmtDate = (iso) => {
        if (!iso) return '';
        // Pega apenas a parte da data para evitar problemas de fuso horário
        const datePart = iso.split('T')[0];
        if (!datePart) return iso;
        return datePart.split('-').reverse().join('/');
    };

    const docDate = fmtDate(dhEmi);
    const vCargaTotal = cte.infCte.infCTeNorm?.infCarga?.vCarga || 0;

    // 1. Processa Notas de Papel (Modelo 1/1A)
    // Tenta pegar o valor individual (vNF) se existir, senão usa 0
    const nfs = Array.isArray(infDoc.infNF) ? infDoc.infNF : infDoc.infNF ? [infDoc.infNF] : [];
    nfs.forEach((n) => {
        docs.push({
            tipo: 'NF',
            // Garante string para evitar notação científica
            numero: String(n.nDoc || ''), 
            // Se a nota tiver data própria (dEmi), usa ela. Senão usa a do CTe.
            data: n.dEmi ? fmtDate(n.dEmi) : docDate, 
            valor: n.vNF || 0 
        });
    });

    // 2. Processa Notas Eletrônicas (NFe - Apenas Chave)
    // O XML do CTe NÃO tem o valor individual da NFe. Iniciamos com 0.
    const nfes = Array.isArray(infDoc.infNFe) ? infDoc.infNFe : infDoc.infNFe ? [infDoc.infNFe] : [];
    nfes.forEach((n) => {
        docs.push({
            tipo: 'NFe',
            // A chave deve ser tratada como string pura
            numero: String(n.chave || ''), 
            data: docDate, // NFe não tem data no XML do CTe, usa a do CTe
            valor: 0 
        });
    });

    if (docs.length === 0) return;

    // LÓGICA INTELIGENTE DE VALOR:
    // Se só tem 1 documento, podemos assumir que ele vale o total da carga.
    // Se tem mais de 1, mantemos 0,00 para não gerar duplicidade errada.
    if (docs.length === 1 && docs[0].valor == 0) {
        docs[0].valor = vCargaTotal;
    }

    const renderHeader = (p) => {
        addRet(p, 0, PDF.mtBlock, PDF.width, hHeader);
        addTXT({ page: p, text: "DOCUMENTOS ORIGINÁRIOS", x: 0, y: PDF.mtBlock + 3, maxWidth: PDF.width, size: 7, fontStyle: 'negrito', align: 'center' });
        PDF.mtBlock += hHeader;
        addRet(p, 0, PDF.mtBlock, PDF.width, hHeader);
        addTXT({ page: p, text: "TP DOC", x: padding, y: PDF.mtBlock + 3, maxWidth: w1, size: 6, fontStyle: 'negrito' });
        addTXT({ page: p, text: "Número", x: w1 + padding, y: PDF.mtBlock + 3, maxWidth: w2, size: 6, fontStyle: 'negrito' });
        addTXT({ page: p, text: "Data de Emissão", x: w1 + w2 + padding, y: PDF.mtBlock + 3, maxWidth: w3, size: 6, fontStyle: 'negrito' });
        addTXT({ page: p, text: "Valor do Documento", x: w1 + w2 + w3 + padding, y: PDF.mtBlock + 3, maxWidth: w4, size: 6, fontStyle: 'negrito' });
        PDF.mtBlock += hHeader;
    };

    renderHeader(page);

    let startY = PDF.mtBlock;
    let itemsInPage = 0;

    const renderBoxAndLines = (p, sY, count) => {
        const totalH = count * hRow;
        addRet(p, 0, sY, PDF.width, totalH);
        
        // Linhas verticais
        [w1, w1 + w2, w1 + w2 + w3].forEach(x => {
            p.drawLine({
                start: { x: x + 4, y: PDF.height - sY - 4 },
                end: { x: x + 4, y: PDF.height - sY - totalH - 4 },
                thickness: 1,
                color: rgb(0, 0, 0),
            });
        });
    };

    for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];

        if (PDF.mtBlock + hRow > PDF.height - 50) {
            renderBoxAndLines(page, startY, itemsInPage);
            page = await PDF.addPage();
            PDF.mtBlock = 20;
            renderHeader(page);
            startY = PDF.mtBlock;
            itemsInPage = 0;
        }

        // addRet removido daqui para tirar as linhas horizontais
        itemsInPage++;

        // Tratamento final para exibição do número (caso ainda venha como number)
        let numeroTexto = doc.numero;
        if (typeof doc.numero === 'number') {
            numeroTexto = doc.numero.toLocaleString('pt-BR', { useGrouping: false });
        }

        addTXT({ page, text: doc.tipo, x: padding, y: PDF.mtBlock + 4, maxWidth: w1, size: 7, fontStyle: 'normal' });
        // Usamos numeroTexto formatado e seguro
        addTXT({ page, text: numeroTexto, x: w1 + padding, y: PDF.mtBlock + 4, maxWidth: w2 - 5, size: 6, fontStyle: 'normal' });
        addTXT({ page, text: doc.data, x: w1 + w2 + padding, y: PDF.mtBlock + 4, maxWidth: w3, size: 7, fontStyle: 'normal' });
        
        // Exibe o valor formatado. Se for 0, aparecerá "0,00" (o que é correto tecnicamente quando não se tem a informação)
        addTXT({ page, text: parseFloat(doc.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), x: w1 + w2 + w3 + padding, y: PDF.mtBlock + 4, maxWidth: w4, size: 7, fontStyle: 'normal' });
        
        PDF.mtBlock += hRow;
    }

    if (itemsInPage > 0) {
        renderBoxAndLines(page, startY, itemsInPage);
    }
    PDF.mtBlock += 0;
}

async function blocoTipoCteServico(page = PDF.pages[0]) {
    const padding = 2;
    const hRow = 20;
    const w = PDF.width / 2;

    const tpCTes: Record<string, string> = { "0": "Normal", "1": "Complementar", "2": "Anulação", "3": "Substituto" };
    const tpServs: Record<string, string> = { "0": "Normal", "1": "Subcontratação", "2": "Redespacho", "3": "Redespacho Intermediário", "4": "Serviço Vinculado a Multimodal" };

    const tpCTeCode = String(cte.infCte.ide.tpCTe);
    const tpServCode = String(cte.infCte.ide.tpServ);

    const tpCTeStr = tpCTes[tpCTeCode] || tpCTeCode;
    const tpServStr = tpServs[tpServCode] || tpServCode;

    // Coluna 1: Tipo CT-e
    addRet(page, 0, PDF.mtBlock, w, hRow);
    addTXT({ page, text: "TIPO DO CT-e", x: padding, y: PDF.mtBlock + padding, maxWidth: w - padding*2, size: 6, fontStyle: 'negrito' });
    addTXT({ page, text: tpCTeStr, x: padding, y: PDF.mtBlock + 10, maxWidth: w - padding*2, size: 8, fontStyle: 'normal' });

    // Coluna 2: Tipo Serviço
    addRet(page, w, PDF.mtBlock, w, hRow);
    addTXT({ page, text: "TIPO DO SERVIÇO", x: w + padding, y: PDF.mtBlock + padding, maxWidth: w - padding*2, size: 6, fontStyle: 'negrito' });
    addTXT({ page, text: tpServStr, x: w + padding, y: PDF.mtBlock + 10, maxWidth: w - padding*2, size: 8, fontStyle: 'normal' });

    PDF.mtBlock += hRow ;
}

async function blocoDadosGerais(page = PDF.pages[0]) {
    const padding = 2;
    const hRow = 25;
    const w1 = PDF.width * 0.60;
    const w2 = PDF.width * 0.40;

    // Linha 1
    addRet(page, 0, PDF.mtBlock, w1, hRow);
    addTXT({ page, text: "INDICADOR DO CT-E GLOBALIZADO", x: padding, y: PDF.mtBlock + padding, maxWidth: w1 - padding*2, size: 6, fontStyle: 'negrito' });
    const isGlobal = cte.infCte.ide.indGlobalizado === "1" ? "Sim" : "Não";
    addTXT({ page, text: isGlobal, x: padding, y: PDF.mtBlock + 12, maxWidth: w1 - padding*2, size: 9, fontStyle: 'normal' });

    addRet(page, w1, PDF.mtBlock, w2, hRow);
    addTXT({ page, text: "Dados do CT-e", x: w1 + padding, y: PDF.mtBlock + padding, maxWidth: w2 - padding*2, size: 6, fontStyle: 'negrito' });
    const nCT = cte.infCte.ide.nCT || "";
    const serie = cte.infCte.ide.serie || "";
    addTXT({ page, text: `Nº: ${nCT} / Série: ${serie}`, x: w1 + padding, y: PDF.mtBlock + 12, maxWidth: w2 - padding*2, size: 8, fontStyle: 'normal' });

    PDF.mtBlock += hRow;

    // Linha 2
    addRet(page, 0, PDF.mtBlock, w1, hRow);
    addTXT({ page, text: "CFOP - NATUREZA DA PRESTAÇÃO", x: padding, y: PDF.mtBlock + padding, maxWidth: w1 - padding*2, size: 6, fontStyle: 'negrito' });
    const cfop = cte.infCte.ide.CFOP || "";
    const natOp = cte.infCte.ide.natOp || "";
    addTXT({ page, text: `${cfop} - ${natOp}`, x: padding, y: PDF.mtBlock + 12, maxWidth: w1 - padding*2, size: 7, fontStyle: 'normal' });

    addRet(page, w1, PDF.mtBlock, w2, hRow);
    addTXT({ page, text: "Protocolo de Autorização de Uso", x: w1 + padding, y: PDF.mtBlock + padding, maxWidth: w2 - padding*2, size: 6, fontStyle: 'negrito' });
    const nProt = protCTe?.infProt?.nProt || "";
    const dhRecbto = protCTe?.infProt?.dhRecbto ? new Date(protCTe.infProt.dhRecbto).toLocaleString('pt-BR') : "";
    addTXT({ page, text: `${nProt} - ${dhRecbto}`, x: w1 + padding, y: PDF.mtBlock + 12, maxWidth: w2 - padding*2, size: 7, fontStyle: 'normal' });

    PDF.mtBlock += hRow ;
}

async function blocoFluxoCarga() {
    const hNeeded = 12 + 40;
    const page = await ensureSpace(hNeeded);
    const padding = 2;
    const hTitle = 12;
    const hContent = 40; // Altura total do conteúdo (20+20 para a col1)
    const hRowInt = hContent / 2;
    const wCol = PDF.width / 2;

    // Título Centralizado
    addRet(page, 0, PDF.mtBlock, PDF.width, hTitle);
    addTXT({ 
        page, 
        text: "PREVISÃO DO FLUXO DA CARGA", 
        x: 0, 
        y: PDF.mtBlock + 3, 
        maxWidth: PDF.width, 
        size: 7, 
        fontStyle: 'negrito',
        align: 'center' 
    });

    const cY = PDF.mtBlock + hTitle;
    addRet(page, 0, cY, PDF.width, hContent);

    // Separador vertical entre colunas
    page.drawLine({
        start: { x: wCol + 4, y: PDF.height - cY - 4 },
        end: { x: wCol + 4, y: PDF.height - cY - hContent - 4 },
        thickness: 1,
        color: rgb(0, 0, 0),
    });

    // Separador horizontal interno na coluna 1
    page.drawLine({
        start: { x: 4, y: PDF.height - (cY + hRowInt) - 4 },
        end: { x: wCol + 4, y: PDF.height - (cY + hRowInt) - 4 },
        thickness: 1,
        color: rgb(0, 0, 0),
    });

    const labelSize = 4.5;
    const labelOrigem = "SIGLA OU CÓDIGO INT. DA FILIAL/PORTO/ESTAÇÃO/AEROPORTO DE ORIGEM";
    const labelDestino = "SIGLA OU CÓDIGO INT. DA FILIAL/PORTO/ESTAÇÃO/AEROPORTO DE DESTINO";
    const labelPassagem = "SIGLA OU CÓDIGO INT. DA FILIAL/PORTO/ESTAÇÃO/AEROPORTO DE PASSAGEM";

    // Coluna 1 - Linha 1: ORIGEM
    addTXT({ page, text: labelOrigem, x: padding, y: cY + 2, maxWidth: wCol - padding, size: labelSize, fontStyle: 'negrito' });
    
    // Coluna 1 - Linha 2: DESTINO
    addTXT({ page, text: labelDestino, x: padding, y: cY + hRowInt + 2, maxWidth: wCol - padding, size: labelSize, fontStyle: 'negrito' });

    // Coluna 2: PASSAGEM
    addTXT({ page, text: labelPassagem, x: wCol + padding, y: cY + 2, maxWidth: wCol - padding, size: labelSize, fontStyle: 'negrito' });

    PDF.mtBlock += hTitle + hContent ;
}

async function blocoObservacao() {
    const hNeeded = 12 + 60;
    const page = await ensureSpace(hNeeded);
    const padding = 2;
    const hTitle = 12;
    const hContent = 60; // Altura fixa inicial para observações
    
    // Título Centralizado
    addRet(page, 0, PDF.mtBlock, PDF.width, hTitle);
    addTXT({ 
        page, 
        text: "OBSERVAÇÃO", 
        x: 0, 
        y: PDF.mtBlock + 3, 
        maxWidth: PDF.width, 
        size: 7, 
        fontStyle: 'negrito',
        align: 'center' 
    });

    const cY = PDF.mtBlock + hTitle;
    addRet(page, 0, cY, PDF.width, hContent);

    const obs = cte.infCte.compl?.xObs || "";
    if (obs) {
        addTXT({ 
            page, 
            text: String(obs), 
            x: padding, 
            y: cY + padding, 
            maxWidth: PDF.width - (padding * 2), 
            size: 6, 
            fontStyle: 'normal' 
        });
    }

    PDF.mtBlock += hTitle + hContent ;
}

async function blocoCteGlobalizado() {
    const hNeeded = 12 + 25;
    const page = await ensureSpace(hNeeded);
    const padding = 2;
    const hTitle = 12;
    const hContent = 25; 
    
    addRet(page, 0, PDF.mtBlock, PDF.width, hTitle);
    addTXT({ 
        page, 
        text: "INFORMAÇÃO DO CT-E GLOBALIZADO", 
        x: 0, 
        y: PDF.mtBlock + 3, 
        maxWidth: PDF.width, 
        size: 7, 
        fontStyle: 'negrito',
        align: 'center' 
    });

    const cY = PDF.mtBlock + hTitle;
    addRet(page, 0, cY, PDF.width, hContent);

    const infDoc = cte.infCte.infCTeNorm?.infDoc;
    const outros = infDoc?.infOutros;
    
    if (outros) {
        let textOutros = "";
        const listaOutros = Array.isArray(outros) ? outros : [outros];
        textOutros = listaOutros.map((o: any) => `${o.tpDoc || ''} ${o.descOutros || ''}`).join(" | ");
        
        addTXT({ page, text: textOutros, x: padding, y: cY + padding, maxWidth: PDF.width - (padding * 2), size: 6, fontStyle: 'normal' });
    }

    PDF.mtBlock += hTitle + hContent ;
}

async function blocoUsoFisco() {
    const hNeeded = 12 + 45;
    const page = await ensureSpace(hNeeded);
    const hTitle = 12;
    const hContent = 45; 
    const wCol1 = PDF.width * 0.70;
    const wCol2 = PDF.width * 0.30;

    // Coluna 1: Uso Exclusivo
    addRet(page, 0, PDF.mtBlock, wCol1, hTitle);
    addTXT({ page, text: "USO EXCLUSIVO DO EMISSOR DO CT-E", x: 0, y: PDF.mtBlock + 3, maxWidth: wCol1, size: 7, fontStyle: 'negrito', align: 'center' });

    // Coluna 2: Reservado Fisco
    addRet(page, wCol1, PDF.mtBlock, wCol2, hTitle);
    addTXT({ page, text: "RESERVADO AO FISCO", x: wCol1, y: PDF.mtBlock + 3, maxWidth: wCol2, size: 7, fontStyle: 'negrito', align: 'center' });

    const cY = PDF.mtBlock + hTitle;
    
    // Caixas de Conteúdo
    addRet(page, 0, cY, wCol1, hContent);
    addRet(page, wCol1, cY, wCol2, hContent);

    PDF.mtBlock += hTitle + hContent ;
}
    
async function blocoHeaderSuperior(page = PDF.pages[0]) {
    const hBlock = 125; 
    const w1 = PDF.width * 0.40;
    const w2 = PDF.width * 0.60;
    const margin = 2;

    // --- Coluna 1: Emitente ---
    addRet(page, 0, 0, w1, hBlock);
    
    const hLogoSection = 50;
    
    if (logo) {
        // Logo centralizada no topo (100% da largura disponível)
        const imgH = 35;
        const imgW = w1 - margin * 4;
        await addIMG({ page, img: logo, x: margin * 2, y: margin, w: imgW, h: imgH });
    }

    // Título centralizado abaixo da logo (uma única linha)
    addTXT({ page, text: "IDENTIFICAÇÃO DO EMITENTE", x: 0, y: 40, maxWidth: w1, size: 7, fontStyle: 'negrito', align: 'center' });
    
    const txtX1 = margin;
    let yPos = hLogoSection + margin;
    
    // NOME
    addTXT({ page, text: "NOME:", x: txtX1, y: yPos, maxWidth: 30, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: cte.infCte.emit.xNome, x: txtX1 + 25, y: yPos - 1, maxWidth: w1 - 25 - margin, size: 7, fontStyle: 'negrito' });
    yPos += 14;

    // CNPJ e IE
    // CNPJ e IE (50% split each)
    const wDoc = (w1 - txtX1) / 2;
    addTXT({ page, text: "CNPJ:", x: txtX1, y: yPos, maxWidth: 20, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: embCNPJCPF(cte.infCte.emit.CNPJ), x: txtX1 + 18, y: yPos - 1, maxWidth: wDoc - 18, size: 7, fontStyle: 'negrito' });

    addTXT({ page, text: "IE:", x: txtX1 + wDoc, y: yPos, maxWidth: 15, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: cte.infCte.emit.IE || "", x: txtX1 + wDoc + 10, y: yPos - 1, maxWidth: wDoc - 10, size: 7, fontStyle: 'negrito' });
    yPos += 10;

    const end = cte.infCte.emit.enderEmit || {} as any;
    // ENDEREÇO
    addTXT({ page, text: "ENDEREÇO:", x: txtX1, y: yPos, maxWidth: 45, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: end.xLgr || "", x: txtX1 + 45, y: yPos - 1, maxWidth: w1 - txtX1 - 45 - margin, size: 7, fontStyle: 'negrito' });
    yPos += 10;

    // NÚMERO e COMPLEMENTO (50% split each)
    const wAddr = (w1 - txtX1) / 2;
    addTXT({ page, text: "NRO:", x: txtX1, y: yPos, maxWidth: 15, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: end.nro || "", x: txtX1 + 15, y: yPos - 1, maxWidth: wAddr - 15, size: 7, fontStyle: 'negrito' });

    addTXT({ page, text: "COMPL:", x: txtX1 + wAddr, y: yPos, maxWidth: 20, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: end.xCpl || "", x: txtX1 + wAddr + 20, y: yPos - 1, maxWidth: wAddr - 20, size: 7, fontStyle: 'negrito' });
    yPos += 10;

    // MUNICÍPIO e BAIRRO (50% split each)
    addTXT({ page, text: "MUN.:", x: txtX1, y: yPos, maxWidth: 15, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: end.xMun || "", x: txtX1 + 15, y: yPos - 1, maxWidth: wAddr - 15, size: 7, fontStyle: 'negrito' });

    addTXT({ page, text: "BAIRRO:", x: txtX1 + wAddr, y: yPos, maxWidth: 20, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: end.xBairro || "", x: txtX1 + wAddr + 20, y: yPos - 1, maxWidth: wAddr - 20, size: 7, fontStyle: 'negrito' });
    yPos += 10;

    // UF, CEP e TELEFONE (split into 3 parts: 20%, 40%, 40%)
    const wUF = (w1 - txtX1) * 0.20;
    const wCEP = (w1 - txtX1) * 0.40;
    const wTEL = (w1 - txtX1) * 0.40;
    
    addTXT({ page, text: "UF:", x: txtX1, y: yPos, maxWidth: 10, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: end.UF || "", x: txtX1 + 10, y: yPos - 1, maxWidth: wUF - 10, size: 7, fontStyle: 'negrito' });

    addTXT({ page, text: "CEP:", x: txtX1 + wUF, y: yPos, maxWidth: 15, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: end.CEP || "", x: txtX1 + wUF + 15, y: yPos - 1, maxWidth: wCEP - 15, size: 7, fontStyle: 'negrito' });

    addTXT({ page, text: "TEL:", x: txtX1 + wUF + wCEP, y: yPos, maxWidth: 15, size: 5, fontStyle: 'normal' });
    addTXT({ page, text: end.fone || "", x: txtX1 + wUF + wCEP + 15, y: yPos - 1, maxWidth: wTEL - 15, size: 7, fontStyle: 'negrito' });

    // --- Coluna 2: DACTE / Controle ---
    const gridY = 35;
    addRet(page, w1, 0, w2, gridY);
    
    // Row 1: DACTE title / Modal
    const wDACTE = w2 * 0.40;
    const wModal = w2 * 0.60;
    addTXT({ page, text: "DACTE", x: w1, y: margin + 1, maxWidth: wDACTE, size: 12, fontStyle: 'negrito', align: 'center' });
    addTXT({ page, text: "Documento Auxiliar do\nConhecimento de Transporte Eletrônico", x: w1, y: 18, maxWidth: wDACTE, size: 4, align: 'center', lineHeight: 5, fontStyle: 'normal' });
    
    addRet(page, w1 + wDACTE, 0, wModal, gridY);
    addTXT({ page, text: "MODAL", x: w1 + wDACTE, y: margin + 2, maxWidth: wModal, size: 6, fontStyle: 'negrito', align: 'center' });
    const ide = cte.infCte.ide || {} as any;
    const modais: Record<string, string> = { "01": "RODOVIÁRIO", "02": "AÉREO", "03": "AQUAVIÁRIO", "04": "FERROVIÁRIO", "05": "DUTOVIÁRIO", "06": "MULTIMODAL" };
    const modalType = ide.modal ? modais[String(ide.modal).padStart(2, '0')] || ide.modal : "";
    addTXT({ page, text: modalType, x: w1 + wDACTE, y: 18, maxWidth: wModal, size: 8, fontStyle: 'negrito', align: 'center' });

    // Row 2: 6 Columns
    const r2Y = gridY;
    const r2H = 25;
    const cWs = [0.10, 0.10, 0.20, 0.10, 0.30, 0.20].map(p => p * w2);
    const labels = ["MODELO", "SÉRIE", "NÚMERO", "FL", "DATA E HORA DE EMISSÃO", "INSC. SUFRAMA DESTINATÁRIO"];
    const dhEmi = ide.dhEmi ? new Date(ide.dhEmi).toLocaleString('pt-BR') : "";
    const values = ["57", ide.serie || "", ide.nCT || "", "1/1", dhEmi, (cte.infCte.dest as any)?.ISUF || ""];
    
    let curX = w1;
    labels.forEach((l, i) => {
        addRet(page, curX, r2Y, cWs[i], r2H);
        addTXT({ page, text: l, x: curX + 1, y: r2Y + 2, maxWidth: cWs[i] - 2, size: 4, fontStyle: 'negrito', align: 'center' });
        const valSize = i === 4 ? 5 : 6; 
        addTXT({ page, text: values[i], x: curX, y: r2Y + 12, maxWidth: cWs[i], size: valSize, fontStyle: 'normal', align: 'center' });
        curX += cWs[i];
    });

    // Row 3: Barcode
    const r3Y = r2Y + r2H;
    const r3H = 35;
    const idValue = cte.infCte["@Id"].replace("CTe", "");
    addRet(page, w1, r3Y, w2, r3H);
    await addIMG({ page, img: await barCode(), x: w1 + margin, y: r3Y + 2, w: w2 - margin * 2, h: r3H - 4 });

    // Row 4: Access Key
    const r4Y = r3Y + r3H;
    const r4H = hBlock - r4Y;
    addRet(page, w1, r4Y, w2, r4H);
    addTXT({ page, text: "Chave de acesso para consulta de autenticidade no site www.cte.fazenda.gov.br ou da Sefaz", x: w1, y: r4Y + 2, maxWidth: w2, size: 4, align: 'center', fontStyle: 'normal' });
    addTXT({ page, text: idValue.replace(/(\d{4})(?=\d)/g, "$1 "), x: w1, y: r4Y + 10, maxWidth: w2, size: 8, fontStyle: 'negrito', align: 'center' });

    PDF.mtBlock = hBlock;
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
