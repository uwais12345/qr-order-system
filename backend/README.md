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
