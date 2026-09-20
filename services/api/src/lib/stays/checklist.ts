import type { GuestStay, Property, Receipt, StayStatus } from "@prisma/client";
import { deadlineState } from "../alloggiati/deadlines.js";
import { deriveStayStatus, stayHasDocument } from "../stays.js";

export type ChecklistItemId =
  | "guest_data"
  | "guest_document"
  | "alloggiati"
  | "receipt"
  | "tourist_tax"
  | "istat"
  | "archive";

export type ChecklistItemStatus = "done" | "todo" | "waiting" | "blocked";

export type ChecklistItem = {
  id: ChecklistItemId;
  label: string;
  status: ChecklistItemStatus;
  detail: string;
  href?: string;
  urgent?: boolean;
};

export type StayWithRelations = GuestStay & {
  property: Property;
  receipt: Receipt | null;
};

function checkoutDate(stay: Pick<GuestStay, "arrivalDate" | "nights">): Date {
  const out = new Date(stay.arrivalDate);
  out.setUTCDate(out.getUTCDate() + stay.nights);
  return out;
}

function guestDataComplete(stay: GuestStay): boolean {
  const nameOk =
    stay.lastName.trim().length > 0 &&
    stay.firstName.trim().length > 0 &&
    stay.firstName.trim().toLowerCase() !== "da completare";
  return nameOk && Boolean(stay.birthCountryCode.trim() && stay.citizenshipCode.trim());
}

function documentComplete(stay: GuestStay): boolean {
  if (stay.status === "sent" || stay.status === "ready" || stay.status === "error") {
    return stay.status !== "error" ? true : stayHasDocument(stay);
  }
  return deriveStayStatus(stay) === "ready";
}

function taxDone(status: string): boolean {
  return status === "collected" || status === "exempt" || status === "na";
}

export function buildStayChecklist(
  stay: StayWithRelations,
  now: Date = new Date(),
): ChecklistItem[] {
  const stayHref = `/soggiorni/${stay.id}`;
  const docOk = documentComplete(stay);
  const dataOk = guestDataComplete(stay);
  const alloggiatiDone = stay.status === "sent";
  const receiptDone = Boolean(stay.receipt);
  const taxOk = taxDone(stay.touristTaxStatus);
  const out = checkoutDate(stay);
  const checkedOut = out.getTime() <= now.getTime();
  const monthKey = `${stay.arrivalDate.getUTCFullYear()}-${String(stay.arrivalDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const deadline = deadlineState(stay.arrivalDate, stay.nights, now);
  const alloggiatiUrgent =
    !alloggiatiDone &&
    (deadline.overdue ||
      stay.arrivalDate.toISOString().slice(0, 10) <= now.toISOString().slice(0, 10));

  const items: ChecklistItem[] = [
    {
      id: "guest_data",
      label: "Dati ospite",
      status: dataOk ? "done" : "todo",
      detail: dataOk ? "Anagrafica presente" : "Manca anagrafica — invia il link check-in",
      href: stayHref,
    },
    {
      id: "guest_document",
      label: "Documento",
      status: docOk ? "done" : dataOk ? "todo" : "blocked",
      detail: docOk
        ? "Documento completo"
        : "Tipo, numero e luogo di rilascio obbligatori per tipi 16–18",
      href: `/immobili?vista=tutti&modifica=${stay.id}`,
    },
    {
      id: "alloggiati",
      label: "Alloggiati Web",
      status: alloggiatiDone ? "done" : docOk ? "todo" : "blocked",
      detail: alloggiatiDone
        ? "Schedina inviata"
        : docOk
          ? deadline.overdue
            ? "Scadenza superata — invia ora"
            : "Prepara e invia la schedina (mock o SOAP)"
          : "Completa prima i documenti",
      href: docOk ? "/invio" : undefined,
      urgent: alloggiatiUrgent && docOk,
    },
    {
      id: "receipt",
      label: "Ricevuta",
      status: receiptDone ? "done" : alloggiatiDone ? "todo" : "waiting",
      detail: receiptDone
        ? "Ricevuta archiviata"
        : alloggiatiDone
          ? "Scarica o genera la ricevuta"
          : "Disponibile dopo l’invio Alloggiati",
      href: alloggiatiDone ? "/invio" : undefined,
    },
    {
      id: "tourist_tax",
      label: "Tassa di soggiorno",
      status: taxOk ? "done" : "todo",
      detail: taxOk
        ? stay.touristTaxStatus === "exempt"
          ? "Esente"
          : stay.touristTaxStatus === "na"
            ? "Non applicabile"
            : "Segnata come riscossa"
        : `Da riscuotere · ${(stay.touristTaxCents / 100).toFixed(2)} €`,
      href: stayHref,
      urgent: !taxOk && checkedOut,
    },
    {
      id: "istat",
      label: "ISTAT",
      status: checkedOut ? "todo" : "waiting",
      detail: checkedOut
        ? "Includi il soggiorno nell’export del mese"
        : "Dopo il checkout",
      href: `/adempimenti?mese=${monthKey}`,
    },
    {
      id: "archive",
      label: "Archivio documenti",
      status: alloggiatiDone ? "done" : "waiting",
      detail: alloggiatiDone
        ? "Conserva i documenti secondo i tempi di legge, poi cancella"
        : "Si attiva dopo l’invio",
      href: stayHref,
    },
  ];

  return items;
}

export function stayChecklistComplete(items: ChecklistItem[]): boolean {
  return items.every((item) => item.status === "done" || item.status === "waiting");
}

export function openChecklistTasks(
  stays: StayWithRelations[],
  now: Date = new Date(),
): Array<{ stay: StayWithRelations; item: ChecklistItem }> {
  const rows: Array<{ stay: StayWithRelations; item: ChecklistItem }> = [];
  for (const stay of stays) {
    for (const item of buildStayChecklist(stay, now)) {
      if (item.status === "todo") {
        rows.push({ stay, item });
      }
    }
  }
  rows.sort((a, b) => {
    const ua = a.item.urgent ? 0 : 1;
    const ub = b.item.urgent ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return a.stay.arrivalDate.getTime() - b.stay.arrivalDate.getTime();
  });
  return rows;
}

export function stayCompletionLabel(status: StayStatus, items: ChecklistItem[]): string {
  if (stayChecklistComplete(items) && status === "sent") {
    return "Soggiorno completato";
  }
  const open = items.filter((i) => i.status === "todo").length;
  if (open === 0) return "In corso";
  return `${open} ${open === 1 ? "cosa da fare" : "cose da fare"}`;
}
