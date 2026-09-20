/** Assumed check-in hour on the arrival calendar day (UTC date-only storage). */
const ASSUMED_CHECK_IN_HOUR_UTC = 15;

export function alloggiatiWindowHours(nights: number): 6 | 24 {
  return nights <= 1 ? 6 : 24;
}

/** Assumed check-in: arrival date at 15:00 UTC (app stores date-only as UTC midnight). */
export function assumedCheckInAt(arrivalDate: Date): Date {
  return new Date(
    arrivalDate.getTime() + ASSUMED_CHECK_IN_HOUR_UTC * 60 * 60 * 1000,
  );
}

export function alloggiatiDeadlineAt(arrivalDate: Date, nights: number): Date {
  const checkIn = assumedCheckInAt(arrivalDate);
  const hours = alloggiatiWindowHours(nights);
  return new Date(checkIn.getTime() + hours * 60 * 60 * 1000);
}

export type DeadlineState = {
  deadlineAt: Date;
  windowHours: 6 | 24;
  msLeft: number;
  overdue: boolean;
  hoursLeft: number;
};

export function deadlineState(
  arrivalDate: Date,
  nights: number,
  now: Date = new Date(),
): DeadlineState {
  const deadlineAt = alloggiatiDeadlineAt(arrivalDate, nights);
  const windowHours = alloggiatiWindowHours(nights);
  const msLeft = deadlineAt.getTime() - now.getTime();
  return {
    deadlineAt,
    windowHours,
    msLeft,
    overdue: msLeft < 0,
    hoursLeft: msLeft / (60 * 60 * 1000),
  };
}

export function formatDeadlineCountdown(state: DeadlineState): string {
  if (state.overdue) {
    const hoursLate = Math.ceil(Math.abs(state.hoursLeft));
    if (hoursLate < 24) {
      return `In ritardo di ${hoursLate}h`;
    }
    const days = Math.ceil(hoursLate / 24);
    return `In ritardo di ${days}g`;
  }
  if (state.hoursLeft < 1) {
    const mins = Math.max(1, Math.ceil(state.msLeft / 60_000));
    return `${mins} min rimasti`;
  }
  if (state.hoursLeft < 24) {
    return `${Math.ceil(state.hoursLeft)}h rimaste`;
  }
  const days = Math.floor(state.hoursLeft / 24);
  const hours = Math.ceil(state.hoursLeft % 24);
  return hours > 0 ? `${days}g ${hours}h` : `${days}g`;
}
