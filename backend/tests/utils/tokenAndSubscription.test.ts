import { describe, it, expect } from 'vitest';
import { RestaurantStatus, SubscriptionStatus } from '@prisma/client';
import {
  buildQrMenuPath,
  generateSecureToken,
  hashGuestToken,
  hashQrToken,
} from '../../src/utils/token.js';
import {
  canRestaurantReceiveOrders,
  isSubscriptionCurrentlyActive,
} from '../../src/utils/subscription.js';

describe('Token & QR Helpers', () => {
  it('generates high-entropy URL-safe tokens and deterministic hashes', () => {
    const token1 = generateSecureToken(32);
    const token2 = generateSecureToken(32);

    expect(token1.length).toBeGreaterThanOrEqual(40);
    expect(token1).not.toBe(token2);
    expect(hashQrToken(token1)).toBe(hashQrToken(token1));
    expect(hashQrToken(token1)).not.toBe(token1);
    expect(hashGuestToken(token1)).not.toBe(hashQrToken(token1));
  });

  it('builds valid QR menu URL paths with slug, table, branch, and token', () => {
    const path = buildQrMenuPath('abc-restaurant', 'T01', 'raw-secret-token', 'branch-1');
    expect(path).toBe('/menu/abc-restaurant?table=T01&token=raw-secret-token&branch=branch-1');
  });
});

describe('Subscription Validity Helpers', () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

  it('allows ACTIVE and TRIAL subscriptions with future expiry', () => {
    expect(
      isSubscriptionCurrentlyActive({ status: SubscriptionStatus.ACTIVE, endsAt: futureDate })
    ).toBe(true);
    expect(
      isSubscriptionCurrentlyActive({ status: SubscriptionStatus.TRIAL, endsAt: null })
    ).toBe(true);
  });

  it('blocks expired, past-due, or cancelled subscriptions and inactive restaurants', () => {
    expect(
      isSubscriptionCurrentlyActive({ status: SubscriptionStatus.ACTIVE, endsAt: pastDate })
    ).toBe(false);
    expect(
      isSubscriptionCurrentlyActive({ status: SubscriptionStatus.EXPIRED, endsAt: futureDate })
    ).toBe(false);
    expect(
      isSubscriptionCurrentlyActive({ status: SubscriptionStatus.PAST_DUE, endsAt: futureDate })
    ).toBe(false);
    expect(
      canRestaurantReceiveOrders(RestaurantStatus.INACTIVE, {
        status: SubscriptionStatus.ACTIVE,
        endsAt: futureDate,
      })
    ).toBe(false);
    expect(
      canRestaurantReceiveOrders(RestaurantStatus.ACTIVE, {
        status: SubscriptionStatus.ACTIVE,
        endsAt: futureDate,
      })
    ).toBe(true);
  });
});
