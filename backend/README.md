# ServeQR Backend API

Modular monolith backend for **ServeQR (QR-based Restaurant Ordering & Management SaaS)** built with Node.js, Express, TypeScript, PostgreSQL, Prisma, Socket.IO, and Razorpay.

## Implemented Phases

### Phase 1: Database Foundation & Prisma Setup
- Full multi-tenant PostgreSQL schema ([prisma/schema.prisma](./prisma/schema.prisma)) implementing ServeQR ERD v1.0 (18 relational models, 13 enums, decimal currency precision, immutable order/modifier/tax snapshots, SHA-256 hashed QR tokens).
- Zod-validated environment configuration ([src/config/env.ts](./src/config/env.ts)) and Prisma singleton ([src/config/prisma.ts](./src/config/prisma.ts)).
- Multi-tenant database seed script ([prisma/seed.ts](./prisma/seed.ts)) matching frontend demo tenants and credentials.

### Phase 2: Authentication, Multi-Tenancy & Security Engine
- Structured Pino logging with automatic redaction of credentials/tokens ([src/utils/logger.ts](./src/utils/logger.ts)).
- Centralized error handler and custom exception classes ([src/middlewares/errorHandler.ts](./src/middlewares/errorHandler.ts), [src/utils/errors.ts](./src/utils/errors.ts)).
- Request validation middleware using Zod ([src/middlewares/validateRequest.ts](./src/middlewares/validateRequest.ts)).
- Argon2id password hashing and dual JWT (access + refresh) utilities ([src/utils/password.ts](./src/utils/password.ts), [src/utils/jwt.ts](./src/utils/jwt.ts)).
- Tenant isolation guard (`requireTenant`) & platform role guard (`requirePlatformRole`) enforcing multi-tenant boundaries and subscription status checks ([src/middlewares/tenantGuard.ts](./src/middlewares/tenantGuard.ts), [src/middlewares/roleGuard.ts](./src/middlewares/roleGuard.ts)).
- Auth module & rate-limited endpoints mounted at `/api/v1/auth` (`/login`, `/refresh`, `/me`, `/logout`) plus `/health` probe.

### Phase 3: Super Admin, Restaurant Management, Tables/QR & Menu Catalog
- **Super Admin** (`/api/v1/super-admin`): Platform dashboard metrics, atomic restaurant onboarding (Tenant, Restaurant, Branch, Owner, Subscription, default GST TaxRules, AuditLog), subscription plan catalog, and audit log feed ([src/modules/super-admin/](./src/modules/super-admin/)).
- **Restaurant, Branches & Staff** (`/api/v1/restaurants/:restaurantId`): Profile/branding updates, `payAtRestaurantEnabled` toggle, multi-branch CRUD enforcing plan limits, and Kitchen/Owner staff management ([src/modules/restaurant/](./src/modules/restaurant/)).
- **Dining Tables & Secure QR Tokens** (`/api/v1/restaurants/:restaurantId/tables`): Branch-scoped table CRUD with HMAC-SHA256 hashed QR tokens, one-time raw token issuance, instant token rotation, and revocation ([src/modules/table/](./src/modules/table/), [src/utils/token.ts](./src/utils/token.ts)).
- **Menu Catalog & Tax Rules** (`/api/v1/restaurants/:restaurantId/menu`): Category CRUD with atomic reordering & item reassignment on delete, menu items, Kitchen/Owner availability toggles, modifier groups, and tax rules ([src/modules/menu/](./src/modules/menu/)).

### Phase 4: Customer QR Resolution, Guest Session, Cart & Atomic Checkout
- **Guest Capability Auth & QR Resolution** (`/api/v1/guest/sessions`, `/api/v1/guest/menu`): Validates QR token hashes, rejects revoked/expired QR codes or inactive subscriptions, issues unguessable guest session tokens, and serves branded branch menus ([src/middlewares/guestAuth.ts](./src/middlewares/guestAuth.ts), [src/modules/guest/guestSession.service.ts](./src/modules/guest/guestSession.service.ts)).
- **Server-Side Cart & Decimal Pricing** (`/api/v1/guest/cart`): `decimal.js` financial calculator, modifier group rule validation, variant merging, live price-change & availability warnings ([src/utils/pricing.ts](./src/utils/pricing.ts), [src/modules/guest/cart.service.ts](./src/modules/guest/cart.service.ts)).
- **Atomic Checkout & Order Tracking** (`/api/v1/guest/orders`): `Serializable` transaction with retry handling, Indian mobile validation, `PAY_AT_RESTAURANT` gating, idempotent retries via `idempotencyKey`, immutable `OrderItem`/`OrderItemModifier`/`OrderTaxLine` snapshots, fresh active cart creation for "Order more food", and guest-session-scoped order tracking ([src/modules/guest/checkout.service.ts](./src/modules/guest/checkout.service.ts)).

### Phase 5: Socket.IO Real-Time Gateway & Kitchen Display System (KDS)
- **Strict Order State Machine** ([src/utils/orderStateMachine.ts](./src/utils/orderStateMachine.ts)): Enforces `PENDING → ACCEPTED → PREPARING → READY → SERVED`, `REJECTED` (with reason), and owner-only `CANCELLED` (with reason).
- **Authenticated Socket.IO Gateway** ([src/realtime/](./src/realtime/)): Handshake authentication for Staff JWTs and Guest tokens, server-controlled rooms (`restaurant:<id>:kitchen`, `restaurant:<id>:admin`, `branch:<id>:kitchen`, `guest-session:<id>`, `order:<id>`), and versioned `1.0` event envelopes (`order:created`, `order:status_updated`, `order:estimate_updated`).
- **KDS & Staff Orders API** (`/api/v1/restaurants/:restaurantId/orders`): Live KDS queue filtering (`activeOnly=true`), status progression with `OrderStatusHistory`, and prep-time estimate updates ([src/modules/order/](./src/modules/order/)).

### Phase 6: Razorpay Payments, Idempotent Webhooks & Cashier Settlement
- **Payment Provider Adapter** ([src/modules/payment/paymentProvider.ts](./src/modules/payment/paymentProvider.ts)): `PaymentGatewayAdapter` with `RazorpayGatewayAdapter` and timing-safe HMAC-SHA256 verification.
- **Online Checkout & Raw Webhooks**: `/api/v1/guest/payments` (`create-order`, signature-verified `verify`), and `/api/v1/webhooks/razorpay` mounted with `express.raw` before `express.json` for raw-body signature verification, event deduplication (`PaymentWebhookEvent`), amount checks, and `payment:updated` broadcasts ([src/modules/payment/](./src/modules/payment/)).
- **Cashier Settlement & Verified Revenue** (`/api/v1/restaurants/:restaurantId/payments`): Owner-only offline counter settlement (`settle-offline`) and verified revenue reporting counting strictly `SUCCEEDED` payments (`summary`).

### Phase 7: Production Hardening, Docker, CI/CD & Frontend Integration Readiness
- **Observability & OpenAPI**: Correlation ID access logging ([src/middlewares/requestLogger.ts](./src/middlewares/requestLogger.ts)), `/health`, `/api/v1/health`, `/api/v1/ready` readiness probes, `/api/v1/openapi.json` OpenAPI 3.0.3 contract ([src/docs/openapi.ts](./src/docs/openapi.ts)), and graceful `SIGTERM`/`SIGINT` shutdown ([src/server.ts](./src/server.ts)).
- **SQL Migration & CHECK Constraints**: Baseline PostgreSQL migration with production `CHECK` constraints ([prisma/migrations/20261127000000_init/migration.sql](./prisma/migrations/20261127000000_init/migration.sql)).
- **Containerization & CI/CD**: Multi-stage [Dockerfile](./Dockerfile), root [docker-compose.yml](../docker-compose.yml) (PostgreSQL 16 + Backend + Nginx SPA Frontend), and GitHub Actions [ci.yml](../.github/workflows/ci.yml).
- **Frontend API Client & Dev Proxy**: Typed API client ([../src/services/apiClient.ts](../src/services/apiClient.ts)) with token refresh and guest-token handling, plus Vite proxy in [../vite.config.ts](../vite.config.ts).

## Production Docker Stack

```bash
# From repository root (qr-order-system/)
docker compose up --build -d

# Seed initial demo/platform accounts inside backend container
docker compose exec backend npx prisma db seed
```

## Database Backup & Restore Runbook

```bash
# Create compressed logical backup
docker compose exec -T postgres pg_dump -U postgres -Fc serveqr > serveqr_backup_$(date +%F).dump

# Restore from backup
cat serveqr_backup_YYYY-MM-DD.dump | docker compose exec -T postgres pg_restore -U postgres -d serveqr --clean --if-exists
```

## Local Setup

```bash
cd backend
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## Verification Commands

```bash
# Type check
npx tsc --noEmit

# Run automated test suite
npm test
```
