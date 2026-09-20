import { describe, expect, it } from "vitest";
import { ageOnDate, computeTouristTax } from "../../src/lib/tax/tourist-tax.js";

const FI = {
  touristTaxPerNightCents: 500,
  touristTaxMaxNights: 7,
  touristTaxExemptUnderAge: 14,
};

describe("tourist tax Firenze demo", () => {
  it("calcola notti tassabili con tetto 7", () => {
    const result = computeTouristTax({
      rule: FI,
      nights: 10,
      birthDate: new Date("1990-01-01T00:00:00.000Z"),
      arrivalDate: new Date("2026-09-17T00:00:00.000Z"),
    });
    expect(result.taxableNights).toBe(7);
    expect(result.cents).toBe(3500);
    expect(result.status).toBe("due");
  });

  it("esenta minori", () => {
    const result = computeTouristTax({
      rule: FI,
      nights: 3,
      birthDate: new Date("2018-01-01T00:00:00.000Z"),
      arrivalDate: new Date("2026-09-17T00:00:00.000Z"),
    });
    expect(result.status).toBe("exempt");
    expect(result.cents).toBe(0);
    expect(ageOnDate(new Date("2018-01-01T00:00:00.000Z"), new Date("2026-09-17T00:00:00.000Z"))).toBe(8);
  });
});
