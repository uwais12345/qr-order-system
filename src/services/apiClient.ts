const viteEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
const API_BASE_URL = viteEnv?.VITE_API_BASE_URL || '/api/v1';

export function isBackendApiEnabled(): boolean {
  return viteEnv?.VITE_USE_BACKEND_API === 'true';
}

const STAFF_ACCESS_KEY = 'serveqr_api_access_token';
const STAFF_REFRESH_KEY = 'serveqr_api_refresh_token';
const GUEST_TOKEN_KEY = 'serveqr_api_guest_token';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    statusCode: number;
    details?: unknown;
    issues?: { path: string; message: string }[];
  };
}

function getStorageItem(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setStorageItem(storage: Storage | undefined, key: string, value: string | null): void {
  try {
    if (!storage) return;
    if (value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export const tokenStore = {
  getStaffAccessToken: () =>
    getStorageItem(typeof window !== 'undefined' ? window.localStorage : undefined, STAFF_ACCESS_KEY),
  getStaffRefreshToken: () =>
    getStorageItem(typeof window !== 'undefined' ? window.localStorage : undefined, STAFF_REFRESH_KEY),
  setStaffTokens: (accessToken: string | null, refreshToken: string | null) => {
    const ls = typeof window !== 'undefined' ? window.localStorage : undefined;
    setStorageItem(ls, STAFF_ACCESS_KEY, accessToken);
    setStorageItem(ls, STAFF_REFRESH_KEY, refreshToken);
  },
  getGuestToken: () =>
    getStorageItem(typeof window !== 'undefined' ? window.sessionStorage : undefined, GUEST_TOKEN_KEY),
  setGuestToken: (token: string | null) => {
    const ss = typeof window !== 'undefined' ? window.sessionStorage : undefined;
    setStorageItem(ss, GUEST_TOKEN_KEY, token);
  },
};

async function requestJson<T>(
  path: string,
  options: RequestInit & { authMode?: 'staff' | 'guest' | 'none'; retryOn401?: boolean } = {}
): Promise<T> {
  const { authMode = 'staff', retryOn401 = true, headers, ...fetchOptions } = options;

  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('Content-Type') && fetchOptions.body) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  if (authMode === 'staff') {
    const accessToken = tokenStore.getStaffAccessToken();
    if (accessToken) {
      requestHeaders.set('Authorization', `Bearer ${accessToken}`);
    }
  } else if (authMode === 'guest') {
    const guestToken = tokenStore.getGuestToken();
    if (guestToken) {
      requestHeaders.set('x-guest-token', guestToken);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers: requestHeaders,
  });

  if (response.status === 401 && authMode === 'staff' && retryOn401) {
    const refreshToken = tokenStore.getStaffRefreshToken();
    if (refreshToken) {
      const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (refreshRes.ok) {
        const refreshEnvelope = (await refreshRes.json()) as ApiEnvelope<{
          accessToken: string;
          refreshToken: string;
        }>;
        if (refreshEnvelope.success && refreshEnvelope.data) {
          tokenStore.setStaffTokens(
            refreshEnvelope.data.accessToken,
            refreshEnvelope.data.refreshToken
          );
          return requestJson<T>(path, { ...options, retryOn401: false });
        }
      }
      tokenStore.setStaffTokens(null, null);
    }
  }

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !envelope.success) {
    throw new ApiError(
      envelope.error?.message || `API request failed (${response.status})`,
      response.status,
      envelope.error?.details ?? envelope.error?.issues
    );
  }

  return envelope.data as T;
}

export const serveqrApi = {
  operations: {
    health: () => requestJson<{ status: string; database: string }>('/health', { authMode: 'none' }),
  },

  auth: {
    async login(email: string, password: string) {
      const data = await requestJson<{
        tokens: { accessToken: string; refreshToken: string };
        user: {
          id: string;
          email: string;
          displayName: string;
          platformRole: string;
          memberships: {
            membershipId: string;
            restaurantId: string;
            restaurantName: string;
            restaurantSlug: string;
            role: string;
          }[];
        };
      }>('/auth/login', {
        method: 'POST',
        authMode: 'none',
        body: JSON.stringify({ email, password }),
      });
      tokenStore.setStaffTokens(data.tokens.accessToken, data.tokens.refreshToken);
      return data;
    },
    me: () => requestJson<any>('/auth/me'),
    async logout() {
      try {
        await requestJson('/auth/logout', { method: 'POST' });
      } finally {
        tokenStore.setStaffTokens(null, null);
      }
    },
  },

  superAdmin: {
    getDashboard: () => requestJson<any>('/super-admin/dashboard'),
    listRestaurants: (params?: { status?: string; search?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return requestJson<any[]>(`/super-admin/restaurants${qs ? `?${qs}` : ''}`);
    },
    getRestaurant: (restaurantId: string) =>
      requestJson<any>(`/super-admin/restaurants/${restaurantId}`),
    createRestaurant: (payload: Record<string, unknown>) =>
      requestJson<any>('/super-admin/restaurants', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateRestaurant: (restaurantId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/super-admin/restaurants/${restaurantId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    listPlans: () => requestJson<any[]>('/super-admin/plans'),
    updatePlan: (planId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/super-admin/plans/${planId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    assignSubscription: (restaurantId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/super-admin/restaurants/${restaurantId}/subscriptions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listAuditLogs: (restaurantId?: string) =>
      requestJson<any>(`/super-admin/audit-logs${restaurantId ? `?restaurantId=${restaurantId}` : ''}`),
  },

  restaurant: {
    getProfile: (restaurantId: string) => requestJson<any>(`/restaurants/${restaurantId}`),
    updateProfile: (restaurantId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/restaurants/${restaurantId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    listBranches: (restaurantId: string) =>
      requestJson<any[]>(`/restaurants/${restaurantId}/branches`),
    createBranch: (restaurantId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/restaurants/${restaurantId}/branches`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateBranch: (restaurantId: string, branchId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/restaurants/${restaurantId}/branches/${branchId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    listStaff: (restaurantId: string) => requestJson<any[]>(`/restaurants/${restaurantId}/staff`),
    createStaff: (restaurantId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/restaurants/${restaurantId}/staff`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listTables: (restaurantId: string, branchId?: string) =>
      requestJson<any[]>(
        `/restaurants/${restaurantId}/tables${branchId ? `?branchId=${branchId}` : ''}`
      ),
    createTable: (restaurantId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/restaurants/${restaurantId}/tables`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateTable: (restaurantId: string, tableId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/restaurants/${restaurantId}/tables/${tableId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    deleteTable: (restaurantId: string, tableId: string) =>
      requestJson<any>(`/restaurants/${restaurantId}/tables/${tableId}`, {
        method: 'DELETE',
      }),
    rotateTableQr: (restaurantId: string, tableId: string) =>
      requestJson<any>(`/restaurants/${restaurantId}/tables/${tableId}/qr-rotate`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    revokeTableQr: (restaurantId: string, tableId: string) =>
      requestJson<any>(`/restaurants/${restaurantId}/tables/${tableId}/qr-revoke`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    getMenu: (restaurantId: string, branchId?: string) =>
      requestJson<any>(
        `/restaurants/${restaurantId}/menu${branchId ? `?branchId=${branchId}` : ''}`
      ),
    createCategory: (restaurantId: string, payload: { name: string; sortOrder?: number }) =>
      requestJson<any>(`/restaurants/${restaurantId}/menu/categories`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateCategory: (
      restaurantId: string,
      categoryId: string,
      payload: { name?: string; sortOrder?: number; isActive?: boolean }
    ) =>
      requestJson<any>(`/restaurants/${restaurantId}/menu/categories/${categoryId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    deleteCategory: (
      restaurantId: string,
      categoryId: string,
      reassignToCategoryId?: string
    ) =>
      requestJson<any>(
        `/restaurants/${restaurantId}/menu/categories/${categoryId}${
          reassignToCategoryId ? `?reassignToCategoryId=${reassignToCategoryId}` : ''
        }`,
        { method: 'DELETE' }
      ),
    createMenuItem: (restaurantId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/restaurants/${restaurantId}/menu/items`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateMenuItem: (restaurantId: string, itemId: string, payload: Record<string, unknown>) =>
      requestJson<any>(`/restaurants/${restaurantId}/menu/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    updateItemAvailability: (
      restaurantId: string,
      itemId: string,
      availabilityStatus: 'AVAILABLE' | 'SOLD_OUT' | 'UNAVAILABLE'
    ) =>
      requestJson<any>(`/restaurants/${restaurantId}/menu/items/${itemId}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ availabilityStatus }),
      }),
    deleteMenuItem: (restaurantId: string, itemId: string) =>
      requestJson<any>(`/restaurants/${restaurantId}/menu/items/${itemId}`, {
        method: 'DELETE',
      }),
    createModifierGroup: (
      restaurantId: string,
      payload: {
        name: string;
        minSelect: number;
        maxSelect: number;
        isRequired: boolean;
        options: { name: string; priceDelta: number; isAvailable?: boolean; sortOrder?: number }[];
      }
    ) =>
      requestJson<any>(`/restaurants/${restaurantId}/menu/modifier-groups`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateModifierGroup: (
      restaurantId: string,
      groupId: string,
      payload: {
        name?: string;
        minSelect?: number;
        maxSelect?: number;
        isRequired?: boolean;
        options?: { name: string; priceDelta: number; isAvailable?: boolean; sortOrder?: number }[];
      }
    ) =>
      requestJson<any>(`/restaurants/${restaurantId}/menu/modifier-groups/${groupId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    createTaxRule: (
      restaurantId: string,
      payload: {
        name: string;
        branchId?: string | null;
        rate: number;
        calculationType?: 'PERCENTAGE' | 'FIXED';
        isActive?: boolean;
      }
    ) =>
      requestJson<any>(`/restaurants/${restaurantId}/menu/tax-rules`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateTaxRule: (
      restaurantId: string,
      taxRuleId: string,
      payload: {
        name?: string;
        rate?: number;
        calculationType?: 'PERCENTAGE' | 'FIXED';
        isActive?: boolean;
      }
    ) =>
      requestJson<any>(`/restaurants/${restaurantId}/menu/tax-rules/${taxRuleId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    listOrders: (restaurantId: string, activeOnly = false) =>
      requestJson<{ items: any[]; total: number }>(
        `/restaurants/${restaurantId}/orders?activeOnly=${activeOnly}`
      ),
    transitionOrderStatus: (
      restaurantId: string,
      orderId: string,
      payload: { toStatus: string; reason?: string; estimatedPrepMinutes?: number }
    ) =>
      requestJson<any>(`/restaurants/${restaurantId}/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    updateOrderEstimate: (restaurantId: string, orderId: string, estimatedPrepMinutes: number) =>
      requestJson<any>(`/restaurants/${restaurantId}/orders/${orderId}/estimate`, {
        method: 'PATCH',
        body: JSON.stringify({ estimatedPrepMinutes }),
      }),
    settleOfflinePayment: (
      restaurantId: string,
      orderId: string,
      payload: { channel: 'CASH' | 'UPI_COUNTER' | 'CARD_POS'; reference?: string }
    ) =>
      requestJson<any>(`/restaurants/${restaurantId}/payments/orders/${orderId}/settle-offline`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getPaymentSummary: (restaurantId: string, branchId?: string) =>
      requestJson<any>(
        `/restaurants/${restaurantId}/payments/summary${branchId ? `?branchId=${branchId}` : ''}`
      ),
  },

  guest: {
    async createSession(payload: { token: string; restaurantSlug?: string; tableCode?: string }) {
      const data = await requestJson<{
        session: { id: string; expiresAt: string };
        accessToken: string;
        restaurant: Record<string, unknown>;
        branch: Record<string, unknown>;
        table: Record<string, unknown>;
        availablePaymentMethods: string[];
      }>('/guest/sessions', {
        method: 'POST',
        authMode: 'none',
        body: JSON.stringify(payload),
      });
      tokenStore.setGuestToken(data.accessToken);
      return data;
    },
    getMenu: () => requestJson<any>('/guest/menu', { authMode: 'guest' }),
    getCart: () => requestJson<any>('/guest/cart', { authMode: 'guest' }),
    addCartItem: (payload: {
      menuItemId: string;
      quantity: number;
      modifierOptionIds?: string[];
      notes?: string;
    }) =>
      requestJson<any>('/guest/cart/items', {
        method: 'POST',
        authMode: 'guest',
        body: JSON.stringify(payload),
      }),
    updateCartItem: (cartItemId: string, payload: { quantity?: number; notes?: string }) =>
      requestJson<any>(`/guest/cart/items/${cartItemId}`, {
        method: 'PATCH',
        authMode: 'guest',
        body: JSON.stringify(payload),
      }),
    removeCartItem: (cartItemId: string) =>
      requestJson<any>(`/guest/cart/items/${cartItemId}`, {
        method: 'DELETE',
        authMode: 'guest',
      }),
    clearCart: () => requestJson<any>('/guest/cart', { method: 'DELETE', authMode: 'guest' }),
    placeOrder: (payload: {
      customerName: string;
      customerPhone: string;
      paymentMethod: 'ONLINE' | 'PAY_AT_RESTAURANT';
      notes?: string;
      idempotencyKey?: string;
      acceptPriceChanges?: boolean;
    }) =>
      requestJson<any>('/guest/orders', {
        method: 'POST',
        authMode: 'guest',
        body: JSON.stringify(payload),
      }),
    listOrders: () => requestJson<any[]>('/guest/orders', { authMode: 'guest' }),
    getOrder: (orderId: string) =>
      requestJson<any>(`/guest/orders/${orderId}`, { authMode: 'guest' }),
    createRazorpayOrder: (orderId: string) =>
      requestJson<any>('/guest/payments/create-order', {
        method: 'POST',
        authMode: 'guest',
        body: JSON.stringify({ orderId }),
      }),
    verifyRazorpayPayment: (payload: {
      orderId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }) =>
      requestJson<any>('/guest/payments/verify', {
        method: 'POST',
        authMode: 'guest',
        body: JSON.stringify(payload),
      }),
  },
};
