// src/libs/danfe.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { XMLParser } from "fast-xml-parser";
import JsBarcode from "jsbarcode";
var DANFe = async (data = {}) => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    parseTagValue: false
    // Evita conversão automática de valores
  });
  const root = parser.parse(data.xml || "");
  const getCaseInsensitiveKey = (obj, key) => {
    if (!obj || typeof obj !== "object") return void 0;
    const foundKey = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
    return foundKey ? obj[foundKey] : void 0;
  };
  let _nfeRaw;
  let _protNFe;
  const nfeProc = getCaseInsensitiveKey(root, "nfeProc");
  if (nfeProc) {
    _nfeRaw = getCaseInsensitiveKey(nfeProc, "NFe");
    _protNFe = getCaseInsensitiveKey(nfeProc, "protNFe");
  } else {
    _nfeRaw = getCaseInsensitiveKey(root, "NFe");
    _protNFe = getCaseInsensitiveKey(root, "protNFe");
  }
  if (!_nfeRaw) {
    if (getCaseInsensitiveKey(root, "cteProc") || getCaseInsensitiveKey(root, "CTe")) {
      throw new Error("O XML fornecido parece ser um CTe (Conhecimento de Transporte Eletr\xF4nico). Esta fun\xE7\xE3o (DANFe) \xE9 exclusiva para NFe (Notas Fiscais). O suporte para DACTE (CTe) ainda n\xE3o foi implementado.");
    }
    console.error("Conte\xFAdo do XML processado:", root);
    throw new Error("N\xE3o foi poss\xEDvel localizar a tag <NFe> no XML fornecido. Verifique se o conte\xFAdo \xE9 um XML de Nota Fiscal Eletr\xF4nica v\xE1lido.");
  }
  const _infNFe = getCaseInsensitiveKey(_nfeRaw, "infNFe");
  if (!_infNFe) {
    console.error("Estrutura do NFe encontrado:", _nfeRaw);
    throw new Error("N\xE3o foi poss\xEDvel localizar a tag <infNFe> dentro de <NFe>. Verifique se o conte\xFAdo do XML est\xE1 completo.");
  }
  const nfe = {
    ..._nfeRaw,
    infNFe: {
      ..._infNFe,
      ide: getCaseInsensitiveKey(_infNFe, "ide"),
      emit: getCaseInsensitiveKey(_infNFe, "emit"),
      dest: getCaseInsensitiveKey(_infNFe, "dest"),
      total: {
        ...getCaseInsensitiveKey(_infNFe, "total"),
        ICMSTot: getCaseInsensitiveKey(getCaseInsensitiveKey(_infNFe, "total"), "ICMSTot"),
        ISSQNtot: getCaseInsensitiveKey(getCaseInsensitiveKey(_infNFe, "total"), "ISSQNtot"),
        retTrib: getCaseInsensitiveKey(getCaseInsensitiveKey(_infNFe, "total"), "retTrib")
      },
      transp: getCaseInsensitiveKey(_infNFe, "transp"),
      det: getCaseInsensitiveKey(_infNFe, "det"),
      cobr: getCaseInsensitiveKey(_infNFe, "cobr"),
      pag: getCaseInsensitiveKey(_infNFe, "pag"),
      infAdic: getCaseInsensitiveKey(_infNFe, "infAdic"),
      infRespTec: getCaseInsensitiveKey(_infNFe, "infRespTec"),
      "@Id": getCaseInsensitiveKey(_infNFe, "@Id") || getCaseInsensitiveKey(_infNFe, "Id")
    }
  };
  let protNFe = _protNFe;
  if (protNFe) {
    protNFe = {
      ...protNFe,
      infProt: getCaseInsensitiveKey(protNFe, "infProt")
    };
  }
  const getTaxData = (imposto) => {
    if (!imposto) return null;
    const icmsTag = getCaseInsensitiveKey(imposto, "ICMS");
    const icmsDetail = icmsTag ? Object.values(icmsTag)[0] : {};
    const ipiTag = getCaseInsensitiveKey(imposto, "IPI");
    let ipiDetail = {};
    if (ipiTag) {
      ipiDetail = getCaseInsensitiveKey(ipiTag, "IPITrib") || getCaseInsensitiveKey(ipiTag, "IPINT") || {};
    }
    const pisTag = getCaseInsensitiveKey(imposto, "PIS");
    const pisDetail = pisTag ? Object.values(pisTag)[0] : {};
    const cofinsTag = getCaseInsensitiveKey(imposto, "COFINS");
    const cofinsDetail = cofinsTag ? Object.values(cofinsTag)[0] : {};
    const issqnDetail = getCaseInsensitiveKey(imposto, "ISSQN") || {};
    return {
      icms: {
        vBC: icmsDetail.vBC || "0.00",
        pICMS: icmsDetail.pICMS || icmsDetail.pICMSST || "0.00",
        vICMS: icmsDetail.vICMS || icmsDetail.vICMSST || "0.00",
        cst: icmsDetail.CST || icmsDetail.CSOSN || ""
      },
      ipi: {
        vBC: ipiDetail.vBC || "0.00",
        pIPI: ipiDetail.pIPI || "0.00",
        vIPI: ipiDetail.vIPI || "0.00",
        cst: ipiDetail.CST || ""
      },
      pis: {
        vBC: pisDetail.vBC || "0.00",
        pPIS: pisDetail.pPIS || "0.00",
        vPIS: pisDetail.vPIS || "0.00",
        cst: pisDetail.CST || ""
      },
      cofins: {
        vBC: cofinsDetail.vBC || "0.00",
        pCOFINS: cofinsDetail.pCOFINS || "0.00",
        vCOFINS: cofinsDetail.vCOFINS || "0.00",
        cst: cofinsDetail.CST || ""
      },
      issqn: {
        vBC: issqnDetail.vBC || "0.00",
        vAliq: issqnDetail.vAliq || "0.00",
        vISSQN: issqnDetail.vISSQN || "0.00",
        cListServ: issqnDetail.cListServ || ""
      }
    };
  };
  var PDF = {
    doc: await PDFDocument.create(),
    pages: [],
    width: 0,
    height: 0,
    mtBlock: 0,
    barCode: null
  }, consulta = typeof data.consulta != "undefined" ? parser.parse(data.consulta) : {}, logo = data.logo, imgDemo = data.imgDemo;
  PDF.pages.push(PDF.doc.addPage());
  PDF.width = PDF.pages[0].getWidth();
  PDF.height = PDF.pages[0].getHeight();
  async function addRet(page, x, y, w, h) {
    page.drawRectangle({
      x: x + 4,
      y: PDF.height - h - (y + 4),
      width: x + w + 8 >= PDF.width ? PDF.width - x - 8 : w,
      height: h,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1
    });
  }
  async function addLTH(page, x, y, h) {
    const startX = Math.max(x, 4);
    const endX = Math.min(x + h, PDF.width - 4);
    const fixedY = PDF.height - y - 4;
    page.drawLine({
      start: { x: startX, y: fixedY },
      end: { x: endX, y: fixedY },
      color: rgb(0, 0, 0),
      thickness: 1,
      dashArray: [5, 3]
    });
  }
  async function addLTV(page, x, y, w) {
    const fixedX = Math.max(4, Math.min(x, PDF.width - 4));
    const startY = Math.max(PDF.height - y - 4, 4);
    const endY = Math.max(PDF.height - (y + w) - 4, 4);
    page.drawLine({
      start: { x: fixedX, y: startY },
      end: { x: fixedX, y: endY },
      color: rgb(0, 0, 0),
      thickness: 1,
      dashArray: [5, 3]
    });
  }
  async function addTXT({
    page,
    text,
    x,
    y,
    maxWidth,
    fontStyle = "normal",
    size = 7,
    lineHeight,
    align = "left",
    cacl = false,
    opacity = 1
  }) {
    let font;
    switch (fontStyle) {
      case "negrito":
        font = await PDF.doc.embedFont(StandardFonts.TimesRomanBold);
        break;
      case "italic":
        font = await PDF.doc.embedFont(StandardFonts.TimesRomanItalic);
        break;
      default:
        font = await PDF.doc.embedFont(StandardFonts.TimesRoman);
    }
    if (maxWidth + x > PDF.width) maxWidth = PDF.width - x - 5;
    const effectiveLineHeight = lineHeight ?? size * 0.9;
    const lines = wrapText(text, maxWidth, font, size);
    if (cacl) return lines.length;
    lines.forEach((line, index) => {
      const textWidth = font.widthOfTextAtSize(line, size);
      let drawX = x + 4;
      if (align === "center") {
        drawX = x + (maxWidth - textWidth) / 2;
      } else if (align === "right") {
        drawX = x + maxWidth - textWidth;
      }
      page.drawText(line, {
        x: drawX,
        y: PDF.height - effectiveLineHeight - (y + 4) - index * effectiveLineHeight,
        size,
        font,
        opacity: opacity || 1
      });
    });
    return lines.length;
  }
  function wrapText(text, maxWidth, font, fontSize) {
    const paragraphs = text.split("\n");
    const lines = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.split(" ");
      let line = "";
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = line + word + " ";
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);
        if (testWidth > maxWidth && line !== "") {
          lines.push(line.trim());
          line = word + " ";
        } else {
          line = testLine;
        }
      }
      if (line.trim() !== "") {
        lines.push(line.trim());
      }
    }
    return lines;
  }
  function embCNPJCPF(valor) {
    const numeros = valor.replace(/\D/g, "");
    if (numeros.length === 11) {
      return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (numeros.length === 14) {
      return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    } else {
      return valor;
    }
  }
  async function gerarBlocos() {
    await bloco0();
    await bloco1();
    await bloco2();
    await bloco3();
    await bloco4();
    await bloco5();
    let fim = await bloco6();
    if (fim) {
      await blocoISSQN();
      await blocoRetencoes();
    }
    await bloco7();
    await bloco8();
    while (!fim) {
      PDF.mtBlock = 0;
      PDF.pages.push(PDF.doc.addPage());
      await bloco1();
      fim = await bloco6();
      if (fim) {
        await blocoISSQN();
        await blocoRetencoes();
      }
    }
    for (const [i, page] of PDF.pages.entries()) {
      addTXT({ page, size: 8, text: `Folha ${i + 1}/${PDF.pages.length}`, x: 235, y: i == 0 ? 142 : 82, maxWidth: PDF.width * 0.19, align: "center", fontStyle: "italic" });
      if (nfe.infNFe.ide.tpAmb == "2") {
        addTXT({ page, size: 30, text: `NFe EMITIDA EM HOMOLOGA\xC7\xC3O SEM VALOR FISCAL`, x: 0, y: PDF.height * 0.5, maxWidth: PDF.width, align: "center", opacity: 0.5, fontStyle: "negrito" });
      }
      if (typeof consulta?.retConsSitNFe?.procEventoNFe != "undefined") {
        for (const event of consulta.retConsSitNFe.procEventoNFe) {
          if (event.retEvento.infEvento.tpEvento == "110111") {
            addTXT({ page, size: 50, text: `CANCELADA`, x: 0, y: PDF.height * 0.6, maxWidth: PDF.width, align: "center", fontStyle: "negrito" });
          }
        }
      }
    }
  }
  async function bloco0(page = PDF.pages[PDF.pages.length - 1]) {
    addRet(page, 0, PDF.mtBlock + 0, PDF.width, 50);
    addRet(page, 0, PDF.mtBlock + 0, PDF.width * 0.8, 25);
    addRet(page, 0, PDF.mtBlock + 0, PDF.width * 0.8, 25);
    addRet(page, 0, PDF.mtBlock + 25, PDF.width * 0.8, 25);
    addRet(page, PDF.width * 0.17, PDF.mtBlock + 25, PDF.width * 0.63, 25);
    addTXT({ page, text: `RECEBEMOS DE ${nfe.infNFe.emit.xNome} OS PRODUTOS E/OU SERVI\xC7OS CONSTANTES DA NOTA FISCAL ELETR\xD4NICA INDICADA ABAIXO. EMISS\xC3O: ${new Date(nfe.infNFe.ide.dhEmi).toLocaleDateString("pt-BR")} VALOR TOTAL: ${parseFloat(nfe.infNFe.total.ICMSTot.vNF).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} DESTINAT\xC1RIO: NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL - ${nfe.infNFe.dest.enderDest.xLgr}, ${nfe.infNFe.dest.enderDest.nro} ${nfe.infNFe.dest.enderDest.xBairro} ${nfe.infNFe.dest.enderDest.xMun}-${nfe.infNFe.dest.enderDest.UF}`, x: 2, y: PDF.mtBlock + 2, maxWidth: PDF.width * 0.78 });
    addTXT({ page, text: "DATA DE RECEBIMENTO", x: 2, y: PDF.mtBlock + 25, maxWidth: PDF.width * 0.78 });
    addTXT({ page, text: "ASSINATURA DO RECEBEDOR", x: PDF.width * 0.173, y: PDF.mtBlock + 25, maxWidth: PDF.width });
    addTXT({ page, size: 18, text: "NFe", x: PDF.width * 0.8, y: PDF.mtBlock, maxWidth: PDF.width * 0.8, align: "center", fontStyle: "negrito" });
    addTXT({ page, size: 11, text: `N\xBA. ${nfe.infNFe.ide.nNF.padStart(9, "0")}`, x: PDF.width * 0.8, y: PDF.mtBlock + 20, maxWidth: PDF.width * 0.8, align: "center", fontStyle: "negrito" });
    addTXT({ page, size: 11, text: `S\xE9rie ${nfe.infNFe.ide.serie.padStart(3, "0")}`, x: PDF.width * 0.8, y: PDF.mtBlock + 30, maxWidth: PDF.width * 0.8, align: "center", fontStyle: "negrito" });
    addLTH(page, 0, PDF.mtBlock + 56, PDF.width);
    PDF.mtBlock += 60;
  }
  async function bloco1(page = PDF.pages[PDF.pages.length - 1]) {
    addRet(page, 0, PDF.mtBlock, PDF.width, 132);
    addRet(page, 0, PDF.mtBlock, PDF.width, 92);
    addRet(page, 0, PDF.mtBlock, PDF.width, 112);
    addRet(page, PDF.width * 0.401, PDF.mtBlock + 0, PDF.width, 92);
    addRet(page, PDF.width * 0.53, PDF.mtBlock + 38, 16, 20);
    addRet(page, PDF.width * 0.57, PDF.mtBlock + 0, PDF.width, 47);
    addRet(page, PDF.width * 0.57, PDF.mtBlock + 47, PDF.width, 23);
    addRet(page, PDF.width * 0.57, PDF.mtBlock + 70, PDF.width, 22);
    addRet(page, PDF.width * 0.57, PDF.mtBlock + 92, PDF.width, 20);
    addRet(page, PDF.width * 0.745, PDF.mtBlock + 112, PDF.width, 20);
    addRet(page, PDF.width * 0.497, PDF.mtBlock + 112, PDF.width, 20);
    addRet(page, PDF.width * 0.25, PDF.mtBlock + 112, PDF.width, 20);
    addTXT({ page, text: "IDENTIFICA\xC7\xC3O DO EMITENTE", x: 0, y: PDF.mtBlock + 2, maxWidth: PDF.width * 0.4, align: "center" });
    let mt = 0;
    if (typeof logo !== "undefined") {
      await addIMG({ page, img: logo, x: PDF.width * 0.18, y: PDF.mtBlock + 14, h: 37, w: 37 });
      mt += 12;
    }
    let sizeNome = 12;
    while (await addTXT({ page, size: sizeNome, text: `${nfe.infNFe.emit.xNome}`, x: 1, y: PDF.mtBlock + 35 + mt, maxWidth: PDF.width * 0.4, align: "center", fontStyle: "negrito", cacl: true }) >= 2) {
      sizeNome--;
    }
    addTXT({ page, size: sizeNome, text: `${nfe.infNFe.emit.xNome}`, x: 1, y: PDF.mtBlock + 35 + mt, maxWidth: PDF.width * 0.4, align: "center", fontStyle: "negrito" });
    addTXT({ page, size: 9, text: `${nfe.infNFe.emit.enderEmit.xLgr}, N\xB0${nfe.infNFe.emit.enderEmit.nro}`, x: 0, y: PDF.mtBlock + 45 + mt, maxWidth: PDF.width * 0.42, align: "center" });
    addTXT({ page, size: 9, text: `${nfe.infNFe.emit.enderEmit.xBairro} - ${nfe.infNFe.emit.enderEmit.CEP}`, x: 0, y: PDF.mtBlock + 55 + mt, maxWidth: PDF.width * 0.42, align: "center" });
    addTXT({ page, size: 9, text: `${nfe.infNFe.emit.enderEmit.xMun} - ${nfe.infNFe.emit.enderEmit.UF} Fone: ${nfe.infNFe.emit.enderEmit?.fone || ""}`, x: 0, y: PDF.mtBlock + 65 + mt, maxWidth: PDF.width * 0.42, align: "center" });
    addTXT({ page, size: 16, text: "DANFE", x: PDF.width * 0.393, y: PDF.mtBlock + 3, maxWidth: PDF.width * 0.2, align: "center", fontStyle: "negrito" });
    addTXT({ page, size: 8, text: "Documento Auxiliar da Nota Fiscal Eletr\xF4nica", x: PDF.width * 0.4, y: PDF.mtBlock + 19, maxWidth: PDF.width * 0.18, align: "center" });
    addTXT({ page, size: 8, text: "0 - ENTRADA", x: PDF.width * 0.415, y: PDF.mtBlock + 42, maxWidth: PDF.width * 0.19, align: "left" });
    addTXT({ page, size: 8, text: "1 - SA\xCDDA", x: PDF.width * 0.415, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.19, align: "left" });
    addTXT({ page, size: 20, text: nfe.infNFe.ide.tpNF, x: PDF.width * 0.534, y: PDF.mtBlock + 37, maxWidth: PDF.width * 0.19, align: "left" });
    addTXT({ page, size: 10, text: `N\xBA. ${nfe.infNFe.ide.nNF.padStart(9, "0")}`, x: PDF.width * 0.4, y: PDF.mtBlock + 63, maxWidth: PDF.width * 0.19, align: "center", fontStyle: "negrito" });
    addTXT({ page, size: 10, text: `S\xE9rie ${nfe.infNFe.ide.serie.padStart(3, "0")}`, x: PDF.width * 0.398, y: PDF.mtBlock + 72, maxWidth: PDF.width * 0.19, align: "center", fontStyle: "negrito" });
    await addIMG({ page, img: await barCode(), x: PDF.width * 0.595, y: PDF.mtBlock + 6, w: PDF.width * 0.39, h: 44 });
    addTXT({ page, text: "CHAVE DE ACESSO", x: PDF.width * 0.575, y: PDF.mtBlock + 47, maxWidth: PDF.width * 0.19 });
    addTXT({ page, size: 8, text: nfe.infNFe["@Id"].replace("NFe", "").replace(/(\d{4})(?=\d)/g, "$1 "), x: PDF.width * 0.595, y: PDF.mtBlock + 58, maxWidth: PDF.width * 0.39, align: "center", fontStyle: "negrito" });
    addTXT({ page, size: 8, text: "Consulta de autenticidade no portal nacional da NF-e", x: PDF.width * 0.595, y: PDF.mtBlock + 70, maxWidth: PDF.width * 0.39, align: "center" });
    addTXT({ page, size: 8, text: " www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora", x: PDF.width * 0.595, y: PDF.mtBlock + 81, maxWidth: PDF.width * 0.39, align: "center" });
    addTXT({ page, text: "PROTOCOLO DE AUTORIZA\xC7\xC3O DE USO", x: PDF.width * 0.575, y: PDF.mtBlock + 92, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: `${protNFe?.infProt?.nProt || ""} - ${protNFe?.infProt?.dhRecbto ? new Date(protNFe.infProt.dhRecbto).toLocaleString("pt-BR") : ""}`, x: PDF.width * 0.595, y: PDF.mtBlock + 101, maxWidth: PDF.width * 0.39, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "NATUREZA DA OPERA\xC7\xC3O", x: 3, y: PDF.mtBlock + 92, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: nfe.infNFe.ide.natOp, x: 3, y: PDF.mtBlock + 101, maxWidth: PDF.width * 0.58, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "INSCRI\xC7\xC3O ESTADUAL", x: 3, y: PDF.mtBlock + 112, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: nfe.infNFe.emit.IE || "", x: 3, y: PDF.mtBlock + 121, maxWidth: PDF.width * 0.25, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "INSCRI\xC7\xC3O MUNICIPAL", x: PDF.width * 0.255, y: PDF.mtBlock + 112, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: nfe.infNFe.emit.IM || "", x: PDF.width * 0.355, y: PDF.mtBlock + 121, maxWidth: PDF.width * 0.05, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "INSCRI\xC7\xC3O ESTADUAL DO SUBST. TRIBUT.", x: PDF.width * 0.5, y: PDF.mtBlock + 112, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: nfe.infNFe.emit.IEST || "", x: PDF.width * 0.6, y: PDF.mtBlock + 121, maxWidth: PDF.width * 0.05, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "CNPJ/CPF", x: PDF.width * 0.75, y: PDF.mtBlock + 112, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: embCNPJCPF(nfe.infNFe.emit?.CNPJ || nfe.infNFe.emit?.CPF || ""), x: PDF.width * 0.845, y: PDF.mtBlock + 121, maxWidth: PDF.width * 0.05, align: "center", fontStyle: "negrito" });
    PDF.mtBlock += 133;
  }
  async function barCode() {
    if (PDF.barCode != null) return PDF.barCode;
    const isNode = typeof window === "undefined";
    if (isNode) {
      const { createCanvas } = await import("canvas");
      const canvas = createCanvas(400, 100);
      JsBarcode(canvas, nfe.infNFe["@Id"], {
        format: "CODE128",
        displayValue: false,
        fontSize: 18
      });
      PDF.barCode = canvas.toDataURL("image/png");
      return PDF.barCode;
    } else {
      return new Promise((resolve, reject) => {
        try {
          const canvas = document.createElement("canvas");
          JsBarcode(canvas, nfe.infNFe["@Id"], {
            format: "CODE128",
            displayValue: false,
            fontSize: 18
          });
          PDF.barCode = canvas.toDataURL("image/png");
          resolve(PDF.barCode);
        } catch (err) {
          reject(err);
        }
      });
    }
  }
  async function bloco2(page = PDF.pages[PDF.pages.length - 1]) {
    addRet(page, 0, PDF.mtBlock + 10, PDF.width * 0.603, 20);
    addRet(page, PDF.width * 0.603, PDF.mtBlock + 10, PDF.width * 0.222, 20);
    addRet(page, PDF.width * 0.825, PDF.mtBlock + 10, PDF.width * 0.2, 20);
    addRet(page, PDF.width * 0.665, PDF.mtBlock + 30, PDF.width, 20);
    addRet(page, PDF.width * 0.825, PDF.mtBlock + 50, PDF.width * 0.2, 20);
    addRet(page, PDF.width * 0.665, PDF.mtBlock + 30, PDF.width * 0.16, 40);
    addRet(page, PDF.width * 0.503, PDF.mtBlock + 50, PDF.width * 0.162, 20);
    addRet(page, PDF.width * 0.465, PDF.mtBlock + 50, PDF.width * 0.038, 20);
    addRet(page, PDF.width * 0, PDF.mtBlock + 50, PDF.width * 0.465, 20);
    addRet(page, PDF.width * 0, PDF.mtBlock + 30, PDF.width * 0.465, 20);
    addTXT({ page, text: "DESTINAT\xC1RIO / REMETENTE", x: 3, y: PDF.mtBlock + 2, maxWidth: PDF.width * 0.4, fontStyle: "negrito" });
    addTXT({ page, text: "NOME / RAZ\xC3O SOCIAL", x: 3, y: PDF.mtBlock + 10, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: nfe.infNFe.dest.xNome, x: 3, y: PDF.mtBlock + 20, maxWidth: PDF.width * 0.58, fontStyle: "negrito" });
    addTXT({ page, text: "CNPJ/CPF", x: PDF.width * 0.61, y: PDF.mtBlock + 10, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: embCNPJCPF(nfe.infNFe.dest?.CNPJ || nfe.infNFe.dest?.CPF || ""), x: PDF.width * 0.51, y: PDF.mtBlock + 20, maxWidth: PDF.width * 0.42, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "DATA DA EMISS\xC3O", x: PDF.width * 0.83, y: PDF.mtBlock + 10, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: new Date(nfe.infNFe.ide.dhEmi).toLocaleDateString("pt-BR"), x: PDF.width * 0.83, y: PDF.mtBlock + 20, maxWidth: PDF.width * 0.42, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "ENDERE\xC7O", x: 2, y: PDF.mtBlock + 31, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: `${nfe.infNFe.dest.enderDest.xLgr}, N\xB0 ${nfe.infNFe.dest.enderDest.nro}`, x: 3, y: PDF.mtBlock + 40, maxWidth: PDF.width * 0.42, align: "left", fontStyle: "negrito" });
    addTXT({ page, text: "BAIRRO/DISTRITO", x: PDF.width * 0.47, y: PDF.mtBlock + 31, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: nfe.infNFe.dest.enderDest?.xBairro || "", x: PDF.width * 0.47, y: PDF.mtBlock + 40, maxWidth: PDF.width * 0.21, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "CEP", x: PDF.width * 0.67, y: PDF.mtBlock + 31, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: (nfe.infNFe?.dest?.enderDest?.CEP || "").replace(/^(\d{5})(\d{3})$/, "$1-$2"), x: PDF.width * 0.67, y: PDF.mtBlock + 40, maxWidth: PDF.width * 0.17, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "DATA DA SA\xCDDA/ENTRDA", x: PDF.width * 0.83, y: PDF.mtBlock + 31, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: new Date(nfe.infNFe.ide.dhEmi).toLocaleDateString("pt-BR"), x: PDF.width * 0.83, y: PDF.mtBlock + 40, maxWidth: PDF.width * 0.17, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "MUNICIPIO", x: 2, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: nfe.infNFe.dest?.enderDest?.xMun || "", x: 3, y: PDF.mtBlock + 60, maxWidth: PDF.width * 0.42, align: "left", fontStyle: "negrito" });
    addTXT({ page, text: "UF", x: PDF.width * 0.47, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: nfe.infNFe.dest.enderDest?.UF || "", x: PDF.width * 0.473, y: PDF.mtBlock + 60, maxWidth: PDF.width * 0.21, align: "left", fontStyle: "negrito" });
    addTXT({ page, text: "FONE/FAX", x: PDF.width * 0.505, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: nfe.infNFe.dest.enderDest?.fone || "", x: PDF.width * 0.505, y: PDF.mtBlock + 60, maxWidth: PDF.width * 0.17, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "INSCRI\xC7\xC3O ESTADUAL", x: PDF.width * 0.67, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: nfe.infNFe.dest.IE || "", x: PDF.width * 0.67, y: PDF.mtBlock + 60, maxWidth: PDF.width * 0.17, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "HORA DA SA\xCDDA/ENTRDA", x: PDF.width * 0.83, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: new Date(nfe.infNFe.ide.dhEmi).toLocaleTimeString("pt-BR"), x: PDF.width * 0.83, y: PDF.mtBlock + 60, maxWidth: PDF.width * 0.17, align: "center", fontStyle: "negrito" });
    PDF.mtBlock += 72;
  }
  async function bloco3(page = PDF.pages[PDF.pages.length - 1]) {
    let IndexX = 0, contL = 0;
    if (nfe.infNFe?.cobr?.dup != void 0) {
      addTXT({ page, text: "FATURA / DUPLICATA", x: 3, y: PDF.mtBlock, maxWidth: PDF.width * 0.25, fontStyle: "negrito" });
      if (Array.isArray(nfe.infNFe.cobr.dup) && nfe.infNFe.cobr.dup.length > 14) {
        addRet(page, PDF.width * IndexX, PDF.mtBlock + 8 + contL * 22, PDF.width, 20);
        addTXT({ page, text: `Existem mais de 14 duplicatas registradas, portanto n\xE3o ser\xE3o exibidas, confira diretamente pelo XML.`, x: 3, y: PDF.mtBlock + 13, maxWidth: PDF.width, align: "center" });
        IndexX += 0.25;
      } else {
        const cobrDup = Array.isArray(nfe.infNFe.cobr.dup) ? nfe.infNFe.cobr.dup : [nfe.infNFe.cobr.dup];
        console.log(cobrDup);
        for (const [index, dup] of cobrDup.entries()) {
          addRet(page, PDF.width * IndexX, PDF.mtBlock + 8 + contL * 22, PDF.width * 0.1428, 20);
          addTXT({ page, text: "Num.", x: PDF.width * IndexX + 1, y: PDF.mtBlock + 8 + contL * 22, maxWidth: PDF.width * 0.1458 });
          addTXT({ page, text: dup.nDup, x: PDF.width * IndexX + 1, y: PDF.mtBlock + 8 + contL * 22, maxWidth: PDF.width * 0.1458, align: "right", fontStyle: "negrito" });
          addTXT({ page, text: "Venc.", x: PDF.width * IndexX + 1, y: PDF.mtBlock + 14 + contL * 22, maxWidth: PDF.width * 0.1458 });
          addTXT({ page, text: new Date(dup.dVenc).toLocaleDateString("pt-BR"), x: PDF.width * IndexX + 1, y: PDF.mtBlock + 14 + contL * 22, maxWidth: PDF.width * 0.1458, align: "right", fontStyle: "negrito" });
          addTXT({ page, text: "Valor", x: PDF.width * IndexX + 1, y: PDF.mtBlock + 20 + contL * 22, maxWidth: PDF.width * 0.1458 });
          addTXT({ page, text: dup.vDup, x: PDF.width * IndexX + 1, y: PDF.mtBlock + 20 + contL * 22, maxWidth: PDF.width * 0.1458, align: "right", fontStyle: "negrito" });
          if (index + 1 < cobrDup.length) {
            if (IndexX + 0.1458 >= 1) {
              IndexX = 0;
              contL++;
            } else {
              IndexX += 0.146;
            }
          }
        }
      }
    } else if (nfe.infNFe?.pag?.detPag) {
      addTXT({ page, text: "PAGAMENTOS", x: 3, y: PDF.mtBlock, maxWidth: PDF.width * 0.25, fontStyle: "negrito" });
      const pagamentos = Array.isArray(nfe.infNFe.pag.detPag) ? nfe.infNFe.pag.detPag : [nfe.infNFe.pag.detPag];
      const formaPagto = {
        "01": "Dinheiro",
        "02": "Cheque",
        "03": "Cart\xE3o de Cr\xE9dito",
        "04": "Cart\xE3o de D\xE9bito",
        "05": "Cr\xE9dito Loja",
        "10": "Vale Alimenta\xE7\xE3o",
        "11": "Vale Refei\xE7\xE3o",
        "12": "Vale Presente",
        "13": "Vale Combust\xEDvel",
        "15": "Boleto Banc\xE1rio",
        "16": "Dep\xF3sito Banc\xE1rio",
        "17": "PIX",
        "18": "Transfer\xEAncia",
        "19": "Fidelidade",
        "90": "Sem pagamento",
        "99": "Outros"
      };
      for (const pag of pagamentos) {
        const forma = formaPagto[pag.tPag] || `C\xF3digo ${pag.tPag}`;
        const valor = parseFloat(pag.vPag).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        addRet(page, PDF.width * IndexX, PDF.mtBlock + 8 + contL * 22, PDF.width * 0.25, 20);
        addTXT({ page, text: "FORMA", x: PDF.width * IndexX + 3, y: PDF.mtBlock + 9 + contL * 22, maxWidth: PDF.width * 0.25 });
        addTXT({ page, text: forma, x: PDF.width * IndexX + 3, y: PDF.mtBlock + 19 + contL * 22, maxWidth: PDF.width * 0.25 });
        addTXT({ page, text: forma, x: PDF.width * IndexX + 3, y: PDF.mtBlock + 9 + contL * 22, maxWidth: PDF.width * 0.245, align: "right", fontStyle: "negrito" });
        addTXT({ page, text: valor, x: PDF.width * IndexX + 3, y: PDF.mtBlock + 19 + contL * 22, maxWidth: PDF.width * 0.245, align: "right", fontStyle: "negrito" });
        if (IndexX + 0.25 >= 1) {
          IndexX = 0.25;
          contL++;
        } else {
          IndexX += 0.25;
        }
      }
    }
    PDF.mtBlock += (contL + 1) * 22 + 7;
  }
  async function bloco4(page = PDF.pages[PDF.pages.length - 1]) {
    const ICMS = {
      vBC: "Base Calc. ICMS",
      vICMS: "Valor ICMS",
      vFCP: "Valor FCP",
      vICMSDeson: "ICMS Desonerado",
      vBCST: "Base Calc. ICMS ST",
      vST: "ICMS Subst. Trib.",
      vFCPST: "Valor FCP ST",
      vFCPSTRet: "FCP Retido ST",
      vProd: "Valor Produtos",
      vFrete: "Valor Frete",
      vSeg: "Valor Seguro",
      vDesc: "Valor Desconto",
      vII: "Valor Imp. Import.",
      vIPI: "Valor IPI",
      vIPIDevol: "IPI Devolvido",
      vPIS: "Valor PIS",
      vCOFINS: "Valor COFINS",
      vOutro: "Outras Desp. Acess.",
      vNF: "Valor Total NF-e"
    };
    addTXT({ page, text: "C\xC1LCULO DO IMPOSTO", x: 3, y: PDF.mtBlock, maxWidth: PDF.width * 0.25, fontStyle: "negrito" });
    let nextY = PDF.mtBlock + 8, nextX = 0, limitY = PDF.width - 8;
    for (const key of Object.keys(ICMS)) {
      const valor = nfe.infNFe.total.ICMSTot[key];
      const texto = valor ? parseFloat(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "0,00";
      await addRet(page, limitY * 0.111 * nextX, nextY, limitY * 0.111, 20);
      addTXT({ page, text: ICMS[key], x: 2 + limitY * 0.111 * nextX, y: nextY + 1, maxWidth: limitY * 0.111 });
      addTXT({ page, size: 10, text: texto.replace("R$", ""), x: limitY * 0.111 * nextX, y: nextY + 9, maxWidth: limitY * 0.111, align: "right", fontStyle: "negrito" });
      nextX++;
      if (nextX >= 9) {
        nextX = 0;
        nextY += 20;
      }
    }
    if (nextX === 0) {
      PDF.mtBlock = nextY + 3;
    } else {
      PDF.mtBlock = nextY + 23;
    }
  }
  async function bloco5(page = PDF.pages[PDF.pages.length - 1]) {
    const transp = nfe.infNFe.transp || {};
    const vol = Array.isArray(transp.vol) ? transp.vol[0] : transp.vol || {};
    const modFreteMap = {
      "0": "0-Remetente (CIF)",
      "1": "1-Destinat\xE1rio (FOB)",
      "2": "2-Terceiros",
      "3": "3-Pr\xF3prio/Remetente",
      "4": "4-Pr\xF3prio/Destinat\xE1rio",
      "9": "9-Sem Transporte"
    };
    addTXT({ page, text: "TRANSPORTADOR / VOLUMES TRANSPORTADOS", x: 3, y: PDF.mtBlock, maxWidth: PDF.width, fontStyle: "negrito" });
    addRet(page, 0, PDF.mtBlock + 8, PDF.width * 0.29, 20);
    addRet(page, PDF.width * 0.29, PDF.mtBlock + 8, PDF.width * 0.15, 20);
    addRet(page, PDF.width * 0.44, PDF.mtBlock + 8, PDF.width * 0.14, 20);
    addRet(page, PDF.width * 0.58, PDF.mtBlock + 8, PDF.width * 0.15, 20);
    addRet(page, PDF.width * 0.73, PDF.mtBlock + 8, PDF.width * 0.04, 20);
    addRet(page, PDF.width * 0.77, PDF.mtBlock + 8, PDF.width, 20);
    addRet(page, PDF.width * 0.77, PDF.mtBlock + 28, PDF.width, 20);
    addRet(page, PDF.width * 0.8, PDF.mtBlock + 48, PDF.width, 20);
    addRet(page, PDF.width * 0.6, PDF.mtBlock + 48, PDF.width, 20);
    addRet(page, PDF.width * 0.44, PDF.mtBlock + 48, PDF.width, 20);
    addRet(page, PDF.width * 0.27, PDF.mtBlock + 48, PDF.width, 20);
    addRet(page, PDF.width * 0.1, PDF.mtBlock + 48, PDF.width, 20);
    addRet(page, 0, PDF.mtBlock + 48, PDF.width, 20);
    addRet(page, 0, PDF.mtBlock + 28, PDF.width * 0.44, 20);
    addRet(page, 0, PDF.mtBlock + 28, PDF.width * 0.73, 20);
    const xNomeTransp = transp.transporta?.xNome || "";
    const sizeTransp = xNomeTransp.length > 30 ? 6 : 7;
    addTXT({ page, text: "NOME / RAZ\xC3O SOCIAL", x: 3, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: sizeTransp, text: xNomeTransp, x: 3, y: PDF.mtBlock + 18, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    const freteTxt = modFreteMap[transp.modFrete] || `C\xF3digo ${transp.modFrete || ""}`;
    const sizeFrete = freteTxt.length > 20 ? 6 : 7;
    addTXT({ page, text: "FRETE", x: PDF.width * 0.293, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.15 });
    addTXT({ page, size: sizeFrete, text: freteTxt, x: PDF.width * 0.293, y: PDF.mtBlock + 18, maxWidth: PDF.width * 0.15, fontStyle: "negrito" });
    addTXT({ page, text: "C\xD3DIGO ANTT", x: PDF.width * 0.443, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.15 });
    addTXT({ page, text: transp.veicTransp?.RNTC || "", x: PDF.width * 0.443, y: PDF.mtBlock + 18, maxWidth: PDF.width * 0.15, fontStyle: "negrito" });
    addTXT({ page, text: "PLACA DO VE\xCDCULO", x: PDF.width * 0.583, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.15 });
    addTXT({ page, text: transp.veicTransp?.placa || "", x: PDF.width * 0.583, y: PDF.mtBlock + 18, maxWidth: PDF.width * 0.15, fontStyle: "negrito" });
    addTXT({ page, text: "UF", x: PDF.width * 0.733, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.15 });
    addTXT({ page, text: transp.veicTransp?.UF || "", x: PDF.width * 0.733, y: PDF.mtBlock + 18, maxWidth: PDF.width * 0.15, fontStyle: "negrito" });
    addTXT({ page, text: "CNPJ/CPF", x: PDF.width * 0.773, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.15 });
    addTXT({ page, text: embCNPJCPF(transp.transporta?.CNPJ || transp.transporta?.CPF || ""), x: PDF.width * 0.773, y: PDF.mtBlock + 18, maxWidth: PDF.width * 0.15, fontStyle: "negrito" });
    addTXT({ page, text: "ENDERE\xC7O", x: 3, y: PDF.mtBlock + 29, maxWidth: PDF.width * 0.29 });
    addTXT({ page, text: transp.transporta?.xEnder || "", x: 3, y: PDF.mtBlock + 39, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    addTXT({ page, text: "MUNIC\xCDPIO", x: PDF.width * 0.443, y: PDF.mtBlock + 29, maxWidth: PDF.width * 0.29 });
    addTXT({ page, text: transp.transporta?.xMun || "", x: PDF.width * 0.443, y: PDF.mtBlock + 39, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    addTXT({ page, text: "UF", x: PDF.width * 0.733, y: PDF.mtBlock + 29, maxWidth: PDF.width * 0.29 });
    addTXT({ page, text: transp.transporta?.UF || "", x: PDF.width * 0.733, y: PDF.mtBlock + 39, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    addTXT({ page, text: "INSCRI\xC7\xC3O ESTADUAL", x: PDF.width * 0.773, y: PDF.mtBlock + 29, maxWidth: PDF.width * 0.29 });
    addTXT({ page, text: transp.transporta?.IE || "", x: PDF.width * 0.773, y: PDF.mtBlock + 39, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    addTXT({ page, text: "QUANTIDADE", x: 3, y: PDF.mtBlock + 49, maxWidth: PDF.width * 0.29 });
    addTXT({ page, text: vol.qVol || "", x: 3, y: PDF.mtBlock + 59, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    addTXT({ page, text: "ESP\xC9CIE", x: PDF.width * 0.102, y: PDF.mtBlock + 49, maxWidth: PDF.width * 0.29 });
    addTXT({ page, text: vol.esp || "", x: PDF.width * 0.102, y: PDF.mtBlock + 59, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    addTXT({ page, text: "MARCA", x: PDF.width * 0.273, y: PDF.mtBlock + 49, maxWidth: PDF.width * 0.29 });
    addTXT({ page, text: vol.marca || "", x: PDF.width * 0.273, y: PDF.mtBlock + 59, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    addTXT({ page, text: "NUMERA\xC7\xC3O", x: PDF.width * 0.443, y: PDF.mtBlock + 49, maxWidth: PDF.width * 0.29 });
    addTXT({ page, text: vol.nVol || "", x: PDF.width * 0.443, y: PDF.mtBlock + 59, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    addTXT({ page, text: "PESO BRUTO", x: PDF.width * 0.603, y: PDF.mtBlock + 49, maxWidth: PDF.width * 0.29 });
    addTXT({ page, text: vol.pesoB || "", x: PDF.width * 0.603, y: PDF.mtBlock + 59, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    addTXT({ page, text: "PESO L\xCDQUIDO", x: PDF.width * 0.803, y: PDF.mtBlock + 49, maxWidth: PDF.width * 0.29 });
    addTXT({ page, text: vol.pesoL || "", x: PDF.width * 0.803, y: PDF.mtBlock + 59, maxWidth: PDF.width * 0.29, fontStyle: "negrito" });
    PDF.mtBlock += 70;
  }
  async function bloco6(page = PDF.pages[PDF.pages.length - 1]) {
    const detArray = Array.isArray(nfe.infNFe.det) ? nfe.infNFe.det : [nfe.infNFe.det];
    addTXT({ page, text: "DADOS DOS PRODUTOS / SERVI\xC7OS", x: 3, y: PDF.mtBlock, maxWidth: PDF.width, fontStyle: "negrito" });
    let blockH;
    if (PDF.pages.length == 1) {
      blockH = PDF.height - PDF.mtBlock - 72;
    } else {
      blockH = PDF.height - PDF.mtBlock - 18;
    }
    addRet(page, 0, PDF.mtBlock + 8, PDF.width, blockH);
    addRet(page, 0, PDF.mtBlock + 8, PDF.width, 15);
    const colunas = [0.1, 0.34, 0.403, 0.453, 0.488, 0.525, 0.6, 0.655, 0.712, 0.76, 0.815, 0.875, 0.92, 0.957];
    for (const x of colunas) addLTV(page, PDF.width * x, PDF.mtBlock + 8, blockH);
    addTXT({ page, text: "C\xD3DIGO PRODUTO", x: PDF.width * 3e-3, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.09, align: "center" });
    addTXT({ page, text: "DESCRI\xC7\xC3O DO PRODUTO / SERVI\xC7O", x: PDF.width * 0.1, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.24, align: "center" });
    addTXT({ page, text: "NCM/SH", x: PDF.width * 0.34, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.06, align: "center" });
    addTXT({ page, text: "O/CST", x: PDF.width * 0.4, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.06, align: "center" });
    addTXT({ page, text: "CFOP", x: PDF.width * 0.46, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.025, align: "center" });
    addTXT({ page, text: "UN", x: PDF.width * 0.495, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.025, align: "center" });
    addTXT({ page, text: "QUANT.", x: PDF.width * 0.525, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.07, align: "center" });
    addTXT({ page, text: "VALOR\nUNIT", x: PDF.width * 0.592, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.07, align: "center" });
    addTXT({ page, text: "VALOR\nTOTAL", x: PDF.width * 0.65, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.07, align: "center" });
    addTXT({ page, text: "VALOR\nDESC", x: PDF.width * 0.7, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.07, align: "center" });
    addTXT({ page, text: "B.C\xC1LC\nICMS", x: PDF.width * 0.75, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.07, align: "center" });
    addTXT({ page, text: "VALOR\nICMS", x: PDF.width * 0.81, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.07, align: "center" });
    addTXT({ page, text: "VALOR\nIPI", x: PDF.width * 0.862, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.07, align: "center" });
    addTXT({ page, text: "AL\xCDQ.\nICMS", x: PDF.width * 0.924, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.03, align: "center" });
    addTXT({ page, text: "AL\xCDQ.\nIPI", x: PDF.width * 0.961, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.03, align: "center" });
    let line = 26, safetyMargin = 10;
    for (const [iDet, det] of detArray.entries()) {
      let prod = det.prod;
      prod.xProd = prod.xProd.split("\n").join(" ");
      const xProdLines = await addTXT({ page, text: prod.xProd, x: 0, y: 0, maxWidth: PDF.width * 0.237, align: "left", cacl: true });
      const itemHeight = xProdLines * 8.5;
      if (line + itemHeight > blockH - safetyMargin) {
        nfe.infNFe.det = detArray.slice(iDet);
        PDF.mtBlock += blockH + 10;
        return false;
      }
      const taxes = getTaxData(det.imposto);
      const icms = taxes?.icms || {};
      const ipi = taxes?.ipi || {};
      const fmt = (v) => parseFloat(v || "0.00").toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      const xProdH = await addTXT({ page, text: prod.xProd, x: PDF.width * 0.096, y: PDF.mtBlock + line, maxWidth: PDF.width * 0.237, align: "left" });
      const y = PDF.mtBlock + line + (xProdH - 1) * 3.5;
      const sizeProd = prod.cProd.length > 15 ? 5 : prod.cProd.length > 12 ? 6 : 7;
      addTXT({ page, size: sizeProd, text: prod.cProd, x: 0, y, maxWidth: PDF.width * 0.1, align: "center" });
      addTXT({ page, text: prod.NCM, x: PDF.width * 0.34, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: icms.cst || "", x: PDF.width * 0.398, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: prod.CFOP, x: PDF.width * 0.44, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: prod.uCom, x: PDF.width * 0.476, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(prod.qCom), x: PDF.width * 0.533, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(prod.vUnCom), x: PDF.width * 0.597, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(prod.vProd), x: PDF.width * 0.655, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(prod.vDesc), x: PDF.width * 0.705, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(icms.vBC), x: PDF.width * 0.756, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(icms.vICMS), x: PDF.width * 0.816, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(ipi.vIPI), x: PDF.width * 0.868, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(icms.pICMS), x: PDF.width * 0.908, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(ipi.pIPI), x: PDF.width * 0.954, y, maxWidth: PDF.width * 0.061, align: "center" });
      line += xProdH * 8.5;
    }
    PDF.mtBlock += blockH + 10;
    return true;
  }
  async function blocoISSQN(page = PDF.pages[PDF.pages.length - 1]) {
    const issqn = nfe.infNFe.total.ISSQNtot;
    if (!issqn || parseFloat(issqn.vServ || "0") === 0 && !issqn.vBC) return;
    addTXT({ page, text: "C\xC1LCULO DO ISSQN", x: 3, y: PDF.mtBlock, maxWidth: PDF.width * 0.25, fontStyle: "negrito" });
    const campos = {
      IM: "INSCRI\xC7\xC3O MUNICIPAL",
      vServ: "VALOR TOTAL DOS SERVI\xC7OS",
      vBC: "BASE DE C\xC1LCULO DO ISSQN",
      vISS: "VALOR DO ISSQN"
    };
    let nextX = 0, limitY = PDF.width - 8;
    const emit = nfe.infNFe.emit;
    const valores = {
      IM: emit.IM || "",
      vServ: issqn.vServ || "0.00",
      vBC: issqn.vBC || "0.00",
      vISS: issqn.vISS || "0.00"
    };
    for (const key of Object.keys(campos)) {
      const valor = valores[key];
      const texto = key !== "IM" && valor ? parseFloat(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace("R$", "") : valor;
      await addRet(page, limitY * 0.25 * nextX, PDF.mtBlock + 8, limitY * 0.25, 20);
      addTXT({ page, text: campos[key], x: 2 + limitY * 0.25 * nextX, y: PDF.mtBlock + 9, maxWidth: limitY * 0.25 });
      addTXT({ page, size: 10, text: texto, x: limitY * 0.25 * nextX, y: PDF.mtBlock + 17, maxWidth: limitY * 0.25, align: "right", fontStyle: "negrito" });
      nextX++;
    }
    PDF.mtBlock += 32;
  }
  async function blocoRetencoes(page = PDF.pages[PDF.pages.length - 1]) {
    const ret = nfe.infNFe.total.retTrib;
    if (!ret) return;
    const temValores = Object.values(ret).some((v) => v && parseFloat(v || "0") > 0);
    if (!temValores) return;
    addTXT({ page, text: "RETEN\xC7\xD5ES TRIBUT\xC1RIAS", x: 3, y: PDF.mtBlock, maxWidth: PDF.width * 0.25, fontStyle: "negrito" });
    const campos = {
      vRetPIS: "VALOR RETIDO PIS",
      vRetCOFINS: "VALOR RETIDO COFINS",
      vRetCSLL: "VALOR RETIDO CSLL",
      vBCIRRF: "BASE C\xC1LC. IRRF",
      vIRRF: "VALOR RETIDO IRRF",
      vBCRetPrev: "BASE C\xC1LC. RET. PREV.",
      vRetPrev: "VALOR RETIDO PREV."
    };
    let nextX = 0, limitY = PDF.width - 8, nextY = PDF.mtBlock + 8;
    for (const key of Object.keys(campos)) {
      const valor = ret[key];
      const texto = valor ? parseFloat(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace("R$", "") : "0,00";
      await addRet(page, limitY * 0.142 * nextX, nextY, limitY * 0.142, 20);
      addTXT({ page, text: campos[key], x: 2 + limitY * 0.142 * nextX, y: nextY + 1, maxWidth: limitY * 0.142 });
      addTXT({ page, size: 9, text: texto, x: limitY * 0.142 * nextX, y: nextY + 10, maxWidth: limitY * 0.142, align: "right", fontStyle: "negrito" });
      nextX++;
    }
    PDF.mtBlock += 32;
  }
  async function bloco7(page = PDF.pages[PDF.pages.length - 1]) {
    addTXT({ page, text: "DADOS ADICIONAIS", x: 3, y: PDF.mtBlock, maxWidth: PDF.width, fontStyle: "negrito" });
    addRet(page, 0, PDF.mtBlock + 8, PDF.width, 40);
    addRet(page, 0, PDF.mtBlock + 8, PDF.width * 0.65, 40);
    addTXT({ page, text: "INFORMA\xC7\xD5ES COMPLEMENTARES", x: 3, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.5, align: "left", fontStyle: "negrito" });
    addTXT({ page, text: "RESERVADO AO FISCO", x: PDF.width * 0.652, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.5, align: "left", fontStyle: "negrito" });
    if (await addTXT({ page, text: nfe.infNFe.infAdic?.infCpl || "", x: 3, y: PDF.mtBlock + 14, maxWidth: PDF.width * 0.65, align: "left", cacl: true }) >= 5) {
      addTXT({ page, text: (nfe.infNFe.infAdic?.infCpl || "").slice(0, 600) || "", x: 3, y: PDF.mtBlock + 14, maxWidth: PDF.width * 0.65, align: "left" });
    } else {
      addTXT({ page, text: nfe.infNFe.infAdic?.infCpl || "", x: 3, y: PDF.mtBlock + 14, maxWidth: PDF.width * 0.65, align: "left" });
    }
    ;
    PDF.mtBlock += 40;
  }
  async function bloco8(page = PDF.pages[PDF.pages.length - 1]) {
    const agora = /* @__PURE__ */ new Date();
    const dataFormatada = agora.toLocaleDateString("pt-BR");
    const horaFormatada = agora.toLocaleTimeString("pt-BR");
    const textoEsquerda = `Impresso em ${dataFormatada} \xE0s ${horaFormatada}. ${nfe.infNFe?.infRespTec?.xContato || ""}`;
    addTXT({ page, text: textoEsquerda, x: 3, y: PDF.mtBlock + 8, maxWidth: PDF.width, align: "left" });
    addTXT({ page, text: "Powered by @node-sped-pdf", x: 3, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.985, align: "right", fontStyle: "italic" });
  }
  async function addIMG({
    page,
    img,
    x,
    y,
    h,
    w
  }) {
    if (typeof img != void 0) {
      if (img.includes("http") || img.includes("wwww"))
        img = await fetch(img || "").then((response) => response.blob()).then((blob) => blob2base64(blob));
      const bytes = Uint8Array.from(atob(img.split(",")[1]), (c) => c.charCodeAt(0));
      const isPng = img?.startsWith("data:image/png");
      const image = isPng ? await PDF.doc.embedPng(bytes) : await PDF.doc.embedJpg(bytes);
      await page.drawImage(image, {
        x,
        y: PDF.height - y - h,
        // Corrige porque pdf-lib desenha do canto inferior da imagem
        width: w,
        height: h
      });
    }
  }
  async function blob2base64(blobOrBuffer) {
    const isBrowser = typeof window !== "undefined" && typeof window.FileReader !== "undefined";
    if (isBrowser) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blobOrBuffer);
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
      });
    } else {
      try {
        let buffer;
        if (blobOrBuffer instanceof Blob) {
          const arrayBuffer = await blobOrBuffer.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        } else if (Buffer.isBuffer(blobOrBuffer)) {
          buffer = blobOrBuffer;
        } else {
          buffer = Buffer.from(blobOrBuffer);
        }
        return buffer.toString("base64");
      } catch (err) {
        throw new Error(`Falha ao converter: ${err}`);
      }
    }
  }
  async function blocoDEMO(page = PDF.pages[PDF.pages.length - 1]) {
    imgDemo = await fetch(imgDemo || "").then((response) => response.blob()).then((blob) => blob2base64(blob));
    const base64Data = imgDemo?.split(",")[1];
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const isPng = imgDemo?.startsWith("data:image/png");
    const image = isPng ? await PDF.doc.embedPng(bytes) : await PDF.doc.embedJpg(bytes);
    page.drawImage(image, {
      x: 0,
      y: 0,
      // Corrige porque pdf-lib desenha do canto inferior da imagem
      width: PDF.width,
      height: PDF.height
    });
  }
  return new Promise(async (resolve, reject) => {
    await gerarBlocos();
    resolve(await PDF.doc.save());
  });
};

// src/libs/danfce.ts
import { PDFDocument as PDFDocument2, StandardFonts as StandardFonts2, rgb as rgb2 } from "pdf-lib";
import { XMLParser as XMLParser2 } from "fast-xml-parser";
import qrcode from "qrcode";
var DANFCe = async (data = {}) => {
  const parser = new XMLParser2({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    parseTagValue: false
    // Evita conversão automática de valores
  });
  var PDF = {
    doc: await PDFDocument2.create(),
    pages: [],
    width: 0,
    height: 0,
    mtBlock: 0,
    barCode: null
  }, isBrowser = typeof window !== "undefined", xml = parser.parse(data.xml || ""), xmlRes = data.xmlRes, logo = data.logo, imgDemo = data.imgDemo, extras = data.extras || [];
  PDF.pages.push(PDF.doc.addPage([
    230,
    await bloco0(null) + await bloco1(null) + await bloco2(null) + await bloco3(null) + await bloco4(null)
  ]));
  PDF.width = PDF.pages[0].getWidth();
  PDF.height = PDF.pages[0].getHeight();
  async function addRet(page, x, y, w, h) {
    page.drawRectangle({
      x: x + 4,
      y: PDF.height - h - (y + 4),
      width: x + w + 8 >= PDF.width ? PDF.width - x - 8 : w,
      height: h,
      borderColor: rgb2(0, 0, 0),
      borderWidth: 1
    });
  }
  async function addLTH(page, x, y, h) {
    const startX = Math.max(x, 4);
    const endX = Math.min(x + h, PDF.width - 4);
    const fixedY = PDF.height - y - 4;
    page.drawLine({
      start: { x: startX, y: fixedY },
      end: { x: endX, y: fixedY },
      color: rgb2(0, 0, 0),
      thickness: 1,
      dashArray: [5, 3]
    });
  }
  async function addLTV(page, x, y, w) {
    const fixedX = Math.max(4, Math.min(x, PDF.width - 4));
    const startY = Math.max(PDF.height - y - 4, 4);
    const endY = Math.max(PDF.height - (y + w) - 4, 4);
    page.drawLine({
      start: { x: fixedX, y: startY },
      end: { x: fixedX, y: endY },
      color: rgb2(0, 0, 0),
      thickness: 1,
      dashArray: [5, 3]
    });
  }
  async function addTXT({
    page,
    text,
    x,
    y,
    maxWidth,
    fontStyle = "normal",
    size = 7,
    lineHeight,
    align = "left",
    cacl = false
  }) {
    let font;
    switch (fontStyle) {
      case "negrito":
        font = await PDF.doc.embedFont(StandardFonts2.TimesRomanBold);
        break;
      case "italic":
        font = await PDF.doc.embedFont(StandardFonts2.TimesRomanItalic);
        break;
      default:
        font = await PDF.doc.embedFont(StandardFonts2.TimesRoman);
    }
    if (maxWidth + x > PDF.width) maxWidth = PDF.width - x - 2;
    const effectiveLineHeight = lineHeight ?? size * 0.9;
    const lines = wrapText(text, maxWidth, font, size);
    if (cacl) return lines.length;
    lines.forEach((line, index) => {
      const textWidth = font.widthOfTextAtSize(line, size);
      let drawX = x + 4;
      if (align === "center") {
        drawX = x + (maxWidth - textWidth) / 2;
      } else if (align === "right") {
        drawX = x + maxWidth - textWidth;
      }
      page.drawText(line, {
        x: drawX,
        y: PDF.height - effectiveLineHeight - (y + 4) - index * effectiveLineHeight,
        size,
        font
      });
    });
    return lines.length;
  }
  function wrapText(text, maxWidth, font, fontSize) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = line + word + " ";
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth && line !== "") {
        lines.push(line.trim());
        line = word + " ";
      } else {
        line = testLine;
      }
    }
    if (line.trim() !== "") {
      lines.push(line.trim());
    }
    return lines;
  }
  async function gerarBlocos() {
    await bloco0();
    await bloco1();
    await bloco2();
    await bloco3();
    await bloco4();
  }
  async function bloco0(page = PDF.pages[PDF.pages.length - 1]) {
    if (!page) return 74;
    let me = 0;
    if (typeof logo !== "undefined") {
      await addIMG({ page, img: logo, x: 3, y: PDF.mtBlock + 3, h: 60, w: 60 });
      me += 62;
    }
    const emit = xml?.NFe?.infNFe?.emit || {};
    const enderEmit = emit.enderEmit || {};
    let line = await addTXT({
      page,
      text: `${emit.xNome || "Emitente desconhecido"}`,
      x: 1 + me,
      y: PDF.mtBlock + 5,
      maxWidth: PDF.width,
      align: "center",
      fontStyle: "negrito"
    });
    PDF.mtBlock = (line - 1) * 2.7 + 10;
    await addTXT({
      page,
      text: `CNPJ: ${emit.CNPJ || "N/D"} - I.E.: ${emit.IE || "N/D"}`,
      x: 1 + me,
      y: PDF.mtBlock + 5,
      maxWidth: PDF.width,
      align: "center"
    });
    await addTXT({
      page,
      text: `${enderEmit.xLgr || "Logradouro desconhecido"}, N\xB0${enderEmit.nro || "S/N"}`,
      x: 0 + me,
      y: PDF.mtBlock + 13,
      maxWidth: PDF.width,
      align: "center"
    });
    await addTXT({
      page,
      text: `${enderEmit.xBairro || "Bairro N/D"} - ${enderEmit.CEP || "CEP N/D"}`,
      x: 0 + me,
      y: PDF.mtBlock + 20,
      maxWidth: PDF.width,
      align: "center"
    });
    await addTXT({
      page,
      text: `${enderEmit.xMun || "Cidade N/D"} - ${enderEmit.UF || "UF"} Fone: ${enderEmit.fone || "N/D"}`,
      x: 0 + me,
      y: PDF.mtBlock + 27,
      maxWidth: PDF.width,
      align: "center"
    });
    addLTH(page, 0, PDF.mtBlock + 55, PDF.width);
    await addTXT({
      page,
      text: `DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETR\xD4NICA`,
      x: 0,
      y: PDF.mtBlock + 57,
      maxWidth: PDF.width,
      align: "center",
      fontStyle: "negrito"
    });
    addLTH(page, 0, PDF.mtBlock + 72, PDF.width);
    PDF.mtBlock += 74;
    return 1;
  }
  async function bloco1(page = PDF.pages[PDF.pages.length - 1]) {
    const produtos = Array.isArray(xml?.NFe?.infNFe?.det) ? xml.NFe.infNFe.det : xml?.NFe?.infNFe?.det ? [xml.NFe.infNFe.det] : [];
    if (page == null) {
      let lIndex = 0;
      for (const det of produtos) {
        const prod = det?.prod || {};
        const text = prod.xProd || "";
        const wrappedLines = wrapText(
          text,
          230 * 0.42,
          await PDF.doc.embedFont(StandardFonts2.TimesRoman),
          7
        );
        lIndex += wrappedLines.length;
      }
      return 24 + lIndex * 10;
    } else {
      let line = 7, lIndex = 0;
      addTXT({ page, text: `CODIGO | DESCRI\xC7\xC3O`, x: PDF.width * 0, y: PDF.mtBlock, maxWidth: PDF.width * 0.5, align: "left" });
      addTXT({ page, text: `QTDE | UN | VL. UNIT | VL. TOTAL`, x: 0, y: PDF.mtBlock, maxWidth: PDF.width * 0.98, align: "right" });
      for (const det of produtos) {
        const prod = det?.prod || {};
        const fmt = (v) => parseFloat(v || "0.00").toLocaleString("pt-BR", {
          minimumFractionDigits: 2
        });
        const xProd = `${prod.cProd} | ${prod.xProd}`;
        const xProdH = await addTXT({
          page,
          text: xProd,
          x: 0,
          y: PDF.mtBlock + line,
          maxWidth: PDF.width * 0.5,
          align: "left"
        });
        const y = PDF.mtBlock + line + (xProdH - 1) * 2.7;
        addTXT({
          page,
          text: `${fmt(prod.qCom)} | ${prod.uCom || "UN"} | ${fmt(prod.vUnCom)} | ${fmt(prod.vProd)}`,
          x: 0,
          y,
          maxWidth: PDF.width * 0.98,
          align: "right"
        });
        line += xProdH * 6.9;
        lIndex += xProdH;
      }
      addLTH(page, 0, 7 + PDF.mtBlock + lIndex * 10, PDF.width);
      PDF.mtBlock += 8 + lIndex * 10;
      return 1;
    }
  }
  async function bloco2(page = PDF.pages[PDF.pages.length - 1]) {
    if (!page) {
      const pag2 = xml?.NFe?.infNFe?.pag || {};
      const detPag2 = Array.isArray(pag2.detPag) ? pag2.detPag : [pag2.detPag];
      return 40 + detPag2.length * 7;
    }
    ;
    const total = xml?.NFe?.infNFe?.total?.ICMSTot || {};
    const pag = xml?.NFe?.infNFe?.pag || {};
    const detPag = Array.isArray(pag.detPag) ? pag.detPag : [pag.detPag];
    const vTroco = parseFloat(pag.vTroco || "0.00");
    const qtdItens = Array.isArray(xml?.NFe?.infNFe?.det) ? xml.NFe.infNFe.det.length : xml?.NFe?.infNFe?.det ? 1 : 0;
    const fmt = (v) => parseFloat(v || "0.00").toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    await addTXT({ page, text: `Qtde. Total de Itens`, x: 0, y: PDF.mtBlock, maxWidth: PDF.width, align: "left" });
    await addTXT({ page, text: `${qtdItens}`, x: 0, y: PDF.mtBlock, maxWidth: PDF.width - 3, align: "right" });
    await addTXT({ page, text: `Valor Total R$`, x: 0, y: PDF.mtBlock + 7, maxWidth: PDF.width, align: "left" });
    await addTXT({ page, text: `${fmt(total.vProd)}`, x: 0, y: PDF.mtBlock + 7, maxWidth: PDF.width - 3, align: "right" });
    await addTXT({ page, text: `Valor a Pagar R$`, x: 0, y: PDF.mtBlock + 14, maxWidth: PDF.width, align: "left" });
    await addTXT({ page, text: `${fmt(total.vNF)}`, x: 0, y: PDF.mtBlock + 14, maxWidth: PDF.width - 3, align: "right" });
    await addTXT({ page, text: `FORMAS PAGAMENTOS`, x: 0, y: PDF.mtBlock + 21, maxWidth: PDF.width, align: "left", fontStyle: "negrito" });
    await addTXT({ page, text: `VALOR PAGO`, x: 0, y: PDF.mtBlock + 21, maxWidth: PDF.width - 3, align: "right", fontStyle: "negrito" });
    let linhaY = PDF.mtBlock + 28;
    const tPagMap = {
      "01": "Dinheiro",
      "02": "Cheque",
      "03": "Cart\xE3o de Cr\xE9dito",
      "04": "Cart\xE3o de D\xE9bito",
      "05": "Cr\xE9dito Loja",
      "10": "Vale Alimenta\xE7\xE3o",
      "11": "Vale Refei\xE7\xE3o",
      "12": "Vale Presente",
      "13": "Vale Combust\xEDvel",
      "15": "Boleto Banc\xE1rio",
      "16": "Dep\xF3sito Banc\xE1rio",
      "17": "Pagamento Instant\xE2neo (PIX)",
      "18": "Transfer\xEAncia banc\xE1ria, Carteira Digital",
      "19": "Programa de fidelidade",
      "90": "Sem pagamento",
      "99": "Outros"
    };
    for (const pagItem of detPag) {
      if (!pagItem) continue;
      const forma = tPagMap[pagItem.tPag] || "Forma desconhecida";
      const valor = fmt(pagItem.vPag);
      await addTXT({ page, text: forma.toUpperCase(), x: 0, y: linhaY, maxWidth: PDF.width, align: "left" });
      await addTXT({ page, text: valor, x: 0, y: linhaY, maxWidth: PDF.width - 3, align: "right" });
      linhaY += 7;
    }
    await addTXT({ page, text: `TROCO`, x: 0, y: linhaY, maxWidth: PDF.width, align: "left" });
    await addTXT({ page, text: `${fmt(vTroco)}`, x: 0, y: linhaY, maxWidth: PDF.width - 3, align: "right" });
    addLTH(page, 0, linhaY + 8, PDF.width);
    PDF.mtBlock = linhaY + 9;
    return 1;
  }
  async function bloco3(page = PDF.pages[PDF.pages.length - 1]) {
    if (!page) {
      let marg = 0;
      const dest2 = xml?.NFe?.infNFe.dest || {};
      if (Object.keys(dest2).length > 0) {
        marg += 7;
        if (typeof dest2.enderDest != null) {
          marg += 7;
        }
      }
      return 195 + marg;
    }
    ;
    const infNFe = xml?.NFe?.infNFe || {};
    const supl = xml?.NFe?.infNFeSupl || {};
    const ide = infNFe.ide || {};
    const dest = infNFe.dest || {};
    const dhEmi = ide.dhEmi ? new Date(ide.dhEmi) : /* @__PURE__ */ new Date();
    const dataFormatada = dhEmi.toLocaleDateString("pt-BR");
    const horaFormatada = dhEmi.toLocaleTimeString("pt-BR");
    const chave = infNFe["@Id"]?.replace("NFe", "") || "00000000000000000000000000000000000000000000";
    const chaveFormatada = chave.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
    const protocolo = infNFe.procEmi === "0" ? "Protocolo n\xE3o informado" : "Protocolo de Autoriza\xE7\xE3o 000000000000000";
    const dataAut = `Data de Autoriza\xE7\xE3o ${dataFormatada} ${horaFormatada}`;
    const serie = ide.serie || "0";
    const nNF = ide.nNF || "0";
    const cpf = dest?.CPF ? `CPF: ${dest.CPF}` : "N\xC3O INFORMADO";
    const nomeDest = dest?.xNome || null;
    const enderDest = dest?.enderDest || null;
    const endereco = enderDest ? `${enderDest.xLgr || ""}, ${enderDest.nro || "S/N"}, ${enderDest.xBairro || ""}, ${enderDest.xMun || ""}`.toUpperCase() : null;
    const qrCode = supl.qrCode || "http://www.sefaz.mt.gov.br/nfce/consultanfce";
    await addTXT({ page, text: `Consulte pela Chave de Acesso em`, x: 0, y: PDF.mtBlock, maxWidth: PDF.width, align: "center", fontStyle: "negrito" });
    await addTXT({ page, text: `www.sefaz.mt.gov.br/nfce/consulta`, x: 0, y: PDF.mtBlock + 7, maxWidth: PDF.width, align: "center" });
    await addTXT({ page, text: chaveFormatada, x: 0, y: PDF.mtBlock + 14, maxWidth: PDF.width, align: "center" });
    await addTXT({ page, text: `CONSUMIDOR - ${cpf}`, x: 0, y: PDF.mtBlock + 21, maxWidth: PDF.width, align: "center", fontStyle: "negrito" });
    PDF.mtBlock += 21;
    if (nomeDest) {
      await addTXT({ page, text: nomeDest, x: 0, y: PDF.mtBlock + 28, maxWidth: PDF.width, align: "center", fontStyle: "negrito" });
      PDF.mtBlock += 7;
    }
    if (endereco) {
      await addTXT({ page, text: endereco, x: 0, y: PDF.mtBlock + 7, maxWidth: PDF.width, align: "center", fontStyle: "negrito" });
      PDF.mtBlock += 7;
    }
    await addTXT({
      page,
      text: `NFC-e n. ${nNF} Serie ${serie} Hs ${dataFormatada} ${horaFormatada}`,
      x: 0,
      y: PDF.mtBlock + 7,
      maxWidth: PDF.width,
      align: "center",
      fontStyle: "negrito"
    });
    const qrCodeDataURL = await qrcode.toDataURL(qrCode);
    await addIMG({
      page,
      img: qrCodeDataURL,
      x: PDF.width / 2 - 75,
      y: PDF.mtBlock + 25,
      w: 150,
      h: 150
    });
    await addTXT({ page, text: protocolo, x: 0, y: PDF.mtBlock + 14, maxWidth: PDF.width, align: "center", fontStyle: "negrito" });
    await addTXT({ page, text: dataAut, x: 0, y: PDF.mtBlock + 21, maxWidth: PDF.width, align: "center", fontStyle: "negrito" });
    await addTXT({
      page,
      text: `Tributos Totais incidentes (Lei Federal 12.741/2012) - Total R$ 0,00 0,00% - Federal 0,00% - Estadual 0,00% - Municipal 0,00%`,
      x: 0,
      y: PDF.mtBlock + 161,
      maxWidth: PDF.width - 3,
      align: "center"
    });
    PDF.mtBlock += 169;
    return 1;
  }
  async function bloco4(page = PDF.pages[PDF.pages.length - 1]) {
    if (page == null) {
      let marg = 0;
      if (typeof extras != "undefined") {
        marg = extras?.length / 2;
        marg = Math.round(marg);
      }
      return marg * 7;
    } else {
      addLTH(page, 0, 7 + PDF.mtBlock, PDF.width);
      return 1;
    }
  }
  async function addIMG({
    page,
    img,
    x,
    y,
    h,
    w
  }) {
    if (typeof img != void 0) {
      if (img.includes("http") || img.includes("wwww"))
        img = await fetch(img || "").then((response) => response.blob()).then((blob) => blob2base64(blob));
      const bytes = Uint8Array.from(atob(img.split(",")[1]), (c) => c.charCodeAt(0));
      const isPng = img?.startsWith("data:image/png");
      const image = isPng ? await PDF.doc.embedPng(bytes) : await PDF.doc.embedJpg(bytes);
      await page.drawImage(image, {
        x,
        y: PDF.height - y - h,
        // Corrige porque pdf-lib desenha do canto inferior da imagem
        width: w,
        height: h
      });
    }
  }
  function blob2base64(blobOrBuffer) {
    return new Promise((resolve, reject) => {
      const isBrowser2 = typeof window !== "undefined" && typeof window.FileReader !== "undefined";
      if (isBrowser2) {
        const reader = new FileReader();
        reader.readAsDataURL(blobOrBuffer);
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
      } else {
        try {
          const buffer = Buffer.isBuffer(blobOrBuffer) ? blobOrBuffer : Buffer.from(blobOrBuffer);
          const base64 = `data:application/octet-stream;base64,${buffer.toString("base64")}`;
          resolve(base64);
        } catch (err) {
          reject(err);
        }
      }
    });
  }
  async function blocoDEMO(page = PDF.pages[PDF.pages.length - 1]) {
    imgDemo = await fetch(imgDemo || "").then((response) => response.blob()).then((blob) => blob2base64(blob));
    const base64Data = imgDemo?.split(",")[1];
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const isPng = imgDemo?.startsWith("data:image/png");
    const image = isPng ? await PDF.doc.embedPng(bytes) : await PDF.doc.embedJpg(bytes);
    page.drawImage(image, {
      x: 0,
      y: 0,
      // Corrige porque pdf-lib desenha do canto inferior da imagem
      width: PDF.width,
      height: PDF.height
    });
  }
  return new Promise(async (resolve, reject) => {
    await gerarBlocos();
    resolve(await PDF.doc.save());
  });
};

// src/libs/dav55.ts
import { PDFDocument as PDFDocument3, StandardFonts as StandardFonts3, rgb as rgb3 } from "pdf-lib";
import { XMLParser as XMLParser3 } from "fast-xml-parser";
import JsBarcode2 from "jsbarcode";
var DAV55 = async (data = { xml: {} }) => {
  const parser = new XMLParser3({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    parseTagValue: false
    // Evita conversão automática de valores
  });
  var PDF = {
    doc: await PDFDocument3.create(),
    pages: [],
    width: 0,
    height: 0,
    mtBlock: 0,
    barCode: null
  }, isBrowser = typeof window !== "undefined", xml = data.xml, logo = data.logo, imgDemo = data.imgDemo, orcamento = data.orcamento || false;
  PDF.pages.push(PDF.doc.addPage());
  PDF.width = PDF.pages[0].getWidth();
  PDF.height = PDF.pages[0].getHeight();
  async function addRet(page, x, y, w, h) {
    page.drawRectangle({
      x: x + 4,
      y: PDF.height - h - (y + 4),
      width: x + w + 8 >= PDF.width ? PDF.width - x - 8 : w,
      height: h,
      borderColor: rgb3(0, 0, 0),
      borderWidth: 1
    });
  }
  async function addLTH(page, x, y, h) {
    const startX = Math.max(x, 4);
    const endX = Math.min(x + h, PDF.width - 4);
    const fixedY = PDF.height - y - 4;
    page.drawLine({
      start: { x: startX, y: fixedY },
      end: { x: endX, y: fixedY },
      color: rgb3(0, 0, 0),
      thickness: 1,
      dashArray: [5, 3]
    });
  }
  async function addLTV(page, x, y, w) {
    const fixedX = Math.max(4, Math.min(x, PDF.width - 4));
    const startY = Math.max(PDF.height - y - 4, 4);
    const endY = Math.max(PDF.height - (y + w) - 4, 4);
    page.drawLine({
      start: { x: fixedX, y: startY },
      end: { x: fixedX, y: endY },
      color: rgb3(0, 0, 0),
      thickness: 1,
      dashArray: [5, 3]
    });
  }
  async function addTXT({
    page,
    text,
    x,
    y,
    maxWidth,
    fontStyle = "normal",
    size = 7,
    lineHeight,
    align = "left",
    cacl = false,
    opacity = 1
  }) {
    let font;
    switch (fontStyle) {
      case "negrito":
        font = await PDF.doc.embedFont(StandardFonts3.TimesRomanBold);
        break;
      case "italic":
        font = await PDF.doc.embedFont(StandardFonts3.TimesRomanItalic);
        break;
      default:
        font = await PDF.doc.embedFont(StandardFonts3.TimesRoman);
    }
    if (maxWidth + x > PDF.width) maxWidth = PDF.width - x - 2;
    const effectiveLineHeight = lineHeight ?? size * 0.9;
    const lines = wrapText(`${text}`, maxWidth, font, size);
    if (cacl) return lines.length;
    lines.forEach((line, index) => {
      const textWidth = font.widthOfTextAtSize(line, size);
      let drawX = x + 4;
      if (align === "center") {
        drawX = x + (maxWidth - textWidth) / 2;
      } else if (align === "right") {
        drawX = x + maxWidth - textWidth;
      }
      page.drawText(line, {
        x: drawX,
        y: PDF.height - effectiveLineHeight - (y + 4) - index * effectiveLineHeight,
        size,
        font,
        opacity: opacity || 1
      });
    });
    return lines.length;
  }
  function wrapText(text, maxWidth, font, fontSize) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = line + word + " ";
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth && line !== "") {
        lines.push(line.trim());
        line = word + " ";
      } else {
        line = testLine;
      }
    }
    if (line.trim() !== "") {
      lines.push(line.trim());
    }
    return lines;
  }
  function embCNPJCPF(valor) {
    const numeros = (valor || "").replace(/\D/g, "");
    if (numeros.length === 11) {
      return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (numeros.length === 14) {
      return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    } else {
      return valor;
    }
  }
  async function gerarBlocos() {
    await bloco1();
    if (xml.tagDetPag.length > 0)
      await bloco3();
    await bloco4();
    let fim = await bloco6();
    await bloco7();
    await bloco8();
    while (!fim) {
      PDF.mtBlock = 0;
      PDF.pages.push(PDF.doc.addPage());
      await bloco1();
      fim = await bloco6();
    }
    for (const [i, page] of PDF.pages.entries()) {
      addTXT({ page, size: 8, text: `Folha ${i + 1}/${PDF.pages.length}`, x: 235, y: 80, maxWidth: PDF.width * 0.19, align: "center", fontStyle: "italic" });
      if (orcamento)
        addTXT({ page, size: 60, text: `OR\xC7AMENTO`, x: 0, y: PDF.height * 0.6, maxWidth: PDF.width, align: "center", fontStyle: "negrito", opacity: 0.3 });
    }
  }
  async function bloco1(page = PDF.pages[PDF.pages.length - 1]) {
    addRet(page, 0, PDF.mtBlock, PDF.width, 132);
    addRet(page, 0, PDF.mtBlock, PDF.width, 92);
    addRet(page, 0, PDF.mtBlock, PDF.width, 112);
    addRet(page, PDF.width * 0.401, PDF.mtBlock + 0, PDF.width, 92);
    addRet(page, PDF.width * 0.53, PDF.mtBlock + 38, 16, 20);
    addRet(page, PDF.width * 0.57, PDF.mtBlock + 0, PDF.width, 92);
    addRet(page, PDF.width * 0.57, PDF.mtBlock + 92, PDF.width, 20);
    addRet(page, PDF.width * 0.745, PDF.mtBlock + 112, PDF.width, 20);
    addRet(page, PDF.width * 0.497, PDF.mtBlock + 112, PDF.width, 20);
    addRet(page, PDF.width * 0.25, PDF.mtBlock + 112, PDF.width, 20);
    addTXT({ page, text: "IDENTIFICA\xC7\xC3O DO EMITENTE", x: 0, y: PDF.mtBlock + 2, maxWidth: PDF.width * 0.4, align: "center" });
    addTXT({ page, text: "IDENTIFICA\xC7\xC3O DO DESTINATARIO", x: PDF.width * 0.6, y: PDF.mtBlock + 2, maxWidth: PDF.width * 0.4, align: "center" });
    let mt = 0;
    if (typeof logo !== "undefined") {
      await addIMG({ page, img: logo, x: PDF.width * 0.18, y: PDF.mtBlock + 14, h: 37, w: 37 });
      mt += 12;
    }
    let sizeNome = 12;
    while (await addTXT({ page, size: sizeNome, text: `${xml.tagEmit?.xNome}`, x: 1, y: PDF.mtBlock + 35 + mt, maxWidth: PDF.width * 0.4, align: "center", fontStyle: "negrito", cacl: true }) >= 2) {
      sizeNome--;
    }
    addTXT({ page, size: sizeNome, text: `${xml.tagEmit?.xNome}`, x: 1, y: PDF.mtBlock + 35 + mt, maxWidth: PDF.width * 0.4, align: "center", fontStyle: "negrito" });
    addTXT({ page, size: 9, text: `CNPJ/CPF ${embCNPJCPF(xml.tagEmit?.CPF || xml.tagEmit?.CNPJ)}`, x: 0, y: PDF.mtBlock + 46 + mt, maxWidth: PDF.width * 0.42, align: "center" });
    addTXT({ page, size: 9, text: `${xml.tagEmit?.xBairro || ""} - ${xml.tagEmit?.CEP || ""}, ${xml.tagEmit?.xLgr || ""}, N\xB0${xml.tagEmit?.nro || ""}`, x: 0, y: PDF.mtBlock + 55 + mt, maxWidth: PDF.width * 0.42, align: "center" });
    addTXT({ page, size: 9, text: `${xml.tagEmit?.xMun || ""} - ${xml.tagEmit?.UF || ""} Fone: ${xml.tagEmit?.fone || ""}`, x: 0, y: PDF.mtBlock + 65 + mt, maxWidth: PDF.width * 0.42, align: "center" });
    if (xml.tagDest) {
      sizeNome = 12;
      while (await addTXT({ page, size: sizeNome, text: `${xml.tagDest?.xNome}`, x: PDF.width * 0.58, y: PDF.mtBlock + 35 + mt, maxWidth: PDF.width * 0.4, align: "center", fontStyle: "negrito", cacl: true }) >= 2) {
        sizeNome--;
      }
      addTXT({ page, size: sizeNome, text: `${xml.tagDest?.xNome}`, x: PDF.width * 0.58, y: PDF.mtBlock + 35 + mt, maxWidth: PDF.width * 0.4, align: "center", fontStyle: "negrito" });
      addTXT({ page, size: 9, text: `CNPJ/CPF ${embCNPJCPF(xml.tagDest?.CPF || xml.tagDest?.CNPJ)}`, x: PDF.width * 0.58, y: PDF.mtBlock + 46 + mt, maxWidth: PDF.width * 0.42, align: "center" });
      addTXT({ page, size: 9, text: `${xml.tagDest?.xMun || ""} - ${xml.tagDest?.UF || ""}, ${xml.tagDest?.xBairro || ""} - ${xml.tagDest?.CEP || ""}, ${xml.tagDest?.xLgr || ""}, N\xB0${xml.tagDest?.nro || ""}`, x: PDF.width * 0.58, y: PDF.mtBlock + 55 + mt, maxWidth: PDF.width * 0.42, align: "center" });
      addTXT({ page, size: 9, text: ``, x: PDF.width * 0.6, y: PDF.mtBlock + 65 + mt, maxWidth: PDF.width * 0.42, align: "center" });
    } else {
    }
    addTXT({ page, size: 16, text: "CUPOM", x: PDF.width * 0.393, y: PDF.mtBlock + 3, maxWidth: PDF.width * 0.2, align: "center", fontStyle: "negrito" });
    addTXT({ page, size: 8, text: "Documento N\xC3O Fiscal", x: PDF.width * 0.4, y: PDF.mtBlock + 19, maxWidth: PDF.width * 0.18, align: "center" });
    addTXT({ page, size: 8, text: "0 - ENTRADA", x: PDF.width * 0.415, y: PDF.mtBlock + 42, maxWidth: PDF.width * 0.19, align: "left" });
    addTXT({ page, size: 8, text: "1 - SA\xCDDA", x: PDF.width * 0.415, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.19, align: "left" });
    addTXT({ page, size: 20, text: xml.tagIde.tpNF, x: PDF.width * 0.534, y: PDF.mtBlock + 37, maxWidth: PDF.width * 0.19, align: "left" });
    addTXT({ page, size: 10, text: `Codigo \xBA. ${xml.tagIde.nNF.padStart(9, "0")}`, x: PDF.width * 0.4, y: PDF.mtBlock + 63, maxWidth: PDF.width * 0.19, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "NATUREZA DA OPERA\xC7\xC3O", x: 3, y: PDF.mtBlock + 92, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: xml.tagIde.natOp, x: 3, y: PDF.mtBlock + 101, maxWidth: PDF.width * 0.58, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "INSCRI\xC7\xC3O ESTADUAL", x: 3, y: PDF.mtBlock + 112, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: xml.tagEmit.IE || "", x: 3, y: PDF.mtBlock + 121, maxWidth: PDF.width * 0.25, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "INSCRI\xC7\xC3O MUNICIPAL", x: PDF.width * 0.255, y: PDF.mtBlock + 112, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: xml.tagEmit.IM || "", x: PDF.width * 0.355, y: PDF.mtBlock + 121, maxWidth: PDF.width * 0.05, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "INSCRI\xC7\xC3O ESTADUAL DO SUBST. TRIBUT.", x: PDF.width * 0.5, y: PDF.mtBlock + 112, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: xml.tagEmit.IEST || "", x: PDF.width * 0.6, y: PDF.mtBlock + 121, maxWidth: PDF.width * 0.05, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "CNPJ/CPF", x: PDF.width * 0.75, y: PDF.mtBlock + 112, maxWidth: PDF.width * 0.29 });
    addTXT({ page, size: 10, text: embCNPJCPF(xml.tagEmit.CNPJ || xml.tagEmit.CPF), x: PDF.width * 0.845, y: PDF.mtBlock + 121, maxWidth: PDF.width * 0.05, align: "center", fontStyle: "negrito" });
    PDF.mtBlock += 133;
  }
  async function barCode() {
    if (PDF.barCode != null) return PDF.barCode;
    const isNode = typeof window === "undefined";
    if (isNode) {
      const { createCanvas } = await import("canvas");
      const canvas = createCanvas(400, 100);
      JsBarcode2(canvas, xml.NFe.infNFe["@Id"], {
        format: "CODE128",
        displayValue: false,
        fontSize: 18
      });
      PDF.barCode = canvas.toDataURL("image/png");
      return PDF.barCode;
    } else {
      return new Promise((resolve, reject) => {
        try {
          const canvas = document.createElement("canvas");
          JsBarcode2(canvas, xml.NFe.infNFe["@Id"], {
            format: "CODE128",
            displayValue: false,
            fontSize: 18
          });
          PDF.barCode = canvas.toDataURL("image/png");
          resolve(PDF.barCode);
        } catch (err) {
          reject(err);
        }
      });
    }
  }
  async function bloco2(page = PDF.pages[PDF.pages.length - 1]) {
    addRet(page, 0, PDF.mtBlock + 10, PDF.width * 0.603, 20);
    addRet(page, PDF.width * 0.603, PDF.mtBlock + 10, PDF.width * 0.222, 20);
    addRet(page, PDF.width * 0.825, PDF.mtBlock + 10, PDF.width * 0.2, 20);
    addRet(page, PDF.width * 0.665, PDF.mtBlock + 30, PDF.width, 20);
    addRet(page, PDF.width * 0.825, PDF.mtBlock + 50, PDF.width * 0.2, 20);
    addRet(page, PDF.width * 0.665, PDF.mtBlock + 30, PDF.width * 0.16, 40);
    addRet(page, PDF.width * 0.503, PDF.mtBlock + 50, PDF.width * 0.162, 20);
    addRet(page, PDF.width * 0.465, PDF.mtBlock + 50, PDF.width * 0.038, 20);
    addRet(page, PDF.width * 0, PDF.mtBlock + 50, PDF.width * 0.465, 20);
    addRet(page, PDF.width * 0, PDF.mtBlock + 30, PDF.width * 0.465, 20);
    addTXT({ page, text: "DESTINAT\xC1RIO / REMETENTE", x: 3, y: PDF.mtBlock + 2, maxWidth: PDF.width * 0.4, fontStyle: "negrito" });
    addTXT({ page, text: "NOME / RAZ\xC3O SOCIAL", x: 3, y: PDF.mtBlock + 10, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: xml.NFe.infNFe.dest.xNome, x: 3, y: PDF.mtBlock + 20, maxWidth: PDF.width * 0.58, fontStyle: "negrito" });
    addTXT({ page, text: "CNPJ/CPF", x: PDF.width * 0.61, y: PDF.mtBlock + 10, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: xml.NFe.infNFe.dest.CNPJ || xml.NFe.infNFe.dest.CPF, x: PDF.width * 0.51, y: PDF.mtBlock + 20, maxWidth: PDF.width * 0.42, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "DATA DA EMISS\xC3O", x: PDF.width * 0.83, y: PDF.mtBlock + 10, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: new Date(xml.tagIde.dhEmi).toLocaleDateString("pt-BR"), x: PDF.width * 0.83, y: PDF.mtBlock + 20, maxWidth: PDF.width * 0.42, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "ENDERE\xC7O", x: 2, y: PDF.mtBlock + 31, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: `${xml.NFe.infNFe.dest.enderDest.xLgr}, N\xB0 ${xml.NFe.infNFe.dest.enderDest.nro}`, x: 3, y: PDF.mtBlock + 40, maxWidth: PDF.width * 0.42, align: "left", fontStyle: "negrito" });
    addTXT({ page, text: "BAIRRO/DISTRITO", x: PDF.width * 0.47, y: PDF.mtBlock + 31, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: xml.NFe.infNFe.dest.enderDest.xBairro, x: PDF.width * 0.47, y: PDF.mtBlock + 40, maxWidth: PDF.width * 0.21, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "CEP", x: PDF.width * 0.67, y: PDF.mtBlock + 31, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: xml.NFe.infNFe.dest.enderDest.CEP.replace(/^(\d{5})(\d{3})$/, "$1-$2"), x: PDF.width * 0.67, y: PDF.mtBlock + 40, maxWidth: PDF.width * 0.17, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "DATA DA SA\xCDDA/ENTRDA", x: PDF.width * 0.83, y: PDF.mtBlock + 31, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: new Date(xml.tagIde.dhEmi).toLocaleDateString("pt-BR"), x: PDF.width * 0.83, y: PDF.mtBlock + 40, maxWidth: PDF.width * 0.17, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "MUNICIPIO", x: 2, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: xml.NFe.infNFe.dest.enderDest.xMun, x: 3, y: PDF.mtBlock + 60, maxWidth: PDF.width * 0.42, align: "left", fontStyle: "negrito" });
    addTXT({ page, text: "UF", x: PDF.width * 0.47, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: xml.NFe.infNFe.dest.enderDest.UF, x: PDF.width * 0.473, y: PDF.mtBlock + 60, maxWidth: PDF.width * 0.21, align: "left", fontStyle: "negrito" });
    addTXT({ page, text: "FONE/FAX", x: PDF.width * 0.505, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: xml.NFe.infNFe.dest.enderDest.fone || "", x: PDF.width * 0.505, y: PDF.mtBlock + 60, maxWidth: PDF.width * 0.17, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "INSCRI\xC7\xC3O ESTADUAL", x: PDF.width * 0.67, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: xml.NFe.infNFe.dest.IE || "", x: PDF.width * 0.67, y: PDF.mtBlock + 60, maxWidth: PDF.width * 0.17, align: "center", fontStyle: "negrito" });
    addTXT({ page, text: "HORA DA SA\xCDDA/ENTRDA", x: PDF.width * 0.83, y: PDF.mtBlock + 50, maxWidth: PDF.width * 0.4 });
    addTXT({ page, size: 9, text: new Date(xml.tagIde.dhEmi).toLocaleTimeString("pt-BR"), x: PDF.width * 0.83, y: PDF.mtBlock + 60, maxWidth: PDF.width * 0.17, align: "center", fontStyle: "negrito" });
    PDF.mtBlock += 73;
  }
  async function bloco3(page = PDF.pages[PDF.pages.length - 1]) {
    addTXT({ page, text: "PAGAMENTO", x: 3, y: PDF.mtBlock, maxWidth: PDF.width * 0.25, fontStyle: "negrito" });
    const pagamentos = Array.isArray(xml.tagDetPag) ? xml.tagDetPag : [xml.tagDetPag];
    const formaPagto = {
      "01": "Dinheiro",
      "02": "Cheque",
      "03": "Cart\xE3o de Cr\xE9dito",
      "04": "Cart\xE3o de D\xE9bito",
      "05": "Cr\xE9dito Loja",
      "10": "Vale Alimenta\xE7\xE3o",
      "11": "Vale Refei\xE7\xE3o",
      "12": "Vale Presente",
      "13": "Vale Combust\xEDvel",
      "15": "Boleto Banc\xE1rio",
      "16": "Dep\xF3sito Banc\xE1rio",
      "17": "PIX",
      "18": "Transfer\xEAncia",
      "19": "Fidelidade",
      "90": "Sem pagamento",
      "99": "Outros"
    };
    let offset = 0;
    for (const pag of pagamentos) {
      const forma = formaPagto[pag.tPag] || `C\xF3digo ${pag.tPag}`;
      const valor = parseFloat(pag.vPag).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      addRet(page, 0, PDF.mtBlock + 7 + offset, PDF.width * 0.25, 20);
      addTXT({ page, text: "FORMA", x: 3, y: PDF.mtBlock + 8 + offset, maxWidth: PDF.width * 0.25 });
      addTXT({ page, text: forma, x: 3, y: PDF.mtBlock + 18 + offset, maxWidth: PDF.width * 0.25 });
      addTXT({ page, text: forma, x: 3, y: PDF.mtBlock + 8 + offset, maxWidth: PDF.width * 0.245, align: "right", fontStyle: "negrito" });
      addTXT({ page, text: valor, x: 3, y: PDF.mtBlock + 18 + offset, maxWidth: PDF.width * 0.245, align: "right", fontStyle: "negrito" });
      offset += 22;
    }
    PDF.mtBlock += offset + 6;
  }
  async function bloco4(page = PDF.pages[PDF.pages.length - 1]) {
    const ICMS = {
      vProd: "Valor Produtos",
      vFrete: "Valor Frete",
      vSeg: "Valor Seguro",
      vDesc: "Valor Desconto",
      vOutro: "Outras Desp. Acess.",
      vNF: "Valor Total NF-e"
    };
    addTXT({ page, text: "TOTAIS", x: 3, y: PDF.mtBlock, maxWidth: PDF.width * 0.25, fontStyle: "negrito" });
    let nextY = PDF.mtBlock + 8, nextX = 0, limitY = PDF.width - 8;
    for (const key of Object.keys(ICMS)) {
      const valor = xml?.vTotal?.[key] || 0;
      const texto = valor ? parseFloat(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "0,00";
      await addRet(page, limitY * 0.111 * nextX, nextY, limitY * 0.111, 20);
      addTXT({ page, text: ICMS[key], x: 2 + limitY * 0.111 * nextX, y: nextY + 1, maxWidth: limitY * 0.111 });
      addTXT({ page, size: 10, text: texto.replace("R$", ""), x: limitY * 0.111 * nextX, y: nextY + 9, maxWidth: limitY * 0.111, align: "right", fontStyle: "negrito" });
      nextX++;
      if (nextX >= 9) {
        nextX = 0;
        nextY += 20;
      }
    }
    PDF.mtBlock += 30;
  }
  async function bloco6(page = PDF.pages[PDF.pages.length - 1]) {
    let hBlock = PDF.height - PDF.mtBlock - (PDF.pages.length == 1 ? 75 : 18);
    xml.tagProd = Array.isArray(xml.tagProd) ? xml.tagProd : [xml.tagProd];
    addTXT({ page, text: "DADOS DOS PRODUTOS / SERVI\xC7OS", x: 3, y: PDF.mtBlock, maxWidth: PDF.width, fontStyle: "negrito" });
    addRet(page, 0, PDF.mtBlock + 8, PDF.width, hBlock);
    addRet(page, 0, PDF.mtBlock + 8, PDF.width, 15);
    const colunas = [0.1, 0.49, 0.57, 0.64, 0.7, 0.775, 0.85, 0.925];
    for (const x of colunas) addLTV(page, PDF.width * x, PDF.mtBlock + 8, hBlock);
    addTXT({ page, text: "C\xD3DIGO PRODUTO", x: PDF.width * 3e-3, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.09, align: "center" });
    addTXT({ page, text: "DESCRI\xC7\xC3O DO PRODUTO / SERVI\xC7O", x: PDF.width * 0.1, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.24, align: "center" });
    addTXT({ page, text: "NCM/SH", x: PDF.width * 0.5, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.06, align: "center" });
    addTXT({ page, text: "CFOP", x: PDF.width * 0.59, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.025, align: "center" });
    addTXT({ page, text: "UN", x: PDF.width * 0.66, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.025, align: "center" });
    addTXT({ page, text: "QUANT.", x: PDF.width * 0.7, y: PDF.mtBlock + 12, maxWidth: PDF.width * 0.07, align: "center" });
    addTXT({ page, text: "VALOR UNIT", x: PDF.width * 0.775, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.07, align: "center" });
    addTXT({ page, text: "VALOR DESC", x: PDF.width * 0.85, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.07, align: "center" });
    addTXT({ page, text: "VALOR TOTAL", x: PDF.width * 0.925, y: PDF.mtBlock + 8.5, maxWidth: PDF.width * 0.07, align: "center" });
    let line = 24, lLimite = Math.floor(hBlock / 7), lIndex = 0;
    for (const [iDet, prod] of xml.tagProd.entries()) {
      lIndex += await addTXT({ page, text: prod.xProd, x: 0, y: 0, maxWidth: PDF.width * 0.39, align: "center", cacl: true });
      if (lIndex >= lLimite) {
        xml.tagProd.splice(0, iDet);
        PDF.mtBlock += hBlock + 12;
        return false;
      }
      const fmt = (v) => parseFloat(v || "0.00").toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      const xProdH = await addTXT({ page, text: prod.xProd, x: PDF.width * 0.096, y: PDF.mtBlock + line, maxWidth: PDF.width * 0.39, align: "left" });
      const y = PDF.mtBlock + line + (xProdH - 1) * 2.7;
      addTXT({ page, text: prod.cEAN || "", x: 0, y, maxWidth: PDF.width * 0.1, align: "center" });
      addTXT({ page, text: prod.NCM || "", x: PDF.width * 0.5, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: prod.CFOP || "", x: PDF.width * 0.575, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: prod.uCom || "", x: PDF.width * 0.64, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(prod.qCom), x: PDF.width * 0.71, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(prod.vUnCom), x: PDF.width * 0.783, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(prod.vDesc || 0), x: PDF.width * 0.86, y, maxWidth: PDF.width * 0.061, align: "center" });
      addTXT({ page, text: fmt(prod.vProd), x: PDF.width * 0.93, y, maxWidth: PDF.width * 0.061, align: "center" });
      line += xProdH * 6.9;
    }
    PDF.mtBlock += hBlock + 12;
    return true;
  }
  async function bloco7(page = PDF.pages[PDF.pages.length - 1]) {
    addTXT({ page, text: "DADOS ADICIONAIS", x: 3, y: PDF.mtBlock, maxWidth: PDF.width, fontStyle: "negrito" });
    addRet(page, 0, PDF.mtBlock + 8, PDF.width, 40);
    addRet(page, 0, PDF.mtBlock + 8, PDF.width * 0.65, 40);
    addTXT({ page, text: "INFORMA\xC7\xD5ES COMPLEMENTARES", x: 3, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.5, align: "left", fontStyle: "negrito" });
    addTXT({ page, text: "RESERVADO AO FISCO", x: PDF.width * 0.652, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.5, align: "left", fontStyle: "negrito" });
    if (await addTXT({ page, text: xml.taginfAdic?.infAdFisco || "", x: 3, y: PDF.mtBlock + 14, maxWidth: PDF.width * 0.65, align: "left", cacl: true }) >= 5) {
      addTXT({ page, text: xml.taginfAdic?.infAdFisco.slice(0, 400) + "..." || "", x: 3, y: PDF.mtBlock + 14, maxWidth: PDF.width * 0.65, align: "left" });
    } else {
      addTXT({ page, text: xml.taginfAdic?.infAdFisco || "", x: 3, y: PDF.mtBlock + 14, maxWidth: PDF.width * 0.65, align: "left" });
    }
    ;
    if (await addTXT({ page, text: xml.taginfAdic?.infCpl || "", x: PDF.width * 0.652, y: PDF.mtBlock + 14, maxWidth: PDF.width * 0.65, align: "left", cacl: true }) >= 5) {
      addTXT({ page, text: xml.taginfAdic?.infCpl.slice(0, 200) + "..." || "", x: PDF.width * 0.652, y: PDF.mtBlock + 14, maxWidth: PDF.width * 0.65, align: "left" });
    } else {
      addTXT({ page, text: xml.taginfAdic?.infCpl || "", x: PDF.width * 0.652, y: PDF.mtBlock + 14, maxWidth: PDF.width * 0.65, align: "left" });
    }
    ;
    PDF.mtBlock += 40;
  }
  async function bloco8(page = PDF.pages[PDF.pages.length - 1]) {
    const agora = /* @__PURE__ */ new Date();
    const dataFormatada = agora.toLocaleDateString("pt-BR");
    const horaFormatada = agora.toLocaleTimeString("pt-BR");
    const textoEsquerda = `Impresso em ${dataFormatada} \xE0s ${horaFormatada}.`;
    addTXT({ page, text: textoEsquerda, x: 3, y: PDF.mtBlock + 8, maxWidth: PDF.width, align: "left" });
    addTXT({ page, text: "Powered by @node-sped-pdf", x: 3, y: PDF.mtBlock + 8, maxWidth: PDF.width * 0.989, align: "right", fontStyle: "italic" });
  }
  async function addIMG({
    page,
    img,
    x,
    y,
    h,
    w
  }) {
    if (typeof img != void 0) {
      if (img.includes("http") || img.includes("wwww"))
        img = await fetch(img || "").then((response) => response.blob()).then((blob) => blob2base64(blob));
      const bytes = Uint8Array.from(atob(img.split(",")[1]), (c) => c.charCodeAt(0));
      const isPng = img?.startsWith("data:image/png");
      const image = isPng ? await PDF.doc.embedPng(bytes) : await PDF.doc.embedJpg(bytes);
      await page.drawImage(image, {
        x,
        y: PDF.height - y - h,
        // Corrige porque pdf-lib desenha do canto inferior da imagem
        width: w,
        height: h
      });
    }
  }
  async function blob2base64(blobOrBuffer) {
    const isBrowser2 = typeof window !== "undefined" && typeof window.FileReader !== "undefined";
    if (isBrowser2) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blobOrBuffer);
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
      });
    } else {
      try {
        let buffer;
        if (blobOrBuffer instanceof Blob) {
          const arrayBuffer = await blobOrBuffer.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        } else if (Buffer.isBuffer(blobOrBuffer)) {
          buffer = blobOrBuffer;
        } else {
          buffer = Buffer.from(blobOrBuffer);
        }
        return buffer.toString("base64");
      } catch (err) {
        throw new Error(`Falha ao converter: ${err}`);
      }
    }
  }
  async function blocoDEMO(page = PDF.pages[PDF.pages.length - 1]) {
    imgDemo = await fetch(imgDemo || "").then((response) => response.blob()).then((blob) => blob2base64(blob));
    const base64Data = imgDemo?.split(",")[1];
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const isPng = imgDemo?.startsWith("data:image/png");
    const image = isPng ? await PDF.doc.embedPng(bytes) : await PDF.doc.embedJpg(bytes);
    page.drawImage(image, {
      x: 0,
      y: 0,
      // Corrige porque pdf-lib desenha do canto inferior da imagem
      width: PDF.width,
      height: PDF.height
    });
  }
  return new Promise(async (resolve, reject) => {
    await gerarBlocos();
    resolve(await PDF.doc.save());
  });
};

// src/libs/dacte.ts
import { PDFDocument as PDFDocument4, rgb as rgb4, StandardFonts as StandardFonts4 } from "pdf-lib";
import { XMLParser as XMLParser4 } from "fast-xml-parser";
import JsBarcode3 from "jsbarcode";
async function DACTE(data) {
  const parser = new XMLParser4({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    parseTagValue: false
    // Garante que números longos (como chaves de acesso) sejam lidos como string
  });
  const xmlNormalized = data.xml.replace(/\r?\n|\r/g, "");
  const jsonObj = parser.parse(xmlNormalized);
  function getCaseInsensitiveKey(obj, key) {
    if (!obj) return void 0;
    const record = obj;
    const lowerKey = key.toLowerCase();
    const foundKey = Object.keys(record).find((k) => k.toLowerCase() === lowerKey);
    return foundKey ? record[foundKey] : void 0;
  }
  const cteProc = getCaseInsensitiveKey(jsonObj, "cteProc");
  const cteObj = getCaseInsensitiveKey(jsonObj, "CTe") || (cteProc ? getCaseInsensitiveKey(cteProc, "CTe") : void 0);
  if (!cteObj) {
    throw new Error("N\xE3o foi poss\xEDvel localizar a tag <CTe> no XML fornecido.");
  }
  const cte = cteObj;
  const protCTe = cteProc ? getCaseInsensitiveKey(cteProc, "protCTe") : void 0;
  var PDF = {
    doc: await PDFDocument4.create(),
    pages: [],
    width: 0,
    height: 0,
    mtBlock: 0,
    barCode: null,
    addPage: async () => PDF.doc.addPage()
  }, consulta = typeof data.consulta != "undefined" ? parser.parse(data.consulta) : {}, logo = data.logo, imgDemo = data.imgDemo;
  let tomador = null;
  if (cte.infCte.ide.toma3) {
    const t3 = cte.infCte.ide.toma3.toma;
    if (String(t3) === "0") tomador = cte.infCte.rem ?? null;
    if (String(t3) === "1") tomador = cte.infCte.exped ?? null;
    if (String(t3) === "2") tomador = cte.infCte.receb ?? null;
    if (String(t3) === "3") tomador = cte.infCte.dest ?? null;
  } else if (cte.infCte.ide.toma4) {
    tomador = cte.infCte.ide.toma4;
  }
  PDF.pages.push(PDF.doc.addPage());
  PDF.width = PDF.pages[0].getWidth();
  PDF.height = PDF.pages[0].getHeight();
  PDF.addPage = async () => {
    const newPage = PDF.doc.addPage();
    PDF.pages.push(newPage);
    return newPage;
  };
  async function addRet(page, x, y, w, h) {
    page.drawRectangle({
      x: x + 4,
      y: PDF.height - h - (y + 4),
      width: x + w + 8 >= PDF.width ? PDF.width - x - 8 : w,
      height: h,
      borderColor: rgb4(0, 0, 0),
      borderWidth: 1
    });
  }
  async function addTXT({
    page,
    text,
    x,
    y,
    maxWidth,
    fontStyle = "normal",
    size = 7,
    lineHeight,
    align = "left",
    cacl = false,
    opacity = 1
  }) {
    let font;
    const textStr = String(text || "");
    switch (fontStyle) {
      case "negrito":
        font = await PDF.doc.embedFont(StandardFonts4.HelveticaBold);
        break;
      case "italic":
        font = await PDF.doc.embedFont(StandardFonts4.HelveticaOblique);
        break;
      default:
        font = await PDF.doc.embedFont(StandardFonts4.Helvetica);
    }
    if (maxWidth + x > PDF.width) maxWidth = PDF.width - x - 5;
    const effectiveLineHeight = lineHeight ?? size * 0.9;
    const lines = wrapText(textStr, maxWidth, font, size);
    if (cacl) return lines.length;
    lines.forEach((line, index) => {
      const textWidth = font.widthOfTextAtSize(line, size);
      let drawX = x + 4;
      if (align === "center") {
        drawX = x + (maxWidth - textWidth) / 2;
      } else if (align === "right") {
        drawX = x + maxWidth - textWidth;
      }
      page.drawText(line, {
        x: drawX,
        y: PDF.height - effectiveLineHeight - (y + 4) - index * effectiveLineHeight,
        size,
        font,
        opacity: opacity || 1
      });
    });
    return lines.length;
  }
  function wrapText(text, maxWidth, font, fontSize) {
    const paragraphs = text.split("\n");
    const lines = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.split(" ");
      let line = "";
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = line + word + " ";
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);
        if (testWidth > maxWidth && line !== "") {
          lines.push(line.trim());
          line = word + " ";
        } else {
          line = testLine;
        }
      }
      if (line.trim() !== "") {
        lines.push(line.trim());
      }
    }
    return lines;
  }
  function embCNPJCPF(valor) {
    if (!valor) return "";
    const str = String(valor);
    const numeros = str.replace(/\D/g, "");
    if (numeros.length === 11) {
      return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (numeros.length === 14) {
      return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    return str;
  }
  async function barCode() {
    if (PDF.barCode != null) return PDF.barCode;
    const id = cte.infCte["@Id"].replace("CTe", "");
    const isNode = typeof window === "undefined";
    if (isNode) {
      const { createCanvas } = await import("canvas");
      const canvas = createCanvas(400, 100);
      JsBarcode3(canvas, id, { format: "CODE128", displayValue: false });
      PDF.barCode = canvas.toDataURL("image/png");
    } else {
      const canvas = document.createElement("canvas");
      JsBarcode3(canvas, id, { format: "CODE128", displayValue: false });
      PDF.barCode = canvas.toDataURL("image/png");
    }
    return PDF.barCode;
  }
  async function addIMG({ page, img, x, y, w, h }) {
    if (img) {
      const isBase64 = typeof img === "string" && img.startsWith("data:image");
      let base64 = img;
      if (!isBase64 && typeof img === "string") {
        base64 = await fetch(img).then((res) => res.blob()).then((blob) => blob2base64(blob));
      }
      const bytes = Uint8Array.from(atob(base64.split(",")[1]), (c) => c.charCodeAt(0));
      const isPng = base64.startsWith("data:image/png");
      const image = isPng ? await PDF.doc.embedPng(bytes) : await PDF.doc.embedJpg(bytes);
      page.drawImage(image, {
        x: x + 4,
        y: PDF.height - y - h - 4,
        width: w,
        height: h
      });
    }
  }
  async function blob2base64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
    });
  }
  async function ensureSpace(h) {
    if (PDF.mtBlock + h > PDF.height - 40) {
      const newPage = await PDF.addPage();
      PDF.mtBlock = 20;
      return newPage;
    }
    return PDF.pages[PDF.pages.length - 1];
  }
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
    const renderBox = async (participant, label, x, height) => {
      addRet(page, x, PDF.mtBlock, w, height);
      const mid = w / 2;
      addTXT({ page, text: label, x: x + padding, y: PDF.mtBlock + padding, maxWidth: 50, size: 6, fontStyle: "negrito" });
      let lY = PDF.mtBlock + padding;
      if (participant?.xNome) {
        addTXT({ page, text: participant.xNome, x: x + 50, y: lY, maxWidth: w - 55, size: 7, fontStyle: "normal" });
      }
      lY += 12;
      const end = (participant && ("enderRem" in participant ? participant.enderRem : "enderDest" in participant ? participant.enderDest : "enderExped" in participant ? participant.enderExped : "enderReceb" in participant ? participant.enderReceb : void 0)) ?? {};
      addTXT({ page, text: "End.:", x: x + padding, y: lY, maxWidth: 25, size: 5, fontStyle: "negrito" });
      if (participant) {
        const address = [end.xLgr, end.nro].filter(Boolean).join(", ");
        const fSize = address.length > 45 ? 5 : address.length > 35 ? 6 : 7;
        addTXT({ page, text: address, x: x + 25, y: lY - 1, maxWidth: w - 30, size: fSize, fontStyle: "normal" });
      }
      lY += 10;
      addTXT({ page, text: "Munic\xEDpio:", x: x + padding, y: lY, maxWidth: 35, size: 5, fontStyle: "negrito" });
      if (participant) {
        addTXT({ page, text: end.xMun || "", x: x + 35, y: lY - 1, maxWidth: mid - 40, size: 7, fontStyle: "normal" });
      }
      addTXT({ page, text: "CEP:", x: x + mid + padding, y: lY, maxWidth: 20, size: 5, fontStyle: "negrito" });
      if (participant) {
        addTXT({ page, text: end.CEP || "", x: x + mid + 20, y: lY - 1, maxWidth: mid - 25, size: 7, fontStyle: "normal" });
      }
      lY += 10;
      addTXT({ page, text: "CNPJ/CPF:", x: x + padding, y: lY, maxWidth: 35, size: 5, fontStyle: "negrito" });
      if (participant) {
        const docVal = embCNPJCPF(participant.CNPJ || participant.CPF);
        addTXT({ page, text: docVal, x: x + 35, y: lY - 1, maxWidth: mid - 40, size: 7, fontStyle: "normal" });
      }
      addTXT({ page, text: "IE:", x: x + mid + padding, y: lY, maxWidth: 15, size: 5, fontStyle: "negrito" });
      if (participant) {
        addTXT({ page, text: participant.IE || "ISENTO", x: x + mid + 15, y: lY - 1, maxWidth: mid - 20, size: 7, fontStyle: "normal" });
      }
      lY += 10;
      addTXT({ page, text: "UF:", x: x + padding, y: lY, maxWidth: 12, size: 5, fontStyle: "negrito" });
      if (participant) {
        addTXT({ page, text: end.UF || "", x: x + padding + 10, y: lY - 1, maxWidth: 15, size: 7, fontStyle: "normal" });
      }
      addTXT({ page, text: "Pa\xEDs:", x: x + 25, y: lY, maxWidth: 20, size: 5, fontStyle: "negrito" });
      if (participant) {
        addTXT({ page, text: end.xPais || "BRASIL", x: x + 40, y: lY - 1, maxWidth: mid - 45, size: 7, fontStyle: "normal" });
      }
      addTXT({ page, text: "Fone:", x: x + mid + padding, y: lY, maxWidth: 20, size: 5, fontStyle: "negrito" });
      if (participant) {
        addTXT({ page, text: participant.fone || "", x: x + mid + 20, y: lY - 1, maxWidth: mid - 25, size: 7, fontStyle: "normal" });
      }
    };
    const h1 = 25;
    const ide = cte.infCte.ide;
    addRet(page, 0, PDF.mtBlock, w, h1);
    addTXT({ page, text: "IN\xCDCIO DA PRESTA\xC7\xC3O", x: padding, y: PDF.mtBlock + padding, maxWidth: w - padding * 2, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: `${ide.UFIni} - ${ide.cMunIni} - ${ide.xMunIni}`, x: padding, y: PDF.mtBlock + 12, maxWidth: w - padding * 2, size: 7, fontStyle: "normal" });
    addRet(page, w, PDF.mtBlock, w, h1);
    addTXT({ page, text: "T\xC9RMINO DA PRESTA\xC7\xC3O", x: w + padding, y: PDF.mtBlock + padding, maxWidth: w - padding * 2, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: `${ide.UFFim} - ${ide.cMunFim} - ${ide.xMunFim}`, x: w + padding, y: PDF.mtBlock + 12, maxWidth: w - padding * 2, size: 7, fontStyle: "normal" });
    PDF.mtBlock += h1;
    await renderBox(cte.infCte.rem, "REMETENTE", 0, 60);
    await renderBox(cte.infCte.dest, "DESTINAT\xC1RIO", w, 60);
    PDF.mtBlock += 60;
    await renderBox(cte.infCte.exped, "EXPEDIDOR", 0, 60);
    await renderBox(cte.infCte.receb, "RECEBEDOR", w, 60);
    PDF.mtBlock += 60;
  }
  async function blocoTomador() {
    const page = await ensureSpace(60);
    const padding = 2;
    const h = 45;
    const w1 = PDF.width * 0.5;
    const w2 = PDF.width * 0.25;
    const w3 = PDF.width * 0.25;
    addRet(page, 0, PDF.mtBlock, PDF.width, h);
    [w1, w1 + w2].forEach((xSep) => {
      page.drawLine({
        start: { x: xSep + 4, y: PDF.height - PDF.mtBlock - 4 },
        end: { x: xSep + 4, y: PDF.height - PDF.mtBlock - h - 4 },
        thickness: 1,
        color: rgb4(0, 0, 0)
      });
    });
    let lY = PDF.mtBlock + padding;
    const end = (tomador && ("enderToma" in tomador ? tomador.enderToma : "enderRem" in tomador ? tomador.enderRem : "enderDest" in tomador ? tomador.enderDest : "enderExped" in tomador ? tomador.enderExped : "enderReceb" in tomador ? tomador.enderReceb : void 0)) ?? {};
    addTXT({ page, text: "TOMADOR:", x: padding, y: lY, maxWidth: 35, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: tomador?.xNome || "", x: 40, y: lY - 1, maxWidth: w1 - 45, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "Munic\xEDpio:", x: w1 + padding, y: lY, maxWidth: 35, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: end.xMun || "", x: w1 + 35 + padding, y: lY - 1, maxWidth: w2 - 40, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "CEP:", x: w1 + w2 + padding, y: lY, maxWidth: 20, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: end.CEP || "", x: w1 + w2 + 20 + padding, y: lY - 1, maxWidth: w3 - 25, size: 7, fontStyle: "normal" });
    lY += 13;
    addTXT({ page, text: "End.:", x: padding, y: lY, maxWidth: 30, size: 6, fontStyle: "negrito" });
    const address = [end.xLgr, end.nro].filter(Boolean).join(", ");
    addTXT({ page, text: address, x: 35, y: lY - 1, maxWidth: w1 - 40, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "UF:", x: w1 + padding, y: lY, maxWidth: 15, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: end.UF || "", x: w1 + 15 + padding, y: lY - 1, maxWidth: w2 - 20, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "Pa\xEDs:", x: w1 + w2 + padding, y: lY, maxWidth: 20, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: end.xPais || "BRASIL", x: w1 + w2 + 20 + padding, y: lY - 1, maxWidth: w3 - 25, size: 7, fontStyle: "normal" });
    lY += 13;
    addTXT({ page, text: "CNPJ/CPF:", x: padding, y: lY, maxWidth: 40, size: 6, fontStyle: "negrito" });
    const docVal = tomador ? embCNPJCPF(tomador.CNPJ || tomador.CPF) : "";
    addTXT({ page, text: docVal, x: 45, y: lY - 1, maxWidth: w1 - 50, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "IE:", x: w1 + padding, y: lY, maxWidth: 15, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: tomador?.IE || "ISENTO", x: w1 + 15 + padding, y: lY - 1, maxWidth: w2 - 20, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "Fone:", x: w1 + w2 + padding, y: lY, maxWidth: 20, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: tomador?.fone || "", x: w1 + w2 + 20 + padding, y: lY - 1, maxWidth: w3 - 25, size: 7, fontStyle: "normal" });
    PDF.mtBlock += h;
  }
  async function blocoCarga() {
    const page = await ensureSpace(25);
    const padding = 2;
    const h = 25;
    const wCol = PDF.width / 3;
    const infoCarga = cte.infCte.infCTeNorm?.infCarga;
    addRet(page, 0, PDF.mtBlock, PDF.width, h);
    [wCol, wCol * 2].forEach((xSep) => {
      page.drawLine({
        start: { x: xSep + 4, y: PDF.height - PDF.mtBlock - 4 },
        end: { x: xSep + 4, y: PDF.height - PDF.mtBlock - h - 4 },
        thickness: 1,
        color: rgb4(0, 0, 0)
      });
    });
    const lY = PDF.mtBlock + padding;
    const vY = lY + 10;
    addTXT({ page, text: "PRODUTO PREDOMINANTE", x: padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: infoCarga?.proPred || "", x: padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "OUTRAS CARACTER\xCDSTICAS DA CARGA", x: wCol + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: infoCarga?.xOutCat || "", x: wCol + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "VALOR TOTAL DA MERCADORIA", x: wCol * 2 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    const vCarga = parseFloat(infoCarga?.vCarga || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    addTXT({ page, text: vCarga, x: wCol * 2 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    PDF.mtBlock += h;
  }
  async function blocoQuantidades() {
    const page = await ensureSpace(25);
    const padding = 2;
    const h = 25;
    const wCol = PDF.width / 5;
    const infoCarga = cte.infCte.infCTeNorm?.infCarga;
    const qsRaw = infoCarga?.infQ;
    const qs = Array.isArray(qsRaw) ? qsRaw : qsRaw ? [qsRaw] : [];
    const getU = (code) => {
      const map = { "00": "M3", "01": "KG", "1": "KG", "02": "TON", "2": "TON", "03": "UN", "3": "UN", "04": "LTS", "4": "LTS", "05": "M3", "5": "M3" };
      return map[String(code).padStart(2, "0")] || map[String(code)] || String(code) || "";
    };
    addRet(page, 0, PDF.mtBlock, PDF.width, h);
    [1, 2, 3, 4].forEach((i) => {
      const xSep = wCol * i;
      page.drawLine({
        start: { x: xSep + 4, y: PDF.height - PDF.mtBlock - 4 },
        end: { x: xSep + 4, y: PDF.height - PDF.mtBlock - h - 4 },
        thickness: 1,
        color: rgb4(0, 0, 0)
      });
    });
    const lY = PDF.mtBlock + padding;
    const vY = lY + 10;
    page.drawLine({
      start: { x: wCol + 4, y: PDF.height - (lY + 9) - 4 },
      end: { x: PDF.width - 4, y: PDF.height - (lY + 9) - 4 },
      thickness: 1,
      color: rgb4(0, 0, 0)
    });
    addTXT({ page, text: "QUANTIDADE\nCARGA", x: padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    const getQ = (tipo) => qs.find((q) => String(q.tpMed).toUpperCase().includes(tipo.toUpperCase()));
    const pb = getQ("REAL");
    addTXT({ page, text: "PESO BRUTO", x: wCol + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    if (pb) {
      const val = parseFloat(pb.qCarga || pb.qMed || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      addTXT({ page, text: `${val} ${getU(pb.cUnid)}`, x: wCol + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    }
    const pl = getQ("LIQUIDO");
    addTXT({ page, text: "PESO L\xCDQUIDO", x: wCol * 2 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    if (pl) {
      const val = parseFloat(pl.qCarga || pl.qMed || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      addTXT({ page, text: `${val} ${getU(pl.cUnid)}`, x: wCol * 2 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    }
    const vol = getQ("M3") || getQ("VOLUME");
    addTXT({ page, text: "VOLUME", x: wCol * 3 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    if (vol) {
      const val = parseFloat(vol.qCarga || vol.qMed || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      addTXT({ page, text: `${val} ${getU(vol.cUnid)}`, x: wCol * 3 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    }
    const und = getQ("UNIDADE");
    addTXT({ page, text: "UNIDADES", x: wCol * 4 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    if (und) {
      const val = parseFloat(und.qCarga || und.qMed || "0").toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
      addTXT({ page, text: `${val} ${getU(und.cUnid)}`, x: wCol * 4 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    }
    PDF.mtBlock += h;
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
    addRet(page, 0, PDF.mtBlock, PDF.width, hTitle);
    addTXT({
      page,
      text: "COMPONENTES DO VALOR DA PRESTA\xC7\xC3O DE SERVI\xC7O",
      x: 0,
      y: PDF.mtBlock + 3,
      maxWidth: PDF.width,
      size: 7,
      fontStyle: "negrito",
      align: "center"
    });
    const cY = PDF.mtBlock + hTitle;
    addRet(page, 0, cY, PDF.width, hContent);
    [1, 2, 3].forEach((i) => {
      page.drawLine({
        start: { x: wCol * i + 4, y: PDF.height - cY - 4 },
        end: { x: wCol * i + 4, y: PDF.height - cY - hContent - 4 },
        thickness: 1,
        color: rgb4(0, 0, 0)
      });
    });
    page.drawLine({
      start: { x: wCol * 3 + 4, y: PDF.height - (cY + hContent / 2) - 4 },
      end: { x: PDF.width - 4, y: PDF.height - (cY + hContent / 2) - 4 },
      thickness: 1,
      color: rgb4(0, 0, 0)
    });
    const fmtV = (v) => parseFloat(String(v || "0")).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const col1Labels = ["Frete Peso", "Frete Valor", "Taxa de Coleta", "Taxa de Entrega"];
    let lY = cY + padding;
    col1Labels.forEach((label) => {
      const comp = components.find((c) => String(c.xNome).toUpperCase().includes(label.toUpperCase()));
      addTXT({ page, text: label.toUpperCase(), x: padding, y: lY, maxWidth: wCol / 2, size: 6, fontStyle: "normal" });
      addTXT({ page, text: fmtV(comp?.vComp), x: wCol * 1 - 50, y: lY, maxWidth: 45, size: 7, fontStyle: "normal", align: "right" });
      lY += 10;
    });
    const others = components.filter((c) => !col1Labels.some((l) => String(c.xNome).toUpperCase().includes(l.toUpperCase())));
    const col2 = others.slice(0, 4);
    const col3 = others.slice(4, 8);
    [col2, col3].forEach((colItems, idx) => {
      let colX = wCol * (idx + 1) + padding;
      let itemY = cY + padding;
      colItems.forEach((item) => {
        addTXT({ page, text: String(item.xNome).toUpperCase(), x: colX, y: itemY, maxWidth: wCol / 2, size: 6, fontStyle: "normal" });
        addTXT({ page, text: fmtV(item.vComp), x: colX + (wCol - 50), y: itemY, maxWidth: 45, size: 7, fontStyle: "normal", align: "right" });
        itemY += 10;
      });
    });
    const col4X = wCol * 3 + padding;
    addTXT({ page, text: "VALOR TOTAL DO SERVI\xC7O", x: col4X, y: cY + 5, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: `R$ ${fmtV(vPrest?.vTPrest)}`, x: col4X, y: cY + 13, maxWidth: wCol - padding, size: 8, fontStyle: "normal" });
    addTXT({ page, text: "VALOR A RECEBER", x: col4X, y: cY + 28, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: `R$ ${fmtV(vPrest?.vRec)}`, x: col4X, y: cY + 36, maxWidth: wCol - padding, size: 8, fontStyle: "normal" });
    PDF.mtBlock += hTotal;
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
    let data2 = {};
    if (icms) {
      const dataKey = Object.keys(icms).find((k) => k.startsWith("ICMS") && k !== "ICMS");
      data2 = dataKey ? icms[dataKey] : icms;
    }
    const getDesc = (code) => {
      const map = {
        "00": "Tributa\xE7\xE3o normal ICMS",
        "20": "Tributa\xE7\xE3o com redu\xE7\xE3o de BC",
        "40": "ICMS isento",
        "41": "ICMS n\xE3o tributado",
        "45": "ICMS Diferido",
        "60": "ICMS cobrado por ST",
        "90": "ICMS outros",
        "101": "Simples Nacional com cr\xE9dito",
        "102": "Simples Nacional sem cr\xE9dito",
        "201": "Simples Nacional com ST e cr\xE9dito",
        "202": "Simples Nacional com ST sem cr\xE9dito",
        "900": "Simples Nacional outros"
      };
      const desc = map[String(code).padStart(2, "0")] || map[String(code)] || "";
      return desc ? `${code} - ${desc}` : code;
    };
    addRet(page, 0, PDF.mtBlock, PDF.width, hTitle);
    addTXT({
      page,
      text: "INFORMA\xC7\xD5ES RELATIVA AO IMPOSTO",
      x: 0,
      y: PDF.mtBlock + 3,
      maxWidth: PDF.width,
      size: 7,
      fontStyle: "negrito",
      align: "center"
    });
    const cY = PDF.mtBlock + hTitle;
    addRet(page, 0, cY, PDF.width, hContent);
    [1, 2, 3, 4].forEach((i) => {
      page.drawLine({
        start: { x: wCol * i + 4, y: PDF.height - cY - 4 },
        end: { x: wCol * i + 4, y: PDF.height - cY - hContent - 4 },
        thickness: 1,
        color: rgb4(0, 0, 0)
      });
    });
    const fmtV = (v) => parseFloat(String(v || "0")).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const lY = cY + padding;
    const vY = lY + 10;
    addTXT({ page, text: "CLASSIFICA\xC7\xC3O TRIBUT\xC1RIA DO SERVI\xC7O", x: padding, y: lY, maxWidth: wCol - padding, size: 5, fontStyle: "negrito" });
    const cst = data2?.CST !== void 0 ? data2.CST : data2?.CSOSN !== void 0 ? data2.CSOSN : "";
    const txtCST = getDesc(String(cst));
    addTXT({ page, text: txtCST, x: padding, y: vY, maxWidth: wCol - padding, size: 6, fontStyle: "normal" });
    addTXT({ page, text: "BASE DE C\xC1LCULO", x: wCol + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    const vBC = data2?.vBC !== void 0 ? data2.vBC : "0.00";
    addTXT({ page, text: fmtV(vBC), x: wCol + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "AL\xCDQ. ICMS", x: wCol * 2 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    const pICMS = data2?.pICMS !== void 0 ? data2.pICMS : "0.00";
    addTXT({ page, text: `${fmtV(pICMS)}%`, x: wCol * 2 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "% RED. BC.", x: wCol * 3 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    const pRedBC = data2?.pRedBC !== void 0 ? data2.pRedBC : "0.00";
    addTXT({ page, text: `${fmtV(pRedBC)}%`, x: wCol * 3 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    addTXT({ page, text: "V. CR\xC9DITO", x: wCol * 4 + padding, y: lY, maxWidth: wCol - padding, size: 6, fontStyle: "negrito" });
    const vCred = data2?.vCred !== void 0 ? data2.vCred : data2?.vICMSOutraUF !== void 0 ? data2.vICMSOutraUF : "0.00";
    addTXT({ page, text: fmtV(vCred), x: wCol * 4 + padding, y: vY, maxWidth: wCol - padding, size: 7, fontStyle: "normal" });
    PDF.mtBlock += hTotal;
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
    const dhEmi = cte.infCte.ide.dhEmi;
    const fmtDate = (iso) => {
      if (!iso) return "";
      const datePart = iso.split("T")[0];
      if (!datePart) return iso;
      return datePart.split("-").reverse().join("/");
    };
    const docDate = fmtDate(dhEmi);
    const vCargaTotal = cte.infCte.infCTeNorm?.infCarga?.vCarga || 0;
    const nfsRaw = infDoc.infNF;
    const nfs = Array.isArray(nfsRaw) ? nfsRaw : nfsRaw ? [nfsRaw] : [];
    nfs.forEach((n) => {
      docs.push({
        tipo: "NF",
        // Garante string para evitar notação científica
        numero: String(n.nDoc || ""),
        // Se a nota tiver data própria (dEmi), usa ela. Senão usa a do CTe.
        data: n.dEmi ? fmtDate(n.dEmi) : docDate,
        valor: n.vNF || 0
      });
    });
    const nfesRaw = infDoc.infNFe;
    const nfes = Array.isArray(nfesRaw) ? nfesRaw : nfesRaw ? [nfesRaw] : [];
    nfes.forEach((n) => {
      docs.push({
        tipo: "NFe",
        // A chave deve ser tratada como string pura
        numero: String(n.chave || ""),
        data: docDate,
        // NFe não tem data no XML do CTe, usa a do CTe
        valor: 0
      });
    });
    if (docs.length === 0) return;
    if (docs.length === 1 && docs[0].valor == 0) {
      docs[0].valor = vCargaTotal;
    }
    const renderHeader = (p) => {
      addRet(p, 0, PDF.mtBlock, PDF.width, hHeader);
      addTXT({ page: p, text: "DOCUMENTOS ORIGIN\xC1RIOS", x: 0, y: PDF.mtBlock + 3, maxWidth: PDF.width, size: 7, fontStyle: "negrito", align: "center" });
      PDF.mtBlock += hHeader;
      addRet(p, 0, PDF.mtBlock, PDF.width, hHeader);
      addTXT({ page: p, text: "TP DOC", x: padding, y: PDF.mtBlock + 3, maxWidth: w1, size: 6, fontStyle: "negrito" });
      addTXT({ page: p, text: "N\xFAmero", x: w1 + padding, y: PDF.mtBlock + 3, maxWidth: w2, size: 6, fontStyle: "negrito" });
      addTXT({ page: p, text: "Data de Emiss\xE3o", x: w1 + w2 + padding, y: PDF.mtBlock + 3, maxWidth: w3, size: 6, fontStyle: "negrito" });
      addTXT({ page: p, text: "Valor do Documento", x: w1 + w2 + w3 + padding, y: PDF.mtBlock + 3, maxWidth: w4, size: 6, fontStyle: "negrito" });
      PDF.mtBlock += hHeader;
    };
    renderHeader(page);
    let startY = PDF.mtBlock;
    let itemsInPage = 0;
    const renderBoxAndLines = (p, sY, count) => {
      const totalH = count * hRow;
      addRet(p, 0, sY, PDF.width, totalH);
      [w1, w1 + w2, w1 + w2 + w3].forEach((x) => {
        p.drawLine({
          start: { x: x + 4, y: PDF.height - sY - 4 },
          end: { x: x + 4, y: PDF.height - sY - totalH - 4 },
          thickness: 1,
          color: rgb4(0, 0, 0)
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
      itemsInPage++;
      let numeroTexto = doc.numero;
      if (typeof doc.numero === "number") {
        numeroTexto = doc.numero.toLocaleString("pt-BR", { useGrouping: false });
      }
      addTXT({ page, text: doc.tipo, x: padding, y: PDF.mtBlock + 4, maxWidth: w1, size: 7, fontStyle: "normal" });
      addTXT({ page, text: numeroTexto, x: w1 + padding, y: PDF.mtBlock + 4, maxWidth: w2 - 5, size: 6, fontStyle: "normal" });
      addTXT({ page, text: doc.data, x: w1 + w2 + padding, y: PDF.mtBlock + 4, maxWidth: w3, size: 7, fontStyle: "normal" });
      addTXT({ page, text: parseFloat(String(doc.valor)).toLocaleString("pt-BR", { minimumFractionDigits: 2 }), x: w1 + w2 + w3 + padding, y: PDF.mtBlock + 4, maxWidth: w4, size: 7, fontStyle: "normal" });
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
    const tpCTes = { "0": "Normal", "1": "Complementar", "2": "Anula\xE7\xE3o", "3": "Substituto" };
    const tpServs = { "0": "Normal", "1": "Subcontrata\xE7\xE3o", "2": "Redespacho", "3": "Redespacho Intermedi\xE1rio", "4": "Servi\xE7o Vinculado a Multimodal" };
    const tpCTeCode = String(cte.infCte.ide.tpCTe);
    const tpServCode = String(cte.infCte.ide.tpServ);
    const tpCTeStr = tpCTes[tpCTeCode] || tpCTeCode;
    const tpServStr = tpServs[tpServCode] || tpServCode;
    addRet(page, 0, PDF.mtBlock, w, hRow);
    addTXT({ page, text: "TIPO DO CT-e", x: padding, y: PDF.mtBlock + padding, maxWidth: w - padding * 2, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: tpCTeStr, x: padding, y: PDF.mtBlock + 10, maxWidth: w - padding * 2, size: 8, fontStyle: "normal" });
    addRet(page, w, PDF.mtBlock, w, hRow);
    addTXT({ page, text: "TIPO DO SERVI\xC7O", x: w + padding, y: PDF.mtBlock + padding, maxWidth: w - padding * 2, size: 6, fontStyle: "negrito" });
    addTXT({ page, text: tpServStr, x: w + padding, y: PDF.mtBlock + 10, maxWidth: w - padding * 2, size: 8, fontStyle: "normal" });
    PDF.mtBlock += hRow;
  }
  async function blocoDadosGerais(page = PDF.pages[0]) {
    const padding = 2;
    const hRow = 25;
    const w1 = PDF.width * 0.6;
    const w2 = PDF.width * 0.4;
    addRet(page, 0, PDF.mtBlock, w1, hRow);
    addTXT({ page, text: "INDICADOR DO CT-E GLOBALIZADO", x: padding, y: PDF.mtBlock + padding, maxWidth: w1 - padding * 2, size: 6, fontStyle: "negrito" });
    const isGlobal = cte.infCte.ide.indGlobalizado === "1" ? "Sim" : "N\xE3o";
    addTXT({ page, text: isGlobal, x: padding, y: PDF.mtBlock + 12, maxWidth: w1 - padding * 2, size: 9, fontStyle: "normal" });
    addRet(page, w1, PDF.mtBlock, w2, hRow);
    addTXT({ page, text: "Dados do CT-e", x: w1 + padding, y: PDF.mtBlock + padding, maxWidth: w2 - padding * 2, size: 6, fontStyle: "negrito" });
    const nCT = cte.infCte.ide.nCT || "";
    const serie = cte.infCte.ide.serie || "";
    addTXT({ page, text: `N\xBA: ${nCT} / S\xE9rie: ${serie}`, x: w1 + padding, y: PDF.mtBlock + 12, maxWidth: w2 - padding * 2, size: 8, fontStyle: "normal" });
    PDF.mtBlock += hRow;
    addRet(page, 0, PDF.mtBlock, w1, hRow);
    addTXT({ page, text: "CFOP - NATUREZA DA PRESTA\xC7\xC3O", x: padding, y: PDF.mtBlock + padding, maxWidth: w1 - padding * 2, size: 6, fontStyle: "negrito" });
    const cfop = cte.infCte.ide.CFOP || "";
    const natOp = cte.infCte.ide.natOp || "";
    addTXT({ page, text: `${cfop} - ${natOp}`, x: padding, y: PDF.mtBlock + 12, maxWidth: w1 - padding * 2, size: 7, fontStyle: "normal" });
    addRet(page, w1, PDF.mtBlock, w2, hRow);
    addTXT({ page, text: "Protocolo de Autoriza\xE7\xE3o de Uso", x: w1 + padding, y: PDF.mtBlock + padding, maxWidth: w2 - padding * 2, size: 6, fontStyle: "negrito" });
    const nProt = protCTe?.infProt?.nProt || "";
    const dhRecbto = protCTe?.infProt?.dhRecbto ? new Date(protCTe.infProt.dhRecbto).toLocaleString("pt-BR") : "";
    addTXT({ page, text: `${nProt} - ${dhRecbto}`, x: w1 + padding, y: PDF.mtBlock + 12, maxWidth: w2 - padding * 2, size: 7, fontStyle: "normal" });
    PDF.mtBlock += hRow;
  }
  async function blocoFluxoCarga() {
    const hNeeded = 12 + 40;
    const page = await ensureSpace(hNeeded);
    const padding = 2;
    const hTitle = 12;
    const hContent = 40;
    const hRowInt = hContent / 2;
    const wCol = PDF.width / 2;
    addRet(page, 0, PDF.mtBlock, PDF.width, hTitle);
    addTXT({
      page,
      text: "PREVIS\xC3O DO FLUXO DA CARGA",
      x: 0,
      y: PDF.mtBlock + 3,
      maxWidth: PDF.width,
      size: 7,
      fontStyle: "negrito",
      align: "center"
    });
    const cY = PDF.mtBlock + hTitle;
    addRet(page, 0, cY, PDF.width, hContent);
    page.drawLine({
      start: { x: wCol + 4, y: PDF.height - cY - 4 },
      end: { x: wCol + 4, y: PDF.height - cY - hContent - 4 },
      thickness: 1,
      color: rgb4(0, 0, 0)
    });
    page.drawLine({
      start: { x: 4, y: PDF.height - (cY + hRowInt) - 4 },
      end: { x: wCol + 4, y: PDF.height - (cY + hRowInt) - 4 },
      thickness: 1,
      color: rgb4(0, 0, 0)
    });
    const labelSize = 4.5;
    const labelOrigem = "SIGLA OU C\xD3DIGO INT. DA FILIAL/PORTO/ESTA\xC7\xC3O/AEROPORTO DE ORIGEM";
    const labelDestino = "SIGLA OU C\xD3DIGO INT. DA FILIAL/PORTO/ESTA\xC7\xC3O/AEROPORTO DE DESTINO";
    const labelPassagem = "SIGLA OU C\xD3DIGO INT. DA FILIAL/PORTO/ESTA\xC7\xC3O/AEROPORTO DE PASSAGEM";
    addTXT({ page, text: labelOrigem, x: padding, y: cY + 2, maxWidth: wCol - padding, size: labelSize, fontStyle: "negrito" });
    addTXT({ page, text: labelDestino, x: padding, y: cY + hRowInt + 2, maxWidth: wCol - padding, size: labelSize, fontStyle: "negrito" });
    addTXT({ page, text: labelPassagem, x: wCol + padding, y: cY + 2, maxWidth: wCol - padding, size: labelSize, fontStyle: "negrito" });
    PDF.mtBlock += hTitle + hContent;
  }
  async function blocoObservacao() {
    const hNeeded = 12 + 60;
    const page = await ensureSpace(hNeeded);
    const padding = 2;
    const hTitle = 12;
    const hContent = 60;
    addRet(page, 0, PDF.mtBlock, PDF.width, hTitle);
    addTXT({
      page,
      text: "OBSERVA\xC7\xC3O",
      x: 0,
      y: PDF.mtBlock + 3,
      maxWidth: PDF.width,
      size: 7,
      fontStyle: "negrito",
      align: "center"
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
        maxWidth: PDF.width - padding * 2,
        size: 6,
        fontStyle: "normal"
      });
    }
    PDF.mtBlock += hTitle + hContent;
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
      text: "INFORMA\xC7\xC3O DO CT-E GLOBALIZADO",
      x: 0,
      y: PDF.mtBlock + 3,
      maxWidth: PDF.width,
      size: 7,
      fontStyle: "negrito",
      align: "center"
    });
    const cY = PDF.mtBlock + hTitle;
    addRet(page, 0, cY, PDF.width, hContent);
    const infDoc = cte.infCte.infCTeNorm?.infDoc;
    const outros = infDoc?.infOutros;
    if (outros) {
      let textOutros = "";
      const listaOutros = Array.isArray(outros) ? outros : [outros];
      textOutros = listaOutros.map((o) => `${o.tpDoc || ""} ${o.descOutros || ""}`).join(" | ");
      addTXT({ page, text: textOutros, x: padding, y: cY + padding, maxWidth: PDF.width - padding * 2, size: 6, fontStyle: "normal" });
    }
    PDF.mtBlock += hTitle + hContent;
  }
  async function blocoUsoFisco() {
    const hNeeded = 12 + 45;
    const page = await ensureSpace(hNeeded);
    const hTitle = 12;
    const hContent = 45;
    const wCol1 = PDF.width * 0.7;
    const wCol2 = PDF.width * 0.3;
    addRet(page, 0, PDF.mtBlock, wCol1, hTitle);
    addTXT({ page, text: "USO EXCLUSIVO DO EMISSOR DO CT-E", x: 0, y: PDF.mtBlock + 3, maxWidth: wCol1, size: 7, fontStyle: "negrito", align: "center" });
    addRet(page, wCol1, PDF.mtBlock, wCol2, hTitle);
    addTXT({ page, text: "RESERVADO AO FISCO", x: wCol1, y: PDF.mtBlock + 3, maxWidth: wCol2, size: 7, fontStyle: "negrito", align: "center" });
    const cY = PDF.mtBlock + hTitle;
    addRet(page, 0, cY, wCol1, hContent);
    addRet(page, wCol1, cY, wCol2, hContent);
    PDF.mtBlock += hTitle + hContent;
  }
  async function blocoHeaderSuperior(page = PDF.pages[0]) {
    const hBlock = 125;
    const w1 = PDF.width * 0.4;
    const w2 = PDF.width * 0.6;
    const margin = 2;
    addRet(page, 0, 0, w1, hBlock);
    const hLogoSection = 50;
    if (logo) {
      const imgH = 35;
      const imgW = w1 - margin * 4;
      await addIMG({ page, img: logo, x: margin * 2, y: margin, w: imgW, h: imgH });
    }
    addTXT({ page, text: "IDENTIFICA\xC7\xC3O DO EMITENTE", x: 0, y: 40, maxWidth: w1, size: 7, fontStyle: "negrito", align: "center" });
    const txtX1 = margin;
    let yPos = hLogoSection + margin;
    addTXT({ page, text: "NOME:", x: txtX1, y: yPos, maxWidth: 30, size: 5, fontStyle: "normal" });
    addTXT({ page, text: cte.infCte.emit.xNome, x: txtX1 + 25, y: yPos - 1, maxWidth: w1 - 25 - margin, size: 7, fontStyle: "negrito" });
    yPos += 14;
    const wDoc = (w1 - txtX1) / 2;
    addTXT({ page, text: "CNPJ:", x: txtX1, y: yPos, maxWidth: 20, size: 5, fontStyle: "normal" });
    addTXT({ page, text: embCNPJCPF(cte.infCte.emit.CNPJ), x: txtX1 + 18, y: yPos - 1, maxWidth: wDoc - 18, size: 7, fontStyle: "negrito" });
    addTXT({ page, text: "IE:", x: txtX1 + wDoc, y: yPos, maxWidth: 15, size: 5, fontStyle: "normal" });
    addTXT({ page, text: cte.infCte.emit.IE || "", x: txtX1 + wDoc + 10, y: yPos - 1, maxWidth: wDoc - 10, size: 7, fontStyle: "negrito" });
    yPos += 10;
    const end = cte.infCte.emit.enderEmit ?? {};
    addTXT({ page, text: "ENDERE\xC7O:", x: txtX1, y: yPos, maxWidth: 45, size: 5, fontStyle: "normal" });
    addTXT({ page, text: end.xLgr || "", x: txtX1 + 45, y: yPos - 1, maxWidth: w1 - txtX1 - 45 - margin, size: 7, fontStyle: "negrito" });
    yPos += 10;
    const wAddr = (w1 - txtX1) / 2;
    addTXT({ page, text: "NRO:", x: txtX1, y: yPos, maxWidth: 15, size: 5, fontStyle: "normal" });
    addTXT({ page, text: end.nro || "", x: txtX1 + 15, y: yPos - 1, maxWidth: wAddr - 15, size: 7, fontStyle: "negrito" });
    addTXT({ page, text: "COMPL:", x: txtX1 + wAddr, y: yPos, maxWidth: 20, size: 5, fontStyle: "normal" });
    addTXT({ page, text: end.xCpl || "", x: txtX1 + wAddr + 20, y: yPos - 1, maxWidth: wAddr - 20, size: 7, fontStyle: "negrito" });
    yPos += 10;
    addTXT({ page, text: "MUN.:", x: txtX1, y: yPos, maxWidth: 15, size: 5, fontStyle: "normal" });
    addTXT({ page, text: end.xMun || "", x: txtX1 + 15, y: yPos - 1, maxWidth: wAddr - 15, size: 7, fontStyle: "negrito" });
    addTXT({ page, text: "BAIRRO:", x: txtX1 + wAddr, y: yPos, maxWidth: 20, size: 5, fontStyle: "normal" });
    addTXT({ page, text: end.xBairro || "", x: txtX1 + wAddr + 20, y: yPos - 1, maxWidth: wAddr - 20, size: 7, fontStyle: "negrito" });
    yPos += 10;
    const wUF = (w1 - txtX1) * 0.2;
    const wCEP = (w1 - txtX1) * 0.4;
    const wTEL = (w1 - txtX1) * 0.4;
    addTXT({ page, text: "UF:", x: txtX1, y: yPos, maxWidth: 10, size: 5, fontStyle: "normal" });
    addTXT({ page, text: end.UF || "", x: txtX1 + 10, y: yPos - 1, maxWidth: wUF - 10, size: 7, fontStyle: "negrito" });
    addTXT({ page, text: "CEP:", x: txtX1 + wUF, y: yPos, maxWidth: 15, size: 5, fontStyle: "normal" });
    addTXT({ page, text: end.CEP || "", x: txtX1 + wUF + 15, y: yPos - 1, maxWidth: wCEP - 15, size: 7, fontStyle: "negrito" });
    addTXT({ page, text: "TEL:", x: txtX1 + wUF + wCEP, y: yPos, maxWidth: 15, size: 5, fontStyle: "normal" });
    addTXT({ page, text: end.fone || "", x: txtX1 + wUF + wCEP + 15, y: yPos - 1, maxWidth: wTEL - 15, size: 7, fontStyle: "negrito" });
    const gridY = 35;
    addRet(page, w1, 0, w2, gridY);
    const wDACTE = w2 * 0.4;
    const wModal = w2 * 0.6;
    addTXT({ page, text: "DACTE", x: w1, y: margin + 1, maxWidth: wDACTE, size: 12, fontStyle: "negrito", align: "center" });
    addTXT({ page, text: "Documento Auxiliar do\nConhecimento de Transporte Eletr\xF4nico", x: w1, y: 18, maxWidth: wDACTE, size: 4, align: "center", lineHeight: 5, fontStyle: "normal" });
    addRet(page, w1 + wDACTE, 0, wModal, gridY);
    addTXT({ page, text: "MODAL", x: w1 + wDACTE, y: margin + 2, maxWidth: wModal, size: 6, fontStyle: "negrito", align: "center" });
    const ide = cte.infCte.ide;
    const modais = { "01": "RODOVI\xC1RIO", "02": "A\xC9REO", "03": "AQUAVI\xC1RIO", "04": "FERROVI\xC1RIO", "05": "DUTOVI\xC1RIO", "06": "MULTIMODAL" };
    const modalType = ide.modal ? modais[String(ide.modal).padStart(2, "0")] || ide.modal : "";
    addTXT({ page, text: modalType, x: w1 + wDACTE, y: 18, maxWidth: wModal, size: 8, fontStyle: "negrito", align: "center" });
    const r2Y = gridY;
    const r2H = 25;
    const cWs = [0.1, 0.1, 0.2, 0.1, 0.3, 0.2].map((p) => p * w2);
    const labels = ["MODELO", "S\xC9RIE", "N\xDAMERO", "FL", "DATA E HORA DE EMISS\xC3O", "INSC. SUFRAMA DESTINAT\xC1RIO"];
    const dhEmi = ide.dhEmi ? new Date(ide.dhEmi).toLocaleString("pt-BR") : "";
    const values = ["57", ide.serie || "", ide.nCT || "", "1/1", dhEmi, cte.infCte.dest?.ISUF || ""];
    let curX = w1;
    labels.forEach((l, i) => {
      addRet(page, curX, r2Y, cWs[i], r2H);
      addTXT({ page, text: l, x: curX + 1, y: r2Y + 2, maxWidth: cWs[i] - 2, size: 4, fontStyle: "negrito", align: "center" });
      const valSize = i === 4 ? 5 : 6;
      addTXT({ page, text: values[i], x: curX, y: r2Y + 12, maxWidth: cWs[i], size: valSize, fontStyle: "normal", align: "center" });
      curX += cWs[i];
    });
    const r3Y = r2Y + r2H;
    const r3H = 35;
    const idValue = cte.infCte["@Id"].replace("CTe", "");
    addRet(page, w1, r3Y, w2, r3H);
    await addIMG({ page, img: await barCode(), x: w1 + margin, y: r3Y + 2, w: w2 - margin * 2, h: r3H - 4 });
    const r4Y = r3Y + r3H;
    const r4H = hBlock - r4Y;
    addRet(page, w1, r4Y, w2, r4H);
    addTXT({ page, text: "Chave de acesso para consulta de autenticidade no site www.cte.fazenda.gov.br ou da Sefaz", x: w1, y: r4Y + 2, maxWidth: w2, size: 4, align: "center", fontStyle: "normal" });
    addTXT({ page, text: idValue.replace(/(\d{4})(?=\d)/g, "$1 "), x: w1, y: r4Y + 10, maxWidth: w2, size: 8, fontStyle: "negrito", align: "center" });
    PDF.mtBlock = hBlock;
  }
  await gerarBlocos();
  if (imgDemo) {
    for (const page of PDF.pages) {
    }
  }
  return await PDF.doc.save();
}
export {
  DACTE,
  DANFCe,
  DANFe,
  DAV55
};
//# sourceMappingURL=index.js.map