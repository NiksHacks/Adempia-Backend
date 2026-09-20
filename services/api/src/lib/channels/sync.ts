import { prisma } from "../../db.js";
import { createId } from "../id.js";
import {
  guestNameFromSummary,
  nightsBetween,
  parseIcsEvents,
} from "./ical.js";
import { parseDateOnly, todayInRome, toDateInputValue } from "../dates.js";
import { taxFieldsForStay } from "../tax/apply.js";

export type SyncResult = {
  created: number;
  skipped: number;
  message: string;
};

async function fetchIcs(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/calendar, text/plain, */*" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Download iCal fallito (HTTP ${response.status}).`);
  }
  return response.text();
}

export async function syncChannelCalendar(calendarId: string): Promise<SyncResult> {
  const calendar = await prisma.channelCalendar.findUnique({
    where: { id: calendarId },
    include: { property: true },
  });
  if (!calendar) {
    throw new Error("Calendario non trovato.");
  }

  const ics = await fetchIcs(calendar.icalUrl);
  const events = parseIcsEvents(ics);
  const today = todayInRome();
  const todayKey = toDateInputValue(today);

  let created = 0;
  let skipped = 0;

  for (const event of events) {
    const arrivalKey = toDateInputValue(event.start);
    if (arrivalKey < todayKey) {
      skipped += 1;
      continue;
    }
    const nights = nightsBetween(event.start, event.end);
    const existing = await prisma.guestStay.findFirst({
      where: {
        propertyId: calendar.propertyId,
        externalUid: event.uid,
      },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const name = guestNameFromSummary(event.summary);
    const birthDate = parseDateOnly("1990-01-01");
    const tax = taxFieldsForStay({
      property: calendar.property,
      birthDate,
      arrivalDate: event.start,
      nights,
    });
    await prisma.guestStay.create({
      data: {
        organizationId: calendar.organizationId,
        propertyId: calendar.propertyId,
        guestType: "16",
        lastName: name.lastName,
        firstName: name.firstName,
        sex: "1",
        birthDate,
        birthComuneCode: "",
        birthProvince: "",
        birthCountryCode: "100000100",
        citizenshipCode: "100000100",
        documentType: "",
        documentNumber: "",
        documentIssuePlace: "",
        arrivalDate: event.start,
        nights,
        status: "draft",
        source: "ical",
        externalUid: event.uid,
        checkInToken: createId(),
        ...tax,
      },
    });
    created += 1;
  }

  const message =
    created === 0
      ? `Nessuna nuova prenotazione (${skipped} già presenti o passate).`
      : `Importate ${created} prenotazioni (${skipped} saltate).`;

  await prisma.channelCalendar.update({
    where: { id: calendarId },
    data: {
      lastSyncAt: new Date(),
      lastSyncOk: true,
      lastSyncMessage: message,
    },
  });

  return { created, skipped, message };
}
