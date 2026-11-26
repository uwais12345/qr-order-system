import { env } from '../config/env.js';

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ServeQR API',
    version: '1.0.0',
    description:
      'Multi-tenant QR-based Restaurant Ordering, Kitchen Display System (KDS), Subscription SaaS & Razorpay Payment API.',
  },
  servers: [
    {
      url: env.API_PREFIX,
      description: 'Versioned REST API base path',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Staff and Super Admin JWT Access Token',
      },
      GuestTokenAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-guest-token',
        description: 'Unguessable Guest Session capability token issued after QR validation',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Operations'],
        summary: 'Liveness & database connectivity probe',
        responses: {
          '200': { description: 'Service is UP and PostgreSQL connected' },
          '503': { description: 'Database disconnected' },
        },
      },
    },
    '/ready': {
      get: {
        tags: ['Operations'],
        summary: 'Container orchestration readiness probe',
        responses: {
          '200': { description: 'Ready to accept traffic' },
          '503': { description: 'Not ready' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate Super Admin or restaurant staff using Argon2id & JWT',
        responses: { '200': { description: 'Tokens and memberships' }, '401': { description: 'Invalid credentials' } },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate JWT access and refresh tokens',
        responses: { '200': { description: 'Fresh token pair' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        security: [{ BearerAuth: [] }],
        summary: 'Get authenticated user profile and active restaurant memberships',
        responses: { '200': { description: 'Authenticated user profile' } },
      },
    },
    '/super-admin/dashboard': {
      get: {
        tags: ['Super Admin'],
        security: [{ BearerAuth: [] }],
        summary: 'Platform metrics, verified payment revenue, subscription breakdown & recent audit logs',
        responses: { '200': { description: 'Platform metrics' } },
      },
    },
    '/super-admin/restaurants': {
      get: {
        tags: ['Super Admin'],
        security: [{ BearerAuth: [] }],
        summary: 'List all restaurants',
        responses: { '200': { description: 'Restaurants list' } },
      },
      post: {
        tags: ['Super Admin'],
        security: [{ BearerAuth: [] }],
        summary: 'Atomically onboard tenant, restaurant, branch, owner, subscription & default GST rules',
        responses: { '201': { description: 'Restaurant onboarded' } },
      },
    },
    '/super-admin/restaurants/{restaurantId}': {
      get: {
        tags: ['Super Admin'],
        security: [{ BearerAuth: [] }],
        summary: 'Inspect restaurant details',
        responses: { '200': { description: 'Restaurant record' } },
      },
      patch: {
        tags: ['Super Admin'],
        security: [{ BearerAuth: [] }],
        summary: 'Update restaurant profile or ACTIVE/INACTIVE status',
        responses: { '200': { description: 'Restaurant updated' } },
      },
    },
    '/super-admin/restaurants/{restaurantId}/subscriptions': {
      post: {
        tags: ['Super Admin'],
        security: [{ BearerAuth: [] }],
        summary: 'Assign or renew restaurant subscription plan',
        responses: { '201': { description: 'Subscription assigned' } },
      },
    },
    '/super-admin/plans': {
      get: {
        tags: ['Super Admin'],
        security: [{ BearerAuth: [] }],
        summary: 'List subscription plan catalog',
        responses: { '200': { description: 'Plans list' } },
      },
      post: {
        tags: ['Super Admin'],
        security: [{ BearerAuth: [] }],
        summary: 'Create subscription plan',
        responses: { '201': { description: 'Plan created' } },
      },
    },
    '/super-admin/audit-logs': {
      get: {
        tags: ['Super Admin'],
        security: [{ BearerAuth: [] }],
        summary: 'Paginated platform audit log feed',
        responses: { '200': { description: 'Audit logs' } },
      },
    },
    '/restaurants/{restaurantId}': {
      get: {
        tags: ['Restaurant'],
        security: [{ BearerAuth: [] }],
        summary: 'Get tenant-scoped restaurant profile, branding & subscription status',
        responses: { '200': { description: 'Restaurant profile' } },
      },
      patch: {
        tags: ['Restaurant'],
        security: [{ BearerAuth: [] }],
        summary: 'Update restaurant profile, logo & Pay at Restaurant toggle (Owner only)',
        responses: { '200': { description: 'Profile updated' } },
      },
    },
    '/restaurants/{restaurantId}/branches': {
      get: { tags: ['Restaurant'], security: [{ BearerAuth: [] }], summary: 'List branches', responses: { '200': { description: 'Branches' } } },
      post: { tags: ['Restaurant'], security: [{ BearerAuth: [] }], summary: 'Create branch', responses: { '201': { description: 'Branch created' } } },
    },
    '/restaurants/{restaurantId}/staff': {
      get: { tags: ['Restaurant'], security: [{ BearerAuth: [] }], summary: 'List staff memberships', responses: { '200': { description: 'Staff list' } } },
      post: { tags: ['Restaurant'], security: [{ BearerAuth: [] }], summary: 'Add Owner or Kitchen staff user', responses: { '201': { description: 'Staff added' } } },
    },
    '/restaurants/{restaurantId}/tables': {
      get: { tags: ['Tables & QR'], security: [{ BearerAuth: [] }], summary: 'List dining tables and active QR token metadata', responses: { '200': { description: 'Tables' } } },
      post: { tags: ['Tables & QR'], security: [{ BearerAuth: [] }], summary: 'Create dining table and generate one-time raw QR token', responses: { '201': { description: 'Table and QR token created' } } },
    },
    '/restaurants/{restaurantId}/tables/{tableId}': {
      patch: { tags: ['Tables & QR'], security: [{ BearerAuth: [] }], summary: 'Update dining table capacity, section or status', responses: { '200': { description: 'Table updated' } } },
      delete: { tags: ['Tables & QR'], security: [{ BearerAuth: [] }], summary: 'Delete unused dining table without order or guest session history', responses: { '200': { description: 'Table deleted' }, '409': { description: 'Table has historical orders or guest sessions' } } },
    },
    '/restaurants/{restaurantId}/tables/{tableId}/qr-rotate': {
      post: { tags: ['Tables & QR'], security: [{ BearerAuth: [] }], summary: 'Revoke old QR tokens and issue a new hashed QR token', responses: { '200': { description: 'New QR credentials' } } },
    },
    '/restaurants/{restaurantId}/tables/{tableId}/qr-revoke': {
      post: { tags: ['Tables & QR'], security: [{ BearerAuth: [] }], summary: 'Revoke active QR tokens for a table', responses: { '200': { description: 'QR revoked' } } },
    },
    '/restaurants/{restaurantId}/menu': {
      get: { tags: ['Menu & Taxes'], security: [{ BearerAuth: [] }], summary: 'Get full menu categories, items, modifier groups & tax rules', responses: { '200': { description: 'Catalog' } } },
    },
    '/restaurants/{restaurantId}/orders': {
      get: { tags: ['Orders & KDS'], security: [{ BearerAuth: [] }], summary: 'List KDS queue or restaurant order history', responses: { '200': { description: 'Orders' } } },
    },
    '/restaurants/{restaurantId}/orders/{orderId}/status': {
      patch: { tags: ['Orders & KDS'], security: [{ BearerAuth: [] }], summary: 'Transition order status through KDS state machine & emit Socket.IO event', responses: { '200': { description: 'Status updated' } } },
    },
    '/restaurants/{restaurantId}/orders/{orderId}/estimate': {
      patch: { tags: ['Orders & KDS'], security: [{ BearerAuth: [] }], summary: 'Update estimated preparation minutes', responses: { '200': { description: 'Estimate updated' } } },
    },
    '/restaurants/{restaurantId}/payments/summary': {
      get: { tags: ['Payments'], security: [{ BearerAuth: [] }], summary: 'Verified revenue summary (SUCCEEDED payments only)', responses: { '200': { description: 'Revenue summary' } } },
    },
    '/restaurants/{restaurantId}/payments/orders/{orderId}/settle-offline': {
      post: { tags: ['Payments'], security: [{ BearerAuth: [] }], summary: 'Settle Pay at Restaurant / counter order as SUCCEEDED', responses: { '200': { description: 'Payment settled' } } },
    },
    '/guest/sessions': {
      post: { tags: ['Guest Ordering'], summary: 'Resolve scanned table QR token into an anonymous guest session', responses: { '201': { description: 'Guest capability token & restaurant context' } } },
    },
    '/guest/menu': {
      get: { tags: ['Guest Ordering'], security: [{ GuestTokenAuth: [] }], summary: 'Fetch branded digital menu for guest session', responses: { '200': { description: 'Menu catalog' } } },
    },
    '/guest/cart': {
      get: { tags: ['Guest Ordering'], security: [{ GuestTokenAuth: [] }], summary: 'Get server-validated cart with live pricing & GST totals', responses: { '200': { description: 'Cart summary' } } },
      delete: { tags: ['Guest Ordering'], security: [{ GuestTokenAuth: [] }], summary: 'Clear active cart', responses: { '200': { description: 'Cart cleared' } } },
    },
    '/guest/cart/items': {
      post: { tags: ['Guest Ordering'], security: [{ GuestTokenAuth: [] }], summary: 'Add or merge customized dish in active cart', responses: { '201': { description: 'Updated cart' } } },
    },
    '/guest/orders': {
      post: { tags: ['Guest Ordering'], security: [{ GuestTokenAuth: [] }], summary: 'Atomic Serializable checkout creating immutable order, modifier & tax snapshots', responses: { '201': { description: 'Order created' }, '409': { description: 'Menu availability or price changed' } } },
      get: { tags: ['Guest Ordering'], security: [{ GuestTokenAuth: [] }], summary: 'List orders placed by current guest session', responses: { '200': { description: 'Guest orders' } } },
    },
    '/guest/orders/{orderId}': {
      get: { tags: ['Guest Ordering'], security: [{ GuestTokenAuth: [] }], summary: 'Track a single order scoped to current guest session', responses: { '200': { description: 'Order tracking detail' } } },
    },
    '/guest/payments/create-order': {
      post: { tags: ['Payments'], security: [{ GuestTokenAuth: [] }], summary: 'Create or reuse Razorpay gateway order for an unpaid guest order', responses: { '201': { description: 'Razorpay order parameters' } } },
    },
    '/guest/payments/verify': {
      post: { tags: ['Payments'], security: [{ GuestTokenAuth: [] }], summary: 'Cryptographically verify Razorpay payment signature server-side', responses: { '200': { description: 'Payment verified' } } },
    },
    '/webhooks/razorpay': {
      post: { tags: ['Webhooks'], summary: 'Idempotent Razorpay webhook receiver with raw-body HMAC verification', responses: { '200': { description: 'Event processed or deduplicated' } } },
    },
  },
};
