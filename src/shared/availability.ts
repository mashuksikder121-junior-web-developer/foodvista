import { FoodAvailability, Product } from './types.ts';
import { getDhakaDateString, getDhakaTimeString, isWithinTimeWindow } from './timezone.ts';

export interface AvailabilityResult {
  available: boolean;
  message: string;
  date: string;
}

export function checkProductAvailability(
  product: Product,
  availabilityList: FoodAvailability[],
  targetDate: string = getDhakaDateString(),
  currentTime: string = getDhakaTimeString(),
): AvailabilityResult {
  if (product.isDeleted || !product.isActive) {
    return {
      available: false,
      message: `${product.name} is currently off the menu.`,
      date: targetDate,
    };
  }

  const record = availabilityList.find(
    (a) => a.productId === product.id && a.date === targetDate,
  );

  if (!record) {
    return {
      available: true,
      message: 'Available today',
      date: targetDate,
    };
  }

  if (!record.isAvailable) {
    return {
      available: false,
      message: record.unavailableMessage.trim() || `আজ ${product.name} পাওয়া যাচ্ছে না।`,
      date: targetDate,
    };
  }

  if (!isWithinTimeWindow(record.openTime, record.closeTime, currentTime)) {
    return {
      available: false,
      message:
        record.unavailableMessage.trim() ||
        `Available daily between ${record.openTime || '10:00'} and ${record.closeTime || '23:00'} (Dhaka time).`,
      date: targetDate,
    };
  }

  return {
    available: true,
    message: 'Available today',
    date: targetDate,
  };
}
