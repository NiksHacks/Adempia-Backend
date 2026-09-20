import { describe, expect, it } from "vitest";
import {
  alloggiatiDeadlineAt,
  alloggiatiWindowHours,
  deadlineState,
  formatDeadlineCountdown,
} from "../../src/lib/alloggiati/deadlines.js";

describe("alloggiati deadlines", () => {
  it("usa 6h per 1 notte e 24h oltre", () => {
    expect(alloggiatiWindowHours(1)).toBe(6);
    expect(alloggiatiWindowHours(2)).toBe(24);
  });

  it("calcola deadline da check-in assunto 15:00 UTC", () => {
    const arrival = new Date("2026-09-17T00:00:00.000Z");
    expect(alloggiatiDeadlineAt(arrival, 1).toISOString()).toBe(
      "2026-09-17T21:00:00.000Z",
    );
    expect(alloggiatiDeadlineAt(arrival, 3).toISOString()).toBe(
      "2026-09-18T15:00:00.000Z",
    );
  });

  it("segna overdue e formatta countdown", () => {
    const arrival = new Date("2026-09-17T00:00:00.000Z");
    const overdue = deadlineState(
      arrival,
      1,
      new Date("2026-09-17T22:00:00.000Z"),
    );
    expect(overdue.overdue).toBe(true);
    expect(formatDeadlineCountdown(overdue)).toMatch(/In ritardo/);

    const ok = deadlineState(arrival, 3, new Date("2026-09-17T16:00:00.000Z"));
    expect(ok.overdue).toBe(false);
    expect(formatDeadlineCountdown(ok)).toMatch(/h rimaste/);
  });
});
