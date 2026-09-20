/**
 * Estratto delle tabelle Alloggiati (Tabella Luoghi / Tipi_Documento).
 * In modalità live il gateway può scaricare le tabelle complete via SOAP;
 * questo fixture copre il percorso demo e la ricerca offline.
 */
export const LOOKUP_ENTRIES = [
  { kind: "stato", code: "100000100", label: "ITALIA" },
  { kind: "stato", code: "100000201", label: "FRANCIA" },
  { kind: "stato", code: "100000205", label: "GERMANIA" },
  { kind: "stato", code: "100000212", label: "SPAGNA" },
  { kind: "stato", code: "100000227", label: "REGNO UNITO" },
  { kind: "stato", code: "100000401", label: "STATI UNITI" },
  { kind: "comune", code: "D612", label: "FIRENZE", province: "FI" },
  { kind: "comune", code: "H501", label: "ROMA", province: "RM" },
  { kind: "comune", code: "F205", label: "MILANO", province: "MI" },
  { kind: "comune", code: "L219", label: "TORINO", province: "TO" },
  { kind: "comune", code: "F839", label: "NAPOLI", province: "NA" },
  { kind: "comune", code: "A944", label: "BOLOGNA", province: "BO" },
  { kind: "comune", code: "G224", label: "PISA", province: "PI" },
  { kind: "comune", code: "L736", label: "VENEZIA", province: "VE" },
  { kind: "documento", code: "IDENT", label: "Carta d'identità" },
  { kind: "documento", code: "PASOR", label: "Passaporto" },
  { kind: "documento", code: "PATEN", label: "Patente" },
  { kind: "documento", code: "PASEU", label: "Passaporto UE" },
] as const;
