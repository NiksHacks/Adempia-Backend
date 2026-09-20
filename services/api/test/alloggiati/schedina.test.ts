import { describe, expect, it } from "vitest";
import { SCHEDINA_FIELDS } from "../../src/lib/alloggiati/protocol.js";
import {
  APARTMENT_ID_LENGTH,
  buildSchedinaRow,
  parseSchedinaRow,
  SCHEDINA_LENGTH,
  SCHEDINA_LENGTH_WITH_APARTMENT,
} from "../../src/lib/alloggiati/schedina.js";
import type { GuestSchedinaInput } from "../../src/lib/alloggiati/types.js";

const sample: GuestSchedinaInput = {
  guestType: "16",
  arrivalDate: new Date(Date.UTC(2026, 8, 17)),
  nights: 3,
  lastName: "Rossi",
  firstName: "Mario",
  sex: "1",
  birthDate: new Date(Date.UTC(1988, 2, 12)),
  birthComuneCode: "H501",
  birthProvince: "RM",
  birthCountryCode: "100000100",
  citizenshipCode: "100000100",
  documentType: "IDENT",
  documentNumber: "CA12345AA",
  documentIssuePlace: "H501",
};

describe("tracciato ufficiale 168 caratteri", () => {
  it("somma le lunghezze del manuale a 168", () => {
    const total = SCHEDINA_FIELDS.reduce((sum, field) => sum + field.length, 0);
    expect(total).toBe(168);
    expect(SCHEDINA_FIELDS.at(-1)?.to).toBe(167);
  });

  it("rispetta DA–A del manuale WS (tipo, arrivo, permanenza, anagrafica, documento)", () => {
    const row = buildSchedinaRow(sample, { includeApartment: false });
    expect(row.length).toBe(SCHEDINA_LENGTH);
    expect(row.slice(0, 2)).toBe("16");
    expect(row.slice(2, 12)).toBe("17/09/2026");
    expect(row.slice(12, 14)).toBe("03");
    expect(row.slice(14, 64)).toBe("ROSSI".padEnd(50, " "));
    expect(row.slice(64, 94)).toBe("MARIO".padEnd(30, " "));
    expect(row.slice(94, 95)).toBe("1");
    expect(row.slice(95, 105)).toBe("12/03/1988");
    expect(row.slice(105, 114)).toBe("H501".padEnd(9, " "));
    expect(row.slice(114, 116)).toBe("RM");
    expect(row.slice(116, 125)).toBe("100000100");
    expect(row.slice(125, 134)).toBe("100000100");
    expect(row.slice(134, 139)).toBe("IDENT");
    expect(row.slice(139, 159)).toBe("CA12345AA".padEnd(20, " "));
    expect(row.slice(159, 168)).toBe("H501".padEnd(9, " "));
  });

  it("file unico: 174 caratteri con ID appartamento in 168–173", () => {
    const row = buildSchedinaRow({ ...sample, apartmentId: "4" }, { includeApartment: true });
    expect(row.length).toBe(SCHEDINA_LENGTH_WITH_APARTMENT);
    expect(row.slice(168, 174)).toBe("4".padStart(APARTMENT_ID_LENGTH, "0"));
  });

  it("tipo 19/20 riempie documento con blank", () => {
    const row = buildSchedinaRow({
      ...sample,
      guestType: "19",
      documentType: "IDENT",
      documentNumber: "XX",
      documentIssuePlace: "H501",
    });
    expect(row.slice(134, 168)).toBe(" ".repeat(5 + 20 + 9));
  });

  it("rifiuta permanenza oltre 30 giorni", () => {
    expect(() => buildSchedinaRow({ ...sample, nights: 31 })).toThrow(/30/);
  });

  it("tronca i campi troppo lunghi", () => {
    const row = buildSchedinaRow({
      ...sample,
      lastName: "A".repeat(80),
      documentType: "IDENTX",
    });
    expect(row.slice(14, 64)).toBe("A".repeat(50));
    expect(row.slice(134, 139)).toBe("IDENT");
  });

  it("rifiuta tipo alloggiato o sesso non validi", () => {
    expect(() => buildSchedinaRow({ ...sample, guestType: "99" })).toThrow(/Tipo alloggiato/);
    expect(() => buildSchedinaRow({ ...sample, sex: "M" })).toThrow(/Sesso/);
  });

  it("è invertibile con parseSchedinaRow", () => {
    const row = buildSchedinaRow({ ...sample, apartmentId: "12" }, { includeApartment: true });
    const parsed = parseSchedinaRow(row);
    expect(parsed.lastName).toBe("ROSSI");
    expect(parsed.arrivalDate).toBe("17/09/2026");
    expect(parsed.nights).toBe("03");
    expect(parsed.apartmentId).toBe("000012");
  });
});
