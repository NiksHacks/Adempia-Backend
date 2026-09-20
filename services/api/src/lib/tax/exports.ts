export type IstatRow = {
  propertyName: string;
  arrivals: number;
  nights: number;
  presences: number;
};

export function buildIstatMonth(input: {
  stays: { propertyName: string; nights: number }[];
}): { rows: IstatRow[]; totals: IstatRow } {
  const map = new Map<string, IstatRow>();
  for (const stay of input.stays) {
    const row = map.get(stay.propertyName) ?? {
      propertyName: stay.propertyName,
      arrivals: 0,
      nights: 0,
      presences: 0,
    };
    row.arrivals += 1;
    row.nights += stay.nights;
    row.presences += stay.nights;
    map.set(stay.propertyName, row);
  }
  const rows = [...map.values()].sort((a, b) =>
    a.propertyName.localeCompare(b.propertyName, "it"),
  );
  const totals = rows.reduce(
    (acc, row) => ({
      propertyName: "Totale",
      arrivals: acc.arrivals + row.arrivals,
      nights: acc.nights + row.nights,
      presences: acc.presences + row.presences,
    }),
    { propertyName: "Totale", arrivals: 0, nights: 0, presences: 0 },
  );
  return { rows, totals };
}

export function istatToCsv(
  monthLabel: string,
  rows: IstatRow[],
  totals: IstatRow,
): string {
  const header = "mese;immobile;arrivi;notti;presenze";
  const lines = rows.map(
    (r) =>
      `${monthLabel};${escapeCsv(r.propertyName)};${r.arrivals};${r.nights};${r.presences}`,
  );
  lines.push(
    `${monthLabel};${escapeCsv(totals.propertyName)};${totals.arrivals};${totals.nights};${totals.presences}`,
  );
  return [header, ...lines].join("\n");
}

export function touristTaxToCsv(
  monthLabel: string,
  rows: {
    guestName: string;
    propertyName: string;
    nights: number;
    cents: number;
    status: string;
  }[],
): string {
  const header = "mese;ospite;immobile;notti;importo_eur;stato";
  const lines = rows.map((r) => {
    const eur = (r.cents / 100).toFixed(2).replace(".", ",");
    return `${monthLabel};${escapeCsv(r.guestName)};${escapeCsv(r.propertyName)};${r.nights};${eur};${r.status}`;
  });
  return [header, ...lines].join("\n");
}

function escapeCsv(value: string): string {
  if (value.includes(";") || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
