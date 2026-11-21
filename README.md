# ServeQR — Multi-Tenant QR Restaurant Ordering & Management Platform

**ServeQR** is a mobile-first, multi-tenant QR-based dine-in ordering, Kitchen Display System (KDS), cashier billing, and restaurant SaaS management platform built with React, TypeScript, Vite, and Tailwind CSS.

Customers scan a dining table QR code to access a restaurant's live digital menu with zero mandatory login, customize dishes, place orders directly from their phone, and track preparation in real time. Restaurant teams manage menus, tables, QR codes, live kitchen queues, and individual/combined table billing from one workspace, while the platform owner governs all tenants and subscriptions via the Super Admin console.

---

## Table of Contents

1. [Core Objectives & Actors](#1-core-objectives--actors)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Application Routing Map](#4-application-routing-map)
5. [End-to-End System Flows](#5-end-to-end-system-flows)
   - [Platform-Wide Actor Flow](#51-platform-wide-actor-flow)
   - [Super Admin Onboarding & Subscription Flow](#52-super-admin-onboarding--subscription-flow)
   - [Customer Mobile QR Ordering & Customization Flow](#53-customer-mobile-qr-ordering--customization-flow)
   - [Order Lifecycle & Kitchen Display (KDS) Flow](#54-order-lifecycle--kitchen-display-kds-flow)
   - [Multi-Guest Individual & Combined Table Billing Flow](#55-multi-guest-individual--combined-table-billing-flow)
6. [Domain Architecture & State Management](#6-domain-architecture--state-management)
7. [Seeded Demo Tenants & Test Routes](#7-seeded-demo-tenants--test-routes)
8. [Design System & Mobile Responsiveness](#8-design-system--mobile-responsiveness)
9. [Local Development, Build & Testing](#9-local-development-build--testing)

---

## 1. Core Objectives & Actors

ServeQR strictly models **three primary actors**:

| Actor | Primary Workspace | Core Responsibilities |
|---|---|---|
| **Super Admin** | `/super-admin*` | Onboard new restaurants, manage tenant status (`Active`, `Inactive`, `Setup Pending`, `Suspended`), configure plan catalog & per-tenant custom subscription pricing, inspect individual restaurants, and review platform-wide revenue/MRR analytics. |
| **Restaurant Owner / Admin** | `/restaurant*` | Manage restaurant branding & branches, configure digital menu items & customization groups, manage dining tables & downloadable QR codes, process live orders, run the Kitchen Display System (KDS), generate individual/combined bills, manage subscription invoices, and configure checkout/payment rules. |
| **Customer (Guest User)** | `/menu/:slug?table=T01` | Scan table QR code, verify table assignment on the centered QR landing card, browse & filter the live menu without mandatory account signup, customize portions/add-ons in a mobile bottom sheet, check out via Online Payment (or Pay at Restaurant if enabled), and track live kitchen progress. |

---

## 2. Tech Stack

- **Frontend Framework**: React 19 + TypeScript 7 (`strict` type checking)
- **Build Tool**: Vite 8 (`@vitejs/plugin-react`)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Icons & Motion**: `lucide-react`, `motion`
- **Charts & Analytics**: `recharts`
- **QR Code Generation**: `qrcode` (real scannable PNG/SVG QR generation & download)
- **State Persistence & Cross-Tab Real-Time Sync**: React Context + `localStorage` + browser `BroadcastChannel` (`serveqr_realtime_sync`)
- **Unit Testing**: Node native test runner (`node:test`) executed with `tsx`

---

## 3. Project Structure

```text
.
├── index.html                                 # HTML entry point, SEO/OG metadata, Google Fonts (Plus Jakarta Sans, DM Sans, JetBrains Mono)
├── metadata.json                              # Platform metadata & capabilities
├── package.json                               # Dependencies and npm scripts
├── tsconfig.json                              # TypeScript compiler configuration
├── vite.config.ts                             # Vite + Tailwind v4 plugin configuration
├── public/
│   └── favicon.ico                            # Application favicon
└── src/
    ├── main.tsx                               # React DOM root mount
    ├── index.css                              # Global Tailwind v4 import & design typography rules
    ├── App.tsx                                # Top-level provider & client-side router (/ , /super-admin*, /restaurant*, /menu/:slug)
    │
    ├── assets/
    │   └── images/                            # Curated local food photography assets
    │       ├── food_biryani_1795189256809.jpg
    │       ├── food_grill_chicken_1795189277987.jpg
    │       ├── food_gulab_jamun_1795189257008.jpg
    │       ├── food_mojito_lime_1795189256773.jpg
    │       ├── food_paneer_starter_1795189256999.jpg
    │       └── food_veg_thali_1795189293784.jpg
    │
    ├── components/                            # Shared UI primitives
    │   ├── FoodImage.tsx                      # Resilient dish image renderer with graceful fallback
    │   ├── QrCodeDisplay.tsx                  # Live scannable QR code canvas/image renderer & download helper
    │   ├── RestaurantBrandAvatar.tsx          # Uploaded logo or monogram fallback avatar
    │   ├── ServeQRLogo.tsx                    # Brand mark & wordmark component
    │   └── StatusText.tsx                     # Accessible semantic status indicators
    │
    ├── domain/                                # Pure business logic, types, seed state & unit tests (UI-agnostic)
    │   ├── types.ts                           # All domain TypeScript interfaces (Restaurant, Branch, MenuItem, CustomizationGroup, DiningTable, Order, Bill, etc.)
    │   ├── serveqrLogic.ts                    # Pure functions: QR route parsing, customization pricing/validation, cart upsert, order/bill totals, state machine transitions, tenant scoping, subscription validity, metrics & form validators
    │   ├── seedData.ts                        # Initial multi-tenant seed data (3 restaurants, branches, menus, tables, sample orders & bills)
    │   └── serveqrLogic.test.ts               # Unit test suite covering pure business logic via node:test
    │
    ├── store/
    │   └── ServeQRStore.tsx                   # Central React Context state store, auth sessions, guest cart persistence & BroadcastChannel live sync
    │
    └── views/
        ├── PortalLanding.tsx                  # Public landing page with quick entry to Super Admin, Restaurant Admin & live QR demo links
        ├── AuthLoginView.tsx                  # Shared role-aware login screen (Super Admin & Restaurant Owner) with validation & password reset modal
        │
        ├── customer/                          # Mobile-first Customer QR Ordering Portal
        │   ├── CustomerOrderApp.tsx           # Centered QR landing card, menu browser, search/veg/category filters, cart, checkout & live order tracker
        │   ├── FoodCustomizationSheet.tsx     # Swiggy-inspired mobile bottom sheet (portions, single/multi customization groups, add-ons, special instructions, live pricing, edit-from-cart)
        │   └── DemoPaymentModal.tsx           # Interactive UPI / Card / NetBanking online payment simulation modal
        │
        ├── restaurant/                        # Multi-tenant Restaurant Owner Workspace
        │   ├── RestaurantOwnerModule.tsx      # Auth guard, mandatory first-login password setup gate & section router
        │   ├── RestaurantLayout.tsx           # Responsive sidebar/topbar layout with live active-order badge
        │   ├── RestaurantDashboard.tsx        # KPIs, live order queue snapshot & quick operational shortcuts
        │   ├── MenuManagementView.tsx         # Category management, item CRUD, availability toggles & customization group builder
        │   ├── TableManagementView.tsx        # Branch-scoped dining tables, seat capacity, status control (Available/Occupied/Reserved)
        │   ├── QrManagementView.tsx           # Per-table QR preview, QR version regeneration, PNG download, printable cards & direct QR launch
        │   ├── OrdersView.tsx                 # Live order management, status transitions, cancellation & customer details
        │   ├── KitchenDisplayView.tsx         # Dedicated Kitchen Display System (KDS) grouped by stage with prep timers & one-tap advancement
        │   ├── BillingCashierView.tsx         # Individual & combined multi-guest table billing, discounts, GST calculation, payment settlement & printable receipts
        │   ├── RestaurantSubscriptionView.tsx # Active subscription plan status, validity countdown & billing invoice history
        │   └── ReportsAndSettingsViews.tsx    # Sales/item/table/payment reports + restaurant profile, logo upload, tax, operating hours & checkout/OTP settings
        │
        └── super-admin/                       # Platform Owner Governance Console
            ├── SuperAdminModule.tsx           # Auth guard, section router & restaurant onboarding wizard modal
            ├── SuperAdminLayout.tsx           # Platform navigation shell & breadcrumbs
            ├── SuperAdminDashboard.tsx        # Platform KPIs (restaurants, active/inactive, orders, GMV, MRR) & recent activity feed
            ├── RestaurantsView.tsx            # Searchable/filterable tenant directory & status actions
            ├── AddRestaurantWizard.tsx        # Multi-step onboarding wizard (Business Details -> Owner Info -> Plan & Custom Pricing -> Provisioning)
            ├── RestaurantInspectionView.tsx   # Deep-dive tenant view: branches, live orders, billing override, custom pricing & status governance
            └── SubscriptionsAndReports.tsx    # Standard plan catalog pricing editor (without mutating existing custom tenant rates), platform reports & global settings
```

---

## 4. Application Routing Map

Routing is handled cleanly in `src/App.tsx` via the History API (`pushState` / `popstate`) paired with `parseTableQrRoute` in `src/domain/serveqrLogic.ts`:

| Route Pattern | Actor / Module | Behavior |
|---|---|---|
| `/` | `PortalLanding` | Entry portal with role navigation and instant QR table preview links. |
| `/super-admin` & `/super-admin/*` | `SuperAdminModule` | Requires Super Admin login; switches across Dashboard, Restaurants, Restaurant Inspection, Subscriptions, Platform Reports, and Settings. |
| `/restaurant` & `/restaurant/*` | `RestaurantOwnerModule` | Requires Restaurant Owner login; enforces first-login password setup when `mustChangePassword === true`; routes across Dashboard, Menu, Tables, QR Codes, Orders, KDS, Billing, Reports, Subscription, and Settings. |
| `/menu/:slug?table=T01` | `CustomerOrderApp` | Guest-accessible QR ordering route. Supports optional query params: `branch=<branchId>`, `v=<qrVersion>`, and `autostart=1` (skips landing card directly into menu). |

---

## 5. End-to-End System Flows

### 5.1 Platform-Wide Actor Flow

```text
┌─────────────────────────────┐
│         SUPER ADMIN         │
│  /super-admin               │
│  • Onboard restaurant       │
│  • Set plan & custom rate   │
│  • Govern active/suspended  │
└──────────────┬──────────────┘
               │ Provisions tenant (RST-xxxx), main branch & invite token
               ▼
┌─────────────────────────────┐
│      RESTAURANT OWNER       │
│  /restaurant                │
│  • First-login password set │
│  • Configure branding & tax │
│  • Build menu & add-ons     │
│  • Create tables & print QR │
└──────────────┬──────────────┘
               │ Generates scannable URL: /menu/{slug}?table={Txx}&branch={BR}
               ▼
┌─────────────────────────────┐
│      CUSTOMER (GUEST)       │
│  /menu/:slug?table=T01      │
│  • Verify table on QR card  │
│  • Customize dish in sheet  │
│  • Checkout (Online / POS)  │
└──────────────┬──────────────┘
               │ Syncs instantly via ServeQRStore + BroadcastChannel
               ▼
┌─────────────────────────────┐         ┌─────────────────────────────┐
│    KITCHEN DISPLAY (KDS)    │────────▶│   BILLING & CASHIER POS     │
│  • Accept -> Preparing      │         │  • Individual or Combined   │
│  • Ready -> Served          │         │  • Discount + GST + Receipt │
│  • Live status to customer  │         │  • Release table to Free    │
└─────────────────────────────┘         └─────────────────────────────┘
```

### 5.2 Super Admin Onboarding & Subscription Flow

1. **Multi-Step Restaurant Onboarding (`AddRestaurantWizard`)**:
   - **Step 1 — Business Details**: Restaurant name (auto-slugified), category, business email, contact phone, full address, and optional brand logo.
   - **Step 2 — Owner Account**: Owner name, email, and phone. Generates `RST-xxxx`, default branch `BR-xxxx-1`, and an onboarding invite token (`INV-RST-...`).
   - **Step 3 — Subscription & Pricing**: Select `Basic` (₹1,999/mo), `Professional` (₹4,499/mo), or `Enterprise` (₹8,999/mo), billing cycle (`Monthly` / `Annual`), optional negotiated custom pricing, and validity dates.
2. **Catalog vs. Tenant Pricing Isolation**:
   - Updating standard catalog rates in **Subscriptions** uses `updateCatalogPlanPriceWithoutMutatingTenants()`, ensuring existing tenants with locked or custom negotiated contracts retain their agreed rates.
3. **Subscription Validity Enforcement**:
   - `computeSubscriptionValidity()` evaluates `subscriptionStatus` and `subscriptionExpiryDate`:
     - Within 14 days of expiry → effective status becomes `EXPIRING SOON` (ordering still allowed).
     - Past expiry → effective status becomes `INACTIVE`.
     - If `status` is `Inactive`/`Suspended` or subscription is `INACTIVE`/`SUSPENDED`, `isRestaurantOrderingAvailable()` blocks customer checkout cleanly on the QR portal.

### 5.3 Customer Mobile QR Ordering & Customization Flow

```text
Scan Table QR (/menu/:slug?table=T01)
   │
   ▼
[1] Centered Mobile QR Landing Card
    • Restaurant logo, name & branch location
    • Verified Dining Table badge (e.g. Table T01 · Main Hall)
    • Short welcome text + full-width "View Menu" CTA
    • "No login required · Instant kitchen sync" + ServeQR footer
   │
   ▼ Tap "View Menu"
[2] Live Digital Menu Browser
    • Search bar, Veg-only toggle & category pills
    • Real-time item availability synced from Restaurant Admin
   │
   ├── Item has NO customizations ──▶ Quick "+ Add" (or simplified sheet)
   │
   └── Item HAS customizations ─────▶ [3] Swiggy-Inspired Customization Bottom Sheet
                                           • Dish photo, name, description & base price
                                           • Mandatory single-select groups (e.g. Portion Size)
                                           • Optional single/multi-select groups (Spice, Add-ons)
                                           • Quantity stepper & Special Instructions input
                                           • Real-time validation & dynamic total price bar
                                           • "Add to Cart" / "Update Item" (when editing from cart)
   │
   ▼
[4] Table Cart & Guest Checkout
    • Edit existing item customizations directly from cart
    • Deduplicates identical item + customization + note signatures via upsertCustomizedCartItem()
    • Guest details validated via validateCustomerCheckout() (name, 10-digit Indian mobile, optional OTP)
    • Payment method resolved via getAvailableCustomerPaymentMethods(payAtRestaurantEnabled):
        - Online Payment (default) ──▶ DemoPaymentModal (UPI / Card / NetBanking) ──▶ Paid
        - Pay at Restaurant (if enabled by restaurant) ──▶ Pending POS settlement
   │
   ▼
[5] Live Order Tracker
    • Step-by-step progress bar: Pending -> Accepted -> Preparing -> Ready -> Served
    • Updates live across tabs as kitchen staff advance the order
    • Supports placing additional rounds or starting a fresh guest session on the same table
```

### 5.4 Order Lifecycle & Kitchen Display (KDS) Flow

Order transitions are strictly validated by `canTransitionOrderStatus()` and `ORDER_STATUS_SEQUENCE`:

```text
Pending ──▶ Accepted ──▶ Preparing ──▶ Ready ──▶ Served ──▶ Completed
   │            │
   └──▶ Cancelled ◀──┘   (Cancellation allowed only before preparation begins)
```

- **Auto-Accept Option**: If `settings.autoAcceptOrders` is enabled, newly placed orders enter directly at `Accepted`.
- **KDS View**: Displays active tickets with table number, guest name, itemized customizations, special cooking instructions, elapsed time, and one-click next-stage progression.
- **Customer Sync**: Every status change immediately broadcasts over `BroadcastChannel` (`serveqr_realtime_sync`), updating the customer's mobile tracking stepper in real time.

### 5.5 Multi-Guest Individual & Combined Table Billing Flow

Multiple customers seated at the same table (each assigned a unique `customerSessionId`) can place independent orders from their own phones:

- **Individual Billing Mode**: Cashier selects a single guest's order(s) at Table `T01`, applies optional percentage discount + configured GST (`calculateBillTotals`), records payment (`Online Payment`, `UPI`, `Card`, or `Cash`), and issues receipt `RCPT-xxxxx`.
- **Combined Table Billing Mode**: Cashier merges all open orders across multiple guest sessions at the same table into one consolidated `BILL-xxxx` and receipt, handling `Pending`, `Partially Paid`, and `Paid` states via `resolvePaymentStatus()`.
- **Table Release**: Once all table orders are settled, the table can be marked `Available` for the next dining party.

---

## 6. Domain Architecture & State Management

ServeQR separates **pure business logic** (`src/domain/serveqrLogic.ts`) from **React UI state** (`src/store/ServeQRStore.tsx`):

- **Multi-Tenant Isolation Helpers**: Every restaurant workspace view filters data strictly through `scopeMenuItemsByRestaurant`, `scopeTablesByRestaurant`, `scopeOrdersByRestaurant`, and `scopeBillsByRestaurant`.
- **Browser Persistence Keys** (`src/store/ServeQRStore.tsx`):
  - `serveqr_platform_state_v1` — Complete `ServeQRState` (plan catalog, restaurants, categories, menu items, tables, orders, bills, activity log, sequence counters).
  - `serveqr_auth_session_v1` — Active Super Admin and Restaurant Owner login sessions.
  - `serveqr_guest_session_id` — Per-device guest session identifier for multi-guest table ordering.
  - `serveqr_guest_carts_v1` — Per-restaurant, per-table customer shopping carts.
- **Cross-Tab Real-Time Sync**: Mutations publish updates on `BroadcastChannel('serveqr_realtime_sync')` and listen to browser `storage` events so opening the Customer QR menu in one tab and the Restaurant KDS/Orders screen in another tab stays synchronized instantaneously.

---

## 7. Seeded Demo Tenants & Test Routes

Out of the box (`src/domain/seedData.ts`), ServeQR seeds three restaurants covering different plans, payment configurations, and onboarding states:

| Role / Restaurant | Email | Password (any ≥6 chars) | Plan & State | Direct Customer QR URL |
|---|---|---|---|---|
| **Super Admin** | `admin@serveqr.io` | `serveqr2026` | Platform Governance | — |
| **ABC Restaurant** (`RST-1001`) | `rahul@abcrestaurant.in` | `serveqr2026` | Professional · Annual · Active · Online Payment only | `/menu/abc-restaurant?table=T01` |
| **Spice Courtyard** (`RST-1002`) | `ananya@spicecourtyard.in` | `serveqr2026` | Enterprise · Custom Annual Rate · Active · Online + Pay at Restaurant | `/menu/spice-courtyard?table=T01` |
| **Malabar Table** (`RST-1003`) | `vikram@malabartable.in` | `serveqr2026` | Basic · Monthly · Expiring Soon · `mustChangePassword` first-login gate | `/menu/malabar-table?table=T01` |

---

## 8. Design System & Mobile Responsiveness

- **Brand Palette**:
  - Primary Navy: `#172B4D` (headers, brand authority, navigation)
  - Action Green: `#087F5B` (primary CTAs, verified table badges, confirmations)
  - Canvas Surface: `#F7F9FC` (clean high-contrast light background)
  - Card Surface: `#FFFFFF` with subtle `#E2E8F0` borders
- **Typography**: `Plus Jakarta Sans` (display headings), `DM Sans` (body copy), `JetBrains Mono` (table numbers, order IDs, prices, receipts).
- **Responsive QR Landing Page**:
  - Uses `min-h-[100svh]`, safe-area inset padding (`env(safe-area-inset-*)`), responsive `clamp()` margins, and `my-auto` flex centering with fluid `w-full max-w-[388px]` card width.
  - Verified across smartphone viewports (`320×568`, `360×640`, `375×667`, `390×844`, `430×932`, `360×740`) for exact horizontal/vertical centering and natural top-safe scrolling on short landscape screens (`568×280`).

---

## 9. Local Development, Build & Testing

### Prerequisites
- Node.js 20+ and npm

### Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Start the development server on http://localhost:3000
npm run dev
```

### Type Check & Production Build

```bash
# TypeScript type validation (tsc --noEmit)
npm run lint

# Production bundle build (outputs to dist/)
npm run build

# Preview production bundle locally
npm run preview
```

### Domain Unit Tests

Pure business rules (QR route parsing, customization pricing/validation, cart deduplication & editing, order status state machine, combined table billing, subscription validity, tenant scoping, and form validation) are unit-tested in `src/domain/serveqrLogic.test.ts`:

```bash
npx tsx --test src/domain/serveqrLogic.test.ts
```

### Environment Variables

See `.env.example` for optional runtime configuration variables (`APP_URL`, `GEMINI_API_KEY`). No external database or API keys are required to run the full ServeQR prototype locally.
