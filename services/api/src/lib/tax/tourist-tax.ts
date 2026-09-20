export type TaxRule = {
  touristTaxPerNightCents: number;
  touristTaxMaxNights: number;
  touristTaxExemptUnderAge: number;
};

export type TaxResult = {
  cents: number;
  status: "due" | "exempt" | "na" | "collected";
  taxableNights: number;
  age: number | null;
};

export function ageOnDate(birthDate: Date, onDate: Date): number {
  let age = onDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = onDate.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && onDate.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function computeTouristTax(input: {
  rule: TaxRule;
  nights: number;
  birthDate: Date;
  arrivalDate: Date;
  /** Se già riscossa, non ricalcolare lo status collected. */
  previousStatus?: string;
}): TaxResult {
  if (input.rule.touristTaxPerNightCents <= 0) {
    return { cents: 0, status: "na", taxableNights: 0, age: null };
  }

  const age = ageOnDate(input.birthDate, input.arrivalDate);
  if (age < input.rule.touristTaxExemptUnderAge) {
    return { cents: 0, status: "exempt", taxableNights: 0, age };
  }

  const maxNights =
    input.rule.touristTaxMaxNights > 0
      ? input.rule.touristTaxMaxNights
      : input.nights;
  const taxableNights = Math.min(Math.max(1, input.nights), maxNights);
  const cents = taxableNights * input.rule.touristTaxPerNightCents;

  if (input.previousStatus === "collected") {
    return { cents, status: "collected", taxableNights, age };
  }

  return { cents, status: "due", taxableNights, age };
}

export function formatEuroFromCents(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function touristTaxStatusLabel(status: string): string {
  switch (status) {
    case "due":
      return "Da riscuotere";
    case "collected":
      return "Riscossa";
    case "exempt":
      return "Esente";
    case "na":
      return "N/D";
    default:
      return status;
  }
}
