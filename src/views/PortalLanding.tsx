import React from 'react';
import { ArrowRight, QrCode, ShieldCheck, Store, UtensilsCrossed } from 'lucide-react';
import { ServeQRLogo } from '../components/ServeQRLogo';
import { QrCodeDisplay } from '../components/QrCodeDisplay';
import { buildTableQrPath, buildTableQrUrl } from '../domain/serveqrLogic';
import { useServeQR } from '../store/ServeQRStore';

interface PortalLandingProps {
  onNavigate: (path: string) => void;
}

export const PortalLanding: React.FC<PortalLandingProps> = ({ onNavigate }) => {
  const { state } = useServeQR();
  const abcRestaurant =
    state.restaurants.find((r) => r.slug === 'abc-restaurant') ?? state.restaurants[0];
  const abcTables = state.tables.filter((t) => t.restaurantId === abcRestaurant?.id);
  const t01 = abcTables.find((t) => t.tableNumber === 'T01') ?? abcTables[0];

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://serveqr.demo';
  const qrPath = abcRestaurant && t01
    ? buildTableQrPath(abcRestaurant.slug, t01.tableNumber, t01.branchId, t01.qrVersion)
    : '/menu/abc-restaurant?table=T01';
  const qrUrl = abcRestaurant && t01
    ? buildTableQrUrl(origin, abcRestaurant.slug, t01.tableNumber, t01.branchId, t01.qrVersion)
    : `${origin}/menu/abc-restaurant?table=T01`;

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#202938] flex flex-col">
      {/* Three-zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F5B] rounded-lg"
            aria-label="ServeQR Home"
          >
            <ServeQRLogo size="md" />
          </button>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => onNavigate('/super-admin/login')}
              className="hover:text-[#172B4D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Super Admin
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/restaurant/login')}
              className="hover:text-[#172B4D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Restaurant Portal
            </button>
            <button
              type="button"
              onClick={() => onNavigate(qrPath)}
              className="hover:text-[#172B4D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Guest QR Menu
            </button>
            <a
              href="#workflow"
              className="hover:text-[#172B4D] transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('/restaurant/login')}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F5B] focus-visible:ring-offset-2"
            >
              Open Workspace
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Split */}
        <section className="max-w-7xl mx-auto px-6 pt-12 pb-14 lg:pt-16 lg:pb-18">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <p className="text-sm font-semibold text-[#087F5B] mb-3">
                Scan. Order. Enjoy.
              </p>
              <h1
                className="font-display font-bold text-[#172B4D] text-4xl sm:text-5xl tracking-tight leading-[1.12] max-w-2xl"
                style={{ textWrap: 'balance' }}
              >
                Multi-restaurant QR dining, kitchen display, and billing in one workspace.
              </h1>
              <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-xl">
                ServeQR digitizes dine-in service from platform onboarding to table-side settlement.
                Guests scan their table QR code without creating an account, orders flow straight to
                the Kitchen Display, and cashiers settle individual or combined table bills.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => onNavigate('/super-admin/login')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#172B4D] hover:bg-[#10203A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Super Admin Console
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/restaurant/login')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Restaurant Owner Login
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(qrPath)}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[#172B4D] bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Launch Table T01 QR
                </button>
              </div>
            </div>

            {/* Live Scannable QR Preview Card */}
            <div className="lg:col-span-5 flex">
              <div className="w-full bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-100">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Live Table QR Demo</p>
                      <h2 className="text-lg font-bold text-[#172B4D] mt-0.5">
                        {abcRestaurant?.name ?? 'ABC Restaurant'}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {abcRestaurant?.branches[0]?.name ?? 'Main Branch – Bengaluru'} · Table{' '}
                        {t01?.tableNumber ?? 'T01'}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-semibold text-[#087F5B] tabular-nums">
                      {t01?.tableNumber ?? 'T01'}
                    </span>
                  </div>

                  <div className="py-6 flex flex-col items-center">
                    <QrCodeDisplay
                      value={qrUrl}
                      size={184}
                      alt="Scannable QR code for ABC Restaurant Table T01"
                    />
                    <p className="mt-4 text-xs text-slate-500 font-mono text-center truncate max-w-full px-2">
                      {qrPath}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    {abcTables.slice(0, 5).map((table) => (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() =>
                          onNavigate(
                            buildTableQrPath(
                              abcRestaurant.slug,
                              table.tableNumber,
                              table.branchId,
                              table.qrVersion
                            )
                          )
                        }
                        className="px-2.5 py-1.5 text-xs font-mono font-medium text-[#172B4D] bg-slate-100 hover:bg-[#087F5B] hover:text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {table.tableNumber}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate(qrPath)}
                    className="text-sm font-semibold text-[#087F5B] hover:text-[#06674A] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Test QR
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Three Primary Actors */}
        <section className="max-w-7xl mx-auto px-6 pb-16">
          <div className="border-t border-slate-200 pt-12">
            <h2 className="font-display text-2xl font-bold text-[#172B4D]">
              Three focused workspaces, strict tenant isolation
            </h2>
            <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
              Every role operates inside its own boundary with synchronized live order data across
              table ordering, kitchen preparation, and billing.
            </p>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              <article className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-[#172B4D]/8 text-[#172B4D] flex items-center justify-center mb-4">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-[#172B4D]">
                    1. Super Admin
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Onboard restaurants in a 4-step workflow, assign subscription plans, monitor
                    platform revenue and orders, and inspect workspaces without altering live
                    operations.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500">admin@serveqr.io</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('/super-admin/login')}
                    className="text-sm font-semibold text-[#087F5B] hover:text-[#06674A] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    Sign in <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </article>

              <article className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-[#087F5B]/10 text-[#087F5B] flex items-center justify-center mb-4">
                    <Store className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-[#172B4D]">
                    2. Restaurant Owner
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Manage menu categories, pricing and customizations, floor tables, scannable QR
                    codes, live Kitchen Display System (KDS), cashier billing, and analytics.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500">rahul@abcrestaurant.in</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('/restaurant/login')}
                    className="text-sm font-semibold text-[#087F5B] hover:text-[#06674A] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    Sign in <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </article>

              <article className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-lg bg-[#087F5B]/10 text-[#087F5B] flex items-center justify-center mb-4">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-[#172B4D]">
                    3. Dine-In Customer
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Scan any table QR code to open the restaurant menu immediately—zero registration.
                    Multiple guests at the same table place independent orders and track live kitchen
                    progress.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500">Table T01 · Guest Session</span>
                  <button
                    type="button"
                    onClick={() => onNavigate(qrPath)}
                    className="text-sm font-semibold text-[#087F5B] hover:text-[#06674A] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    Open Menu <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* End-to-End Flow Summary */}
        <section id="workflow" className="bg-white border-t border-slate-200 py-14">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="font-display text-xl font-bold text-[#172B4D]">
              End-to-end dining workflow
            </h2>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {[
                {
                  step: '01. Platform Setup',
                  desc: 'Super Admin registers restaurant, assigns plan, and provisions isolated workspace.',
                },
                {
                  step: '02. Menu & QR Setup',
                  desc: 'Owner adds dishes, configures dining tables, and prints unique table QR codes.',
                },
                {
                  step: '03. Guest Ordering',
                  desc: 'Diners scan table QR, customize dishes, and order without creating an account.',
                },
                {
                  step: '04. Kitchen Display',
                  desc: 'Tickets appear live on KDS; staff advance status from Accepted to Served.',
                },
                {
                  step: '05. Flexible Billing',
                  desc: 'Cashier settles individual guest bills or combined table bills with receipts.',
                },
              ].map((item) => (
                <div key={item.step} className="pt-4 border-t border-slate-200">
                  <p className="font-display text-sm font-bold text-[#172B4D]">{item.step}</p>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#F7F9FC] border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-3.5 h-3.5 text-[#087F5B]" />
            <span>ServeQR · QR-Based Restaurant Ordering &amp; Management Platform</span>
          </div>
          <span>Interactive multi-tenant prototype · Shared local session sync</span>
        </div>
      </footer>
    </div>
  );
};
