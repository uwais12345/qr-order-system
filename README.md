# QR ORDER SYSTEM (ServeQR)

> **Multi-Restaurant SaaS QR-Based Food Ordering & Restaurant Management Platform**

**QR ORDER SYSTEM** is a mobile-first, multi-tenant QR-based dine-in ordering, Kitchen Display System (KDS), cashier billing, and restaurant SaaS management frontend application built with React, TypeScript, Vite, and Tailwind CSS.

Customers scan a dining table QR code to access a restaurant's digital menu without mandatory registration, customize dishes with add-ons and portions, place orders directly from their smartphone, and track preparation status in real time. Restaurant operators manage digital menus, dining tables, downloadable QR standees, live kitchen tickets, and individual or combined table billing from an integrated workspace. Platform administrators manage onboarding, subscriptions, custom tenant pricing, and platform health from the Super Admin portal.

---

## 1. Core Portals & Workspaces

The application serves three distinct user roles:

| Portal | Route Pattern | Target Users & Capabilities |
| :--- | :--- | :--- |
| **Super Admin Portal** | `/super-admin*` | Platform owner governance: onboarding wizard, subscription management, custom pricing editor, restaurant inspection, and platform revenue metrics. |
| **Restaurant Admin Portal** | `/restaurant*` | Restaurant operators: menu management, dining tables, printable QR standees, Kitchen Display System (KDS), cashier billing, and store settings. |
| **Customer QR Ordering Portal** | `/menu/:slug?table=:tableNumber` | Guests: table QR landing page, live digital menu browsing, search & dietary filters, dish customization sheet, guest checkout, and live order tracking stepper. |

---

## 2. Frontend Technology Stack

- **Framework & Language**: React 19 + TypeScript 5 (`strict: true`)
- **Build Tooling**: Vite 8 with `@vitejs/plugin-react`
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Icons & Animation**: `lucide-react`, `motion` (Framer Motion 12)
- **Charts & Dashboards**: `recharts`
- **QR Generation**: `qrcode` (real-time SVG/PNG client-side generation)
- **State & Storage**: React Context (`ServeQRStore.tsx`) with `localStorage`, `sessionStorage`, and browser `BroadcastChannel`
- **Unit Testing**: Native Node.js test runner (`node:test`) executed via `tsx`
- **Deployment Platform**: Vercel (Single Page Application with Vite preset)

---

## 3. Local Development & Installation

### Prerequisites

- **Node.js**: v20.x or v22.x
- **npm**: v9.x or later

### Installation & Development Commands

```bash
# 1. Clean reproducible dependency installation
npm ci

# 2. Start local development server (runs on http://localhost:3000)
npm run dev

# 3. Type check with strict TypeScript validation
npm run lint

# 4. Run automated domain business logic tests
npx tsx --test src/domain/serveqrLogic.test.ts

# 5. Production build (Vite compilation & route code-splitting)
npm run build

# 6. Preview production build locally
npm run preview
```

---

## 4. Seeded Demo Accounts & Testing URLs

The prototype initializes with pre-configured multi-tenant seed data:

| Role / Restaurant | Demo Login Email | Demo Password | Subscription Plan | Direct Customer QR Route |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@serveqr.io` | `serveqr2026` | Platform Owner | `/` |
| **ABC Restaurant** (`RST-1001`) | `rahul@abcrestaurant.in` | `serveqr2026` | Professional (Active) | `/menu/abc-restaurant?table=T01` |
| **Spice Courtyard** (`RST-1002`) | `ananya@spicecourtyard.in` | `serveqr2026` | Enterprise (Active) | `/menu/spice-courtyard?table=T01` |
| **Malabar Table** (`RST-1003`) | `vikram@malabartable.in` | `serveqr2026` | Basic (First Login Setup) | `/menu/malabar-table?table=T01` |

---

## 5. Deployment on Vercel

The application is fully configured for deployment on **Vercel** as a client-side Single Page Application (SPA).

### Vercel Project Settings

- **Framework Preset**: `Vite`
- **Root Directory**: `./`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm ci`
- **SPA Rewrites**: Defined in `vercel.json` to route deep links (`/menu/:slug?table=T01`, `/super-admin`, `/restaurant/*`) back to `index.html` without 404 errors on browser refresh.

---

## 6. Current Prototype Scope & Limitations

This repository currently hosts the **Phase 11 verified frontend application**. To set clear engineering expectations:

1. **State Persistence**: Application state resides in browser `localStorage` (`serveqr_platform_state_v1`). Wiping browser data or resetting via Super Admin resets to seed state.
2. **Real-time Sync Boundary**: Real-time cross-tab updates operate via browser `BroadcastChannel ('serveqr_realtime_sync')`. This syncs across multiple tabs or windows on the *same machine/browser*, but does not yet sync across physically disparate devices over the internet.
3. **Simulated Payments**: Online payments simulate payment gateway processing (instant confirmation or retry) without communicating with live bank APIs.
4. **Demo Authentication**: User sessions are validated client-side against the seeded tenant store.
5. **No Backend or Database**: There is no live relational database or server-side API connected in this phase.

---

## 7. Future Backend Stack Roadmap (Phase 12+)

Future engineering phases will integrate a robust backend architecture:

- **Database**: PostgreSQL with Prisma ORM / Drizzle ORM (multi-tenant relational schemas for restaurants, branches, menus, orders, bills, and subscriptions).
- **Backend Service**: Node.js / Express or NestJS REST/GraphQL API.
- **Authentication**: JWT access tokens, HTTP-only refresh cookies, and bcrypt password hashing.
- **Real-Time Cross-Device Sync**: WebSockets (Socket.io) or Server-Sent Events (SSE) for live Kitchen Display System (KDS) order routing across physical devices.
- **Payment Processing**: Live Razorpay / Stripe webhook integration with server-side signature verification.
- **Cloud Storage**: Amazon S3 / Cloudinary for restaurant logo and dish image uploads.
- **SMS / WhatsApp Gateway**: Twilio or Gupshup for customer order notification dispatch.
