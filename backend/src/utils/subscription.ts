import { RestaurantStatus, SubscriptionStatus } from '@prisma/client';

export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  endsAt: Date | null;
}

/**
 * Checks whether a restaurant subscription is currently valid for receiving orders (BR-04).
 */
export function isSubscriptionCurrentlyActive(
  subscription?: SubscriptionSnapshot | null,
  referenceDate: Date = new Date()
): boolean {
  if (!subscription) {
    return false;
  }

  const allowedStatuses: SubscriptionStatus[] = [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIAL,
  ];

  if (!allowedStatuses.includes(subscription.status)) {
    return false;
  }

  if (subscription.endsAt && subscription.endsAt < referenceDate) {
    return false;
  }

  return true;
}

/**
 * Checks whether a restaurant can accept new customer orders.
 */
export function canRestaurantReceiveOrders(
  restaurantStatus: RestaurantStatus,
  subscription?: SubscriptionSnapshot | null,
  referenceDate: Date = new Date()
): boolean {
  if (restaurantStatus !== RestaurantStatus.ACTIVE) {
    return false;
  }
  return isSubscriptionCurrentlyActive(subscription, referenceDate);
}
