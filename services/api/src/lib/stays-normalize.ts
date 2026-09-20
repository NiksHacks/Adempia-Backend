import { GUEST_TYPES_WITHOUT_DOCUMENT } from "./alloggiati/protocol.js";

export function normalizeStayDocuments(input: {
  guestType: string;
  documentType: string;
  documentNumber: string;
  documentIssuePlace: string;
}): {
  documentType: string;
  documentNumber: string;
  documentIssuePlace: string;
} {
  if ((GUEST_TYPES_WITHOUT_DOCUMENT as readonly string[]).includes(input.guestType)) {
    return { documentType: "", documentNumber: "", documentIssuePlace: "" };
  }
  return {
    documentType: input.documentType.trim(),
    documentNumber: input.documentNumber.trim(),
    documentIssuePlace: input.documentIssuePlace.trim(),
  };
}
