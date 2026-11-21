import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTableQrPath,
  buildTableQrUrl,
  calculateBillTotals,
  calculateCartItemUnitPrice,
  calculateOrderTotals,
  canTransitionOrderStatus,
  computeRestaurantMetrics,
  computeSubscriptionValidity,
  computeSuperAdminMetrics,
  generateOrderId,
  generateRestaurantId,
  getAvailableCustomerPaymentMethods,
  getCustomerTrackingStepIndex,
  getEffectiveSubscriptionAmount,
  getNextOrderStatus,
  hasConfiguredCustomizations,
  isRestaurantOrderingAvailable,
  isValidIndianMobile,
  parseTableQrRoute,
  resolvePaymentStatus,
  scopeOrdersByRestaurant,
  SUBSCRIPTION_PLANS,
  updateCatalogPlanPriceWithoutMutatingTenants,
  upsertCustomizedCartItem,
  validateCustomerCheckout,
  validateCustomizationSelections,
  validateLoginForm,
  validateTableForm,
  validateCategoryName,
  addCategoryInState,
  renameCategoryInState,
  deleteCategoryInState,
} from './serveqrLogic';
import type {
  CartItem,
  CustomizationGroup,
  DiningTable,
  MenuItem,
  Order,
  Restaurant,
  ServeQRState,
} from './types';

test('QR route building and parsing round-trips restaurant slug, table, branch, and version', () => {
  const path = buildTableQrPath('abc-restaurant', 'T01', 'BR-1001-1', 2);
  assert.equal(path, '/menu/abc-restaurant?table=T01&branch=BR-1001-1&v=2');

  const parsed = parseTableQrRoute('/menu/abc-restaurant', '?table=t01&branch=BR-1001-1&v=2');
  assert.deepEqual(parsed, {
    restaurantSlug: 'abc-restaurant',
    tableNumber: 'T01',
    branchId: 'BR-1001-1',
    qrVersion: 2,
  });

  const fullUrl = buildTableQrUrl('https://serveqr.demo/', 'abc-restaurant', 'T05');
  assert.equal(fullUrl, 'https://serveqr.demo/menu/abc-restaurant?table=T05');
  assert.equal(parseTableQrRoute('/restaurant/dashboard', ''), null);
});

test('cart pricing and order totals include customization add-ons and configured tax', () => {
  const cart: CartItem[] = [
    {
      cartItemId: 'c1',
      menuItemId: 'm1',
      name: 'Chicken Biryani',
      imageUrl: '',
      basePrice: 180,
      isVeg: false,
      prepTimeMinutes: 18,
      quantity: 2,
      selectedCustomizations: [
        { groupId: 'g1', groupName: 'Spice', choiceId: 's2', choiceLabel: 'Spicy', priceDelta: 0 },
        {
          groupId: 'g2',
          groupName: 'Add-ons',
          choiceId: 'a1',
          choiceLabel: 'Extra Chicken',
          priceDelta: 60,
        },
      ],
      specialInstructions: 'Less oil',
    },
    {
      cartItemId: 'c2',
      menuItemId: 'm7',
      name: 'Fresh Lime Juice',
      imageUrl: '',
      basePrice: 60,
      isVeg: true,
      prepTimeMinutes: 5,
      quantity: 1,
      selectedCustomizations: [],
      specialInstructions: '',
    },
  ];

  assert.equal(calculateCartItemUnitPrice(180, cart[0].selectedCustomizations), 240);
  const summary = calculateOrderTotals(cart, 5, 2);
  assert.equal(summary.itemCount, 3);
  assert.equal(summary.subtotal, 540);
  assert.equal(summary.taxAmount, 27);
  assert.equal(summary.totalAmount, 567);
  assert.equal(summary.estimatedPrepMinutes, 20);
});

test('combined table billing accurately aggregates multiple independent guest orders with discount and tax', () => {
  const orders: Order[] = [
    {
      id: 'SQ-1001',
      restaurantId: 'RST-1001',
      branchId: 'BR-1001-1',
      tableId: 'TBL-1001-T01',
      tableNumber: 'T01',
      customerSessionId: 'guest-a',
      customerName: 'Aarav',
      items: [],
      subtotal: 240,
      taxRatePercent: 5,
      taxAmount: 12,
      totalAmount: 252,
      status: 'Served',
      paymentStatus: 'Pending',
      estimatedPrepMinutes: 18,
      createdAt: '2026-11-20T12:00:00.000Z',
      updatedAt: '2026-11-20T12:15:00.000Z',
    },
    {
      id: 'SQ-1002',
      restaurantId: 'RST-1001',
      branchId: 'BR-1001-1',
      tableId: 'TBL-1001-T01',
      tableNumber: 'T01',
      customerSessionId: 'guest-b',
      customerName: 'Meera',
      items: [],
      subtotal: 160,
      taxRatePercent: 5,
      taxAmount: 8,
      totalAmount: 168,
      status: 'Served',
      paymentStatus: 'Pending',
      estimatedPrepMinutes: 12,
      createdAt: '2026-11-20T12:02:00.000Z',
      updatedAt: '2026-11-20T12:18:00.000Z',
    },
  ];

  const bill = calculateBillTotals(orders, 5, 10);
  assert.equal(bill.subtotal, 400);
  assert.equal(bill.discountAmount, 40);
  assert.equal(bill.taxableSubtotal, 360);
  assert.equal(bill.taxAmount, 18);
  assert.equal(bill.totalAmount, 378);
  assert.equal(resolvePaymentStatus(378, 378), 'Paid');
  assert.equal(resolvePaymentStatus(378, 200), 'Partially Paid');
  assert.equal(resolvePaymentStatus(378, 0), 'Pending');
});

test('KDS order status progression and customer tracking step alignment', () => {
  assert.equal(getNextOrderStatus('Pending'), 'Accepted');
  assert.equal(getNextOrderStatus('Accepted'), 'Preparing');
  assert.equal(getNextOrderStatus('Preparing'), 'Ready');
  assert.equal(getNextOrderStatus('Ready'), 'Served');
  assert.equal(getNextOrderStatus('Served'), 'Completed');
  assert.equal(getNextOrderStatus('Completed'), null);

  assert.equal(canTransitionOrderStatus('Pending', 'Preparing'), true);
  assert.equal(canTransitionOrderStatus('Served', 'Cancelled'), false);
  assert.equal(canTransitionOrderStatus('Completed', 'Pending'), false);

  assert.equal(getCustomerTrackingStepIndex('Pending'), 0);
  assert.equal(getCustomerTrackingStepIndex('Preparing'), 2);
  assert.equal(getCustomerTrackingStepIndex('Served'), 4);
  assert.equal(getCustomerTrackingStepIndex('Cancelled'), -1);
});

test('multi-tenant scoping isolates orders strictly by restaurantId', () => {
  const mixedOrders = [
    { id: 'SQ-1001', restaurantId: 'RST-1001', status: 'Pending', totalAmount: 200 },
    { id: 'SQ-1002', restaurantId: 'RST-1002', status: 'Ready', totalAmount: 350 },
  ] as Order[];

  const scoped = scopeOrdersByRestaurant(mixedOrders, 'RST-1001');
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].id, 'SQ-1001');
  assert.equal(generateRestaurantId(1004), 'RST-1004');
  assert.equal(generateOrderId(1015), 'SQ-1015');
});

test('mandatory customer details enforce non-empty name and 10-digit Indian mobile numbers', () => {
  assert.equal(isValidIndianMobile('9876543210'), true);
  assert.equal(isValidIndianMobile('+91 98765 43210'), true);
  assert.equal(isValidIndianMobile('6123456789'), true);
  assert.equal(isValidIndianMobile('1234567890'), false);
  assert.equal(isValidIndianMobile('987654321'), false);
  assert.equal(isValidIndianMobile('5876543210'), false);

  const settings = {
    guestOrderingEnabled: true,
    customerNameRequirement: 'Mandatory' as const,
    mobileNumberRequirement: 'Mandatory' as const,
    otpVerificationEnabled: false,
    waiterApprovalRequired: false,
  };

  const emptyErr = validateCustomerCheckout('', '', settings, false);
  assert.ok(emptyErr.customerName);
  assert.ok(emptyErr.customerPhone);

  const invalidPhoneErr = validateCustomerCheckout('Riya', '1234567890', settings, false);
  assert.equal(invalidPhoneErr.customerName, undefined);
  assert.ok(invalidPhoneErr.customerPhone);

  assert.deepEqual(validateCustomerCheckout('Riya', '9876543210', settings, false), {});

  const otpSettings = { ...settings, otpVerificationEnabled: true };
  assert.ok(validateCustomerCheckout('Riya', '9876543210', otpSettings, false).otp);
  assert.deepEqual(validateCustomerCheckout('Riya', '9876543210', otpSettings, true), {});
});

test('payment method options always keep Online Payment enabled and gate Pay at Restaurant', () => {
  assert.deepEqual(getAvailableCustomerPaymentMethods(false), ['Online Payment']);
  assert.deepEqual(getAvailableCustomerPaymentMethods(true), [
    'Online Payment',
    'Pay at Restaurant',
  ]);
});

test('subscription validity and inactive subscription customer ordering lockout rules', () => {
  const refDate = new Date('2026-11-20T00:00:00Z');

  const active = computeSubscriptionValidity('ACTIVE', '2027-06-01', refDate);
  assert.equal(active.effectiveStatus, 'ACTIVE');
  assert.equal(active.isOrderAcceptanceAllowed, true);

  const expiringSoon = computeSubscriptionValidity('ACTIVE', '2026-11-28', refDate);
  assert.equal(expiringSoon.effectiveStatus, 'EXPIRING SOON');
  assert.equal(expiringSoon.daysRemaining, 8);
  assert.equal(expiringSoon.isOrderAcceptanceAllowed, true);

  const inactive = computeSubscriptionValidity('INACTIVE', '2027-06-01', refDate);
  assert.equal(inactive.effectiveStatus, 'INACTIVE');
  assert.equal(inactive.isOrderAcceptanceAllowed, false);

  const suspended = computeSubscriptionValidity('SUSPENDED', '2027-06-01', refDate);
  assert.equal(suspended.effectiveStatus, 'SUSPENDED');
  assert.equal(suspended.isOrderAcceptanceAllowed, false);

  const expired = computeSubscriptionValidity('ACTIVE', '2026-11-10', refDate);
  assert.equal(expired.effectiveStatus, 'INACTIVE');
  assert.equal(expired.isExpired, true);
  assert.equal(expired.isOrderAcceptanceAllowed, false);

  const activeRest = {
    status: 'Active',
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiryDate: '2027-06-01',
  } as Restaurant;
  const inactiveSubRest = {
    status: 'Active',
    subscriptionStatus: 'INACTIVE',
    subscriptionExpiryDate: '2027-06-01',
  } as Restaurant;

  assert.equal(isRestaurantOrderingAvailable(activeRest, refDate), true);
  assert.equal(isRestaurantOrderingAvailable(inactiveSubRest, refDate), false);
});

test('standard plan price edits do NOT overwrite individual restaurant custom prices', () => {
  const tenantWithCustomPrice = {
    subscriptionPlan: 'Enterprise',
    billingCycle: 'Annual',
    monthlyPriceInr: 7500,
    customMonthlyPriceInr: 7500,
    customAnnualPriceInr: 78000,
  } as Restaurant;

  const updatedCatalog = updateCatalogPlanPriceWithoutMutatingTenants(
    SUBSCRIPTION_PLANS,
    'Enterprise',
    10999,
    109990
  );
  assert.equal(updatedCatalog.find((p) => p.name === 'Enterprise')?.monthlyPriceInr, 10999);

  // Tenant's individual billing remains unchanged at custom rate
  const eff = getEffectiveSubscriptionAmount(tenantWithCustomPrice);
  assert.equal(eff.amountInr, 78000);
  assert.equal(eff.monthlyEquivalentInr, 6500);
});

test('form validators and dashboard metrics compute active counts, revenue, and table stats accurately', () => {
  const loginErr = validateLoginForm('invalid', '123');
  assert.ok(loginErr.email);
  assert.ok(loginErr.password);
  assert.deepEqual(validateLoginForm('admin@serveqr.io', 'serveqr123'), {});

  const dupTable = validateTableForm('t01', 'Main Hall', 4, ['T01', 'T02']);
  assert.ok(dupTable.tableNumber);
  assert.deepEqual(validateTableForm('T06', 'Outdoor', 4, ['T01', 'T02']), {});

  const restaurants = [
    {
      status: 'Active',
      subscriptionStatus: 'ACTIVE',
      billingCycle: 'Monthly',
      monthlyPriceInr: 4499,
      customMonthlyPriceInr: 4499,
      customAnnualPriceInr: 44990,
    },
    {
      status: 'Setup Pending',
      subscriptionStatus: 'EXPIRING SOON',
      billingCycle: 'Monthly',
      monthlyPriceInr: 1999,
      customMonthlyPriceInr: 1999,
      customAnnualPriceInr: 19990,
    },
    {
      status: 'Suspended',
      subscriptionStatus: 'SUSPENDED',
      billingCycle: 'Monthly',
      monthlyPriceInr: 8999,
      customMonthlyPriceInr: 8999,
      customAnnualPriceInr: 89990,
    },
  ] as Restaurant[];
  const orders = [
    { status: 'Pending', totalAmount: 300 },
    { status: 'Preparing', totalAmount: 450 },
    { status: 'Completed', totalAmount: 600 },
    { status: 'Cancelled', totalAmount: 999 },
  ] as Order[];
  const tables = [
    { status: 'Occupied', qrGeneratedAt: '2026-11-20T08:00:00Z' },
    { status: 'Available', qrGeneratedAt: '2026-11-20T08:00:00Z' },
  ] as DiningTable[];

  const adminMetrics = computeSuperAdminMetrics(restaurants, orders);
  assert.equal(adminMetrics.totalRestaurants, 3);
  assert.equal(adminMetrics.activeRestaurants, 1);
  assert.equal(adminMetrics.pendingSetups, 1);
  assert.equal(adminMetrics.inactiveRestaurants, 1);
  assert.equal(adminMetrics.totalOrders, 3);
  assert.equal(adminMetrics.totalRevenue, 1350);
  assert.equal(adminMetrics.subscriptionMrr, 6498);

  const restMetrics = computeRestaurantMetrics(orders, tables);
  assert.equal(restMetrics.todayOrders, 3);
  assert.equal(restMetrics.totalSales, 1350);
  assert.equal(restMetrics.pendingOrders, 1);
  assert.equal(restMetrics.preparingOrders, 1);
  assert.equal(restMetrics.completedOrders, 1);
  assert.equal(restMetrics.totalTables, 2);
  assert.equal(restMetrics.activeQrTables, 2);
});

test('customization validation enforces mandatory groups and cart upsert merges identical variants cleanly', () => {
  const groups: CustomizationGroup[] = [
    {
      id: 'grp-portion',
      name: 'Portion Size',
      type: 'single',
      required: true,
      choices: [
        { id: 'c-reg', label: 'Regular', priceDelta: 0 },
        { id: 'c-full', label: 'Full', priceDelta: 120 },
      ],
    },
    {
      id: 'grp-addons',
      name: 'Add-ons',
      type: 'multiple',
      required: false,
      choices: [
        { id: 'c-raita', label: 'Extra Raita', priceDelta: 25 },
        { id: 'c-egg', label: 'Boiled Egg', priceDelta: 20 },
      ],
    },
  ];

  assert.equal(hasConfiguredCustomizations({ customizations: groups }), true);
  assert.equal(hasConfiguredCustomizations({ customizations: [] }), false);

  const missing = validateCustomizationSelections(groups, []);
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missingGroupIds, ['grp-portion']);
  assert.deepEqual(missing.missingGroupNames, ['Portion Size']);

  const selectedFullWithAddons = [
    {
      groupId: 'grp-portion',
      groupName: 'Portion Size',
      choiceId: 'c-full',
      choiceLabel: 'Full',
      priceDelta: 120,
    },
    {
      groupId: 'grp-addons',
      groupName: 'Add-ons',
      choiceId: 'c-raita',
      choiceLabel: 'Extra Raita',
      priceDelta: 25,
    },
  ];
  assert.equal(validateCustomizationSelections(groups, selectedFullWithAddons).valid, true);
  assert.equal(calculateCartItemUnitPrice(180, selectedFullWithAddons), 325);

  const dish: MenuItem = {
    id: 'MENU-101',
    restaurantId: 'RST-1001',
    name: 'Chicken Biryani',
    description: 'Hyderabadi dum biryani',
    imageUrl: '',
    price: 180,
    category: 'Biryani & Rice',
    isVeg: false,
    available: true,
    prepTimeMinutes: 18,
    customizations: groups,
  };

  let cart: CartItem[] = [];
  cart = upsertCustomizedCartItem(cart, dish, {
    selectedCustomizations: selectedFullWithAddons,
    specialInstructions: 'Less oil',
    quantity: 1,
  });
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 1);

  // Adding the exact same customization + note merges quantity
  cart = upsertCustomizedCartItem(cart, dish, {
    selectedCustomizations: [...selectedFullWithAddons].reverse(),
    specialInstructions: '  less oil ',
    quantity: 2,
  });
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);

  // Editing existing cart line updates in place
  cart = upsertCustomizedCartItem(
    cart,
    dish,
    {
      selectedCustomizations: [selectedFullWithAddons[0]],
      specialInstructions: '',
      quantity: 2,
    },
    cart[0].cartItemId
  );
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 2);
  assert.equal(cart[0].selectedCustomizations.length, 1);
});

test('Category CRUD: creation, validation, atomic renaming with dish preservation, deletion with reassignment, and tenant isolation', () => {
  const mockState: ServeQRState = {
    planCatalog: [],
    restaurants: [],
    categoriesByRestaurant: {
      'RST-1001': ['Biryani & Rice', 'Starters', 'Desserts'],
      'RST-1002': ['Starters', 'Beverages'],
    },
    menuItems: [
      {
        id: 'M1',
        restaurantId: 'RST-1001',
        name: 'Paneer Tikka',
        description: 'Tandoori paneer',
        imageUrl: '',
        price: 220,
        category: 'Starters',
        isVeg: true,
        available: true,
        prepTimeMinutes: 15,
        customizations: [],
      },
      {
        id: 'M2',
        restaurantId: 'RST-1001',
        name: 'Gulab Jamun',
        description: 'Sweet dumplings',
        imageUrl: '',
        price: 90,
        category: 'Desserts',
        isVeg: true,
        available: true,
        prepTimeMinutes: 5,
        customizations: [],
      },
      {
        id: 'M3',
        restaurantId: 'RST-1002',
        name: 'RST-1002 Starter',
        description: 'Other rest starter',
        imageUrl: '',
        price: 150,
        category: 'Starters',
        isVeg: false,
        available: true,
        prepTimeMinutes: 10,
        customizations: [],
      },
    ],
    tables: [],
    orders: [],
    bills: [],
    activities: [],
    nextOrderSeq: 1,
    nextRestaurantSeq: 1,
    nextBillSeq: 1,
  };

  // 1. Creating a valid category (trims spaces)
  const validCheck = validateCategoryName('  Wood-Fired Pizza  ', mockState.categoriesByRestaurant['RST-1001']);
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.cleanName, 'Wood-Fired Pizza');

  const addRes = addCategoryInState(mockState, 'RST-1001', '  Wood-Fired Pizza  ');
  assert.equal(addRes.ok, true);
  assert.equal(addRes.nextState.categoriesByRestaurant['RST-1001'].includes('Wood-Fired Pizza'), true);
  // RST-1002 unaffected
  assert.deepEqual(addRes.nextState.categoriesByRestaurant['RST-1002'], ['Starters', 'Beverages']);

  // 2. Rejecting empty category names
  const emptyCheck = validateCategoryName('   ', mockState.categoriesByRestaurant['RST-1001']);
  assert.equal(emptyCheck.valid, false);
  assert.equal(emptyCheck.error, 'Category name cannot be empty.');

  // 3. Rejecting duplicate names regardless of letter case
  const duplicateCheck = validateCategoryName('starters', mockState.categoriesByRestaurant['RST-1001']);
  assert.equal(duplicateCheck.valid, false);
  assert.equal(duplicateCheck.error, 'A category named "starters" already exists.');

  // 4. Renaming a category and updating every associated menu item atomically
  const renameRes = renameCategoryInState(mockState, 'RST-1001', 'Starters', 'Appetizers & Starters');
  assert.equal(renameRes.ok, true);
  assert.equal(renameRes.nextState.categoriesByRestaurant['RST-1001'].includes('Appetizers & Starters'), true);
  assert.equal(renameRes.nextState.categoriesByRestaurant['RST-1001'].includes('Starters'), false);

  // 5. Associated menu items for RST-1001 updated, preserving all other properties
  const m1Updated = renameRes.nextState.menuItems.find((m) => m.id === 'M1');
  assert.equal(m1Updated?.category, 'Appetizers & Starters');
  assert.equal(m1Updated?.name, 'Paneer Tikka');
  assert.equal(m1Updated?.price, 220);

  // 6. Tenant isolation: RST-1002 menu item M3 with category 'Starters' must NOT be renamed
  const m3Untouched = renameRes.nextState.menuItems.find((m) => m.id === 'M3');
  assert.equal(m3Untouched?.category, 'Starters');
  assert.equal(renameRes.nextState.categoriesByRestaurant['RST-1002'].includes('Starters'), true);

  // 7. Case-only renaming (e.g. 'desserts' -> 'DESSERTS')
  const caseRenameRes = renameCategoryInState(mockState, 'RST-1001', 'Desserts', 'DESSERTS');
  assert.equal(caseRenameRes.ok, true);
  assert.equal(caseRenameRes.nextState.categoriesByRestaurant['RST-1001'].includes('DESSERTS'), true);
  const m2Updated = caseRenameRes.nextState.menuItems.find((m) => m.id === 'M2');
  assert.equal(m2Updated?.category, 'DESSERTS');

  // 8. Deleting a category with menu item reassignment
  const deleteRes = deleteCategoryInState(mockState, 'RST-1001', 'Desserts', 'Biryani & Rice');
  assert.equal(deleteRes.ok, true);
  assert.equal(deleteRes.nextState.categoriesByRestaurant['RST-1001'].includes('Desserts'), false);
  assert.equal(deleteRes.nextState.categoriesByRestaurant['RST-1001'].length, 2);

  // 9. Preventing orphaned menu items: M2 must now have category 'Biryani & Rice'
  const m2Reassigned = deleteRes.nextState.menuItems.find((m) => m.id === 'M2');
  assert.equal(m2Reassigned?.category, 'Biryani & Rice');

  // 10. Cannot delete when it is the last remaining category
  const singleCatState: ServeQRState = {
    ...mockState,
    categoriesByRestaurant: {
      'RST-1001': ['OnlyCategory'],
    },
  };
  const lastCatRes = deleteCategoryInState(singleCatState, 'RST-1001', 'OnlyCategory', 'AnyOther');
  assert.equal(lastCatRes.ok, false);
  assert.match(lastCatRes.error ?? '', /Cannot delete the only remaining category/);

  // 11. Cannot reassign to the same category being deleted
  const selfReassignRes = deleteCategoryInState(mockState, 'RST-1001', 'Desserts', 'Desserts');
  assert.equal(selfReassignRes.ok, false);
  assert.match(selfReassignRes.error ?? '', /cannot be the same/);
});

test('Customer Portal Scenarios 1-7: complete ordering journey, validation, payment gating, and tracking', () => {
  // Scenario 1: Scan/open valid restaurant QR -> Select food -> Add to cart -> Online Payment -> Order placed -> Tracking
  const qrPath = buildTableQrPath('green-leaf-bistro', 'T01', 'BR-01');
  const parsed = parseTableQrRoute('/menu/green-leaf-bistro', '?table=T01&branch=BR-01');
  assert.equal(parsed?.restaurantSlug, 'green-leaf-bistro');
  assert.equal(parsed?.tableNumber, 'T01');

  const baseDish: MenuItem = {
    id: 'DISH-1',
    restaurantId: 'RST-1',
    name: 'Paneer Tikka',
    description: 'Charcoal grilled cottage cheese',
    imageUrl: '',
    price: 320,
    category: 'Starters',
    isVeg: true,
    available: true,
    prepTimeMinutes: 15,
    customizations: [],
  };

  const initialCart = upsertCustomizedCartItem([], baseDish, {
    selectedCustomizations: [],
    specialInstructions: 'Make it spicy',
    quantity: 2,
  });
  assert.equal(initialCart.length, 1);
  assert.equal(initialCart[0].quantity, 2);

  const totals = calculateOrderTotals(initialCart, 5, 3);
  assert.equal(totals.subtotal, 640);
  assert.equal(totals.taxAmount, 32);
  assert.equal(totals.totalAmount, 672);

  // Tracking step progression
  assert.equal(getCustomerTrackingStepIndex('Pending'), 0);
  assert.equal(getCustomerTrackingStepIndex('Accepted'), 1);
  assert.equal(getCustomerTrackingStepIndex('Preparing'), 2);
  assert.equal(getCustomerTrackingStepIndex('Ready'), 3);
  assert.equal(getCustomerTrackingStepIndex('Served'), 4);

  // Scenario 2: Pay at Restaurant allowed when enabled
  const payAtRestMethods = getAvailableCustomerPaymentMethods(true);
  assert.deepEqual(payAtRestMethods, ['Online Payment', 'Pay at Restaurant']);

  // Scenario 3: Pay at Restaurant disabled in settings
  const onlineOnlyMethods = getAvailableCustomerPaymentMethods(false);
  assert.deepEqual(onlineOnlyMethods, ['Online Payment']);
  assert.equal(onlineOnlyMethods.includes('Pay at Restaurant'), false);

  // Scenario 4: Validation rejects empty name or invalid Indian mobile
  const custSettings = {
    guestOrderingEnabled: true,
    customerNameRequirement: 'Mandatory' as const,
    mobileNumberRequirement: 'Mandatory' as const,
    otpVerificationEnabled: false,
    waiterApprovalRequired: false,
  };
  const invalidNameErr = validateCustomerCheckout('', '9876543210', custSettings, false);
  assert.ok(invalidNameErr.customerName);

  const invalidPhoneErr = validateCustomerCheckout('Aarav', '12345', custSettings, false);
  assert.ok(invalidPhoneErr.customerPhone);

  const validCheckoutErr = validateCustomerCheckout('Aarav', '9876543210', custSettings, false);
  assert.deepEqual(validCheckoutErr, {});

  // Scenario 5: Restaurant with inactive/suspended subscription blocks new ordering
  const now = new Date('2026-11-20T00:00:00Z');
  const inactiveRestaurant = {
    status: 'Active',
    subscriptionStatus: 'INACTIVE',
    subscriptionExpiryDate: '2027-01-01',
  } as Restaurant;
  assert.equal(isRestaurantOrderingAvailable(inactiveRestaurant, now), false);

  const activeRestaurant = {
    status: 'Active',
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiryDate: '2027-01-01',
  } as Restaurant;
  assert.equal(isRestaurantOrderingAvailable(activeRestaurant, now), true);

  // Scenario 6: Item with mandatory and optional customizations
  const biryaniDish: MenuItem = {
    id: 'DISH-2',
    restaurantId: 'RST-1',
    name: 'Hyderabadi Dum Biryani',
    description: 'Fragrant basmati rice',
    imageUrl: '',
    price: 350,
    category: 'Mains',
    isVeg: true,
    available: true,
    prepTimeMinutes: 20,
    customizations: [
      {
        id: 'portion',
        name: 'Portion Size',
        type: 'single',
        required: true,
        choices: [
          { id: 'regular', label: 'Regular', priceDelta: 0 },
          { id: 'large', label: 'Large (Serves 2)', priceDelta: 120 },
        ],
      },
      {
        id: 'addons',
        name: 'Add-ons',
        type: 'multiple',
        required: false,
        choices: [
          { id: 'mirchi', label: 'Mirchi Ka Salan', priceDelta: 40 },
          { id: 'raita', label: 'Extra Raita', priceDelta: 25 },
        ],
      },
    ],
  };

  const selectedCustomizations = [
    { groupId: 'portion', groupName: 'Portion Size', choiceId: 'large', choiceLabel: 'Large (Serves 2)', priceDelta: 120 },
    { groupId: 'addons', groupName: 'Add-ons', choiceId: 'mirchi', choiceLabel: 'Mirchi Ka Salan', priceDelta: 40 },
  ];

  // Unit price = 350 + 120 + 40 = 510
  const customUnitPrice = calculateCartItemUnitPrice(biryaniDish.price, selectedCustomizations);
  assert.equal(customUnitPrice, 510);

  const customizedCart = upsertCustomizedCartItem([], biryaniDish, {
    selectedCustomizations,
    specialInstructions: 'Spicy',
    quantity: 1,
  });
  const customTotals = calculateOrderTotals(customizedCart, 5, 0);
  assert.equal(customTotals.subtotal, 510);
  assert.equal(customTotals.taxAmount, 25.5);
  assert.equal(customTotals.totalAmount, 535.5);

  // Scenario 7: Cart item hash uniqueness merges identical variants and separates different variants
  const identicalCart = upsertCustomizedCartItem(customizedCart, biryaniDish, {
    selectedCustomizations,
    specialInstructions: 'Spicy',
    quantity: 2,
  });
  assert.equal(identicalCart.length, 1);
  assert.equal(identicalCart[0].quantity, 3); // 1 + 2 = 3

  const differentVariantCart = upsertCustomizedCartItem(identicalCart, biryaniDish, {
    selectedCustomizations: [
      { groupId: 'portion', groupName: 'Portion Size', choiceId: 'regular', choiceLabel: 'Regular', priceDelta: 0 },
    ],
    specialInstructions: '',
    quantity: 1,
  });
  assert.equal(differentVariantCart.length, 2);
  assert.equal(differentVariantCart[0].quantity, 3);
  assert.equal(differentVariantCart[1].quantity, 1);
});

