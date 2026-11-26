import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createInitialSeedState, DEFAULT_CATEGORIES } from '../domain/seedData';
import {
  isBackendApiEnabled,
  serveqrApi,
  tokenStore,
} from '../services/apiClient';
import {
  mapBackendAuditLogsToUiActivities,
  mapBackendMenuToUi,
  mapBackendOrderStatusToUi,
  mapBackendOrderToUi,
  mapBackendPlansToUi,
  mapBackendRestaurantToUi,
  mapBackendTableToUi,
  mapUiOrderStatusToBackend,
  mapUiSubscriptionStatusToBackend,
} from '../services/mappers';
import {
  buildIsoRangeFromDates,
  syncBackendModifierGroups,
  syncBackendTaxRules,
  type BackendTaxRuleRef,
} from '../services/backendSyncHelpers';
import { serveqrSocket } from '../services/socketClient';
import {
  addCategoryInState,
  calculateBillTotals,
  calculateCartItemUnitPrice,
  calculateOrderTotals,
  computeDefaultExpiryDate,
  deleteCategoryInState,
  generateBillId,
  generateBranchId,
  generateInviteToken,
  generateOrderId,
  generateReceiptNumber,
  generateRestaurantId,
  generateTableId,
  getPlanConfig,
  normalizeSubscriptionStatus,
  renameCategoryInState,
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
  staffRole?: 'OWNER' | 'KITCHEN';
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
  backendMode: boolean;
  backendSyncing: boolean;
  backendError: string | null;
  qrPathsByTableId: Record<string, string>;
  authenticateWithBackend: (
    email: string,
    password: string,
    expectedRole: 'super-admin' | 'restaurant-owner'
  ) => Promise<{ ok: boolean; error?: string }>;
  refreshFromBackend: () => Promise<void>;
  clearBackendError: () => void;
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
  addCategory: (restaurantId: string, category: string) => { ok: boolean; error?: string };
  renameCategory: (
    restaurantId: string,
    oldName: string,
    newName: string
  ) => { ok: boolean; error?: string };
  deleteCategory: (
    restaurantId: string,
    categoryToDelete: string,
    reassignToCategory: string
  ) => { ok: boolean; error?: string };
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
  updateOrderStatus: (
    orderId: string,
    nextStatus: OrderStatus,
    reason?: string,
    options?: { rejectPending?: boolean }
  ) => void;
  updateOrderPrepEstimate: (orderId: string, estimatedPrepMinutes: number) => void;
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
  const backendMode = isBackendApiEnabled();
  const [state, setState] = useState<ServeQRState>(() => loadPersistedState());
  const [auth, setAuth] = useState<AuthSession>(() => loadAuthSession());
  const [backendSyncing, setBackendSyncing] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [qrPathsByTableId, setQrPathsByTableId] = useState<Record<string, string>>({});
  const categoryIdsByRestaurantRef = useRef<Record<string, Record<string, string>>>({});
  const planIdsByCodeRef = useRef<Record<string, string>>({});
  const taxRuleIdsByRestaurantRef = useRef<Record<string, BackendTaxRuleRef[]>>({});
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
    if (backendMode) {
      void serveqrApi.auth.logout();
      serveqrSocket.disconnect();
    }
    setAuth((prev) => ({
      ...prev,
      superAdminLoggedIn: false,
    }));
  }, [backendMode]);

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
    if (backendMode) {
      void serveqrApi.auth.logout();
      serveqrSocket.disconnect();
    }
    setAuth((prev) => ({
      ...prev,
      restaurantOwnerLoggedIn: false,
      restaurantId: null,
      ownerEmail: '',
      staffRole: undefined,
    }));
  }, [backendMode]);

  const clearBackendError = useCallback(() => {
    setBackendError(null);
  }, []);

  const refreshFromBackend = useCallback(async () => {
    if (!backendMode) return;
    const accessToken = tokenStore.getStaffAccessToken();
    if (!accessToken) return;

    setBackendSyncing(true);
    setBackendError(null);
    try {
      if (auth.superAdminLoggedIn) {
        const [remoteRestaurants, remotePlans, remoteAuditLogs] = await Promise.all([
          serveqrApi.superAdmin.listRestaurants(),
          serveqrApi.superAdmin.listPlans().catch(() => []),
          serveqrApi.superAdmin.listAuditLogs().catch(() => ({ items: [] })),
        ]);
        commitState((prev) => {
          const mappedPlans =
            Array.isArray(remotePlans) && remotePlans.length > 0
              ? mapBackendPlansToUi(remotePlans, prev.planCatalog)
              : { planCatalog: prev.planCatalog, planIdByCode: planIdsByCodeRef.current };
          planIdsByCodeRef.current = mappedPlans.planIdByCode;
          const mappedActivities =
            Array.isArray(remoteAuditLogs?.items) && remoteAuditLogs.items.length > 0
              ? mapBackendAuditLogsToUiActivities(remoteAuditLogs.items)
              : prev.activities;

          return {
            ...prev,
            planCatalog: mappedPlans.planCatalog,
            activities: mappedActivities,
            restaurants: remoteRestaurants.map((r) =>
              mapBackendRestaurantToUi(
                r,
                prev.restaurants.find((ex) => ex.id === r.id || ex.slug === r.slug)
              )
            ),
          };
        });
      }

      if (auth.restaurantOwnerLoggedIn && auth.restaurantId) {
        const rstId = auth.restaurantId;
        const [profileDto, menuDto, tablesDto, ordersDto] = await Promise.all([
          serveqrApi.restaurant.getProfile(rstId),
          serveqrApi.restaurant.getMenu(rstId),
          serveqrApi.restaurant.listTables(rstId),
          serveqrApi.restaurant.listOrders(rstId, false),
        ]);

        const mappedMenu = mapBackendMenuToUi(rstId, menuDto);
        categoryIdsByRestaurantRef.current[rstId] = mappedMenu.categoryIdByName;
        taxRuleIdsByRestaurantRef.current[rstId] = (menuDto?.taxRules ?? [])
          .filter((tr: any) => tr.isActive && tr.calculationType === 'PERCENTAGE')
          .map((tr: any) => ({
            id: tr.id,
            name: tr.name,
            rate: Number(tr.rate),
          }));
        const mappedTables = tablesDto.map((t) => mapBackendTableToUi(rstId, t));
        const mappedOrders = (ordersDto.items ?? []).map(mapBackendOrderToUi);

        commitState((prev) => {
          const existing = prev.restaurants.find((r) => r.id === rstId || r.slug === profileDto.slug);
          const mappedRestaurant = mapBackendRestaurantToUi(profileDto, existing);
          const otherRestaurants = prev.restaurants.filter((r) => r.id !== rstId);

          return {
            ...prev,
            restaurants: [mappedRestaurant, ...otherRestaurants],
            categoriesByRestaurant: {
              ...prev.categoriesByRestaurant,
              [rstId]: mappedMenu.categories,
            },
            menuItems: [
              ...mappedMenu.menuItems,
              ...prev.menuItems.filter((m) => m.restaurantId !== rstId),
            ],
            tables: [
              ...mappedTables,
              ...prev.tables.filter((t) => t.restaurantId !== rstId),
            ],
            orders: [
              ...mappedOrders,
              ...prev.orders.filter((o) => o.restaurantId !== rstId),
            ],
          };
        });
      }
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Failed to synchronize with server');
    } finally {
      setBackendSyncing(false);
    }
  }, [auth.restaurantId, auth.restaurantOwnerLoggedIn, auth.superAdminLoggedIn, backendMode, commitState]);

  const authenticateWithBackend = useCallback(
    async (
      email: string,
      password: string,
      expectedRole: 'super-admin' | 'restaurant-owner'
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const result = await serveqrApi.auth.login(email, password);
        if (expectedRole === 'super-admin') {
          if (result.user.platformRole !== 'SUPER_ADMIN') {
            await serveqrApi.auth.logout();
            return { ok: false, error: 'This account does not have Super Admin access.' };
          }
          setAuth((prev) => ({
            ...prev,
            superAdminLoggedIn: true,
            superAdminEmail: result.user.email,
          }));
          return { ok: true };
        }

        const membership = result.user.memberships[0];
        if (!membership) {
          await serveqrApi.auth.logout();
          return { ok: false, error: 'No active restaurant workspace found for this user.' };
        }
        setAuth((prev) => ({
          ...prev,
          restaurantOwnerLoggedIn: true,
          restaurantId: membership.restaurantId,
          ownerEmail: result.user.email,
          staffRole: membership.role === 'KITCHEN' ? 'KITCHEN' : 'OWNER',
        }));
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Authentication failed',
        };
      }
    },
    []
  );

  // Sync initial data & Socket.IO real-time events when backend mode is active
  useEffect(() => {
    if (!backendMode) return;
    const accessToken = tokenStore.getStaffAccessToken();
    if (!accessToken || (!auth.superAdminLoggedIn && !auth.restaurantOwnerLoggedIn)) {
      return;
    }

    void refreshFromBackend();
    serveqrSocket.connectAsStaff(accessToken);

    const unsubCreated = serveqrSocket.onOrderCreated(() => {
      void refreshFromBackend();
    });
    const unsubStatus = serveqrSocket.onOrderStatusUpdated<{ toStatus: string }>((event) => {
      commitState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === event.resource.id
            ? {
                ...o,
                status: mapBackendOrderStatusToUi(event.payload.toStatus),
                updatedAt: event.timestamp,
              }
            : o
        ),
      }));
    });
    const unsubEstimate = serveqrSocket.onOrderEstimateUpdated<{ estimatedPrepMinutes?: number }>(
      (event) => {
        if (typeof event.payload.estimatedPrepMinutes !== 'number') return;
        commitState((prev) => ({
          ...prev,
          orders: prev.orders.map((o) =>
            o.id === event.resource.id
              ? { ...o, estimatedPrepMinutes: event.payload.estimatedPrepMinutes as number }
              : o
          ),
        }));
      }
    );
    const unsubPayment = serveqrSocket.onPaymentUpdated<{ status: string }>((event) => {
      commitState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === event.resource.id
            ? {
                ...o,
                paymentStatus:
                  event.payload.status === 'SUCCEEDED'
                    ? 'Paid'
                    : event.payload.status === 'REFUNDED'
                    ? 'Refunded'
                    : o.paymentStatus,
              }
            : o
        ),
      }));
    });
    const unsubReconnect = serveqrSocket.onReconnect(() => {
      void refreshFromBackend();
    });

    return () => {
      unsubCreated();
      unsubStatus();
      unsubEstimate();
      unsubPayment();
      unsubReconnect();
    };
  }, [
    auth.restaurantId,
    auth.restaurantOwnerLoggedIn,
    auth.superAdminLoggedIn,
    backendMode,
    commitState,
    refreshFromBackend,
  ]);

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

      if (backendMode && auth.superAdminLoggedIn) {
        void serveqrApi.superAdmin
          .createRestaurant({
            name: newRestaurant.name,
            slug: newRestaurant.slug,
            logoUrl: newRestaurant.logoImageUrl ?? null,
            ownerName: newRestaurant.ownerName,
            ownerEmail: newRestaurant.ownerEmail,
            ownerPassword: 'serveqr2026',
            branchName: newRestaurant.branches[0]?.name ?? 'Main Branch',
            addressLine1: newRestaurant.address,
            city: newRestaurant.city,
            state: newRestaurant.state,
            pincode: newRestaurant.postalCode,
            planCode: newRestaurant.subscriptionPlan.toUpperCase(),
          })
          .then(() => refreshFromBackend())
          .catch((err) => setBackendError(err instanceof Error ? err.message : 'Failed to create restaurant'));
      }

      return newRestaurant;
    },
    [auth.superAdminLoggedIn, backendMode, commitState, refreshFromBackend, state.nextRestaurantSeq, state.planCatalog, state.restaurants]
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

      if (backendMode && auth.superAdminLoggedIn) {
        void serveqrApi.superAdmin
          .updateRestaurant(restaurantId, {
            status: status === 'Active' ? 'ACTIVE' : 'INACTIVE',
          })
          .catch(() => void refreshFromBackend());
      }
    },
    [auth.superAdminLoggedIn, backendMode, commitState, refreshFromBackend]
  );

  const updateSubscriptionStatus = useCallback(
    (restaurantId: string, subscriptionStatus: SubscriptionStatus) => {
      const target = state.restaurants.find((r) => r.id === restaurantId);
      commitState((prev) => {
        const matched = prev.restaurants.find((r) => r.id === restaurantId);
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
          activities: matched
            ? [
                {
                  id: `act-${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  restaurantName: matched.name,
                  action: `Subscription ${subscriptionStatus}`,
                  detail: `${matched.id} subscription set to ${subscriptionStatus} by Super Admin`,
                },
                ...prev.activities,
              ]
            : prev.activities,
        };
      });

      if (backendMode && auth.superAdminLoggedIn && target) {
        const planId = planIdsByCodeRef.current[target.subscriptionPlan.toUpperCase()];
        if (planId) {
          void serveqrApi.superAdmin
            .assignSubscription(restaurantId, {
              planId,
              status: mapUiSubscriptionStatusToBackend(subscriptionStatus),
            })
            .then(() => refreshFromBackend())
            .catch((err) => {
              setBackendError(err instanceof Error ? err.message : 'Failed to update subscription status');
              void refreshFromBackend();
            });
        }
      }
    },
    [auth.superAdminLoggedIn, backendMode, commitState, refreshFromBackend, state.restaurants]
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

      if (backendMode && auth.superAdminLoggedIn) {
        const planId = planIdsByCodeRef.current[billing.subscriptionPlan.toUpperCase()];
        if (planId) {
          const { startsAt, endsAt } = buildIsoRangeFromDates(
            billing.subscriptionStartDate,
            billing.subscriptionExpiryDate
          );
          void serveqrApi.superAdmin
            .assignSubscription(restaurantId, {
              planId,
              status: mapUiSubscriptionStatusToBackend(billing.subscriptionStatus),
              ...(startsAt ? { startsAt } : {}),
              ...(endsAt ? { endsAt } : {}),
              providerReference: billing.invoiceNote?.trim() || null,
            })
            .then(() => refreshFromBackend())
            .catch((err) => {
              setBackendError(err instanceof Error ? err.message : 'Failed to assign subscription');
              void refreshFromBackend();
            });
        }
      }
    },
    [auth.superAdminLoggedIn, backendMode, commitState, refreshFromBackend]
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

      if (backendMode && auth.superAdminLoggedIn) {
        const planId = planIdsByCodeRef.current[planName.toUpperCase()];
        if (planId) {
          void serveqrApi.superAdmin
            .updatePlan(planId, { price: monthlyPriceInr })
            .then(() => refreshFromBackend())
            .catch((err) => {
              setBackendError(err instanceof Error ? err.message : 'Failed to update plan pricing');
              void refreshFromBackend();
            });
        }
      }
    },
    [auth.superAdminLoggedIn, backendMode, commitState, refreshFromBackend]
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

      if (backendMode) {
        void serveqrApi.restaurant
          .updateProfile(restaurantId, {
            ...(branding.name?.trim() ? { name: branding.name.trim() } : {}),
            ...(branding.logoImageUrl !== undefined ? { logoUrl: branding.logoImageUrl } : {}),
          })
          .catch((err) => {
            setBackendError(err instanceof Error ? err.message : 'Failed to update branding');
            void refreshFromBackend();
          });
      }
    },
    [backendMode, commitState, refreshFromBackend]
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

      if (backendMode && updates.name?.trim()) {
        const req = auth.superAdminLoggedIn
          ? serveqrApi.superAdmin.updateRestaurant(restaurantId, { name: updates.name.trim() })
          : serveqrApi.restaurant.updateProfile(restaurantId, { name: updates.name.trim() });
        void req.catch((err) => {
          setBackendError(err instanceof Error ? err.message : 'Failed to save restaurant profile');
          void refreshFromBackend();
        });
      }
    },
    [auth.superAdminLoggedIn, backendMode, commitState, refreshFromBackend]
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

      if (backendMode && updates.name.trim().length >= 2) {
        void serveqrApi.restaurant
          .updateBranch(restaurantId, branchId, {
            name: updates.name.trim(),
            addressLine1: updates.address.trim() || null,
            city: updates.city.trim() || null,
          })
          .catch((err) => {
            setBackendError(err instanceof Error ? err.message : 'Failed to update branch details');
            void refreshFromBackend();
          });
      }
    },
    [backendMode, commitState, refreshFromBackend]
  );

  const updateRestaurantSettings = useCallback(
    (restaurantId: string, settings: RestaurantSettings) => {
      commitState((prev) => ({
        ...prev,
        restaurants: prev.restaurants.map((r) =>
          r.id === restaurantId ? { ...r, settings } : r
        ),
      }));

      if (backendMode) {
        const existingTaxRules = taxRuleIdsByRestaurantRef.current[restaurantId] ?? [];
        void Promise.all([
          serveqrApi.restaurant.updateProfile(restaurantId, {
            payAtRestaurantEnabled: settings.payAtRestaurantEnabled,
          }),
          syncBackendTaxRules(
            restaurantId,
            existingTaxRules,
            settings.taxRatePercent,
            settings.taxLabel
          ),
        ])
          .then(() => refreshFromBackend())
          .catch((err) => {
            setBackendError(err instanceof Error ? err.message : 'Failed to save settings');
            void refreshFromBackend();
          });
      }
    },
    [backendMode, commitState, refreshFromBackend]
  );

  const addCategory = useCallback(
    (restaurantId: string, category: string): { ok: boolean; error?: string } => {
      let result: { ok: boolean; error?: string } = { ok: true };
      commitState((prev) => {
        const res = addCategoryInState(prev, restaurantId, category);
        if (!res.ok) {
          result = { ok: false, error: res.error };
          return prev;
        }
        result = { ok: true };
        return res.nextState;
      });
      if (result.ok && backendMode) {
        void serveqrApi.restaurant
          .createCategory(restaurantId, { name: category.trim() })
          .then(() => refreshFromBackend())
          .catch(() => void refreshFromBackend());
      }
      return result;
    },
    [backendMode, commitState, refreshFromBackend]
  );

  const renameCategory = useCallback(
    (restaurantId: string, oldName: string, newName: string): { ok: boolean; error?: string } => {
      let result: { ok: boolean; error?: string } = { ok: true };
      commitState((prev) => {
        const res = renameCategoryInState(prev, restaurantId, oldName, newName);
        if (!res.ok) {
          result = { ok: false, error: res.error };
          return prev;
        }
        result = { ok: true };
        return res.nextState;
      });
      const catId = categoryIdsByRestaurantRef.current[restaurantId]?.[oldName];
      if (result.ok && backendMode && catId) {
        void serveqrApi.restaurant
          .updateCategory(restaurantId, catId, { name: newName.trim() })
          .then(() => refreshFromBackend())
          .catch(() => void refreshFromBackend());
      }
      return result;
    },
    [backendMode, commitState, refreshFromBackend]
  );

  const deleteCategory = useCallback(
    (
      restaurantId: string,
      categoryToDelete: string,
      reassignToCategory: string
    ): { ok: boolean; error?: string } => {
      let result: { ok: boolean; error?: string } = { ok: true };
      commitState((prev) => {
        const res = deleteCategoryInState(
          prev,
          restaurantId,
          categoryToDelete,
          reassignToCategory
        );
        if (!res.ok) {
          result = { ok: false, error: res.error };
          return prev;
        }
        result = { ok: true };
        return res.nextState;
      });
      const catId = categoryIdsByRestaurantRef.current[restaurantId]?.[categoryToDelete];
      const targetCatId = categoryIdsByRestaurantRef.current[restaurantId]?.[reassignToCategory];
      if (result.ok && backendMode && catId) {
        void serveqrApi.restaurant
          .deleteCategory(restaurantId, catId, targetCatId)
          .then(() => refreshFromBackend())
          .catch(() => void refreshFromBackend());
      }
      return result;
    },
    [backendMode, commitState, refreshFromBackend]
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

      const catId = categoryIdsByRestaurantRef.current[item.restaurantId]?.[item.category];
      if (backendMode && catId) {
        void (async () => {
          const modifierGroupIds =
            item.customizations.length > 0
              ? await syncBackendModifierGroups(item.restaurantId, item.customizations)
              : [];
          await serveqrApi.restaurant.createMenuItem(item.restaurantId, {
            categoryId: catId,
            name: item.name,
            description: item.description,
            imageUrl: item.imageUrl,
            price: item.price,
            isVeg: item.isVeg,
            availabilityStatus: item.available ? 'AVAILABLE' : 'SOLD_OUT',
            modifierGroupIds,
          });
          await refreshFromBackend();
        })().catch((err) => {
          setBackendError(err instanceof Error ? err.message : 'Failed to create menu item');
          void refreshFromBackend();
        });
      }
      return created;
    },
    [backendMode, commitState, refreshFromBackend]
  );

  const updateMenuItem = useCallback(
    (itemId: string, updates: Partial<Omit<MenuItem, 'id' | 'restaurantId'>>) => {
      const existingItem = state.menuItems.find((m) => m.id === itemId);
      commitState((prev) => ({
        ...prev,
        menuItems: prev.menuItems.map((m) => (m.id === itemId ? { ...m, ...updates } : m)),
      }));

      if (backendMode && existingItem) {
        const targetCatId = updates.category
          ? categoryIdsByRestaurantRef.current[existingItem.restaurantId]?.[updates.category]
          : undefined;
        void (async () => {
          const modifierGroupIds =
            updates.customizations !== undefined
              ? await syncBackendModifierGroups(existingItem.restaurantId, updates.customizations)
              : undefined;
          await serveqrApi.restaurant.updateMenuItem(existingItem.restaurantId, itemId, {
            ...(targetCatId ? { categoryId: targetCatId } : {}),
            ...(updates.name !== undefined ? { name: updates.name } : {}),
            ...(updates.description !== undefined ? { description: updates.description } : {}),
            ...(updates.imageUrl !== undefined ? { imageUrl: updates.imageUrl } : {}),
            ...(updates.price !== undefined ? { price: updates.price } : {}),
            ...(updates.isVeg !== undefined ? { isVeg: updates.isVeg } : {}),
            ...(updates.available !== undefined
              ? { availabilityStatus: updates.available ? 'AVAILABLE' : 'SOLD_OUT' }
              : {}),
            ...(modifierGroupIds !== undefined ? { modifierGroupIds } : {}),
          });
          await refreshFromBackend();
        })().catch((err) => {
          setBackendError(err instanceof Error ? err.message : 'Failed to update menu item');
          void refreshFromBackend();
        });
      }
    },
    [backendMode, commitState, refreshFromBackend, state.menuItems]
  );

  const deleteMenuItem = useCallback(
    (itemId: string) => {
      const existingItem = state.menuItems.find((m) => m.id === itemId);
      commitState((prev) => ({
        ...prev,
        menuItems: prev.menuItems.filter((m) => m.id !== itemId),
      }));
      if (backendMode && existingItem) {
        void serveqrApi.restaurant
          .deleteMenuItem(existingItem.restaurantId, itemId)
          .catch(() => void refreshFromBackend());
      }
    },
    [backendMode, commitState, refreshFromBackend, state.menuItems]
  );

  const toggleMenuItemAvailability = useCallback(
    (itemId: string) => {
      const targetItem = state.menuItems.find((m) => m.id === itemId);
      commitState((prev) => ({
        ...prev,
        menuItems: prev.menuItems.map((m) =>
          m.id === itemId ? { ...m, available: !m.available } : m
        ),
      }));

      if (backendMode && targetItem) {
        void serveqrApi.restaurant
          .updateItemAvailability(
            targetItem.restaurantId,
            itemId,
            targetItem.available ? 'SOLD_OUT' : 'AVAILABLE'
          )
          .catch(() => void refreshFromBackend());
      }
    },
    [backendMode, commitState, refreshFromBackend, state.menuItems]
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

      if (backendMode) {
        void serveqrApi.restaurant
          .createTable(input.restaurantId, {
            branchId: input.branchId,
            tableCode: normalizedNumber,
            displayName: input.section.trim() || `Table ${normalizedNumber}`,
            capacity: input.capacity,
          })
          .then((res) => {
            if (res?.table?.id && res?.qrCredentials?.qrPath) {
              setQrPathsByTableId((prev) => ({
                ...prev,
                [res.table.id]: res.qrCredentials.qrPath,
              }));
            }
            return refreshFromBackend();
          })
          .catch(() => void refreshFromBackend());
      }
      return created;
    },
    [backendMode, commitState, refreshFromBackend]
  );

  const updateTable = useCallback(
    (
      tableId: string,
      updates: Partial<Pick<DiningTable, 'tableNumber' | 'section' | 'capacity' | 'status'>>
    ) => {
      const targetTable = state.tables.find((t) => t.id === tableId);
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

      if (backendMode && targetTable) {
        void serveqrApi.restaurant
          .updateTable(targetTable.restaurantId, tableId, {
            ...(updates.section !== undefined ? { displayName: updates.section.trim() } : {}),
            ...(updates.capacity !== undefined ? { capacity: updates.capacity } : {}),
            ...(updates.status !== undefined
              ? { status: updates.status === 'Reserved' ? 'INACTIVE' : 'ACTIVE' }
              : {}),
          })
          .catch((err) => {
            setBackendError(err instanceof Error ? err.message : 'Failed to update dining table');
            void refreshFromBackend();
          });
      }
    },
    [backendMode, commitState, refreshFromBackend, state.tables]
  );

  const deleteTable = useCallback(
    (tableId: string) => {
      const targetTable = state.tables.find((t) => t.id === tableId);
      commitState((prev) => ({
        ...prev,
        tables: prev.tables.filter((t) => t.id !== tableId),
      }));

      if (backendMode && targetTable) {
        void serveqrApi.restaurant
          .deleteTable(targetTable.restaurantId, tableId)
          .catch((err) => {
            setBackendError(err instanceof Error ? err.message : 'Failed to delete dining table');
            void refreshFromBackend();
          });
      }
    },
    [backendMode, commitState, refreshFromBackend, state.tables]
  );

  const regenerateTableQr = useCallback(
    (tableId: string) => {
      const targetTable = state.tables.find((t) => t.id === tableId);
      commitState((prev) => ({
        ...prev,
        tables: prev.tables.map((t) =>
          t.id === tableId
            ? { ...t, qrVersion: t.qrVersion + 1, qrGeneratedAt: new Date().toISOString() }
            : t
        ),
      }));

      if (backendMode && targetTable) {
        void serveqrApi.restaurant
          .rotateTableQr(targetTable.restaurantId, tableId)
          .then((res) => {
            if (res?.qrCredentials?.qrPath) {
              setQrPathsByTableId((prev) => ({
                ...prev,
                [tableId]: res.qrCredentials.qrPath,
              }));
            }
          })
          .catch(() => void refreshFromBackend());
      }
    },
    [backendMode, commitState, refreshFromBackend, state.tables]
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
    (
      orderId: string,
      nextStatus: OrderStatus,
      reason?: string,
      options?: { rejectPending?: boolean }
    ) => {
      const targetOrder = state.orders.find((o) => o.id === orderId);
      commitState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId ? { ...o, status: nextStatus, updatedAt: new Date().toISOString() } : o
        ),
      }));

      if (backendMode && targetOrder) {
        const shouldReject =
          nextStatus === 'Cancelled' &&
          (options?.rejectPending ||
            (targetOrder.status === 'Pending' && auth.staffRole === 'KITCHEN'));
        const backendStatus = shouldReject ? 'REJECTED' : mapUiOrderStatusToBackend(nextStatus);
        const defaultReason = shouldReject
          ? 'Rejected by kitchen staff'
          : 'Cancelled by restaurant staff';
        const effectiveReason =
          reason && reason.trim().length >= 3 ? reason.trim() : defaultReason;

        void serveqrApi.restaurant
          .transitionOrderStatus(targetOrder.restaurantId, orderId, {
            toStatus: backendStatus,
            ...(backendStatus === 'CANCELLED' || backendStatus === 'REJECTED'
              ? { reason: effectiveReason }
              : {}),
          })
          .catch((err) => {
            setBackendError(err instanceof Error ? err.message : 'Failed to update order status');
            void refreshFromBackend();
          });
      }
    },
    [auth.staffRole, backendMode, commitState, refreshFromBackend, state.orders]
  );

  const updateOrderPrepEstimate = useCallback(
    (orderId: string, estimatedPrepMinutes: number) => {
      const clamped = Math.max(1, Math.min(180, Math.round(estimatedPrepMinutes)));
      const targetOrder = state.orders.find((o) => o.id === orderId);
      commitState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId
            ? { ...o, estimatedPrepMinutes: clamped, updatedAt: new Date().toISOString() }
            : o
        ),
      }));

      if (backendMode && targetOrder) {
        void serveqrApi.restaurant
          .updateOrderEstimate(targetOrder.restaurantId, orderId, clamped)
          .catch((err) => {
            setBackendError(err instanceof Error ? err.message : 'Failed to update prep estimate');
            void refreshFromBackend();
          });
      }
    },
    [backendMode, commitState, refreshFromBackend, state.orders]
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

      if (backendMode && paymentStatus === 'Paid') {
        const channel =
          input.paymentMethod === 'UPI'
            ? 'UPI_COUNTER'
            : input.paymentMethod === 'Card'
            ? 'CARD_POS'
            : 'CASH';
        void Promise.all(
          targetOrders
            .filter((o) => o.paymentStatus !== 'Paid')
            .map((o) =>
              serveqrApi.restaurant.settleOfflinePayment(input.restaurantId, o.id, {
                channel,
                reference: receiptNumber,
              })
            )
        ).catch(() => void refreshFromBackend());
      }

      return newBill;
    },
    [backendMode, commitState, refreshFromBackend, state.nextBillSeq, state.orders, state.restaurants]
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
      backendMode,
      backendSyncing,
      backendError,
      qrPathsByTableId,
      authenticateWithBackend,
      refreshFromBackend,
      clearBackendError,
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
      renameCategory,
      deleteCategory,
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
      updateOrderPrepEstimate,
      createBillAndRecordPayment,
      resetDemoData,
    }),
    [
      state,
      auth,
      backendMode,
      backendSyncing,
      backendError,
      qrPathsByTableId,
      authenticateWithBackend,
      refreshFromBackend,
      clearBackendError,
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
      renameCategory,
      deleteCategory,
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
      updateOrderPrepEstimate,
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
