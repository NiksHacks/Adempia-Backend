import type { TipoTabella } from "./protocol.js";

export const ALLOGGIATI_SOAP_ENDPOINT =
  "https://alloggiatiweb.poliziadistato.it/service/Service.asmx";
export const ALLOGGIATI_SOAP_NAMESPACE = "AlloggiatiService";

export type AlloggiatiCredentials = {
  utente: string;
  password: string;
  wsKey: string;
};

export type AlloggiatiSession = {
  utente: string;
  token: string;
};

export type TokenInfo = {
  token: string;
  issued: Date | null;
  expires: Date | null;
};

export type EsitoOperazioneServizio = {
  esito: boolean;
  erroreCod: string;
  erroreDes: string;
  erroreDettaglio: string;
};

export type ElencoSchedineEsito = {
  schedineValide: number;
  dettaglio: EsitoOperazioneServizio[];
};

export type SchedineCallResult = {
  result: EsitoOperazioneServizio;
  elenco: ElencoSchedineEsito;
};

export type RicevutaResult = {
  result: EsitoOperazioneServizio;
  pdfBase64: string;
};

export type TabellaResult = {
  result: EsitoOperazioneServizio;
  csv: string;
};

export type AlloggiatiApartment = {
  id: string;
  description: string;
  comune?: string;
  provincia?: string;
  indirizzo?: string;
  proprietario?: string;
};

export type NewApartment = {
  descrizione: string;
  comuneCodice: string;
  indirizzo: string;
  proprietario: string;
};

export type GuestSchedinaInput = {
  guestType: string;
  arrivalDate: Date;
  nights: number;
  lastName: string;
  firstName: string;
  sex: string;
  birthDate: Date;
  birthComuneCode: string;
  birthProvince: string;
  birthCountryCode: string;
  citizenshipCode: string;
  documentType: string;
  documentNumber: string;
  documentIssuePlace: string;
  apartmentId?: string | null;
};

export interface AlloggiatiClient {
  generateToken(credentials: AlloggiatiCredentials): Promise<TokenInfo>;
  authenticationTest(session: AlloggiatiSession): Promise<EsitoOperazioneServizio>;
  test(session: AlloggiatiSession, rows: string[]): Promise<SchedineCallResult>;
  send(session: AlloggiatiSession, rows: string[]): Promise<SchedineCallResult>;
  ricevuta(session: AlloggiatiSession, date: Date): Promise<RicevutaResult>;
  tabella(session: AlloggiatiSession, tipo: TipoTabella): Promise<TabellaResult>;
  gestioneAppartamenti: {
    test(
      session: AlloggiatiSession,
      rows: string[],
      idAppartamento: number,
    ): Promise<SchedineCallResult>;
    send(
      session: AlloggiatiSession,
      rows: string[],
      idAppartamento: number,
    ): Promise<SchedineCallResult>;
    fileUnicoTest(session: AlloggiatiSession, rows: string[]): Promise<SchedineCallResult>;
    fileUnicoSend(session: AlloggiatiSession, rows: string[]): Promise<SchedineCallResult>;
    aggiungiAppartamento(
      session: AlloggiatiSession,
      apartment: NewApartment,
    ): Promise<EsitoOperazioneServizio>;
    disabilitaAppartamento(
      session: AlloggiatiSession,
      idAppartamento: number,
    ): Promise<EsitoOperazioneServizio>;
    lista(session: AlloggiatiSession): Promise<AlloggiatiApartment[]>;
  };
}

export function esitoToMessage(
  esito: EsitoOperazioneServizio,
  okMessage: string,
): { ok: boolean; message: string } {
  if (esito.esito) {
    return { ok: true, message: okMessage };
  }
  const detail = [esito.erroreDes, esito.erroreDettaglio].filter(Boolean).join(" — ");
  return { ok: false, message: detail || "Operazione Alloggiati non riuscita." };
}

export function okEsito(): EsitoOperazioneServizio {
  return { esito: true, erroreCod: "", erroreDes: "", erroreDettaglio: "" };
}

export function failEsito(cod: string, des: string, dettaglio = ""): EsitoOperazioneServizio {
  return { esito: false, erroreCod: cod, erroreDes: des, erroreDettaglio: dettaglio };
}
