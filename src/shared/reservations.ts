import { Reservation, RestaurantTable } from './types.ts';

export function hasReservationConflict(
  reservations: Reservation[],
  tableId: string,
  date: string,
  timeSlot: string,
  excludeReservationId?: string,
): boolean {
  return reservations.some(
    (r) =>
      r.id !== excludeReservationId &&
      r.tableId === tableId &&
      r.date === date &&
      r.timeSlot === timeSlot &&
      (r.status === 'pending' || r.status === 'confirmed'),
  );
}

export function findAvailableTablesForSlot(
  tables: RestaurantTable[],
  reservations: Reservation[],
  date: string,
  timeSlot: string,
  guestCount: number,
): RestaurantTable[] {
  return tables
    .filter(
      (t) =>
        t.isActive &&
        t.status !== 'inactive' &&
        t.capacity >= guestCount &&
        !hasReservationConflict(reservations, t.id, date, timeSlot),
    )
    .sort((a, b) => a.capacity - b.capacity);
}
