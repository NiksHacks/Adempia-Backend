import { describe, expect, it } from "vitest";
import { getLookupByCode, searchLookup } from "../../src/lib/alloggiati/lookups.js";

describe("searchLookup", () => {
  it("trova Firenze per etichetta", () => {
    const rows = searchLookup("firenze", "comune");
    expect(rows.some((row) => row.code === "D612")).toBe(true);
  });

  it("trova Italia per codice", () => {
    const rows = searchLookup("100000100", "stato");
    expect(rows[0]?.code).toBe("100000100");
  });

  it("restituisce documenti con query vuota", () => {
    const rows = searchLookup("", "documento");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.kind === "documento")).toBe(true);
  });
});

describe("getLookupByCode", () => {
  it("risolve IDENT", () => {
    expect(getLookupByCode("IDENT", "documento")?.label).toMatch(/identit/i);
  });

  it("undefined se kind sbagliato", () => {
    expect(getLookupByCode("IDENT", "comune")).toBeUndefined();
  });
});
