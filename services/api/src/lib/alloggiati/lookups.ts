import { LOOKUP_ENTRIES } from "./fixtures/lookups.js";

export type LookupKind = "comune" | "stato" | "documento";

export type LookupEntry = {
  kind: LookupKind;
  code: string;
  label: string;
  province?: string;
};

const ENTRIES: LookupEntry[] = LOOKUP_ENTRIES.map((entry) => ({ ...entry }));

function haystack(entry: LookupEntry): string {
  return [entry.code, entry.label, entry.province ?? ""].join(" ").toLowerCase();
}

export function searchLookup(query: string, kind: LookupKind, limit = 20): LookupEntry[] {
  const rows = ENTRIES.filter((entry) => entry.kind === kind);
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? rows.filter((entry) => haystack(entry).includes(needle))
    : rows;
  return matched.slice(0, limit);
}

export function getLookupByCode(code: string, kind: LookupKind): LookupEntry | undefined {
  const normalized = code.trim().toUpperCase();
  return ENTRIES.find(
    (entry) => entry.kind === kind && entry.code.toUpperCase() === normalized,
  );
}

export function lookupsToCsv(kind: LookupKind): string {
  const rows = ENTRIES.filter((entry) => entry.kind === kind);
  if (kind === "documento") {
    return ["tipo;descrizione", ...rows.map((row) => `${row.code};${row.label}`)].join("\n");
  }
  return [
    "codice;descrizione;provincia",
    ...rows.map((row) => `${row.code};${row.label};${row.province ?? ""}`),
  ].join("\n");
}
