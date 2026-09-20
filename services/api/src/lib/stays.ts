import type { StayStatus } from "@prisma/client";
import {
  GUEST_TYPES_WITH_DOCUMENT,
  GUEST_TYPES_WITHOUT_DOCUMENT,
} from "./alloggiati/protocol.js";

export function stayHasDocument(input: {
  documentType: string;
  documentNumber: string;
  documentIssuePlace: string;
}): boolean {
  return Boolean(
    input.documentType.trim() &&
      input.documentNumber.trim() &&
      input.documentIssuePlace.trim(),
  );
}

function needsDocument(guestType: string): boolean {
  return (GUEST_TYPES_WITH_DOCUMENT as readonly string[]).includes(guestType);
}

export function deriveStayStatus(input: {
  guestType: string;
  documentType: string;
  documentNumber: string;
  documentIssuePlace: string;
}): Extract<StayStatus, "draft" | "ready"> {
  if ((GUEST_TYPES_WITHOUT_DOCUMENT as readonly string[]).includes(input.guestType)) {
    return "ready";
  }
  if (needsDocument(input.guestType) && stayHasDocument(input)) {
    return "ready";
  }
  return "draft";
}

export function stayStatusLabel(status: StayStatus): string {
  switch (status) {
    case "draft":
      return "Manca documento";
    case "ready":
      return "Pronto";
    case "sent":
      return "Inviato";
    case "error":
      return "Errore";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export const GUEST_TYPE_LABELS: Record<string, string> = {
  "16": "Ospite singolo",
  "17": "Capo famiglia",
  "18": "Capo gruppo",
  "19": "Familiare",
  "20": "Membro di gruppo",
};

export const DOCUMENT_TYPES = [
  { value: "IDENT", label: "IDENT — Carta d'identità" },
  { value: "PASOR", label: "PASOR — Passaporto" },
  { value: "PATEN", label: "PATEN — Patente" },
  { value: "PASEU", label: "PASEU — Passaporto UE" },
] as const;
