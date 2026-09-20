import { createMockAlloggiatiClient } from "./mock.js";
import { getAlloggiatiMode } from "./mode.js";
import { createSoapAlloggiatiClient } from "./soap.js";
import type { AlloggiatiClient } from "./types.js";

export function getAlloggiatiClient(): AlloggiatiClient {
  if (getAlloggiatiMode() === "live") {
    return createSoapAlloggiatiClient();
  }
  return createMockAlloggiatiClient();
}

export { getAlloggiatiMode } from "./mode.js";
export type { AlloggiatiMode } from "./mode.js";
export type {
  AlloggiatiClient,
  AlloggiatiCredentials,
  AlloggiatiSession,
  GuestSchedinaInput,
} from "./types.js";
export { esitoToMessage } from "./types.js";
export { buildSchedinaRow, parseSchedinaRow } from "./schedina.js";
export { ALLOGGIATI_SOAP_ENDPOINT, SOAP_METHODS } from "./protocol.js";
