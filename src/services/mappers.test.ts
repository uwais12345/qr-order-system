import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapBackendAuditLogsToUiActivities,
  mapBackendMenuToUi,
  mapBackendOrderStatusToUi,
  mapBackendOrderToUi,
  mapBackendPaymentMethodToUi,
  mapBackendPaymentsToUiStatus,
  mapBackendPlansToUi,
  mapBackendRestaurantToUi,
  mapBackendSubscriptionStatusToUi,
  mapBackendTableToUi,
  mapUiOrderStatusToBackend,
  mapUiSubscriptionStatusToBackend,
} from './mappers.ts';

test('order status and payment status mappers round-trip accurately', () => {
  assert.equal(mapBackendOrderStatusToUi('PENDING'), 'Pending');
  assert.equal(mapBackendOrderStatusToUi('ACCEPTED'), 'Accepted');
  assert.equal(mapBackendOrderStatusToUi('PREPARING'), 'Preparing');
  assert.equal(mapBackendOrderStatusToUi('READY'), 'Ready');
  assert.equal(mapBackendOrderStatusToUi('SERVED'), 'Served');
  assert.equal(mapBackendOrderStatusToUi('REJECTED'), 'Cancelled');
  assert.equal(mapBackendOrderStatusToUi('CANCELLED'), 'Cancelled');

  assert.equal(mapUiOrderStatusToBackend('Pending'), 'PENDING');
  assert.equal(mapUiOrderStatusToBackend('Preparing'), 'PREPARING');
  assert.equal(mapUiOrderStatusToBackend('Completed'), 'SERVED');

  assert.equal(mapBackendPaymentsToUiStatus([{ status: 'SUCCEEDED' }]), 'Paid');
  assert.equal(mapBackendPaymentsToUiStatus([{ status: 'REFUNDED' }]), 'Refunded');
  assert.equal(mapBackendPaymentsToUiStatus([{ status: 'PENDING' }]), 'Pending');
  assert.equal(mapBackendPaymentMethodToUi([{ method: 'PAY_AT_RESTAURANT' }]), 'Pay at Restaurant');
  assert.equal(mapBackendPaymentMethodToUi([{ method: 'ONLINE' }]), 'Online Payment');

  assert.equal(mapBackendSubscriptionStatusToUi('ACTIVE'), 'ACTIVE');
  assert.equal(mapBackendSubscriptionStatusToUi('PAST_DUE'), 'EXPIRING SOON');
  assert.equal(mapBackendSubscriptionStatusToUi('EXPIRED'), 'INACTIVE');
});

test('mapBackendOrderToUi maps decimal strings, modifiers, and customer details into UI Order', () => {
  const uiOrder = mapBackendOrderToUi({
    id: 'ord-1',
    restaurantId: 'rst-1',
    branchId: 'br-1',
    diningTableId: 'tbl-1',
    guestSessionId: 'gs-1',
    customerName: 'Aarav',
    customerPhone: '9845022190',
    status: 'PREPARING',
    subtotal: '640.00',
    taxTotal: '32.00',
    grandTotal: '672.00',
    estimatedPrepMinutes: 20,
    table: { id: 'tbl-1', tableCode: 'T01' },
    items: [
      {
        id: 'oi-1',
        menuItemId: 'mi-1',
        name: 'Royal Biryani',
        quantity: 2,
        unitPrice: '320.00',
        modifiers: [{ id: 'm-1', modifierName: 'Spice', optionName: 'Medium', priceDelta: '0.00' }],
      },
    ],
    payments: [{ method: 'ONLINE', status: 'SUCCEEDED' }],
    createdAt: '2026-11-26T12:00:00.000Z',
    updatedAt: '2026-11-26T12:05:00.000Z',
  });

  assert.equal(uiOrder.id, 'ord-1');
  assert.equal(uiOrder.tableNumber, 'T01');
  assert.equal(uiOrder.status, 'Preparing');
  assert.equal(uiOrder.paymentStatus, 'Paid');
  assert.equal(uiOrder.subtotal, 640);
  assert.equal(uiOrder.taxAmount, 32);
  assert.equal(uiOrder.totalAmount, 672);
  assert.equal(uiOrder.taxRatePercent, 5);
  assert.equal(uiOrder.items[0].selectedCustomizations[0].choiceLabel, 'Medium');
});

test('mapBackendMenuToUi, mapBackendTableToUi, and mapBackendRestaurantToUi transform catalogs cleanly', () => {
  const { categories, menuItems } = mapBackendMenuToUi('rst-1', {
    categories: [
      {
        id: 'cat-1',
        name: 'Biryani & Rice',
        items: [
          {
            id: 'item-1',
            name: 'Dum Biryani',
            description: 'Spiced rice',
            price: '320.00',
            isVeg: false,
            availabilityStatus: 'AVAILABLE',
            modifierGroups: [
              {
                modifierGroup: {
                  id: 'grp-1',
                  name: 'Portion',
                  maxSelect: 1,
                  isRequired: true,
                  options: [{ id: 'opt-1', name: 'Regular', priceDelta: '0.00' }],
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(categories, ['Biryani & Rice']);
  assert.equal(menuItems[0].price, 320);
  assert.equal(menuItems[0].available, true);
  assert.equal(menuItems[0].customizations[0].choices[0].label, 'Regular');

  const table = mapBackendTableToUi('rst-1', {
    id: 'tbl-1',
    branchId: 'br-1',
    tableCode: 'T02',
    displayName: 'Patio',
    capacity: 6,
    status: 'ACTIVE',
  });
  assert.equal(table.tableNumber, 'T02');
  assert.equal(table.status, 'Available');

  const rest = mapBackendRestaurantToUi({
    id: 'rst-1',
    slug: 'abc-restaurant',
    name: 'ABC Restaurant',
    status: 'ACTIVE',
    payAtRestaurantEnabled: true,
    branches: [{ id: 'br-1', name: 'Main Branch', city: 'Bengaluru' }],
    taxRules: [
      { rate: '2.50', calculationType: 'PERCENTAGE', isActive: true },
      { rate: '2.50', calculationType: 'PERCENTAGE', isActive: true },
    ],
  });
  assert.equal(rest.settings.payAtRestaurantEnabled, true);
  assert.equal(rest.settings.taxRatePercent, 5);
  assert.equal(rest.branches[0].isMain, true);
});

test('mapUiSubscriptionStatusToBackend, mapBackendPlansToUi, and mapBackendAuditLogsToUiActivities sync Super Admin state', () => {
  assert.equal(mapUiSubscriptionStatusToBackend('ACTIVE'), 'ACTIVE');
  assert.equal(mapUiSubscriptionStatusToBackend('EXPIRING SOON'), 'PAST_DUE');
  assert.equal(mapUiSubscriptionStatusToBackend('SUSPENDED'), 'CANCELLED');
  assert.equal(mapUiSubscriptionStatusToBackend('INACTIVE'), 'EXPIRED');

  const baseCatalog = [
    {
      name: 'Basic' as const,
      audience: 'Single outlets',
      monthlyPriceInr: 1999,
      annualPriceInr: 19990,
      maxBranches: 1,
      maxTables: 10,
      features: ['Core QR menu'],
    },
    {
      name: 'Professional' as const,
      audience: 'Growing teams',
      monthlyPriceInr: 4499,
      annualPriceInr: 44990,
      maxBranches: 3,
      maxTables: 30,
      features: ['KDS'],
    },
  ];

  const mappedPlans = mapBackendPlansToUi(
    [
      {
        id: 'plan-basic-uuid',
        code: 'BASIC',
        price: '2499.00',
        billingPeriod: 'MONTHLY',
        featureConfig: { maxTables: 15, maxBranches: 2 },
      },
    ],
    baseCatalog
  );

  assert.equal(mappedPlans.planIdByCode.BASIC, 'plan-basic-uuid');
  assert.equal(mappedPlans.planCatalog[0].monthlyPriceInr, 2499);
  assert.equal(mappedPlans.planCatalog[0].annualPriceInr, 24990);
  assert.equal(mappedPlans.planCatalog[0].maxTables, 15);
  assert.equal(mappedPlans.planCatalog[0].maxBranches, 2);

  const activities = mapBackendAuditLogsToUiActivities([
    {
      id: 'log-1',
      action: 'RESTAURANT_CREATED',
      entityType: 'Restaurant',
      createdAt: '2026-11-27T01:00:00.000Z',
      restaurant: { name: 'ABC Restaurant' },
      metadata: { planCode: 'PROFESSIONAL', city: 'Bengaluru' },
    },
  ]);

  assert.equal(activities.length, 1);
  assert.equal(activities[0].restaurantName, 'ABC Restaurant');
  assert.equal(activities[0].action, 'RESTAURANT CREATED');
  assert.match(activities[0].detail, /planCode: PROFESSIONAL/);
});
