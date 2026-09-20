import { describe, expect, it } from "vitest";
import { normalizeStayDocuments } from "../src/lib/stays-normalize.js";

describe("normalizeStayDocuments", () => {
  it("azzera documento per familiare (19)", () => {
    expect(
      normalizeStayDocuments({
        guestType: "19",
        documentType: "IDENT",
        documentNumber: "CA1",
        documentIssuePlace: "D612",
      }),
    ).toEqual({
      documentType: "",
      documentNumber: "",
      documentIssuePlace: "",
    });
  });

  it("mantiene documento per ospite singolo (16)", () => {
    expect(
      normalizeStayDocuments({
        guestType: "16",
        documentType: " IDENT ",
        documentNumber: " CA1 ",
        documentIssuePlace: " D612 ",
      }),
    ).toEqual({
      documentType: "IDENT",
      documentNumber: "CA1",
      documentIssuePlace: "D612",
    });
  });
});
