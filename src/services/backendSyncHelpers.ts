import type { CustomizationGroup } from '../domain/types';
import { serveqrApi } from './apiClient';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface BackendTaxRuleRef {
  id: string;
  name: string;
  rate: number;
}

/**
 * Converts optional YYYY-MM-DD strings into ISO-8601 timestamps for subscription billing requests.
 */
export function buildIsoRangeFromDates(
  startDateStr?: string,
  expiryDateStr?: string
): { startsAt?: string; endsAt?: string } {
  const parseDate = (raw?: string): string | undefined => {
    if (!raw?.trim()) return undefined;
    const d = new Date(raw.includes('T') ? raw : `${raw.trim()}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  };

  return {
    startsAt: parseDate(startDateStr),
    endsAt: parseDate(expiryDateStr),
  };
}

/**
 * Synchronizes UI CustomizationGroup definitions into backend ModifierGroup records and returns
 * their persisted UUIDs for linking on menu items.
 */
export async function syncBackendModifierGroups(
  restaurantId: string,
  customizations: CustomizationGroup[]
): Promise<string[]> {
  const groupIds: string[] = [];

  for (const group of customizations) {
    const validChoices = group.choices.filter((c) => c.label.trim().length > 0);
    if (validChoices.length === 0) continue;

    const payload = {
      name: group.name.trim(),
      minSelect: group.required ? 1 : 0,
      maxSelect: group.type === 'multiple' ? Math.max(1, validChoices.length) : 1,
      isRequired: group.required,
      options: validChoices.map((c, idx) => ({
        name: c.label.trim(),
        priceDelta: Math.max(0, Number(c.priceDelta) || 0),
        isAvailable: true,
        sortOrder: idx,
      })),
    };

    if (UUID_REGEX.test(group.id)) {
      const updated = await serveqrApi.restaurant.updateModifierGroup(
        restaurantId,
        group.id,
        payload
      );
      groupIds.push(updated.id ?? group.id);
    } else {
      const created = await serveqrApi.restaurant.createModifierGroup(restaurantId, payload);
      if (created?.id) {
        groupIds.push(created.id);
      }
    }
  }

  return groupIds;
}

/**
 * Updates active percentage TaxRule entries (e.g., splitting GST evenly across CGST + SGST)
 * or creates a new TaxRule when none exist yet.
 */
export async function syncBackendTaxRules(
  restaurantId: string,
  existingRules: BackendTaxRuleRef[],
  targetPercent: number,
  taxLabel: string
): Promise<void> {
  const normalizedTarget = Math.max(0, Math.min(100, Number(targetPercent) || 0));
  const currentTotal = existingRules.reduce((sum, r) => sum + r.rate, 0);

  if (Math.abs(currentTotal - normalizedTarget) < 0.001) {
    return;
  }

  if (existingRules.length === 0) {
    if (normalizedTarget > 0) {
      await serveqrApi.restaurant.createTaxRule(restaurantId, {
        name: taxLabel.trim() || 'GST',
        rate: normalizedTarget,
        calculationType: 'PERCENTAGE',
        isActive: true,
      });
    }
    return;
  }

  if (existingRules.length === 2) {
    const half = Math.round((normalizedTarget / 2) * 100) / 100;
    const remainder = Math.round((normalizedTarget - half) * 100) / 100;
    await Promise.all([
      serveqrApi.restaurant.updateTaxRule(restaurantId, existingRules[0].id, {
        rate: half,
        isActive: half > 0,
      }),
      serveqrApi.restaurant.updateTaxRule(restaurantId, existingRules[1].id, {
        rate: remainder,
        isActive: remainder > 0,
      }),
    ]);
    return;
  }

  await serveqrApi.restaurant.updateTaxRule(restaurantId, existingRules[0].id, {
    rate: normalizedTarget,
    isActive: normalizedTarget > 0,
  });
}
