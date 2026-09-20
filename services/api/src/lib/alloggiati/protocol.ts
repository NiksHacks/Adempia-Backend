/** Tracciato e metodi dal manuale WS Alloggiati (Rev. 01, 24/01/2022) e dal WSDL. */

export const ALLOGGIATI_SOAP_ENDPOINT =
  "https://alloggiatiweb.poliziadistato.it/service/Service.asmx";

export const ALLOGGIATI_SOAP_NAMESPACE = "AlloggiatiService";

export const SOAP_METHODS = [
  "GenerateToken",
  "Authentication_Test",
  "Test",
  "Send",
  "GestioneAppartamenti_Test",
  "GestioneAppartamenti_Send",
  "GestioneAppartamenti_FileUnico_Test",
  "GestioneAppartamenti_FileUnico_Send",
  "GestioneAppartamenti_AggiungiAppartamento",
  "GestioneAppartamenti_DisabilitaAppartamento",
  "Ricevuta",
  "Tabella",
] as const;

export type SoapMethod = (typeof SOAP_METHODS)[number];

export const TIPO_TABELLA = [
  "Luoghi",
  "Tipi_Documento",
  "Tipi_Alloggiato",
  "TipoErrore",
  "ListaAppartamenti",
] as const;

export type TipoTabella = (typeof TIPO_TABELLA)[number];

export const GUEST_TYPES = ["16", "17", "18", "19", "20"] as const;
export type GuestType = (typeof GUEST_TYPES)[number];

export const GUEST_TYPES_WITH_DOCUMENT = ["16", "17", "18"] as const;
export const GUEST_TYPES_WITHOUT_DOCUMENT = ["19", "20"] as const;

export const MAX_NIGHTS = 30;
export const SCHEDINA_LENGTH = 168;
export const SCHEDINA_LENGTH_WITH_APARTMENT = 174;
export const APARTMENT_ID_LENGTH = 6;

/** Posizioni inclusive DA–A del tracciato ufficiale (0-based). */
export const SCHEDINA_FIELDS = [
  { key: "guestType", from: 0, to: 1, length: 2 },
  { key: "arrivalDate", from: 2, to: 11, length: 10 },
  { key: "nights", from: 12, to: 13, length: 2 },
  { key: "lastName", from: 14, to: 63, length: 50 },
  { key: "firstName", from: 64, to: 93, length: 30 },
  { key: "sex", from: 94, to: 94, length: 1 },
  { key: "birthDate", from: 95, to: 104, length: 10 },
  { key: "birthComuneCode", from: 105, to: 113, length: 9 },
  { key: "birthProvince", from: 114, to: 115, length: 2 },
  { key: "birthCountryCode", from: 116, to: 124, length: 9 },
  { key: "citizenshipCode", from: 125, to: 133, length: 9 },
  { key: "documentType", from: 134, to: 138, length: 5 },
  { key: "documentNumber", from: 139, to: 158, length: 20 },
  { key: "documentIssuePlace", from: 159, to: 167, length: 9 },
] as const;

export type SchedinaFieldKey = (typeof SCHEDINA_FIELDS)[number]["key"];
