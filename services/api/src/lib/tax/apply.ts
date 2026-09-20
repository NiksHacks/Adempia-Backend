import { computeTouristTax } from "./tourist-tax.js";

type PropertyTaxFields = {
  touristTaxPerNightCents: number;
  touristTaxMaxNights: number;
  touristTaxExemptUnderAge: number;
};

export function taxFieldsForStay(input: {
  property: PropertyTaxFields;
  birthDate: Date;
  arrivalDate: Date;
  nights: number;
  previousStatus?: string;
}) {
  const result = computeTouristTax({
    rule: input.property,
    nights: input.nights,
    birthDate: input.birthDate,
    arrivalDate: input.arrivalDate,
    previousStatus: input.previousStatus,
  });
  return {
    touristTaxCents: result.cents,
    touristTaxStatus: result.status,
  };
}
