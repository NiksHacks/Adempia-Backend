import { parseDateOnly } from "../dates.js";

export type IcalEvent = {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
};

function unfoldLines(ics: string): string[] {
  const raw = ics.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcalDate(value: string): Date | null {
  const cleaned = value.trim();
  // DATE: 20260920
  if (/^\d{8}$/.test(cleaned)) {
    const y = cleaned.slice(0, 4);
    const m = cleaned.slice(4, 6);
    const d = cleaned.slice(6, 8);
    return parseDateOnly(`${y}-${m}-${d}`);
  }
  // DATE-TIME: 20260920T150000Z or 20260920T150000
  const m = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (m) {
    return parseDateOnly(`${m[1]}-${m[2]}-${m[3]}`);
  }
  return null;
}

function fieldValue(line: string): string | null {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  return line.slice(idx + 1).trim();
}

function fieldName(line: string): string {
  const beforeColon = line.split(":", 1)[0] ?? "";
  return beforeColon.split(";", 1)[0]?.toUpperCase() ?? "";
}

export function parseIcsEvents(ics: string): IcalEvent[] {
  const lines = unfoldLines(ics);
  const events: IcalEvent[] = [];
  let current: Partial<IcalEvent> | null = null;

  for (const line of lines) {
    const name = fieldName(line);
    if (name === "BEGIN" && fieldValue(line)?.toUpperCase() === "VEVENT") {
      current = {};
      continue;
    }
    if (!current) continue;
    if (name === "END" && fieldValue(line)?.toUpperCase() === "VEVENT") {
      if (current.uid && current.start && current.end) {
        events.push({
          uid: current.uid,
          summary: current.summary?.trim() || "Prenotazione",
          start: current.start,
          end: current.end,
        });
      }
      current = null;
      continue;
    }
    const value = fieldValue(line);
    if (!value) continue;
    switch (name) {
      case "UID":
        current.uid = value;
        break;
      case "SUMMARY":
        current.summary = value.replace(/\\,/g, ",").replace(/\\n/g, " ");
        break;
      case "DTSTART": {
        const date = parseIcalDate(value);
        if (date) current.start = date;
        break;
      }
      case "DTEND": {
        const date = parseIcalDate(value);
        if (date) current.end = date;
        break;
      }
      default:
        break;
    }
  }

  return events;
}

export function nightsBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const nights = Math.round(ms / (24 * 60 * 60 * 1000));
  return Math.min(30, Math.max(1, nights || 1));
}

/** Airbnb/Booking spesso mettono "Not available" — non è un nome ospite. */
export function guestNameFromSummary(summary: string): {
  firstName: string;
  lastName: string;
} {
  const cleaned = summary
    .replace(/\\,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  const lower = cleaned.toLowerCase();
  if (
    !cleaned ||
    lower.includes("not available")
    || lower.includes("blocked")
    || lower.includes("airbnb")
    || lower.includes("booking.com")
    || lower === "reserved"
  ) {
    return { lastName: "Ospite", firstName: "Da completare" };
  }
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 1) {
    return { lastName: parts[0]!, firstName: "—" };
  }
  return {
    lastName: parts[parts.length - 1]!,
    firstName: parts.slice(0, -1).join(" "),
  };
}
