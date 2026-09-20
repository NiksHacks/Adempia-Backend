import { toAlloggiatiDate } from "../dates.js";
import {
  APARTMENT_ID_LENGTH,
  GUEST_TYPES,
  GUEST_TYPES_WITHOUT_DOCUMENT,
  MAX_NIGHTS,
  SCHEDINA_FIELDS,
  SCHEDINA_LENGTH,
  SCHEDINA_LENGTH_WITH_APARTMENT,
  type GuestType,
} from "./protocol.js";
import type { GuestSchedinaInput } from "./types.js";

export {
  APARTMENT_ID_LENGTH,
  MAX_NIGHTS,
  SCHEDINA_LENGTH,
  SCHEDINA_LENGTH_WITH_APARTMENT,
} from "./protocol.js";
export { GUEST_TYPES } from "./protocol.js";

function pad(value: string, length: number): string {
  const normalized = value.replace(/\r?\n/g, " ").trimEnd();
  if (normalized.length >= length) {
    return normalized.slice(0, length);
  }
  return normalized.padEnd(length, " ");
}

function padNumber(value: number, length: number): string {
  const abs = Math.max(0, Math.trunc(value));
  return String(abs).padStart(length, "0").slice(-length);
}

export function padApartmentId(id: string): string {
  const trimmed = id.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(APARTMENT_ID_LENGTH, "0").slice(-APARTMENT_ID_LENGTH);
  }
  return pad(trimmed, APARTMENT_ID_LENGTH);
}

function isGuestType(value: string): value is GuestType {
  return (GUEST_TYPES as readonly string[]).includes(value);
}

function documentsAreBlankForType(guestType: string): boolean {
  return (GUEST_TYPES_WITHOUT_DOCUMENT as readonly string[]).includes(guestType);
}

export function buildSchedinaRow(
  input: GuestSchedinaInput,
  options: { includeApartment?: boolean } = {},
): string {
  if (!isGuestType(input.guestType)) {
    throw new Error("Tipo alloggiato non valido (16, 17, 18, 19, 20)");
  }
  if (input.sex !== "1" && input.sex !== "2") {
    throw new Error("Sesso non valido (1 = maschio, 2 = femmina)");
  }
  if (input.nights < 1 || input.nights > MAX_NIGHTS) {
    throw new Error(`Giorni di permanenza non validi (massimo ${MAX_NIGHTS})`);
  }

  const blankDocs = documentsAreBlankForType(input.guestType);

  const values: Record<(typeof SCHEDINA_FIELDS)[number]["key"], string> = {
    guestType: pad(input.guestType, 2),
    arrivalDate: pad(toAlloggiatiDate(input.arrivalDate), 10),
    nights: padNumber(input.nights, 2),
    lastName: pad(input.lastName.toUpperCase(), 50),
    firstName: pad(input.firstName.toUpperCase(), 30),
    sex: pad(input.sex, 1),
    birthDate: pad(toAlloggiatiDate(input.birthDate), 10),
    birthComuneCode: pad(input.birthComuneCode.toUpperCase(), 9),
    birthProvince: pad(input.birthProvince.toUpperCase(), 2),
    birthCountryCode: pad(input.birthCountryCode.toUpperCase(), 9),
    citizenshipCode: pad(input.citizenshipCode.toUpperCase(), 9),
    documentType: blankDocs ? pad("", 5) : pad(input.documentType.toUpperCase(), 5),
    documentNumber: blankDocs ? pad("", 20) : pad(input.documentNumber.toUpperCase(), 20),
    documentIssuePlace: blankDocs ? pad("", 9) : pad(input.documentIssuePlace.toUpperCase(), 9),
  };

  let row = "";
  for (const field of SCHEDINA_FIELDS) {
    const piece = values[field.key];
    if (piece.length !== field.length) {
      throw new Error(`Campo ${field.key}: lunghezza ${piece.length}, attesi ${field.length}`);
    }
    row += piece;
  }

  if (row.length !== SCHEDINA_LENGTH) {
    throw new Error(`Schedina di lunghezza ${row.length}, attesi ${SCHEDINA_LENGTH}`);
  }

  const includeApartment = options.includeApartment ?? Boolean(input.apartmentId?.trim());
  if (includeApartment) {
    const apartmentId = input.apartmentId?.trim();
    if (!apartmentId) {
      throw new Error("ID appartamento obbligatorio per il tracciato file unico (174 caratteri)");
    }
    row += padApartmentId(apartmentId);
    if (row.length !== SCHEDINA_LENGTH_WITH_APARTMENT) {
      throw new Error(
        `Schedina con appartamento di lunghezza ${row.length}, attesi ${SCHEDINA_LENGTH_WITH_APARTMENT}`,
      );
    }
  }

  return row;
}

export function parseSchedinaRow(row: string) {
  if (row.length !== SCHEDINA_LENGTH && row.length !== SCHEDINA_LENGTH_WITH_APARTMENT) {
    throw new Error("Lunghezza riga schedina non valida");
  }

  const sliced: Record<string, string> = {};
  for (const field of SCHEDINA_FIELDS) {
    sliced[field.key] = row.slice(field.from, field.to + 1);
  }

  return {
    guestType: sliced.guestType.trim(),
    arrivalDate: sliced.arrivalDate.trim(),
    nights: sliced.nights.trim(),
    lastName: sliced.lastName.trim(),
    firstName: sliced.firstName.trim(),
    sex: sliced.sex.trim(),
    birthDate: sliced.birthDate.trim(),
    birthComuneCode: sliced.birthComuneCode.trim(),
    birthProvince: sliced.birthProvince.trim(),
    birthCountryCode: sliced.birthCountryCode.trim(),
    citizenshipCode: sliced.citizenshipCode.trim(),
    documentType: sliced.documentType.trim(),
    documentNumber: sliced.documentNumber.trim(),
    documentIssuePlace: sliced.documentIssuePlace.trim(),
    apartmentId:
      row.length === SCHEDINA_LENGTH_WITH_APARTMENT
        ? row.slice(SCHEDINA_LENGTH, SCHEDINA_LENGTH + APARTMENT_ID_LENGTH).trim() || null
        : null,
  };
}
