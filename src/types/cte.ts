/**
 * Interfaces para mapeamento do XML de CTe (Conhecimento de Transporte Eletrônico)
 * Baseado no Manual de Orientação do Contribuinte (MOC) e na saída do fast-xml-parser.
 */

export interface CTeRoot {
    cteProc?: CTeProc
    CTe?: CTe
}

export interface CTeProc {
    "@xmlns": string
    "@versao": string
    CTe: CTe
    protCTe: ProtCTe
}

export interface CTe {
    infCte: InfCTe
    signature?: any
}

export interface InfCTe {
    "@Id": string
    "@versao": string
    ide: CTeIde
    compl?: CTeCompl
    emit: CTeEmit
    rem?: CTeRem
    exped?: CTeExped
    receb?: CTeReceb
    dest?: CTeDest
    vPrest: CTeVPrest
    imp: CTeImp
    infCTeNorm?: InfCTeNorm
    infAdic?: CTeInfAdic
}

export interface CTeIde {
    cUF: string
    cCT: string
    CFOP: string
    natOp: string
    mod: string
    serie: string
    nCT: string
    dhEmi: string
    tpImp: string
    tpEmis: string
    cDV: string
    tpAmb: string
    tpCTe: string
    procEmi: string
    verProc: string
    cMunEnv: string
    xMunEnv: string
    UFEnv: string
    modal: string
    tpServ: string
    cMunIni: string
    indGlobalizado?: string
    xMunIni: string
    UFIni: string
    cMunFim: string
    xMunFim: string
    UFFim: string
    retira: string
    toma3?: {
        toma: string
    }
    toma4?: {
        toma: string
        CNPJ?: string
        CPF?: string
        IE?: string
        xNome: string
        xFant?: string
        enderToma: CTeEndereco
    }
}

export interface CTeCompl {
    xCaracAd?: string
    xCaracSer?: string
    xEmi?: string
    fluxo?: {
        xOrig?: string
        xPass?: string
        xDest?: string
    }
    Entrega?: {
        tipo: string
        dProg?: string
        dIni?: string
        dFim?: string
        hProg?: string
        hIni?: string
        hFim?: string
    }
    origCalc?: string
    destCalc?: string
    xObs?: string
}

export interface CTeEmit {
    CNPJ: string
    IE: string
    IEST?: string
    xNome: string
    xFant?: string
    enderEmit: CTeEndereco
    CRT?: string
}

export interface CTeRem {
    CNPJ?: string
    CPF?: string
    IE: string
    xNome: string
    xFant?: string
    fone?: string
    enderRem: CTeEndereco
    email?: string
}

export interface CTeExped {
    CNPJ?: string
    CPF?: string
    IE: string
    xNome: string
    fone?: string
    enderExped: CTeEndereco
    email?: string
}

export interface CTeReceb {
    CNPJ?: string
    CPF?: string
    IE: string
    xNome: string
    fone?: string
    enderReceb: CTeEndereco
    email?: string
}

export interface CTeDest {
    CNPJ?: string
    CPF?: string
    IE?: string
    ISUF?: string
    xNome: string
    fone?: string
    enderDest: CTeEndereco
    email?: string
}

export interface CTeEndereco {
    xLgr: string
    nro: string
    xCpl?: string
    xBairro: string
    cMun: string
    xMun: string
    CEP: string
    UF: string
    fone?: string
    cPais?: string
    xPais?: string
}

export interface CTeVPrest {
    vTPrest: string
    vRec: string
    Comp?: CTeCompVal | CTeCompVal[]
}

export interface CTeCompVal {
    xNome: string
    vComp: string
}

export interface CTeImp {
    ICMS: any
    vTotTrib?: string
    infAdFisco?: string
}

export interface CTeInfNF {
    nDoc?: string | number
    dEmi?: string
    vNF?: string | number
    [key: string]: unknown
}

export interface CTeInfNFe {
    chave: string
    PIN?: string
    dPrev?: string
}

export interface CTeInfOutros {
    tpDoc?: string
    descOutros?: string
    [key: string]: unknown
}

export interface InfCTeNorm {
    infCarga: {
        vCarga: string
        proPred: string
        xOutCat?: string
        infQ: CTeInfQ | CTeInfQ[]
    }
    infDoc?: {
        infNF?: CTeInfNF | CTeInfNF[]
        infNFe?: CTeInfNFe | CTeInfNFe[]
        infOutros?: CTeInfOutros | CTeInfOutros[]
    }
    infModal: {
        "@versaoModal": string
        rodo?: {
            RNTRC: string
        }
    }
}

export interface CTeInfQ {
    cUnid: string
    tpMed: string
    qMed: string
    qCarga?: string
}

/** Union de todos os participantes do CTe (remetente, expedidor, recebedor, destinatário) */
export type CTeParticipant = import('./cte').CTeRem | import('./cte').CTeExped | import('./cte').CTeReceb | import('./cte').CTeDest

export interface CTeInfAdic {
    infAdFisco?: string
    infCpl?: string
}

export interface ProtCTe {
    "@versao": string
    infProt: {
        tpAmb: string
        verAplic: string
        chCTe: string
        dhRecbto: string
        nProt?: string
        digVal?: string
        cStat: string
        xMotivo: string
    }
}
