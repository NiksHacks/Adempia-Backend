import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatItDate } from "../dates.js";

export async function buildMockRicevutaPdf(input: {
  protocol: string;
  issuedAt: Date;
  guests: { lastName: string; firstName: string; arrivalDate: Date }[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.12, 0.18, 0.14);
  const green = rgb(0.12, 0.32, 0.24);

  page.drawText("QUESTURA — ALLOGGIATI WEB", {
    x: 56,
    y: 780,
    size: 11,
    font: bold,
    color: green,
  });
  page.drawText("Ricevuta di trasmissione (simulata)", {
    x: 56,
    y: 760,
    size: 18,
    font: bold,
    color: ink,
  });
  page.drawText("Adempia — modalita mock, nessuna chiamata alla Questura", {
    x: 56,
    y: 740,
    size: 10,
    font,
    color: ink,
  });

  page.drawText(`Protocollo: ${input.protocol}`, { x: 56, y: 700, size: 12, font: bold, color: ink });
  page.drawText(`Data: ${formatItDate(input.issuedAt)}`, {
    x: 56,
    y: 682,
    size: 12,
    font,
    color: ink,
  });

  let y = 640;
  page.drawText("Ospiti trasmessi", { x: 56, y, size: 12, font: bold, color: green });
  y -= 22;
  for (const guest of input.guests) {
    page.drawText(
      `${guest.lastName} ${guest.firstName}  —  arrivo ${formatItDate(guest.arrivalDate)}`,
      { x: 56, y, size: 11, font, color: ink },
    );
    y -= 18;
  }

  page.drawText("Questo PDF e un sostituto di prova della ricevuta Alloggiati.", {
    x: 56,
    y: 80,
    size: 9,
    font,
    color: ink,
  });

  return doc.save();
}
