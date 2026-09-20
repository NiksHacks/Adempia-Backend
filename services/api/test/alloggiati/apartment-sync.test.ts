import { describe, expect, it } from "vitest";
import { planApartmentSync } from "../../src/lib/alloggiati/apartment-sync.js";
import type { AlloggiatiApartment } from "../../src/lib/alloggiati/types.js";

const remote: AlloggiatiApartment[] = [
  { id: "1", description: "Oltrarno", indirizzo: "Via de' Bardi 12" },
  { id: "2", description: "Santa Croce", indirizzo: "Piazza Santa Croce 8" },
];

describe("planApartmentSync", () => {
  it("crea tutti se non ci sono immobili", () => {
    const plan = planApartmentSync([], remote);
    expect(plan.create).toHaveLength(2);
    expect(plan.create[0]?.alloggiatiApartmentId).toBe("000001");
    expect(plan.link).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(0);
  });

  it("abbina ID già paddato", () => {
    const plan = planApartmentSync(
      [{ id: "prop-1", name: "Casa", alloggiatiApartmentId: "000001" }],
      remote,
    );
    expect(plan.create).toHaveLength(0);
    expect(plan.link).toEqual([{ propertyId: "prop-1", alloggiatiApartmentId: "000001" }]);
    expect(plan.unmatched).toHaveLength(1);
    expect(plan.unmatched[0]?.id).toBe("2");
  });

  it("non crea se esistono immobili anche senza match", () => {
    const plan = planApartmentSync(
      [{ id: "prop-1", name: "Altro", alloggiatiApartmentId: null }],
      remote,
    );
    expect(plan.create).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(2);
  });
});
