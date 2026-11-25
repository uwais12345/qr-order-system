import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { TaxCalculationType } from '@prisma/client';
import { isValidIndianMobile, normalizeIndianMobile } from '../../src/utils/phone.js';
import {
  calculateLineItemPricing,
  calculateOrderFinancials,
  ModifierGroupSpec,
  validateModifierSelections,
} from '../../src/utils/pricing.js';
import { BadRequestError } from '../../src/utils/errors.js';

describe('Indian Mobile Validation', () => {
  it('normalizes +91 and 0-prefixed Indian mobile numbers', () => {
    expect(normalizeIndianMobile('+91 98450 22190')).toBe('9845022190');
    expect(normalizeIndianMobile('09845022190')).toBe('9845022190');
    expect(isValidIndianMobile('+91 98450 22190')).toBe(true);
    expect(isValidIndianMobile('5123456789')).toBe(false);
    expect(isValidIndianMobile('98450')).toBe(false);
  });
});

describe('Modifier Validation & Decimal Pricing Engine', () => {
  const sampleGroups: ModifierGroupSpec[] = [
    {
      id: 'grp-portion',
      name: 'Portion Size',
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      options: [
        { id: 'opt-reg', name: 'Regular', priceDelta: '0.00', isAvailable: true },
        { id: 'opt-lrg', name: 'Large', priceDelta: '140.00', isAvailable: true },
      ],
    },
    {
      id: 'grp-addons',
      name: 'Add-ons',
      minSelect: 0,
      maxSelect: 2,
      isRequired: false,
      options: [
        { id: 'opt-cheese', name: 'Extra Cheese', priceDelta: '45.50', isAvailable: true },
        { id: 'opt-dip', name: 'Garlic Dip', priceDelta: '25.00', isAvailable: true },
        { id: 'opt-truffle', name: 'Truffle Oil', priceDelta: '90.00', isAvailable: false },
      ],
    },
  ];

  it('enforces required modifier groups and maxSelect bounds', () => {
    expect(() => validateModifierSelections(sampleGroups, [])).toThrow(BadRequestError);
    expect(() =>
      validateModifierSelections(sampleGroups, ['opt-reg', 'opt-lrg'])
    ).toThrow(BadRequestError);
    expect(() =>
      validateModifierSelections(sampleGroups, ['opt-reg', 'opt-truffle'])
    ).toThrow(BadRequestError);
    expect(() =>
      validateModifierSelections(sampleGroups, ['opt-reg', 'opt-nonexistent'])
    ).toThrow(BadRequestError);

    const valid = validateModifierSelections(sampleGroups, ['opt-lrg', 'opt-cheese']);
    expect(valid).toHaveLength(2);
  });

  it('computes exact Decimal line items, GST tax lines, and grand totals without float error', () => {
    const line1 = calculateLineItemPricing('320.00', 2, [{ priceDelta: '140.00' }]);
    expect(line1.unitPrice.toFixed(2)).toBe('460.00');
    expect(line1.lineTotal.toFixed(2)).toBe('920.00');

    const line2 = calculateLineItemPricing('99.95', 1, [{ priceDelta: '15.05' }]);
    expect(line2.unitPrice.toFixed(2)).toBe('115.00');
    expect(line2.lineTotal.toFixed(2)).toBe('115.00');

    const now = new Date();
    const financials = calculateOrderFinancials(
      [line1.lineTotal, line2.lineTotal],
      [
        {
          id: 'tax-cgst',
          name: 'CGST',
          rate: new Decimal('2.50'),
          calculationType: TaxCalculationType.PERCENTAGE,
          isActive: true,
          effectiveFrom: new Date(now.getTime() - 10000),
          effectiveTo: null,
        },
        {
          id: 'tax-sgst',
          name: 'SGST',
          rate: new Decimal('2.50'),
          calculationType: TaxCalculationType.PERCENTAGE,
          isActive: true,
          effectiveFrom: new Date(now.getTime() - 10000),
          effectiveTo: null,
        },
      ],
      now
    );

    // Subtotal = 920 + 115 = 1035.00
    // CGST 2.5% = 25.875 -> 25.88, SGST 2.5% = 25.88, TaxTotal = 51.76, GrandTotal = 1086.76
    expect(financials.subtotal.toFixed(2)).toBe('1035.00');
    expect(financials.taxLines).toHaveLength(2);
    expect(financials.taxLines[0].taxAmount.toFixed(2)).toBe('25.88');
    expect(financials.taxTotal.toFixed(2)).toBe('51.76');
    expect(financials.grandTotal.toFixed(2)).toBe('1086.76');
  });
});
