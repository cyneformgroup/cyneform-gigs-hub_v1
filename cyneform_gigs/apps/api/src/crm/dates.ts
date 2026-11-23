const EAT = 3 * 3_600_000;
const DAY = 86_400_000;

/** 8:00 AM EAT on the same EAT calendar day as d. */
function atEight(d: Date): Date {
  const e = new Date(d.getTime() + EAT);
  e.setUTCHours(8, 0, 0, 0);
  return new Date(e.getTime() - EAT);
}

function businessDay(d: Date): Date {
  const dow = new Date(d.getTime() + EAT).getUTCDay();
  return new Date(d.getTime() + (dow === 6 ? 2 : dow === 0 ? 1 : 0) * DAY);
}

/** d1 = from + n1, d2 = d1 + n2, d3 = d2 + n3, each moved off weekends. */
export function followupDates(
  from: Date,
  [n1, n2, n3]: [number, number, number],
): [Date, Date, Date] {
  const d1 = businessDay(atEight(new Date(from.getTime() + n1 * DAY)));
  const d2 = businessDay(atEight(new Date(d1.getTime() + n2 * DAY)));
  const d3 = businessDay(atEight(new Date(d2.getTime() + n3 * DAY)));
  return [d1, d2, d3];
}
