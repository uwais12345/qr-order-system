import type {
  CustomizationGroup,
  DiningTable,
  MenuItem,
  Order,
  OrderCheckoutPaymentMethod,
  OrderStatus,
  PaymentStatus,
  PlatformActivity,
  Restaurant,
  SubscriptionPlan,
  SubscriptionPlanConfig,
  SubscriptionStatus,
} from '../domain/types';

export type BackendOrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'REJECTED'
  | 'CANCELLED';

export type BackendPaymentStatus =
  | 'INITIATED'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REFUNDED';

export function mapBackendOrderStatusToUi(status: string): OrderStatus {
  switch (status.toUpperCase()) {
    case 'PENDING':
      return 'Pending';
    case 'ACCEPTED':
      return 'Accepted';
    case 'PREPARING':
      return 'Preparing';
    case 'READY':
      return 'Ready';
    case 'SERVED':
      return 'Served';
    case 'REJECTED':
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return 'Pending';
  }
}

export function mapUiOrderStatusToBackend(status: OrderStatus): BackendOrderStatus {
  switch (status) {
    case 'Pending':
      return 'PENDING';
    case 'Accepted':
      return 'ACCEPTED';
    case 'Preparing':
      return 'PREPARING';
    case 'Ready':
      return 'READY';
    case 'Served':
    case 'Completed':
      return 'SERVED';
    case 'Cancelled':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}

export function mapBackendPaymentsToUiStatus(
  payments?: { status?: string }[]
): PaymentStatus {
  if (!payments || payments.length === 0) return 'Pending';
  if (payments.some((p) => p.status === 'SUCCEEDED')) return 'Paid';
  if (payments.some((p) => p.status === 'REFUNDED')) return 'Refunded';
  return 'Pending';
}

export function mapBackendPaymentMethodToUi(
  payments?: { method?: string }[]
): OrderCheckoutPaymentMethod {
  const first = payments?.[0]?.method;
  return first === 'PAY_AT_RESTAURANT' ? 'Pay at Restaurant' : 'Online Payment';
}

export function mapBackendSubscriptionStatusToUi(status?: string): SubscriptionStatus {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
    case 'TRIAL':
      return 'ACTIVE';
    case 'PAST_DUE':
      return 'EXPIRING SOON';
    case 'CANCELLED':
      return 'SUSPENDED';
    case 'EXPIRED':
    default:
      return 'INACTIVE';
  }
}

export function mapUiSubscriptionStatusToBackend(
  status: SubscriptionStatus
): 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED' {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'EXPIRING SOON':
      return 'PAST_DUE';
    case 'SUSPENDED':
      return 'CANCELLED';
    case 'INACTIVE':
    default:
      return 'EXPIRED';
  }
}

export function mapBackendOrderToUi(dto: any): Order {
  const subtotal = Number(dto.subtotal ?? 0);
  const taxTotal = Number(dto.taxTotal ?? 0);
  const grandTotal = Number(dto.grandTotal ?? 0);
  const taxRatePercent = subtotal > 0 ? Math.round((taxTotal / subtotal) * 10000) / 100 : 5;

  return {
    id: dto.id,
    restaurantId: dto.restaurantId ?? dto.restaurant?.id ?? '',
    branchId: dto.branchId ?? dto.branch?.id ?? '',
    tableId: dto.diningTableId ?? dto.table?.id ?? '',
    tableNumber: dto.table?.tableCode ?? dto.diningTable?.tableCode ?? 'T01',
    customerSessionId: dto.guestSessionId ?? '',
    customerName: dto.customerName ?? undefined,
    customerPhone: dto.customerPhone ?? undefined,
    items: (dto.items ?? []).map((item: any) => ({
      id: item.id,
      menuItemId: item.menuItemId ?? item.id,
      name: item.name ?? item.itemNameSnapshot,
      basePrice: Number(item.unitPrice ?? 0),
      unitPrice: Number(item.unitPrice ?? 0),
      quantity: Number(item.quantity ?? 1),
      isVeg: Boolean(item.isVeg ?? true),
      selectedCustomizations: (item.modifiers ?? []).map((m: any) => ({
        groupId: m.id,
        groupName: m.modifierName ?? m.modifierNameSnapshot ?? 'Option',
        choiceId: m.id,
        choiceLabel: m.optionName ?? m.optionNameSnapshot ?? '',
        priceDelta: Number(m.priceDelta ?? 0),
      })),
      specialInstructions: item.notes ?? '',
    })),
    subtotal,
    taxRatePercent,
    taxAmount: taxTotal,
    totalAmount: grandTotal,
    status: mapBackendOrderStatusToUi(dto.status),
    paymentStatus: mapBackendPaymentsToUiStatus(dto.payments),
    orderPaymentMethod: mapBackendPaymentMethodToUi(dto.payments),
    estimatedPrepMinutes: Number(dto.estimatedPrepMinutes ?? 15),
    createdAt: dto.createdAt ?? new Date().toISOString(),
    updatedAt: dto.updatedAt ?? dto.createdAt ?? new Date().toISOString(),
  };
}

export function mapBackendMenuToUi(
  restaurantId: string,
  catalogDto: any
): {
  categories: string[];
  menuItems: MenuItem[];
  categoryIdByName: Record<string, string>;
} {
  const categories: string[] = [];
  const categoryIdByName: Record<string, string> = {};
  const menuItems: MenuItem[] = [];

  for (const cat of catalogDto?.categories ?? []) {
    categories.push(cat.name);
    categoryIdByName[cat.name] = cat.id;

    for (const item of cat.items ?? []) {
      const customizations: CustomizationGroup[] = (item.modifierGroups ?? []).map((mg: any) => {
        const group = mg.modifierGroup ?? mg;
        return {
          id: group.id,
          name: group.name,
          type: Number(group.maxSelect ?? 1) > 1 ? 'multiple' : 'single',
          required: Boolean(group.isRequired),
          choices: (group.options ?? []).map((opt: any) => ({
            id: opt.id,
            label: opt.name,
            priceDelta: Number(opt.priceDelta ?? 0),
          })),
        };
      });

      menuItems.push({
        id: item.id,
        restaurantId,
        name: item.name,
        description: item.description ?? '',
        imageUrl: item.imageUrl ?? '',
        price: Number(item.price ?? 0),
        category: cat.name,
        isVeg: Boolean(item.isVeg),
        available: item.availabilityStatus === 'AVAILABLE' || item.isOrderable === true,
        prepTimeMinutes: 15,
        customizations,
      });
    }
  }

  return { categories, menuItems, categoryIdByName };
}

export function mapBackendTableToUi(restaurantId: string, dto: any): DiningTable {
  const activeQr = dto.qrTokens?.[0];
  return {
    id: dto.id,
    restaurantId,
    branchId: dto.branchId ?? dto.branch?.id ?? '',
    tableNumber: dto.tableCode,
    section: dto.displayName ?? 'Main Dining',
    capacity: Number(dto.capacity ?? 4),
    status: dto.status === 'ACTIVE' ? 'Available' : 'Reserved',
    qrVersion: 1,
    qrGeneratedAt: activeQr?.createdAt ?? dto.createdAt ?? new Date().toISOString(),
  };
}

export function mapBackendRestaurantToUi(dto: any, existing?: Restaurant): Restaurant {
  const latestSub = dto.currentSubscription ?? dto.subscriptions?.[0];
  const planNameRaw = latestSub?.plan?.name ?? 'Professional';
  const subscriptionPlan: SubscriptionPlan =
    planNameRaw === 'Basic' || planNameRaw === 'Enterprise' ? planNameRaw : 'Professional';

  const initials = (dto.name || 'SR')
    .trim()
    .split(/\s+/)
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const branches = (dto.branches ?? []).map((b: any, idx: number) => ({
    id: b.id,
    restaurantId: dto.id,
    name: b.name,
    address: b.addressLine1 ?? '',
    city: b.city ?? '',
    phone: existing?.phone ?? '',
    isMain: idx === 0,
  }));

  const taxTotalPercent = (dto.taxRules ?? []).reduce(
    (sum: number, tr: any) => (tr.calculationType === 'PERCENTAGE' && tr.isActive ? sum + Number(tr.rate) : sum),
    0
  );

  const ownerMembership = (dto.memberships ?? []).find((m: any) => m.role === 'OWNER');

  return {
    id: dto.id,
    slug: dto.slug,
    name: dto.name,
    logoText: existing?.logoText ?? initials,
    logoColor: existing?.logoColor ?? '#087F5B',
    logoImageUrl: dto.logoUrl ?? existing?.logoImageUrl,
    businessType: existing?.businessType ?? 'Dining Restaurant',
    email: ownerMembership?.user?.email ?? existing?.email ?? '',
    phone: existing?.phone ?? '',
    address: branches[0]?.address ?? existing?.address ?? '',
    city: branches[0]?.city ?? existing?.city ?? '',
    state: existing?.state ?? '',
    country: existing?.country ?? 'India',
    postalCode: existing?.postalCode ?? '',
    ownerName: ownerMembership?.user?.displayName ?? existing?.ownerName ?? 'Owner',
    ownerEmail: ownerMembership?.user?.email ?? existing?.ownerEmail ?? '',
    ownerPhone: existing?.ownerPhone ?? '',
    subscriptionPlan,
    billingCycle: latestSub?.plan?.billingPeriod === 'ANNUAL' ? 'Annual' : 'Monthly',
    subscriptionStartDate: latestSub?.startsAt
      ? new Date(latestSub.startsAt).toISOString().slice(0, 10)
      : existing?.subscriptionStartDate ?? new Date().toISOString().slice(0, 10),
    subscriptionExpiryDate: latestSub?.endsAt
      ? new Date(latestSub.endsAt).toISOString().slice(0, 10)
      : existing?.subscriptionExpiryDate ?? new Date().toISOString().slice(0, 10),
    subscriptionStatus: mapBackendSubscriptionStatusToUi(latestSub?.status),
    subscriptionPaymentStatus: 'Paid',
    monthlyPriceInr: Number(latestSub?.plan?.price ?? existing?.monthlyPriceInr ?? 4499),
    customMonthlyPriceInr: Number(latestSub?.plan?.price ?? existing?.customMonthlyPriceInr ?? 4499),
    customAnnualPriceInr: existing?.customAnnualPriceInr ?? 44990,
    hasCustomPricing: existing?.hasCustomPricing ?? false,
    subscriptionBillingHistory: existing?.subscriptionBillingHistory ?? [],
    status: dto.status === 'ACTIVE' ? 'Active' : 'Inactive',
    registeredAt: dto.createdAt
      ? new Date(dto.createdAt).toISOString().slice(0, 10)
      : existing?.registeredAt ?? new Date().toISOString().slice(0, 10),
    inviteToken: existing?.inviteToken ?? '',
    inviteSetupCompleted: true,
    mustChangePassword: false,
    emailVerified: true,
    branches: branches.length > 0 ? branches : existing?.branches ?? [],
    settings: {
      operatingHours: existing?.settings.operatingHours ?? '11:00 AM – 11:00 PM (Daily)',
      taxRatePercent: taxTotalPercent > 0 ? taxTotalPercent : existing?.settings.taxRatePercent ?? 5,
      taxLabel: existing?.settings.taxLabel ?? 'GST',
      currencySymbol: existing?.settings.currencySymbol ?? '₹',
      currencyCode: existing?.settings.currencyCode ?? 'INR',
      autoAcceptOrders: existing?.settings.autoAcceptOrders ?? false,
      estimatedPrepBufferMin: existing?.settings.estimatedPrepBufferMin ?? 3,
      welcomeMessage: existing?.settings.welcomeMessage ?? `Welcome to ${dto.name}.`,
      payAtRestaurantEnabled: Boolean(dto.payAtRestaurantEnabled),
      customerSettings: existing?.settings.customerSettings ?? {
        guestOrderingEnabled: true,
        customerNameRequirement: 'Mandatory',
        mobileNumberRequirement: 'Mandatory',
        otpVerificationEnabled: false,
        waiterApprovalRequired: false,
      },
    },
  };
}

export function mapBackendPlansToUi(
  planDtos: any[],
  existingCatalog: SubscriptionPlanConfig[]
): {
  planCatalog: SubscriptionPlanConfig[];
  planIdByCode: Record<string, string>;
} {
  const planIdByCode: Record<string, string> = {};
  const byCode = new Map<string, any>();

  for (const dto of planDtos ?? []) {
    if (dto?.code && dto?.id) {
      const code = String(dto.code).toUpperCase();
      planIdByCode[code] = dto.id;
      byCode.set(code, dto);
    }
  }

  const planCatalog = existingCatalog.map((planCfg) => {
    const code = planCfg.name.toUpperCase();
    const remote = byCode.get(code);
    if (!remote) return planCfg;

    const remotePrice = Number(remote.price);
    const featureConfig = (remote.featureConfig ?? {}) as {
      maxTables?: number;
      maxBranches?: number;
    };

    const isAnnual = String(remote.billingPeriod || '').toUpperCase() === 'ANNUAL';
    const monthlyPriceInr =
      Number.isFinite(remotePrice) && remotePrice >= 0
        ? isAnnual
          ? Math.round(remotePrice / 10)
          : remotePrice
        : planCfg.monthlyPriceInr;
    const annualPriceInr =
      Number.isFinite(remotePrice) && remotePrice >= 0
        ? isAnnual
          ? remotePrice
          : remotePrice * 10
        : planCfg.annualPriceInr;

    return {
      ...planCfg,
      monthlyPriceInr,
      annualPriceInr,
      maxBranches:
        typeof featureConfig.maxBranches === 'number'
          ? featureConfig.maxBranches
          : planCfg.maxBranches,
      maxTables:
        typeof featureConfig.maxTables === 'number' ? featureConfig.maxTables : planCfg.maxTables,
    };
  });

  return { planCatalog, planIdByCode };
}

export function mapBackendAuditLogsToUiActivities(auditLogItems: any[]): PlatformActivity[] {
  return (auditLogItems ?? []).map((log: any) => {
    const metadataSummary =
      log?.metadata && typeof log.metadata === 'object'
        ? Object.entries(log.metadata)
            .slice(0, 3)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(' · ')
        : '';

    return {
      id: log.id ?? `audit-${Date.now()}`,
      timestamp: log.createdAt ?? new Date().toISOString(),
      restaurantName: log.restaurant?.name ?? 'ServeQR Platform',
      action: String(log.action ?? 'PLATFORM_EVENT').replace(/_/g, ' '),
      detail:
        metadataSummary ||
        `${log.entityType ?? 'Entity'}${log.actorUser?.email ? ` by ${log.actorUser.email}` : ''}`,
    };
  });
}
