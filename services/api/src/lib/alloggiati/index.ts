import { createSoapAlloggiatiClient } from "./soap.js";
import type { AlloggiatiClient } from "./types.js";

export function getAlloggiatiClient(): AlloggiatiClient {
  return createSoapAlloggiatiClient();
}

export type {
  AlloggiatiClient,
  AlloggiatiCredentials,
  AlloggiatiSession,
  GuestSchedinaInput,
} from "./types.js";
export { esitoToMessage } from "./types.js";
export { buildSchedinaRow, parseSchedinaRow } from "./schedina.js";
export { ALLOGGIATI_SOAP_ENDPOINT, SOAP_METHODS } from "./protocol.js";
