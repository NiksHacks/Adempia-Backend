/**
 * Deterministic guest-reminder / overdue computation.
 *
 * The frontend already knows how to derive the assumed check-in instant
 * (15:00 Europe/Rome) from an arrival date. The backend owns the deadline math
 * so reminder logic lives in one place, callable by cron/webhooks later.
 */

export type StayStatus = "draft" | "ready" | "sent" | "error";

export type ReminderStay = {
  id: string;
  /** Assumed check-in instant (ISO 8601). */
  checkInAt: string;
  nights: number;
  status: StayStatus;
  hasCheckInToken: boolean;
};

export type DueReminder = {
  stayId: string;
  kind: "guest_reminder" | "host_overdue";
  deadlineAt: string;
  hoursToDeadline: number;
};

export type ComputeOptions = {
  /** How many hours before the deadline a guest reminder becomes due. */
  reminderWindowHours?: number;
};

const HOUR_MS = 60 * 60 * 1000;

/** Alloggiati deadline: 6h for stays up to 1 night, otherwise 24h. */
export function deadlineFor(checkInAt: Date, nights: number): Date {
  const windowHours = nights <= 1 ? 6 : 24;
  return new Date(checkInAt.getTime() + windowHours * HOUR_MS);
}

export function computeDueReminders(
  stays: ReminderStay[],
  now: Date,
  options: ComputeOptions = {},
): DueReminder[] {
  const reminderWindowHours = options.reminderWindowHours ?? 24;
  const due: DueReminder[] = [];

  for (const stay of stays) {
    // Only stays still missing data are actionable.
    if (stay.status !== "draft") continue;

    const checkInAt = new Date(stay.checkInAt);
    if (Number.isNaN(checkInAt.getTime())) continue;

    const deadline = deadlineFor(checkInAt, stay.nights);
    const hoursToDeadline = (deadline.getTime() - now.getTime()) / HOUR_MS;

    if (now.getTime() > deadline.getTime()) {
      due.push({
        stayId: stay.id,
        kind: "host_overdue",
        deadlineAt: deadline.toISOString(),
        hoursToDeadline,
      });
      continue;
    }

    // A guest reminder needs a public check-in link to send.
    if (stay.hasCheckInToken && hoursToDeadline <= reminderWindowHours) {
      due.push({
        stayId: stay.id,
        kind: "guest_reminder",
        deadlineAt: deadline.toISOString(),
        hoursToDeadline,
      });
    }
  }

  return due;
}
