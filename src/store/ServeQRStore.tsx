import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createInitialSeedState, DEFAULT_CATEGORIES } from '../domain/seedData';
import {
  calculateBillTotals,
  calculateCartItemUnitPrice,
  calculateOrderTotals,
  computeDefaultExpiryDate,
  generateBillId,
  generateBranchId,
  generateInviteToken,
  generateOrderId,
  generateReceiptNumber,
  generateRestaurantId,
  generateTableId,
  getPlanConfig,
  normalizeSubscriptionStatus,
  resolvePaymentStatus,
  slugifyRestaurantName,
  SUBSCRIPTION_PLANS,
  updateCatalogPlanPriceWithoutMutatingTenants,
} from '../domain/serveqrLogic';
import type {
  Bill,
  BillingCycle,
  CartItem,
  DiningTable,
  MenuItem,
  Order,
  OrderCheckoutPaymentMethod,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Restaurant,
  RestaurantSettings,
  RestaurantStatus,
  ServeQRState,
  SubscriptionPaymentStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  TableStatus,
} from '../domain/types';

const STORAGE_KEY = 'serveqr_platform_state_v1';
const AUTH_STORAGE_KEY = 'serveqr_auth_session_v1';
const GUEST_SESSION_KEY = 'serveqr_guest_session_id';
const GUEST_CART_KEY = 'serveqr_guest_carts_v1';
const SYNC_CHANNEL_NAME = 'serveqr_realtime_sync';

export interface AuthSession {
  superAdminLoggedIn: boolean;
  superAdminEmail: string;
  restaurantOwnerLoggedIn: boolean;
  restaurantId: string | null;
  ownerEmail: string;
}

const DEFAULT_AUTH: AuthSession = {
  superAdminLoggedIn: false,
  superAdminEmail: 'admin@serveqr.io',
  restaurantOwnerLoggedIn: false,
  restaurantId: null,
  ownerEmail: '',
};

export interface CreateRestaurantInput {
  name: string;
  logoText: string;
  logoColor: string;
  logoImageUrl?: string;
  businessType: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  accountStatus?: RestaurantStatus;
  emailVerified?: boolean;
  subscriptionPlan: SubscriptionPlan;
  billingCycle: BillingCycle;
  customMonthlyPriceInr?: number;
  customAnnualPriceInr?: number;
  subscriptionStartDate: string;
  subscriptionExpiryDate?: string;
  subscriptionStatus: SubscriptionStatus;
}

export interface UpdateRestaurantBillingInput {
  subscriptionPlan: SubscriptionPlan;
  billingCycle: BillingCycle;
  customMonthlyPriceInr: number;
  customAnnualPriceInr: number;
  subscriptionStartDate: string;
  subscriptionExpiryDate: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPaymentStatus: SubscriptionPaymentStatus;
  invoiceNote?: string;
}

interface ServeQRContextValue {
  state: ServeQRState;
  auth: AuthSession;
  guestSessionId: string;
  startFreshGuestSession: () => string;
  getGuestCart: (restaurantId: string, tableNumber: string) => CartItem[];
  setGuestCart: (restaurantId: string, tableNumber: string, items: CartItem[]) => void;
  loginSuperAdmin: (email: string) => void;
  logoutSuperAdmin: () => void;
  loginRestaurantOwner: (email: string) => {
    ok: boolean;
    restaurant?: Restaurant;
    error?: string;
  };
  logoutRestaurantOwner: () => void;
  completeOwnerFirstLoginPasswordChange: (restaurantId: string) => void;
  createRestaurant: (input: CreateRestaurantInput) => Restaurant;
  updateRestaurantStatus: (restaurantId: string, status: RestaurantStatus) => void;
  updateSubscriptionStatus: (restaurantId: string, status: SubscriptionStatus) => void;
  updateRestaurantBilling: (
    restaurantId: string,
    billing: UpdateRestaurantBillingInput
  ) => void;
  updateStandardPlanPrices: (
    planName: SubscriptionPlan,
    monthlyPriceInr: number,
    annualPriceInr: number
  ) => void;
  updateRestaurantBranding: (
    restaurantId: string,
    branding: { name?: string; logoImageUrl?: string | null }
  ) => void;
  updateRestaurantProfile: (
    restaurantId: string,
    updates: Partial<
      Pick<
        Restaurant,
        | 'name'
        | 'businessType'
        | 'email'
        | 'phone'
        | 'address'
        | 'city'
        | 'state'
        | 'country'
        | 'postalCode'
        | 'ownerName'
        | 'ownerEmail'
        | 'ownerPhone'
        | 'subscriptionPlan'
        | 'billingCycle'
        | 'subscriptionStatus'
      >
    >
  ) => void;
  updateBranchInfo: (
    restaurantId: string,
    branchId: string,
    updates: { name: string; address: string; city: string; phone: string }
  ) => void;
  updateRestaurantSettings: (restaurantId: string, settings: RestaurantSettings) => void;
  addCategory: (restaurantId: string, category: string) => void;
  addMenuItem: (item: Omit<MenuItem, 'id'>) => MenuItem;
  updateMenuItem: (itemId: string, updates: Partial<Omit<MenuItem, 'id' | 'restaurantId'>>) => void;
  deleteMenuItem: (itemId: string) => void;
  toggleMenuItemAvailability: (itemId: string) => void;
  addTable: (input: {
    restaurantId: string;
    branchId: string;
    tableNumber: string;
    section: string;
    capacity: number;
    status: TableStatus;
  }) => DiningTable;
  updateTable: (
    tableId: string,
    updates: Partial<Pick<DiningTable, 'tableNumber' | 'section' | 'capacity' | 'status'>>
  ) => void;
  deleteTable: (tableId: string) => void;
  regenerateTableQr: (tableId: string) => void;
  placeCustomerOrder: (input: {
    restaurantId: string;
    branchId: string;
    tableId: string;
    tableNumber: string;
    cartItems: CartItem[];
    customerName: string;
    customerPhone: string;
    otpVerified?: boolean;
    orderPaymentMethod: OrderCheckoutPaymentMethod;
    paymentStatus: PaymentStatus;
    onlinePaymentRef?: string;
  }) => Order;
  updateOrderStatus: (orderId: string, nextStatus: OrderStatus) => void;
  createBillAndRecordPayment: (input: {
    restaurantId: string;
    branchId: string;
    tableNumber: string;
    mode: 'individual' | 'combined';
    orderIds: string[];
    discountPercent: number;
    paymentMethod: PaymentMethod;
    paidAmount: number;
    overridePaymentStatus?: PaymentStatus;
  }) => Bill | null;
  resetDemoData: () => void;
}

const ServeQRContext = createContext<ServeQRContextValue | null>(null);

function migrateLoadedState(parsed: Partial<ServeQRState>): ServeQRState {
  const seed = createInitialSeedState();
  if (!parsed || !Array.isArray(parsed.restaurants) || parsed.restaurants.length === 0) {
    return seed;
  }

  const planCatalog =
    Array.isArray(parsed.planCatalog) && parsed.planCatalog.length === 3
      ? parsed.planCatalog
      : SUBSCRIPTION_PLANS.map((p) => ({ ...p, features: [...p.features] }));

  const migratedRestaurants: Restaurant[] = parsed.restaurants.map((r) => {
    const planCfg = getPlanConfig(r.subscriptionPlan, planCatalog);
    const normalizedSubStatus = normalizeSubscriptionStatus(r.subscriptionStatus);
    const customMonthly =
      typeof r.customMonthlyPriceInr === 'number' && r.customMonthlyPriceInr >= 0
        ? r.customMonthlyPriceInr
        : r.monthlyPriceInr ?? planCfg.monthlyPriceInr;
    const customAnnual =
      typeof r.customAnnualPriceInr === 'number' && r.customAnnualPriceInr >= 0
        ? r.customAnnualPriceInr
        : planCfg.annualPriceInr;
    const expiryDate =
      r.subscriptionExpiryDate ||
      computeDefaultExpiryDate(r.subscriptionStartDate, r.billingCycle);

    return {
      ...r,
      subscriptionStatus: normalizedSubStatus,
      subscriptionExpiryDate: expiryDate,
      subscriptionPaymentStatus: r.subscriptionPaymentStatus ?? 'Paid',
      monthlyPriceInr: customMonthly,
      customMonthlyPriceInr: customMonthly,
      customAnnualPriceInr: customAnnual,
      hasCustomPricing:
        r.hasCustomPricing ??
        (customMonthly !== planCfg.monthlyPriceInr || customAnnual !== planCfg.annualPriceInr),
      subscriptionBillingHistory:
        Array.isArray(r.subscriptionBillingHistory) && r.subscriptionBillingHistory.length > 0
          ? r.subscriptionBillingHistory
          : [
              {
                id: `INV-SUB-${r.id}-1`,
                date: r.subscriptionStartDate || new Date().toISOString().slice(0, 10),
                description: `${r.subscriptionPlan} Plan — ${r.billingCycle} Billing`,
                amountInr: r.billingCycle === 'Annual' ? customAnnual : customMonthly,
                billingCycle: r.billingCycle,
                status: r.subscriptionPaymentStatus ?? 'Paid',
              },
            ],
      mustChangePassword: r.mustChangePassword ?? false,
      emailVerified: r.emailVerified ?? true,
      settings: {
        ...r.settings,
        payAtRestaurantEnabled:
          typeof r.settings?.payAtRestaurantEnabled === 'boolean'
            ? r.settings.payAtRestaurantEnabled
            : false,
        customerSettings: {
          ...(r.settings?.customerSettings ?? {
            guestOrderingEnabled: true,
            customerNameRequirement: 'Mandatory',
            mobileNumberRequirement: 'Mandatory',
            otpVerificationEnabled: false,
            waiterApprovalRequired: false,
          }),
          customerNameRequirement: 'Mandatory',
          mobileNumberRequirement: 'Mandatory',
        },
      },
    };
  });

  return {
    ...seed,
    ...parsed,
    planCatalog,
    restaurants: migratedRestaurants,
  };
}

function loadPersistedState(): ServeQRState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialSeedState();
    return migrateLoadedState(JSON.parse(raw) as Partial<ServeQRState>);
  } catch {
    return createInitialSeedState();
  }
}

function loadAuthSession(): AuthSession {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return DEFAULT_AUTH;
    return { ...DEFAULT_AUTH, ...(JSON.parse(raw) as Partial<AuthSession>) };
  } catch {
    return DEFAULT_AUTH;
  }
}

function createGuestSessionToken(): string {
  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadOrCreateGuestSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(GUEST_SESSION_KEY);
    if (existing) return existing;
    const created = createGuestSessionToken();
    window.sessionStorage.setItem(GUEST_SESSION_KEY, created);
    return created;
  } catch {
    return createGuestSessionToken();
  }
}

function loadGuestCarts(): Record<string, CartItem[]> {
  try {
    const raw = window.sessionStorage.getItem(GUEST_CART_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, CartItem[]>;
  } catch {
    return {};
  }
}

export const ServeQRProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ServeQRState>(() => loadPersistedState());
  const [auth, setAuth] = useState<AuthSession>(() => loadAuthSession());
  const [guestSessionId, setGuestSessionId] = useState<string>(() => loadOrCreateGuestSessionId());
  const [guestCarts, setGuestCarts] = useState<Record<string, CartItem[]>>(() => loadGuestCarts());

  const broadcastState = useCallback((next: ServeQRState) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
        ch.postMessage({ type: 'STATE_UPDATED', payload: next });
        ch.close();
      }
    } catch {
      // Ignore storage quota issues in constrained contexts
    }
  }, []);

  const commitState = useCallback(
    (updater: (prev: ServeQRState) => ServeQRState) => {
      setState((prev) => {
        const next = updater(prev);
        broadcastState(next);
        return next;
      });
    },
    [broadcastState]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    } catch {
      // ignore
    }
  }, [auth]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(GUEST_CART_KEY, JSON.stringify(guestCarts));
    } catch {
      // ignore
    }
  }, [guestCarts]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setState(migrateLoadedState(JSON.parse(e.newValue) as Partial<ServeQRState>));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === 'STATE_UPDATED' && event.data.payload) {
          setState(migrateLoadedState(event.data.payload as Partial<ServeQRState>));
        }
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      channel?.close();
    };
  }, []);

  const startFreshGuestSession = useCallback(() => {
    const fresh = createGuestSessionToken();
    setGuestSessionId(fresh);
    try {
      window.sessionStorage.setItem(GUEST_SESSION_KEY, fresh);
    } catch {
      // ignore
    }
    return fresh;
  }, []);

  const getGuestCart = useCallback(
    (restaurantId: string, tableNumber: string) => {
      const key = `${restaurantId}::${tableNumber.toUpperCase()}::${guestSessionId}`;
      return guestCarts[key] ?? [];
    },
    [guestCarts, guestSessionId]
  );

  const setGuestCart = useCallback(
    (restaurantId: string, tableNumber: string, items: CartItem[]) => {
      const key = `${restaurantId}::${tableNumber.toUpperCase()}::${guestSessionId}`;
      setGuestCarts((prev) => ({ ...prev, [key]: items }));
    },
    [guestSessionId]
  );

  const loginSuperAdmin = useCallback((email: string) => {
    setAuth((prev) => ({
      ...prev,
      superAdminLoggedIn: true,
      superAdminEmail: email.trim(),
    }));
  }, []);

  const logoutSuperAdmin = useCallback(() => {
    setAuth((prev) => ({
      ...prev,
      superAdminLoggedIn: false,
    }));
  }, []);

  // Requirement §8: Even when a restaurant's subscription is INACTIVE or SUSPENDED,
  // Restaurant Admin can still log in, access dashboard, view historical orders,
  // view subscription details, and view reports.
  const loginRestaurantOwner = useCallback(
    (email: string) => {
      const normalized = email.trim().toLowerCase();
      const matched = state.restaurants.find(
        (r) =>
          r.ownerEmail.toLowerCase() === normalized || r.email.toLowerCase() === normalized
      );
      if (!matched) {
        return {
          ok: false,
          error:
            'No restaurant workspace found for that email. Try rahul@abcrestaurant.in or ananya@spicecourtyard.in.',
        };
      }
      setAuth((prev) => ({
        ...prev,
        restaurantOwnerLoggedIn: true,
        restaurantId: matched.id,
        ownerEmail: matched.ownerEmail,
      }));
      return { ok: true, restaurant: matched };
    },
    [state.restaurants]
  );

  const logoutRestaurantOwner = useCallback(() => {
    setAuth((prev) => ({
      ...prev,
      restaurantOwnerLoggedIn: false,
      restaurantId: null,
      ownerEmail: '',
    }));
  }, []);

  const completeOwnerFirstLoginPasswordChange = useCallback(
    (restaurantId: string) => {
      commitState((prev) => ({
        ...prev,
        restaurants: prev.restaurants.map((r) =>
          r.id === restaurantId
            ? {
                ...r,
                mustChangePassword: false,
                inviteSetupCompleted: true,
                status: r.status === 'Setup Pending' ? 'Active' : r.status,
              }
            : r
        ),
      }));
    },
    [commitState]
  );

  const createRestaurant = useCallback(
    (input: CreateRestaurantInput): Restaurant => {
      const seq = state.nextRestaurantSeq;
      const restaurantId = generateRestaurantId(seq);
      const baseSlug = slugifyRestaurantName(input.name);
      const existingSlugs = new Set(state.restaurants.map((r) => r.slug));
      const slug = existingSlugs.has(baseSlug) ? `${baseSlug}-${seq}` : baseSlug;
      const branchId = generateBranchId(seq, 1);
      const planCfg = getPlanConfig(input.subscriptionPlan, state.planCatalog);
      const nowDate = new Date().toISOString().slice(0, 10);
      const startDate = input.subscriptionStartDate || nowDate;
      const expiryDate =
        input.subscriptionExpiryDate ||
        computeDefaultExpiryDate(startDate, input.billingCycle);

      const customMonthly =
        typeof input.customMonthlyPriceInr === 'number' && input.customMonthlyPriceInr > 0
          ? Math.round(input.customMonthlyPriceInr)
          : planCfg.monthlyPriceInr;
      const customAnnual =
        typeof input.customAnnualPriceInr === 'number' && input.customAnnualPriceInr > 0
          ? Math.round(input.customAnnualPriceInr)
          : planCfg.annualPriceInr;
      const hasCustomPricing =
        customMonthly !== planCfg.monthlyPriceInr || customAnnual !== planCfg.annualPriceInr;

      const billedAmount = input.billingCycle === 'Annual' ? customAnnual : customMonthly;

      const newRestaurant: Restaurant = {
        id: restaurantId,
        slug,
        name: input.name.trim(),
        logoText:
          input.logoText.trim().slice(0, 2).toUpperCase() ||
          input.name
            .trim()
            .split(/\s+/)
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
        logoColor: input.logoColor || '#087F5B',
        logoImageUrl: input.logoImageUrl,
        businessType: input.businessType.trim(),
        email: input.email.trim(),
        phone: input.phone.trim(),
        address: input.address.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        country: input.country.trim(),
        postalCode: input.postalCode.trim(),
        ownerName: input.ownerName.trim(),
        ownerEmail: input.ownerEmail.trim(),
        ownerPhone: input.ownerPhone.trim(),
        subscriptionPlan: input.subscriptionPlan,
        billingCycle: input.billingCycle,
        subscriptionStartDate: startDate,
        subscriptionExpiryDate: expiryDate,
        subscriptionStatus: normalizeSubscriptionStatus(input.subscriptionStatus),
        subscriptionPaymentStatus: 'Paid',
        monthlyPriceInr: customMonthly,
        customMonthlyPriceInr: customMonthly,
        customAnnualPriceInr: customAnnual,
        hasCustomPricing,
        subscriptionBillingHistory: [
          {
            id: `INV-SUB-${seq}-1`,
            date: startDate,
            description: `${input.subscriptionPlan} Plan — Initial ${input.billingCycle} Billing${
              hasCustomPricing ? ' (Custom Rate)' : ''
            }`,
            amountInr: billedAmount,
            billingCycle: input.billingCycle,
            status: 'Paid',
          },
        ],
        status: input.accountStatus ?? 'Setup Pending',
        registeredAt: nowDate,
        inviteToken: generateInviteToken(restaurantId),
        inviteSetupCompleted: false,
        mustChangePassword: true,
        emailVerified: input.emailVerified ?? true,
        branches: [
          {
            id: branchId,
            restaurantId,
            name: `Main Branch – ${input.city.trim()}`,
            address: input.address.trim(),
            city: input.city.trim(),
            phone: input.phone.trim(),
            isMain: true,
          },
        ],
        settings: {
          operatingHours: '11:00 AM – 11:00 PM (Daily)',
          taxRatePercent: 5,
          taxLabel: 'GST',
          currencySymbol: '₹',
          currencyCode: 'INR',
          autoAcceptOrders: false,
          estimatedPrepBufferMin: 3,
          welcomeMessage: `Welcome to ${input.name.trim()}. Scan, browse our digital menu, and order straight from your table.`,
          payAtRestaurantEnabled: false,
          customerSettings: {
            guestOrderingEnabled: true,
            customerNameRequirement: 'Mandatory',
            mobileNumberRequirement: 'Mandatory',
            otpVerificationEnabled: false,
            waiterApprovalRequired: false,
          },
        },
      };

      commitState((prev) => ({
        ...prev,
        restaurants: [newRestaurant, ...prev.restaurants],
        categoriesByRestaurant: {
          ...prev.categoriesByRestaurant,
          [restaurantId]: [...DEFAULT_CATEGORIES],
        },
        activities: [
          {
            id: `act-${Date.now()}`,
            timestamp: new Date().toISOString(),
            restaurantName: newRestaurant.name,
            action: 'Restaurant Workspace Created',
            detail: `${newRestaurant.id} provisioned on ${newRestaurant.subscriptionPlan} (${newRestaurant.billingCycle}) — Email verified`,
          },
          ...prev.activities,
        ],
        nextRestaurantSeq: prev.nextRestaurantSeq + 1,
      }));

      return newRestaurant;
    },
    [commitState, state.nextRestaurantSeq, state.planCatalog, state.restaurants]
  );

  const updateRestaurantStatus = useCallback(
    (restaurantId: string, status: RestaurantStatus) => {
      commitState((prev) => {
        const target = prev.restaurants.find((r) => r.id === restaurantId);
        return {
          ...prev,
          restaurants: prev.restaurants.map((r) => {
            if (r.id !== restaurantId) return r;
            const syncedSubStatus: SubscriptionStatus =
              status === 'Active'
                ? 'ACTIVE'
                : status === 'Inactive'
                ? 'INACTIVE'
                : status === 'Suspended'
                ? 'SUSPENDED'
                : r.subscriptionStatus;
            return { ...r, status, subscriptionStatus: syncedSubStatus };
          }),
          activities: target
            ? [
                {
                  id: `act-${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  restaurantName: target.name,
                  action: `Status Changed to ${status}`,
                  detail: `Workspace ${target.id} updated by Super Admin`,
                },
                ...prev.activities,
              ]
            : prev.activities,
        };
      });
    },
    [commitState]
  );

  const updateSubscriptionStatus = useCallback(
    (restaurantId: string, subscriptionStatus: SubscriptionStatus) => {
      commitState((prev) => {
        const target = prev.restaurants.find((r) => r.id === restaurantId);
        return {
          ...prev,
          restaurants: prev.restaurants.map((r) =>
            r.id === restaurantId
              ? {
                  ...r,
                  subscriptionStatus,
                  status:
                    subscriptionStatus === 'ACTIVE' || subscriptionStatus === 'EXPIRING SOON'
                      ? r.status === 'Inactive' || r.status === 'Suspended'
                        ? 'Active'
                        : r.status
                      : r.status,
                }
              : r
          ),
          activities: target
            ? [
                {
                  id: `act-${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  restaurantName: target.name,
                  action: `Subscription ${subscriptionStatus}`,
                  detail: `${target.id} subscription set to ${subscriptionStatus} by Super Admin`,
                },
                ...prev.activities,
              ]
            : prev.activities,
        };
      });
    },
    [commitState]
  );

  const updateRestaurantBilling = useCallback(
    (restaurantId: string, billing: UpdateRestaurantBillingInput) => {
      commitState((prev) => {
        const target = prev.restaurants.find((r) => r.id === restaurantId);
        const planCfg = getPlanConfig(billing.subscriptionPlan, prev.planCatalog);
        const hasCustomPricing =
          billing.customMonthlyPriceInr !== planCfg.monthlyPriceInr ||
          billing.customAnnualPriceInr !== planCfg.annualPriceInr;
        const billedAmount =
          billing.billingCycle === 'Annual'
            ? billing.customAnnualPriceInr
            : billing.customMonthlyPriceInr;

        return {
          ...prev,
          restaurants: prev.restaurants.map((r) => {
            if (r.id !== restaurantId) return r;
            const nextInvoice = {
              id: `INV-SUB-${r.id.replace('RST-', '')}-${r.subscriptionBillingHistory.length + 1}`,
              date: new Date().toISOString().slice(0, 10),
              description:
                billing.invoiceNote?.trim() ||
                `${billing.subscriptionPlan} Plan — ${billing.billingCycle} Billing Updated${
                  hasCustomPricing ? ' (Custom Rate)' : ''
                }`,
              amountInr: billedAmount,
              billingCycle: billing.billingCycle,
              status: billing.subscriptionPaymentStatus,
            };

            return {
              ...r,
              subscriptionPlan: billing.subscriptionPlan,
              billingCycle: billing.billingCycle,
              customMonthlyPriceInr: billing.customMonthlyPriceInr,
              customAnnualPriceInr: billing.customAnnualPriceInr,
              monthlyPriceInr: billing.customMonthlyPriceInr,
              hasCustomPricing,
              subscriptionStartDate: billing.subscriptionStartDate,
              subscriptionExpiryDate: billing.subscriptionExpiryDate,
              subscriptionStatus: billing.subscriptionStatus,
              subscriptionPaymentStatus: billing.subscriptionPaymentStatus,
              status:
                billing.subscriptionStatus === 'ACTIVE' ||
                billing.subscriptionStatus === 'EXPIRING SOON'
                  ? r.status === 'Inactive' || r.status === 'Suspended'
                    ? 'Active'
                    : r.status
                  : r.status,
              subscriptionBillingHistory: [nextInvoice, ...r.subscriptionBillingHistory],
            };
          }),
          activities: target
            ? [
                {
                  id: `act-${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  restaurantName: target.name,
                  action: 'Subscription Billing Updated',
                  detail: `${target.id} set to ${billing.subscriptionPlan} (${billing.billingCycle}, ${billing.subscriptionStatus})`,
                },
                ...prev.activities,
              ]
            : prev.activities,
        };
      });
    },
    [commitState]
  );

  // Business Rule: Editing standard plan prices NEVER overwrites existing restaurants' custom prices.
  const updateStandardPlanPrices = useCallback(
    (planName: SubscriptionPlan, monthlyPriceInr: number, annualPriceInr: number) => {
      commitState((prev) => ({
        ...prev,
        planCatalog: updateCatalogPlanPriceWithoutMutatingTenants(
          prev.planCatalog,
          planName,
          monthlyPriceInr,
          annualPriceInr
        ),
        activities: [
          {
            id: `act-${Date.now()}`,
            timestamp: new Date().toISOString(),
            restaurantName: 'ServeQR Platform',
            action: `Standard ${planName} Plan Updated`,
            detail: `Default catalog set to ₹${monthlyPriceInr}/mo & ₹${annualPriceInr}/yr (existing tenant custom rates preserved)`,
          },
          ...prev.activities,
        ],
      }));
    },
    [commitState]
  );

  const updateRestaurantBranding = useCallback(
    (restaurantId: string, branding: { name?: string; logoImageUrl?: string | null }) => {
      commitState((prev) => ({
        ...prev,
        restaurants: prev.restaurants.map((r) => {
          if (r.id !== restaurantId) return r;
          const nextName = branding.name?.trim() || r.name;
          const nextLogoImageUrl =
            branding.logoImageUrl === null
              ? undefined
              : branding.logoImageUrl !== undefined
              ? branding.logoImageUrl
              : r.logoImageUrl;
          return {
            ...r,
            name: nextName,
            logoImageUrl: nextLogoImageUrl,
          };
        }),
      }));
    },
    [commitState]
  );

  const updateRestaurantProfile = useCallback(
    (
      restaurantId: string,
      updates: Partial<
        Pick<
          Restaurant,
          | 'name'
          | 'businessType'
          | 'email'
          | 'phone'
          | 'address'
          | 'city'
          | 'state'
          | 'country'
          | 'postalCode'
          | 'ownerName'
          | 'ownerEmail'
          | 'ownerPhone'
          | 'subscriptionPlan'
          | 'billingCycle'
          | 'subscriptionStatus'
        >
      >
    ) => {
      commitState((prev) => ({
        ...prev,
        restaurants: prev.restaurants.map((r) => {
          if (r.id !== restaurantId) return r;
          const planChanged =
            updates.subscriptionPlan && updates.subscriptionPlan !== r.subscriptionPlan;
          const planCfg = getPlanConfig(
            updates.subscriptionPlan ?? r.subscriptionPlan,
            prev.planCatalog
          );
          return {
            ...r,
            ...updates,
            ...(planChanged && !r.hasCustomPricing
              ? {
                  monthlyPriceInr: planCfg.monthlyPriceInr,
                  customMonthlyPriceInr: planCfg.monthlyPriceInr,
                  customAnnualPriceInr: planCfg.annualPriceInr,
                }
              : {}),
          };
        }),
      }));
    },
    [commitState]
  );

  const updateBranchInfo = useCallback(
    (
      restaurantId: string,
      branchId: string,
      updates: { name: string; address: string; city: string; phone: string }
    ) => {
      commitState((prev) => ({
        ...prev,
        restaurants: prev.restaurants.map((r) => {
          if (r.id !== restaurantId) return r;
          return {
            ...r,
            branches: r.branches.map((b) => (b.id === branchId ? { ...b, ...updates } : b)),
          };
        }),
      }));
    },
    [commitState]
  );

  const updateRestaurantSettings = useCallback(
    (restaurantId: string, settings: RestaurantSettings) => {
      commitState((prev) => ({
        ...prev,
        restaurants: prev.restaurants.map((r) =>
          r.id === restaurantId ? { ...r, settings } : r
        ),
      }));
    },
    [commitState]
  );

  const addCategory = useCallback(
    (restaurantId: string, category: string) => {
      const clean = category.trim();
      if (!clean) return;
      commitState((prev) => {
        const existing = prev.categoriesByRestaurant[restaurantId] ?? [];
        if (existing.some((c) => c.toLowerCase() === clean.toLowerCase())) return prev;
        return {
          ...prev,
          categoriesByRestaurant: {
            ...prev.categoriesByRestaurant,
            [restaurantId]: [...existing, clean],
          },
        };
      });
    },
    [commitState]
  );

  const addMenuItem = useCallback(
    (item: Omit<MenuItem, 'id'>): MenuItem => {
      const created: MenuItem = {
        ...item,
        id: `MENU-${Date.now().toString(36).toUpperCase()}`,
      };
      commitState((prev) => {
        const existingCats = prev.categoriesByRestaurant[item.restaurantId] ?? [];
        const hasCat = existingCats.some(
          (c) => c.toLowerCase() === item.category.toLowerCase()
        );
        return {
          ...prev,
          menuItems: [created, ...prev.menuItems],
          categoriesByRestaurant: hasCat
            ? prev.categoriesByRestaurant
            : {
                ...prev.categoriesByRestaurant,
                [item.restaurantId]: [...existingCats, item.category],
              },
        };
      });
      return created;
    },
    [commitState]
  );

  const updateMenuItem = useCallback(
    (itemId: string, updates: Partial<Omit<MenuItem, 'id' | 'restaurantId'>>) => {
      commitState((prev) => ({
        ...prev,
        menuItems: prev.menuItems.map((m) => (m.id === itemId ? { ...m, ...updates } : m)),
      }));
    },
    [commitState]
  );

  const deleteMenuItem = useCallback(
    (itemId: string) => {
      commitState((prev) => ({
        ...prev,
        menuItems: prev.menuItems.filter((m) => m.id !== itemId),
      }));
    },
    [commitState]
  );

  const toggleMenuItemAvailability = useCallback(
    (itemId: string) => {
      commitState((prev) => ({
        ...prev,
        menuItems: prev.menuItems.map((m) =>
          m.id === itemId ? { ...m, available: !m.available } : m
        ),
      }));
    },
    [commitState]
  );

  const addTable = useCallback(
    (input: {
      restaurantId: string;
      branchId: string;
      tableNumber: string;
      section: string;
      capacity: number;
      status: TableStatus;
    }): DiningTable => {
      const normalizedNumber = input.tableNumber.trim().toUpperCase();
      const created: DiningTable = {
        id: generateTableId(input.restaurantId, normalizedNumber),
        restaurantId: input.restaurantId,
        branchId: input.branchId,
        tableNumber: normalizedNumber,
        section: input.section.trim(),
        capacity: input.capacity,
        status: input.status,
        qrVersion: 1,
        qrGeneratedAt: new Date().toISOString(),
      };
      commitState((prev) => ({
        ...prev,
        tables: [...prev.tables, created],
      }));
      return created;
    },
    [commitState]
  );

  const updateTable = useCallback(
    (
      tableId: string,
      updates: Partial<Pick<DiningTable, 'tableNumber' | 'section' | 'capacity' | 'status'>>
    ) => {
      commitState((prev) => ({
        ...prev,
        tables: prev.tables.map((t) =>
          t.id === tableId
            ? {
                ...t,
                ...updates,
                tableNumber: updates.tableNumber
                  ? updates.tableNumber.trim().toUpperCase()
                  : t.tableNumber,
              }
            : t
        ),
      }));
    },
    [commitState]
  );

  const deleteTable = useCallback(
    (tableId: string) => {
      commitState((prev) => ({
        ...prev,
        tables: prev.tables.filter((t) => t.id !== tableId),
      }));
    },
    [commitState]
  );

  const regenerateTableQr = useCallback(
    (tableId: string) => {
      commitState((prev) => ({
        ...prev,
        tables: prev.tables.map((t) =>
          t.id === tableId
            ? { ...t, qrVersion: t.qrVersion + 1, qrGeneratedAt: new Date().toISOString() }
            : t
        ),
      }));
    },
    [commitState]
  );

  const placeCustomerOrder = useCallback(
    (input: {
      restaurantId: string;
      branchId: string;
      tableId: string;
      tableNumber: string;
      cartItems: CartItem[];
      customerName: string;
      customerPhone: string;
      otpVerified?: boolean;
      orderPaymentMethod: OrderCheckoutPaymentMethod;
      paymentStatus: PaymentStatus;
      onlinePaymentRef?: string;
    }): Order => {
      const restaurant = state.restaurants.find((r) => r.id === input.restaurantId);
      const taxRate = restaurant?.settings.taxRatePercent ?? 5;
      const prepBuffer = restaurant?.settings.estimatedPrepBufferMin ?? 3;
      const pricing = calculateOrderTotals(input.cartItems, taxRate, prepBuffer);
      const nowIso = new Date().toISOString();
      const orderId = generateOrderId(state.nextOrderSeq);

      const newOrder: Order = {
        id: orderId,
        restaurantId: input.restaurantId,
        branchId: input.branchId,
        tableId: input.tableId,
        tableNumber: input.tableNumber,
        customerSessionId: guestSessionId,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        otpVerified: input.otpVerified,
        items: input.cartItems.map((ci, idx) => ({
          id: `${orderId}-item-${idx + 1}`,
          menuItemId: ci.menuItemId,
          name: ci.name,
          basePrice: ci.basePrice,
          unitPrice: calculateCartItemUnitPrice(ci.basePrice, ci.selectedCustomizations),
          quantity: ci.quantity,
          isVeg: ci.isVeg,
          selectedCustomizations: ci.selectedCustomizations,
          specialInstructions: ci.specialInstructions.trim(),
        })),
        subtotal: pricing.subtotal,
        taxRatePercent: taxRate,
        taxAmount: pricing.taxAmount,
        totalAmount: pricing.totalAmount,
        status: restaurant?.settings.autoAcceptOrders ? 'Accepted' : 'Pending',
        paymentStatus: input.paymentStatus,
        orderPaymentMethod: input.orderPaymentMethod,
        onlinePaymentRef: input.onlinePaymentRef,
        estimatedPrepMinutes: pricing.estimatedPrepMinutes || 15,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      commitState((prev) => ({
        ...prev,
        orders: [newOrder, ...prev.orders],
        tables: prev.tables.map((t) =>
          t.id === input.tableId ? { ...t, status: 'Occupied' } : t
        ),
        activities: [
          {
            id: `act-${Date.now()}`,
            timestamp: nowIso,
            restaurantName: restaurant?.name ?? 'Restaurant',
            action: 'New QR Order Placed',
            detail: `Order ${orderId} at Table ${input.tableNumber} (${restaurant?.settings.currencySymbol ?? '₹'}${pricing.totalAmount} · ${input.orderPaymentMethod})`,
          },
          ...prev.activities,
        ],
        nextOrderSeq: prev.nextOrderSeq + 1,
      }));

      setGuestCart(input.restaurantId, input.tableNumber, []);
      return newOrder;
    },
    [commitState, guestSessionId, setGuestCart, state.nextOrderSeq, state.restaurants]
  );

  const updateOrderStatus = useCallback(
    (orderId: string, nextStatus: OrderStatus) => {
      commitState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId ? { ...o, status: nextStatus, updatedAt: new Date().toISOString() } : o
        ),
      }));
    },
    [commitState]
  );

  const createBillAndRecordPayment = useCallback(
    (input: {
      restaurantId: string;
      branchId: string;
      tableNumber: string;
      mode: 'individual' | 'combined';
      orderIds: string[];
      discountPercent: number;
      paymentMethod: PaymentMethod;
      paidAmount: number;
      overridePaymentStatus?: PaymentStatus;
    }): Bill | null => {
      const targetOrders = state.orders.filter(
        (o) => o.restaurantId === input.restaurantId && input.orderIds.includes(o.id)
      );
      if (targetOrders.length === 0) return null;

      const restaurant = state.restaurants.find((r) => r.id === input.restaurantId);
      const taxRate = restaurant?.settings.taxRatePercent ?? 5;
      const calc = calculateBillTotals(targetOrders, taxRate, input.discountPercent);
      const paymentStatus =
        input.overridePaymentStatus ?? resolvePaymentStatus(calc.totalAmount, input.paidAmount);

      const billId = generateBillId(state.nextBillSeq);
      const receiptNumber = generateReceiptNumber(state.nextBillSeq);
      const customerNames = Array.from(
        new Set(targetOrders.map((o) => o.customerName || 'Walk-in Guest'))
      );

      const newBill: Bill = {
        id: billId,
        receiptNumber,
        restaurantId: input.restaurantId,
        branchId: input.branchId,
        tableNumber: input.tableNumber,
        mode: input.mode,
        orderIds: targetOrders.map((o) => o.id),
        customerSummary: customerNames.join(', '),
        subtotal: calc.subtotal,
        discountPercent: calc.discountPercent,
        discountAmount: calc.discountAmount,
        taxRatePercent: calc.taxRatePercent,
        taxAmount: calc.taxAmount,
        totalAmount: calc.totalAmount,
        paidAmount: input.paidAmount,
        paymentMethod: input.paymentMethod,
        paymentStatus,
        createdAt: new Date().toISOString(),
      };

      commitState((prev) => {
        const updatedOrders = prev.orders.map((o) => {
          if (!input.orderIds.includes(o.id)) return o;
          return {
            ...o,
            billId,
            paymentStatus,
            status: paymentStatus === 'Paid' ? ('Completed' as OrderStatus) : o.status,
            updatedAt: new Date().toISOString(),
          };
        });

        const hasRemainingUnpaidOnTable = updatedOrders.some(
          (o) =>
            o.restaurantId === input.restaurantId &&
            o.tableNumber === input.tableNumber &&
            o.status !== 'Cancelled' &&
            o.paymentStatus !== 'Paid'
        );

        return {
          ...prev,
          orders: updatedOrders,
          bills: [newBill, ...prev.bills],
          tables: prev.tables.map((t) =>
            t.restaurantId === input.restaurantId &&
            t.tableNumber === input.tableNumber &&
            !hasRemainingUnpaidOnTable
              ? { ...t, status: 'Available' }
              : t
          ),
          activities: [
            {
              id: `act-${Date.now()}`,
              timestamp: new Date().toISOString(),
              restaurantName: restaurant?.name ?? 'Restaurant',
              action: `Bill ${paymentStatus}`,
              detail: `${receiptNumber} (${input.mode === 'combined' ? 'Combined Table' : 'Individual'}) for Table ${input.tableNumber} via ${input.paymentMethod}`,
            },
            ...prev.activities,
          ],
          nextBillSeq: prev.nextBillSeq + 1,
        };
      });

      return newBill;
    },
    [commitState, state.nextBillSeq, state.orders, state.restaurants]
  );

  const resetDemoData = useCallback(() => {
    const fresh = createInitialSeedState();
    setState(fresh);
    broadcastState(fresh);
    setGuestCarts({});
  }, [broadcastState]);

  const value = useMemo<ServeQRContextValue>(
    () => ({
      state,
      auth,
      guestSessionId,
      startFreshGuestSession,
      getGuestCart,
      setGuestCart,
      loginSuperAdmin,
      logoutSuperAdmin,
      loginRestaurantOwner,
      logoutRestaurantOwner,
      completeOwnerFirstLoginPasswordChange,
      createRestaurant,
      updateRestaurantStatus,
      updateSubscriptionStatus,
      updateRestaurantBilling,
      updateStandardPlanPrices,
      updateRestaurantBranding,
      updateRestaurantProfile,
      updateBranchInfo,
      updateRestaurantSettings,
      addCategory,
      addMenuItem,
      updateMenuItem,
      deleteMenuItem,
      toggleMenuItemAvailability,
      addTable,
      updateTable,
      deleteTable,
      regenerateTableQr,
      placeCustomerOrder,
      updateOrderStatus,
      createBillAndRecordPayment,
      resetDemoData,
    }),
    [
      state,
      auth,
      guestSessionId,
      startFreshGuestSession,
      getGuestCart,
      setGuestCart,
      loginSuperAdmin,
      logoutSuperAdmin,
      loginRestaurantOwner,
      logoutRestaurantOwner,
      completeOwnerFirstLoginPasswordChange,
      createRestaurant,
      updateRestaurantStatus,
      updateSubscriptionStatus,
      updateRestaurantBilling,
      updateStandardPlanPrices,
      updateRestaurantBranding,
      updateRestaurantProfile,
      updateBranchInfo,
      updateRestaurantSettings,
      addCategory,
      addMenuItem,
      updateMenuItem,
      deleteMenuItem,
      toggleMenuItemAvailability,
      addTable,
      updateTable,
      deleteTable,
      regenerateTableQr,
      placeCustomerOrder,
      updateOrderStatus,
      createBillAndRecordPayment,
      resetDemoData,
    ]
  );

  return <ServeQRContext.Provider value={value}>{children}</ServeQRContext.Provider>;
};

export function useServeQR(): ServeQRContextValue {
  const ctx = useContext(ServeQRContext);
  if (!ctx) {
    throw new Error('useServeQR must be used inside ServeQRProvider');
  }
  return ctx;
}
