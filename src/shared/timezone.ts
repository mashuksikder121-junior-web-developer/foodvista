export const DHAKA_TIMEZONE = 'Asia/Dhaka';

export function getDhakaDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DHAKA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function getDhakaTimeString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: DHAKA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

export function isWithinTimeWindow(
  openTime?: string,
  closeTime?: string,
  currentTime: string = getDhakaTimeString(),
): boolean {
  if (!openTime && !closeTime) return true;
  const open = openTime || '00:00';
  const close = closeTime || '23:59';
  if (open <= close) {
    return currentTime >= open && currentTime <= close;
  }
  return currentTime >= open || currentTime <= close;
}

export function formatBDT(amount: number): string {
  const rounded = Math.round(amount);
  return `৳${rounded.toLocaleString('en-BD')}`;
}
