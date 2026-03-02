/**
 * Interfaces para mapeamento do XML de NFe (Nota Fiscal Eletrônica)
 * Baseado no Manual de Orientação do Contribuinte (MOC) e na saída do fast-xml-parser.
 */

export interface NFeRoot {
    nfeProc?: NFeProc
    NFe?: NFe
}

export interface NFeProc {
    "@xmlns": string
    "@versao": string
    NFe: NFe
    protNFe: ProtNFe
}

export interface NFe {
    infNFe: InfNFe
    signature?: any
}

export interface InfNFe {
    "@Id": string
    "@versao": string
    ide: NFeIde
    emit: NFeEmit
    dest: NFeDest
    det: NFeDet | NFeDet[]
    total: NFeTotal
    transp: NFeTransp
    cobr?: NFeCobr
    pag: NFePag
    infAdic?: NFeInfAdic
    infRespTec?: NFeInfRespTec
}

export interface NFeIde {
    cUF: string
    cNF: string
    natOp: string
    mod: string
    serie: string
    nNF: string
    dhEmi: string
    dhSaiEnt?: string
    tpNF: string
    idDest: string
    cMunFG: string
    tpImp: string
    tpEmis: string
    cDV: string
    tpAmb: string
    finNFe: string
    indFinal: string
    indPres: string
    procEmi: string
    verProc: string
}

export interface NFeEmit {
    CNPJ?: string
    CPF?: string
    xNome: string
    xFant?: string
    enderEmit: NFeEndereco
    IE: string
    IEST?: string
    IM?: string
    CNAE?: string
    CRT: string
}

export interface NFeEndereco {
    xLgr: string
    nro: string
    xCpl?: string
    xBairro: string
    cMun: string
    xMun: string
    UF: string
    CEP: string
    cPais: string
    xPais: string
    fone?: string
}

export interface NFeDest {
    CNPJ?: string
    CPF?: string
    xNome: string
    enderDest: NFeEndereco
    indIEDest: string
    IE?: string
    email?: string
}

export interface NFeDet {
    "@nItem": string
    prod: NFeProd
    imposto: NFeImposto
}

export interface NFeProd {
    cProd: string
    cEAN: string
    xProd: string
    NCM: string
    CFOP: string
    uCom: string
    qCom: string
    vUnCom: string
    vProd: string
    cEANTrib: string
    uTrib: string
    qTrib: string
    vUnTrib: string
    indTot: string
    vDesc?: string
    vOutro?: string
    vFrete?: string
    vSeg?: string
}

export interface NFeImposto {
    vTotTrib?: string
    ICMS?: any // Diferentes estruturas (ICMS00, ICMS40, ICMSSN102, etc)
    IPI?: any
    PIS?: any
    COFINS?: any
    ISSQN?: any
}

export interface NFeTotal {
    ICMSTot: {
        vBC: string
        vICMS: string
        vICMSDeson: string
        vFCP: string
        vBCST: string
        vST: string
        vFCPST: string
        vFCPSTRet: string
        vProd: string
        vFrete: string
        vSeg: string
        vDesc: string
        vII: string
        vIPI: string
        vIPIDevol: string
        vPIS: string
        vCOFINS: string
        vOutro: string
        vNF: string
        vTotTrib?: string
    }
    ISSQNtot?: {
        vServ?: string
        vBC?: string
        vISS?: string
        vPIS?: string
        vCOFINS?: string
        dCompet?: string
        vDeduc?: string
        vOutro?: string
        vDescIncond?: string
        vDescCond?: string
        vISSRet?: string
        cRegTrib?: string
    }
    retTrib?: {
        vRetPIS?: string
        vRetCOFINS?: string
        vRetCSLL?: string
        vBCIRRF?: string
        vIRRF?: string
        vBCRetPrev?: string
        vRetPrev?: string
    }
}

export interface NFeTransp {
    modFrete: string
    transporta?: {
        CNPJ?: string
        CPF?: string
        xNome?: string
        IE?: string
        xEnder?: string
        xMun?: string
        UF?: string
    }
    veicTransp?: {
        placa?: string
        UF?: string
        RNTC?: string
    }
    vol?: NFeVol | NFeVol[]
}

export interface NFeVol {
    qVol?: string
    esp?: string
    marca?: string
    nVol?: string
    pesoL?: string
    pesoB?: string
}

export interface NFeCobr {
    fat?: {
        nFat?: string
        vOrig?: string
        vDesc?: string
        vLiq?: string
    }
    dup?: NFeDup | NFeDup[]
}

export interface NFeDup {
    nDup: string
    dVenc: string
    vDup: string
}

export interface NFePag {
    detPag: NFeDetPag | NFeDetPag[]
}

export interface NFeDetPag {
    tPag: string
    vPag: string
    card?: {
        tpIntegra: string
        CNPJ?: string
        tBand?: string
        cAut?: string
    }
}

export interface NFeInfAdic {
    infAdFisco?: string
    infCpl?: string
}

export interface NFeInfRespTec {
    CNPJ: string
    xContato: string
    email: string
    fone: string
}

export interface ProtNFe {
    "@versao": string
    infProt: {
        tpAmb: string
        verAplic: string
        chNFe: string
        dhRecbto: string
        nProt?: string
        digVal?: string
        cStat: string
        xMotivo: string
    }
}
