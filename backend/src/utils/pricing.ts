import { Decimal } from 'decimal.js';
import { TaxCalculationType } from '@prisma/client';
import { BadRequestError } from './errors.js';

export interface ModifierOptionSpec {
  id: string;
  name: string;
  priceDelta: Decimal.Value;
  isAvailable: boolean;
}

export interface ModifierGroupSpec {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  options: ModifierOptionSpec[];
}

export interface ValidatedModifierOption {
  modifierGroupId: string;
  modifierGroupName: string;
  optionId: string;
  optionName: string;
  priceDelta: Decimal;
}

export interface TaxRuleSpec {
  id: string;
  name: string;
  rate: Decimal.Value;
  calculationType: TaxCalculationType;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface CalculatedTaxLine {
  taxRuleId: string;
  taxNameSnapshot: string;
  rateSnapshot: Decimal;
  taxableAmount: Decimal;
  taxAmount: Decimal;
}

export function roundMoney(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Validates selected modifierOptionIds against an item's configured ModifierGroups.
 * Enforces ownership, availability, minSelect, maxSelect, and isRequired rules.
 */
export function validateModifierSelections(
  groups: ModifierGroupSpec[],
  selectedOptionIds: string[]
): ValidatedModifierOption[] {
  const uniqueOptionIds = [...new Set(selectedOptionIds)];
  const optionLookup = new Map<
    string,
    { group: ModifierGroupSpec; option: ModifierOptionSpec }
  >();

  for (const group of groups) {
    for (const option of group.options) {
      optionLookup.set(option.id, { group, option });
    }
  }

  const selectionsByGroup = new Map<string, ValidatedModifierOption[]>();

  for (const optId of uniqueOptionIds) {
    const match = optionLookup.get(optId);
    if (!match) {
      throw new BadRequestError(`Invalid modifier option "${optId}" for this menu item`);
    }
    if (!match.option.isAvailable) {
      throw new BadRequestError(`Modifier option "${match.option.name}" is currently unavailable`);
    }

    const list = selectionsByGroup.get(match.group.id) ?? [];
    list.push({
      modifierGroupId: match.group.id,
      modifierGroupName: match.group.name,
      optionId: match.option.id,
      optionName: match.option.name,
      priceDelta: roundMoney(match.option.priceDelta),
    });
    selectionsByGroup.set(match.group.id, list);
  }

  const validated: ValidatedModifierOption[] = [];

  for (const group of groups) {
    const chosen = selectionsByGroup.get(group.id) ?? [];
    const effectiveMin = group.isRequired ? Math.max(1, group.minSelect) : group.minSelect;

    if (group.options.length > 0 && chosen.length < effectiveMin) {
      throw new BadRequestError(
        `Modifier group "${group.name}" requires at least ${effectiveMin} selection(s)`
      );
    }

    if (chosen.length > group.maxSelect) {
      throw new BadRequestError(
        `Modifier group "${group.name}" allows at most ${group.maxSelect} selection(s)`
      );
    }

    validated.push(...chosen);
  }

  // Deterministic order for signature comparison & snapshot storage
  validated.sort((a, b) => a.optionId.localeCompare(b.optionId));
  return validated;
}

/**
 * Computes unitPrice and lineTotal using exact Decimal arithmetic.
 */
export function calculateLineItemPricing(
  basePrice: Decimal.Value,
  quantity: number,
  modifiers: { priceDelta: Decimal.Value }[]
): { unitPrice: Decimal; lineTotal: Decimal } {
  const base = new Decimal(basePrice);
  const deltaSum = modifiers.reduce((acc, mod) => acc.plus(new Decimal(mod.priceDelta)), new Decimal(0));
  const unitPrice = roundMoney(Decimal.max(0, base.plus(deltaSum)));
  const lineTotal = roundMoney(unitPrice.times(quantity));
  return { unitPrice, lineTotal };
}

/**
 * Computes order subtotal, itemized GST/tax snapshots, and grand total using Decimal math.
 */
export function calculateOrderFinancials(
  lineTotals: Decimal[],
  taxRules: TaxRuleSpec[],
  referenceDate: Date = new Date()
): {
  subtotal: Decimal;
  taxLines: CalculatedTaxLine[];
  taxTotal: Decimal;
  grandTotal: Decimal;
} {
  const subtotal = roundMoney(
    lineTotals.reduce((acc, val) => acc.plus(val), new Decimal(0))
  );

  const activeRules = taxRules.filter(
    (rule) =>
      rule.isActive &&
      rule.effectiveFrom <= referenceDate &&
      (!rule.effectiveTo || rule.effectiveTo > referenceDate)
  );

  const taxLines: CalculatedTaxLine[] = activeRules.map((rule) => {
    const rate = new Decimal(rule.rate);
    const taxAmount =
      rule.calculationType === TaxCalculationType.PERCENTAGE
        ? roundMoney(subtotal.times(rate).dividedBy(100))
        : roundMoney(rate);

    return {
      taxRuleId: rule.id,
      taxNameSnapshot: rule.name,
      rateSnapshot: rate.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      taxableAmount: subtotal,
      taxAmount,
    };
  });

  const taxTotal = roundMoney(
    taxLines.reduce((acc, line) => acc.plus(line.taxAmount), new Decimal(0))
  );
  const grandTotal = roundMoney(subtotal.plus(taxTotal));

  return { subtotal, taxLines, taxTotal, grandTotal };
}
