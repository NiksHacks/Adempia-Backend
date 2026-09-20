import { describe, expect, it } from "vitest";
import {
  buildStayChecklist,
  openChecklistTasks,
  stayChecklistComplete,
} from "../../src/lib/stays/checklist.js";
import type { StayWithRelations } from "../../src/lib/stays/checklist.js";

function baseStay(overrides: Partial<StayWithRelations> = {}): StayWithRelations {
  const arrival = new Date(Date.UTC(2026, 8, 17));
  return {
    id: "stay1",
    organizationId: "org1",
    propertyId: "prop1",
    guestType: "16",
    lastName: "Rossi",
    firstName: "Mario",
    sex: "1",
    birthDate: new Date(Date.UTC(1990, 0, 1)),
    birthComuneCode: "D612",
    birthProvince: "FI",
    birthCountryCode: "100000100",
    citizenshipCode: "100000100",
    documentType: "",
    documentNumber: "",
    documentIssuePlace: "",
    arrivalDate: arrival,
    nights: 3,
    status: "draft",
    errorMessage: null,
    sentAt: null,
    source: "manual",
    externalUid: null,
    checkInToken: null,
    touristTaxCents: 1500,
    touristTaxStatus: "due",
    createdAt: arrival,
    updatedAt: arrival,
    property: {
      id: "prop1",
      organizationId: "org1",
      name: "Casa Milano",
      address: "Via Roma 1",
      cin: "IT000",
      alloggiatiApartmentId: "000001",
      touristTaxPerNightCents: 500,
      touristTaxMaxNights: 7,
      touristTaxExemptUnderAge: 14,
      touristTaxCity: "Firenze",
      createdAt: arrival,
      updatedAt: arrival,
    },
    receipt: null,
    ...overrides,
  };
}

describe("buildStayChecklist", () => {
  it("segna documento e Alloggiati da fare su draft incompleto", () => {
    const items = buildStayChecklist(baseStay(), new Date(Date.UTC(2026, 8, 17, 12)));
    expect(items.find((i) => i.id === "guest_data")?.status).toBe("done");
    expect(items.find((i) => i.id === "guest_document")?.status).toBe("todo");
    expect(items.find((i) => i.id === "alloggiati")?.status).toBe("blocked");
  });

  it("sblocca Alloggiati quando il documento è completo", () => {
    const items = buildStayChecklist(
      baseStay({
        documentType: "IDENT",
        documentNumber: "AB123",
        documentIssuePlace: "D612",
        status: "ready",
      }),
      new Date(Date.UTC(2026, 8, 17, 12)),
    );
    expect(items.find((i) => i.id === "guest_document")?.status).toBe("done");
    expect(items.find((i) => i.id === "alloggiati")?.status).toBe("todo");
  });

  it("considera completato un soggiorno inviato con tassa e ricevuta", () => {
    const items = buildStayChecklist(
      baseStay({
        documentType: "IDENT",
        documentNumber: "AB123",
        documentIssuePlace: "D612",
        status: "sent",
        touristTaxStatus: "collected",
        receipt: {
          id: "r1",
          stayId: "stay1",
          organizationId: "org1",
          pdfBytes: Buffer.from(""),
          issuedAt: new Date(),
        },
      }),
      new Date(Date.UTC(2026, 8, 20, 12)),
    );
    expect(stayChecklistComplete(items)).toBe(false); // ISTAT still todo after checkout
    expect(items.find((i) => i.id === "alloggiati")?.status).toBe("done");
    expect(items.find((i) => i.id === "istat")?.status).toBe("todo");
  });
});

describe("openChecklistTasks", () => {
  it("mette prima i task urgenti", () => {
    const draft = baseStay({
      id: "a",
      documentType: "IDENT",
      documentNumber: "X",
      documentIssuePlace: "D612",
      status: "ready",
      arrivalDate: new Date(Date.UTC(2026, 8, 10)),
    });
    const future = baseStay({
      id: "b",
      lastName: "Bianchi",
      firstName: "Luca",
      arrivalDate: new Date(Date.UTC(2026, 9, 1)),
    });
    const rows = openChecklistTasks([future, draft], new Date(Date.UTC(2026, 8, 17, 12)));
    expect(rows[0]?.stay.id).toBe("a");
  });
});
