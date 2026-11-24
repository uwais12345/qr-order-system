import { PlatformRole, RestaurantRole, SubscriptionStatus } from '@prisma/client';

export interface AuthUserMembership {
  id: string;
  restaurantId: string;
  role: RestaurantRole;
  status: string;
  restaurant: {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    status: string;
    subscriptions: {
      id: string;
      status: SubscriptionStatus;
      endsAt: Date | null;
    }[];
  };
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
  memberships: AuthUserMembership[];
}

export interface TenantContext {
  tenantId: string;
  restaurantId: string;
  branchId?: string;
  userRole: RestaurantRole | 'SUPER_ADMIN';
  subscriptionStatus: SubscriptionStatus;
  isSubscriptionActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantContext?: TenantContext;
    }
  }
}
