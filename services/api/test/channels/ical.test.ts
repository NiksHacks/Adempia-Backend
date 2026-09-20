import { describe, expect, it } from "vitest";
import {
  guestNameFromSummary,
  nightsBetween,
  parseIcsEvents,
} from "../../src/lib/channels/ical.js";

const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:abc-123@airbnb.com
DTSTART;VALUE=DATE:20260920
DTEND;VALUE=DATE:20260923
SUMMARY:Reserved
END:VEVENT
BEGIN:VEVENT
UID:fold-456
DTSTART:20261001T150000Z
DTEND:20261003T110000Z
SUMMARY:Mario
  Rossi
END:VEVENT
END:VCALENDAR`;

describe("parseIcsEvents", () => {
  it("parsa eventi DATE e DATE-TIME con line folding", () => {
    const events = parseIcsEvents(SAMPLE);
    expect(events).toHaveLength(2);
    expect(events[0]?.uid).toBe("abc-123@airbnb.com");
    expect(events[0]?.start.toISOString().slice(0, 10)).toBe("2026-09-20");
    expect(nightsBetween(events[0]!.start, events[0]!.end)).toBe(3);
    expect(events[1]?.summary).toBe("Mario Rossi");
  });

  it("normalizza nomi da summary OTA", () => {
    expect(guestNameFromSummary("Airbnb (Not available)")).toEqual({
      lastName: "Ospite",
      firstName: "Da completare",
    });
    expect(guestNameFromSummary("Anna Verdi")).toEqual({
      lastName: "Verdi",
      firstName: "Anna",
    });
  });
});
