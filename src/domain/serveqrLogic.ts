import type {
  Bill,
  BillingCycle,
  CartItem,
  CustomerVerificationSettings,
  CustomizationGroup,
  DiningTable,
  MenuItem,
  Order,
  OrderCheckoutPaymentMethod,
  OrderStatus,
  PaymentStatus,
  Restaurant,
  SelectedCustomization,
  ServeQRState,
  SubscriptionPlan,
  SubscriptionPlanConfig,
  SubscriptionStatus,
} from './types';

export const SUBSCRIPTION_PLANS: SubscriptionPlanConfig[] = [
  {
    name: 'Basic',
    audience: 'For single-outlet cafes and bistros',
    monthlyPriceInr: 1999,
    annualPriceInr: 19990,
    maxBranches: 1,
    maxTables: 20,
    features: [
      'Up to 20 QR tables per branch',
      'Digital menu & live availability toggles',
      'Order queue & basic daily sales summary',
      'Online checkout & standard POS billing',
    ],
  },
  {
    name: 'Professional',
    audience: 'For busy full-service restaurants',
    monthlyPriceInr: 4499,
    annualPriceInr: 44990,
    maxBranches: 5,
    maxTables: 100,
    features: [
      'Up to 5 branches & 100 QR tables',
      'Real-time Kitchen Display System (KDS)',
      'Individual & combined table billing',
      'Detailed item, table, and payment analytics',
      'Custom restaurant logo & QR branding',
    ],
  },
  {
    name: 'Enterprise',
    audience: 'For multi-city hospitality groups',
    monthlyPriceInr: 8999,
    annualPriceInr: 89990,
    maxBranches: 50,
    maxTables: 1000,
    features: [
      'Unlimited branches & high-volume dining floors',
      'Custom branding & multi-branch analytics',
      'Configurable OTP & waiter approval workflows',
      'Dedicated onboarding & priority SLA support',
      'Custom negotiated enterprise billing',
    ],
  },
];

export function getPlanConfig(
  plan: SubscriptionPlan,
  catalog: SubscriptionPlanConfig[] = SUBSCRIPTION_PLANS
): SubscriptionPlanConfig {
  return catalog.find((p) => p.name === plan) ?? catalog[1] ?? SUBSCRIPTION_PLANS[1];
}

export function normalizeSubscriptionStatus(raw: string | undefined): SubscriptionStatus {
  const upper = (raw || '').trim().toUpperCase();
  if (upper === 'ACTIVE' || upper === 'TRIAL') return 'ACTIVE';
  if (upper === 'EXPIRING SOON' || upper === 'PAST DUE') return 'EXPIRING SOON';
  if (upper === 'SUSPENDED') return 'SUSPENDED';
  if (upper === 'INACTIVE' || upper === 'CANCELLED') return 'INACTIVE';
  return 'ACTIVE';
}

export function computeDefaultExpiryDate(startDateIso: string, billingCycle: BillingCycle): string {
  const base = startDateIso ? new Date(`${startDateIso}T00:00:00Z`) : new Date();
  const safe = Number.isNaN(base.getTime()) ? new Date() : base;
  if (billingCycle === 'Annual') {
    safe.setUTCFullYear(safe.getUTCFullYear() + 1);
  } else {
    safe.setUTCMonth(safe.getUTCMonth() + 1);
  }
  return safe.toISOString().slice(0, 10);
}

export interface SubscriptionValidityInfo {
  daysRemaining: number;
  isExpired: boolean;
  effectiveStatus: SubscriptionStatus;
  isOrderAcceptanceAllowed: boolean;
  validitySummary: string;
}

export function computeSubscriptionValidity(
  subscriptionStatus: SubscriptionStatus,
  expiryDateIso: string,
  referenceDate: Date = new Date()
): SubscriptionValidityInfo {
  const normalized = normalizeSubscriptionStatus(subscriptionStatus);
  const refDay = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  );
  const expiryParsed = new Date(`${expiryDateIso}T00:00:00Z`);
  const expiryMs = Number.isNaN(expiryParsed.getTime()) ? refDay : expiryParsed.getTime();
  const daysRemaining = Math.ceil((expiryMs - refDay) / (24 * 60 * 60 * 1000));
  const isExpired = daysRemaining < 0;

  let effectiveStatus: SubscriptionStatus = normalized;
  if (normalized === 'ACTIVE') {
    if (isExpired) {
      effectiveStatus = 'INACTIVE';
    } else if (daysRemaining <= 14) {
      effectiveStatus = 'EXPIRING SOON';
    }
  } else if (normalized === 'EXPIRING SOON' && isExpired) {
    effectiveStatus = 'INACTIVE';
  }

  const isOrderAcceptanceAllowed =
    effectiveStatus === 'ACTIVE' || effectiveStatus === 'EXPIRING SOON';

  const validitySummary =
    effectiveStatus === 'SUSPENDED'
      ? 'Suspended by platform admin'
      : effectiveStatus === 'INACTIVE'
      ? isExpired
        ? `Expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} ago`
        : 'Subscription inactive'
      : daysRemaining === 0
      ? 'Expires today'
      : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`;

  return {
    daysRemaining,
    isExpired,
    effectiveStatus,
    isOrderAcceptanceAllowed,
    validitySummary,
  };
}

export function isRestaurantOrderingAvailable(
  restaurant: Restaurant,
  referenceDate: Date = new Date()
): boolean {
  if (restaurant.status === 'Inactive' || restaurant.status === 'Suspended') {
    return false;
  }
  const validity = computeSubscriptionValidity(
    restaurant.subscriptionStatus,
    restaurant.subscriptionExpiryDate,
    referenceDate
  );
  return validity.isOrderAcceptanceAllowed;
}

export function getEffectiveSubscriptionAmount(restaurant: Restaurant): {
  amountInr: number;
  monthlyEquivalentInr: number;
  periodLabel: string;
} {
  const monthly = restaurant.customMonthlyPriceInr ?? restaurant.monthlyPriceInr;
  const annual = restaurant.customAnnualPriceInr ?? monthly * 10;
  if (restaurant.billingCycle === 'Annual') {
    return {
      amountInr: annual,
      monthlyEquivalentInr: Math.round(annual / 12),
      periodLabel: '/year',
    };
  }
  return {
    amountInr: monthly,
    monthlyEquivalentInr: monthly,
    periodLabel: '/month',
  };
}

export function updateCatalogPlanPriceWithoutMutatingTenants(
  catalog: SubscriptionPlanConfig[],
  planName: SubscriptionPlan,
  monthlyPriceInr: number,
  annualPriceInr: number
): SubscriptionPlanConfig[] {
  return catalog.map((plan) =>
    plan.name === planName
      ? {
          ...plan,
          monthlyPriceInr: Math.max(0, Math.round(monthlyPriceInr)),
          annualPriceInr: Math.max(0, Math.round(annualPriceInr)),
        }
      : plan
  );
}

export function getAvailableCustomerPaymentMethods(
  payAtRestaurantEnabled: boolean
): OrderCheckoutPaymentMethod[] {
  return payAtRestaurantEnabled
    ? ['Online Payment', 'Pay at Restaurant']
    : ['Online Payment'];
}

export function normalizeIndianMobile(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

export function isValidIndianMobile(phone: string): boolean {
  const normalized = normalizeIndianMobile(phone);
  return /^[6-9]\d{9}$/.test(normalized);
}

export function slugifyRestaurantName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'restaurant'
  );
}

export function generateRestaurantId(seq: number): string {
  return `RST-${String(seq).padStart(4, '0')}`;
}

export function generateBranchId(restaurantSeq: number, branchIndex = 1): string {
  return `BR-${String(restaurantSeq).padStart(4, '0')}-${branchIndex}`;
}

export function generateTableId(restaurantId: string, tableNumber: string): string {
  const cleanTable = tableNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `TBL-${restaurantId.replace('RST-', '')}-${cleanTable}`;
}

export function generateOrderId(seq: number): string {
  return `SQ-${seq}`;
}

export function generateBillId(seq: number): string {
  return `BILL-${String(seq).padStart(4, '0')}`;
}

export function generateReceiptNumber(seq: number): string {
  return `RCPT-${String(seq).padStart(5, '0')}`;
}

export function generateInviteToken(restaurantId: string): string {
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `INV-${restaurantId}-${suffix}`;
}

export function buildTableQrPath(
  restaurantSlug: string,
  tableNumber: string,
  branchId?: string,
  qrVersion = 1
): string {
  const params = new URLSearchParams();
  params.set('table', tableNumber);
  if (branchId) {
    params.set('branch', branchId);
  }
  if (qrVersion > 1) {
    params.set('v', String(qrVersion));
  }
  return `/menu/${encodeURIComponent(restaurantSlug)}?${params.toString()}`;
}

export function buildTableQrUrl(
  origin: string,
  restaurantSlug: string,
  tableNumber: string,
  branchId?: string,
  qrVersion = 1
): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}${buildTableQrPath(restaurantSlug, tableNumber, branchId, qrVersion)}`;
}

export interface ParsedQrRoute {
  restaurantSlug: string;
  tableNumber: string;
  branchId?: string;
  qrVersion: number;
}

export function parseTableQrRoute(pathname: string, search: string): ParsedQrRoute | null {
  const match = pathname.match(/^\/menu\/([^/]+)\/?$/);
  if (!match) return null;
  const restaurantSlug = decodeURIComponent(match[1]);
  const params = new URLSearchParams(search);
  const tableNumber = (params.get('table') || '').trim().toUpperCase();
  if (!tableNumber) return null;
  const branchId = params.get('branch') || undefined;
  const rawVersion = Number(params.get('v') || '1');
  const qrVersion = Number.isFinite(rawVersion) && rawVersion >= 1 ? Math.floor(rawVersion) : 1;
  return { restaurantSlug, tableNumber, branchId, qrVersion };
}

export function calculateCustomizationDelta(selected: SelectedCustomization[]): number {
  return selected.reduce((sum, opt) => sum + opt.priceDelta, 0);
}

export function calculateCartItemUnitPrice(
  basePrice: number,
  selected: SelectedCustomization[]
): number {
  return Math.max(0, roundCurrency(basePrice + calculateCustomizationDelta(selected)));
}

export function hasConfiguredCustomizations(item: Pick<MenuItem, 'customizations'>): boolean {
  return item.customizations.some((group) => group.choices.length > 0);
}

export interface CustomizationValidationResult {
  valid: boolean;
  missingGroupIds: string[];
  missingGroupNames: string[];
}

export function validateCustomizationSelections(
  groups: CustomizationGroup[],
  selected: SelectedCustomization[]
): CustomizationValidationResult {
  const missingGroupIds: string[] = [];
  const missingGroupNames: string[] = [];

  for (const group of groups) {
    if (!group.required || group.choices.length === 0) continue;
    const hasSelection = selected.some((s) => s.groupId === group.id);
    if (!hasSelection) {
      missingGroupIds.push(group.id);
      missingGroupNames.push(group.name);
    }
  }

  return {
    valid: missingGroupIds.length === 0,
    missingGroupIds,
    missingGroupNames,
  };
}

function getCustomizationSignature(
  selected: SelectedCustomization[],
  specialInstructions: string
): string {
  const sorted = [...selected]
    .map((s) => `${s.groupId}:${s.choiceId}:${s.priceDelta}`)
    .sort()
    .join('|');
  return `${sorted}::${specialInstructions.trim().toLowerCase()}`;
}

export function upsertCustomizedCartItem(
  cart: CartItem[],
  item: MenuItem,
  payload: {
    selectedCustomizations: SelectedCustomization[];
    specialInstructions: string;
    quantity: number;
  },
  editingCartItemId?: string | null
): CartItem[] {
  const cleanQty = Math.max(1, Math.floor(payload.quantity));
  const cleanNotes = payload.specialInstructions.trim();

  if (editingCartItemId) {
    return cart.map((ci) =>
      ci.cartItemId === editingCartItemId
        ? {
            ...ci,
            selectedCustomizations: payload.selectedCustomizations,
            specialInstructions: cleanNotes,
            quantity: cleanQty,
          }
        : ci
    );
  }

  const targetSig = getCustomizationSignature(payload.selectedCustomizations, cleanNotes);
  const existing = cart.find(
    (ci) =>
      ci.menuItemId === item.id &&
      getCustomizationSignature(ci.selectedCustomizations, ci.specialInstructions) === targetSig
  );

  if (existing) {
    return cart.map((ci) =>
      ci.cartItemId === existing.cartItemId
        ? { ...ci, quantity: ci.quantity + cleanQty }
        : ci
    );
  }

  return [
    ...cart,
    {
      cartItemId: `ci-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      menuItemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      basePrice: item.price,
      isVeg: item.isVeg,
      prepTimeMinutes: item.prepTimeMinutes,
      quantity: cleanQty,
      selectedCustomizations: payload.selectedCustomizations,
      specialInstructions: cleanNotes,
    },
  ];
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatCurrency(amount: number, symbol = '₹'): string {
  const formatted = Number.isInteger(amount)
    ? amount.toLocaleString('en-IN')
    : amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

export interface OrderPricingSummary {
  itemCount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  estimatedPrepMinutes: number;
}

export function calculateOrderTotals(
  cartItems: CartItem[],
  taxRatePercent: number,
  prepBufferMinutes = 0
): OrderPricingSummary {
  let itemCount = 0;
  let subtotal = 0;
  let maxPrep = 0;

  for (const item of cartItems) {
    const qty = Math.max(0, item.quantity);
    itemCount += qty;
    const unitPrice = calculateCartItemUnitPrice(item.basePrice, item.selectedCustomizations);
    subtotal += unitPrice * qty;
    if (qty > 0 && item.prepTimeMinutes > maxPrep) {
      maxPrep = item.prepTimeMinutes;
    }
  }

  subtotal = roundCurrency(subtotal);
  const taxAmount = roundCurrency((subtotal * Math.max(0, taxRatePercent)) / 100);
  const totalAmount = roundCurrency(subtotal + taxAmount);
  const estimatedPrepMinutes = itemCount > 0 ? maxPrep + Math.max(0, prepBufferMinutes) : 0;

  return { itemCount, subtotal, taxAmount, totalAmount, estimatedPrepMinutes };
}

export interface BillCalculation {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxableSubtotal: number;
  taxRatePercent: number;
  taxAmount: number;
  totalAmount: number;
}

export function calculateBillTotals(
  orders: Order[],
  taxRatePercent: number,
  discountPercent = 0
): BillCalculation {
  const clampedDiscount = Math.min(100, Math.max(0, discountPercent));
  const rawSubtotal = orders.reduce((sum, o) => sum + o.subtotal, 0);
  const subtotal = roundCurrency(rawSubtotal);
  const discountAmount = roundCurrency((subtotal * clampedDiscount) / 100);
  const taxableSubtotal = roundCurrency(Math.max(0, subtotal - discountAmount));
  const taxAmount = roundCurrency((taxableSubtotal * Math.max(0, taxRatePercent)) / 100);
  const totalAmount = roundCurrency(taxableSubtotal + taxAmount);

  return {
    subtotal,
    discountPercent: clampedDiscount,
    discountAmount,
    taxableSubtotal,
    taxRatePercent: Math.max(0, taxRatePercent),
    taxAmount,
    totalAmount,
  };
}

export function resolvePaymentStatus(totalAmount: number, paidAmount: number): PaymentStatus {
  if (paidAmount <= 0) return 'Pending';
  if (paidAmount + 0.01 >= totalAmount) return 'Paid';
  return 'Partially Paid';
}

export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  'Pending',
  'Accepted',
  'Preparing',
  'Ready',
  'Served',
  'Completed',
];

export function getNextOrderStatus(status: OrderStatus): OrderStatus | null {
  const idx = ORDER_STATUS_SEQUENCE.indexOf(status);
  if (idx === -1 || idx >= ORDER_STATUS_SEQUENCE.length - 1) return null;
  return ORDER_STATUS_SEQUENCE[idx + 1];
}

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  if (from === 'Cancelled' || from === 'Completed') return false;
  if (to === 'Cancelled') return from === 'Pending' || from === 'Accepted';
  const fromIdx = ORDER_STATUS_SEQUENCE.indexOf(from);
  const toIdx = ORDER_STATUS_SEQUENCE.indexOf(to);
  return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx;
}

export function getCustomerTrackingStepIndex(status: OrderStatus): number {
  switch (status) {
    case 'Pending':
      return 0;
    case 'Accepted':
      return 1;
    case 'Preparing':
      return 2;
    case 'Ready':
      return 3;
    case 'Served':
    case 'Completed':
      return 4;
    case 'Cancelled':
      return -1;
  }
}

export function scopeMenuItemsByRestaurant(
  items: MenuItem[],
  restaurantId: string
): MenuItem[] {
  return items.filter((item) => item.restaurantId === restaurantId);
}

export function scopeTablesByRestaurant(
  tables: DiningTable[],
  restaurantId: string
): DiningTable[] {
  return tables.filter((t) => t.restaurantId === restaurantId);
}

export function scopeOrdersByRestaurant(
  orders: Order[],
  restaurantId: string
): Order[] {
  return orders.filter((o) => o.restaurantId === restaurantId);
}

export function scopeBillsByRestaurant(bills: Bill[], restaurantId: string): Bill[] {
  return bills.filter((b) => b.restaurantId === restaurantId);
}

export function computeSuperAdminMetrics(restaurants: Restaurant[], orders: Order[]) {
  const totalRestaurants = restaurants.length;
  const activeRestaurants = restaurants.filter(
    (r) =>
      r.status === 'Active' &&
      (r.subscriptionStatus === 'ACTIVE' || r.subscriptionStatus === 'EXPIRING SOON')
  ).length;
  const inactiveRestaurants = restaurants.filter(
    (r) =>
      r.status === 'Inactive' ||
      r.status === 'Suspended' ||
      r.subscriptionStatus === 'INACTIVE' ||
      r.subscriptionStatus === 'SUSPENDED'
  ).length;
  const pendingSetups = restaurants.filter((r) => r.status === 'Setup Pending').length;
  const validOrders = orders.filter((o) => o.status !== 'Cancelled');
  const totalOrders = validOrders.length;
  const totalRevenue = roundCurrency(
    validOrders.reduce((sum, order) => sum + order.totalAmount, 0)
  );
  const subscriptionMrr = restaurants
    .filter(
      (r) => r.subscriptionStatus === 'ACTIVE' || r.subscriptionStatus === 'EXPIRING SOON'
    )
    .reduce((sum, r) => sum + getEffectiveSubscriptionAmount(r).monthlyEquivalentInr, 0);

  return {
    totalRestaurants,
    activeRestaurants,
    inactiveRestaurants,
    pendingSetups,
    totalOrders,
    totalRevenue,
    subscriptionMrr,
  };
}

export function computeRestaurantMetrics(orders: Order[], tables: DiningTable[]) {
  const validOrders = orders.filter((o) => o.status !== 'Cancelled');
  const todayOrders = validOrders.length;
  const totalSales = roundCurrency(validOrders.reduce((s, o) => s + o.totalAmount, 0));
  const pendingOrders = orders.filter(
    (o) => o.status === 'Pending' || o.status === 'Accepted'
  ).length;
  const preparingOrders = orders.filter((o) => o.status === 'Preparing').length;
  const readyOrders = orders.filter((o) => o.status === 'Ready').length;
  const completedOrders = orders.filter(
    (o) => o.status === 'Completed' || o.status === 'Served'
  ).length;
  const totalTables = tables.length;
  const activeQrTables = tables.filter((t) => Boolean(t.qrGeneratedAt)).length;
  const occupiedTables = tables.filter((t) => t.status === 'Occupied').length;

  return {
    todayOrders,
    totalSales,
    pendingOrders,
    preparingOrders,
    readyOrders,
    completedOrders,
    totalTables,
    activeQrTables,
    occupiedTables,
  };
}

export function computePopularItems(orders: Order[]) {
  const map = new Map<
    string,
    { menuItemId: string; name: string; quantity: number; revenue: number }
  >();
  for (const order of orders) {
    if (order.status === 'Cancelled') continue;
    for (const item of order.items) {
      const existing = map.get(item.menuItemId) ?? {
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: 0,
        revenue: 0,
      };
      existing.quantity += item.quantity;
      existing.revenue = roundCurrency(existing.revenue + item.unitPrice * item.quantity);
      map.set(item.menuItemId, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

export function computeTablePerformance(tables: DiningTable[], orders: Order[]) {
  return tables.map((table) => {
    const tableOrders = orders.filter(
      (o) => o.tableNumber === table.tableNumber && o.status !== 'Cancelled'
    );
    const revenue = roundCurrency(tableOrders.reduce((sum, o) => sum + o.totalAmount, 0));
    const guestSessions = new Set(tableOrders.map((o) => o.customerSessionId)).size;
    return {
      tableNumber: table.tableNumber,
      section: table.section,
      status: table.status,
      orderCount: tableOrders.length,
      guestSessions,
      revenue,
    };
  });
}

export function computePaymentBreakdown(bills: Bill[]) {
  const methods: Array<'Cash' | 'UPI' | 'Card' | 'Online Payment'> = [
    'Online Payment',
    'UPI',
    'Card',
    'Cash',
  ];
  return methods.map((method) => {
    const matched = bills.filter((b) => b.paymentMethod === method && b.paymentStatus === 'Paid');
    return {
      method,
      count: matched.length,
      amount: roundCurrency(matched.reduce((sum, b) => sum + b.paidAmount, 0)),
    };
  });
}

export interface ValidationErrors {
  [field: string]: string;
}

export function validateLoginForm(email: string, password: string): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (!password.trim() || password.trim().length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }
  return errors;
}

export function validateRestaurantStep1(data: {
  name: string;
  businessType: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!data.name.trim()) errors.name = 'Restaurant name is required.';
  if (!data.businessType.trim()) errors.businessType = 'Restaurant category is required.';
  if (!data.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
    errors.email = 'Valid business email is required.';
  }
  if (!data.phone.trim() || data.phone.replace(/\D/g, '').length < 8) {
    errors.phone = 'Valid contact number is required.';
  }
  if (!data.address.trim()) errors.address = 'Street address is required.';
  if (!data.city.trim()) errors.city = 'City is required.';
  if (!data.state.trim()) errors.state = 'State is required.';
  if (!data.country.trim()) errors.country = 'Country is required.';
  if (!data.postalCode.trim()) errors.postalCode = 'Postal code is required.';
  return errors;
}

export function validateRestaurantStep2(data: {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
}): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!data.ownerName.trim()) errors.ownerName = 'Owner full name is required.';
  if (!data.ownerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.ownerEmail.trim())) {
    errors.ownerEmail = 'Valid owner email is required.';
  }
  if (!data.ownerPhone.trim() || data.ownerPhone.replace(/\D/g, '').length < 8) {
    errors.ownerPhone = 'Valid owner phone number is required.';
  }
  return errors;
}

export function validateMenuItemForm(data: {
  name: string;
  price: number;
  category: string;
  prepTimeMinutes: number;
}): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!data.name.trim()) errors.name = 'Food item name is required.';
  if (!Number.isFinite(data.price) || data.price <= 0) {
    errors.price = 'Price must be greater than zero.';
  }
  if (!data.category.trim()) errors.category = 'Category is required.';
  if (!Number.isFinite(data.prepTimeMinutes) || data.prepTimeMinutes <= 0) {
    errors.prepTimeMinutes = 'Preparation time must be at least 1 minute.';
  }
  return errors;
}

export function validateTableForm(
  tableNumber: string,
  section: string,
  capacity: number,
  existingTableNumbers: string[],
  editingOriginalNumber?: string
): ValidationErrors {
  const errors: ValidationErrors = {};
  const normalized = tableNumber.trim().toUpperCase();
  if (!normalized) {
    errors.tableNumber = 'Table number is required (e.g., T06).';
  } else if (
    existingTableNumbers.some(
      (n) =>
        n.toUpperCase() === normalized &&
        n.toUpperCase() !== editingOriginalNumber?.toUpperCase()
    )
  ) {
    errors.tableNumber = `Table ${normalized} already exists.`;
  }
  if (!section.trim()) errors.section = 'Dining section is required.';
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 24) {
    errors.capacity = 'Capacity must be between 1 and 24 seats.';
  }
  return errors;
}

export function validateCustomerCheckout(
  customerName: string,
  customerPhone: string,
  settings: CustomerVerificationSettings,
  otpVerified: boolean
): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!customerName.trim()) {
    errors.customerName = 'Please enter your name to place the order.';
  }
  if (!isValidIndianMobile(customerPhone)) {
    errors.customerPhone = 'Enter a valid 10-digit Indian mobile number (starts with 6–9).';
  }
  if (settings.otpVerificationEnabled && !otpVerified) {
    errors.otp = 'Please verify the one-time passcode sent to your mobile number.';
  }
  return errors;
}

export function validateCategoryName(
  name: string,
  existingCategories: string[],
  currentName?: string
): { valid: boolean; error?: string; cleanName: string } {
  const cleanName = name.trim();
  if (!cleanName) {
    return { valid: false, error: 'Category name cannot be empty.', cleanName: '' };
  }
  const isDuplicate = existingCategories.some((cat) => {
    if (currentName && cat.toLowerCase() === currentName.trim().toLowerCase()) {
      return false;
    }
    return cat.toLowerCase() === cleanName.toLowerCase();
  });
  if (isDuplicate) {
    return {
      valid: false,
      error: `A category named "${cleanName}" already exists.`,
      cleanName,
    };
  }
  return { valid: true, cleanName };
}

export function addCategoryInState(
  state: ServeQRState,
  restaurantId: string,
  newCategory: string
): { ok: boolean; error?: string; cleanName?: string; nextState: ServeQRState } {
  const categories = state.categoriesByRestaurant[restaurantId] ?? [];
  const validation = validateCategoryName(newCategory, categories);
  if (!validation.valid) {
    return { ok: false, error: validation.error, nextState: state };
  }
  const clean = validation.cleanName;
  const nextState: ServeQRState = {
    ...state,
    categoriesByRestaurant: {
      ...state.categoriesByRestaurant,
      [restaurantId]: [...categories, clean],
    },
  };
  return { ok: true, cleanName: clean, nextState };
}

export function renameCategoryInState(
  state: ServeQRState,
  restaurantId: string,
  oldName: string,
  newName: string
): { ok: boolean; error?: string; nextState: ServeQRState } {
  const categories = state.categoriesByRestaurant[restaurantId] ?? [];
  const oldClean = oldName.trim();
  const existingIdx = categories.findIndex((c) => c.toLowerCase() === oldClean.toLowerCase());
  if (existingIdx === -1) {
    return { ok: false, error: `Category "${oldName}" not found.`, nextState: state };
  }
  const validation = validateCategoryName(newName, categories, categories[existingIdx]);
  if (!validation.valid) {
    return { ok: false, error: validation.error, nextState: state };
  }
  const actualOldName = categories[existingIdx];
  const finalNewName = validation.cleanName;

  const nextCategories = [...categories];
  nextCategories[existingIdx] = finalNewName;

  // Atomically update menu items assigned to oldName for this restaurant only
  const nextMenuItems = state.menuItems.map((item) => {
    if (item.restaurantId === restaurantId && item.category === actualOldName) {
      return { ...item, category: finalNewName };
    }
    return item;
  });

  const nextState: ServeQRState = {
    ...state,
    categoriesByRestaurant: {
      ...state.categoriesByRestaurant,
      [restaurantId]: nextCategories,
    },
    menuItems: nextMenuItems,
  };

  return { ok: true, nextState };
}

export function deleteCategoryInState(
  state: ServeQRState,
  restaurantId: string,
  categoryToDelete: string,
  reassignToCategory: string
): { ok: boolean; error?: string; nextState: ServeQRState } {
  const categories = state.categoriesByRestaurant[restaurantId] ?? [];
  if (categories.length <= 1) {
    return {
      ok: false,
      error: 'Cannot delete the only remaining category. A restaurant must have at least one category.',
      nextState: state,
    };
  }

  const delClean = categoryToDelete.trim().toLowerCase();
  const reassignClean = reassignToCategory.trim().toLowerCase();

  const toDeleteIdx = categories.findIndex((c) => c.toLowerCase() === delClean);
  if (toDeleteIdx === -1) {
    return { ok: false, error: `Category "${categoryToDelete}" not found.`, nextState: state };
  }

  if (delClean === reassignClean) {
    return {
      ok: false,
      error: 'Reassignment category cannot be the same as the category being deleted.',
      nextState: state,
    };
  }

  const targetCategory = categories.find((c) => c.toLowerCase() === reassignClean);
  if (!targetCategory) {
    return {
      ok: false,
      error: `Reassignment category "${reassignToCategory}" does not exist.`,
      nextState: state,
    };
  }

  const actualCategoryToDelete = categories[toDeleteIdx];
  const nextCategories = categories.filter((_, idx) => idx !== toDeleteIdx);

  // Atomically reassign menu items belonging to the deleted category
  const nextMenuItems = state.menuItems.map((item) => {
    if (item.restaurantId === restaurantId && item.category === actualCategoryToDelete) {
      return { ...item, category: targetCategory };
    }
    return item;
  });

  const nextState: ServeQRState = {
    ...state,
    categoriesByRestaurant: {
      ...state.categoriesByRestaurant,
      [restaurantId]: nextCategories,
    },
    menuItems: nextMenuItems,
  };

  return { ok: true, nextState };
}
