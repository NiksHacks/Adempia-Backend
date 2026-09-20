import { describe, expect, it } from "vitest";
import { computeDueReminders, deadlineFor, type ReminderStay } from "../src/reminders.js";

function stay(overrides: Partial<ReminderStay> = {}): ReminderStay {
  return {
    id: "s1",
    checkInAt: "2026-06-01T13:00:00.000Z",
    nights: 3,
    status: "draft",
    hasCheckInToken: true,
    ...overrides,
  };
}

describe("deadlineFor", () => {
  it("uses a 6h window for stays up to one night", () => {
    const d = deadlineFor(new Date("2026-06-01T13:00:00Z"), 1);
    expect(d.toISOString()).toBe("2026-06-01T19:00:00.000Z");
  });
  it("uses a 24h window for multi-night stays", () => {
    const d = deadlineFor(new Date("2026-06-01T13:00:00Z"), 3);
    expect(d.toISOString()).toBe("2026-06-02T13:00:00.000Z");
  });
});

describe("computeDueReminders", () => {
  it("does not remind when the deadline is far away", () => {
    const now = new Date("2026-05-25T13:00:00Z"); // ~1 week before
    expect(computeDueReminders([stay()], now)).toEqual([]);
  });

  it("emits a guest reminder within the reminder window", () => {
    const now = new Date("2026-06-01T20:00:00Z"); // deadline 06-02T13:00, ~17h left
    const due = computeDueReminders([stay()], now);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ stayId: "s1", kind: "guest_reminder" });
  });

  it("flags host_overdue after the deadline passes", () => {
    const now = new Date("2026-06-03T13:00:00Z"); // past 06-02T13:00
    const due = computeDueReminders([stay()], now);
    expect(due).toHaveLength(1);
    expect(due[0]?.kind).toBe("host_overdue");
  });

  it("skips stays that are no longer draft", () => {
    const now = new Date("2026-06-01T20:00:00Z");
    expect(computeDueReminders([stay({ status: "ready" })], now)).toEqual([]);
  });

  it("does not emit a guest reminder without a check-in token (still overdue-capable)", () => {
    const withinWindow = new Date("2026-06-01T20:00:00Z");
    expect(computeDueReminders([stay({ hasCheckInToken: false })], withinWindow)).toEqual([]);
    const past = new Date("2026-06-03T13:00:00Z");
    expect(computeDueReminders([stay({ hasCheckInToken: false })], past)[0]?.kind).toBe(
      "host_overdue",
    );
  });
});
