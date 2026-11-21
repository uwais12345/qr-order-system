import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ChefHat,
  ClipboardList,
  CreditCard,
  Grid2x2,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Receipt,
  Settings,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { RestaurantBrandAvatar } from '../../components/RestaurantBrandAvatar';
import { ServeQRLogo } from '../../components/ServeQRLogo';
import { StatusLabel } from '../../components/StatusText';
import {
  computeSubscriptionValidity,
  isRestaurantOrderingAvailable,
} from '../../domain/serveqrLogic';
import type { Restaurant } from '../../domain/types';

export type RestaurantSection =
  | 'dashboard'
  | 'menu'
  | 'tables'
  | 'qr'
  | 'orders'
  | 'kds'
  | 'billing'
  | 'reports'
  | 'subscription'
  | 'settings';

interface RestaurantLayoutProps {
  restaurant: Restaurant;
  activeSection: RestaurantSection;
  pendingOrdersCount: number;
  onSelectSection: (section: RestaurantSection) => void;
  onLogout: () => void;
  onGoHome: () => void;
  children: React.ReactNode;
}

const OWNER_NAV: Array<{
  id: RestaurantSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'menu', label: 'Menu Management', icon: UtensilsCrossed },
  { id: 'tables', label: 'Table Management', icon: Grid2x2 },
  { id: 'qr', label: 'QR Management', icon: QrCode },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'kds', label: 'Kitchen Display', icon: ChefHat },
  { id: 'billing', label: 'Billing & Cashier', icon: Receipt },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'subscription', label: 'My Plan', icon: CreditCard },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const RestaurantLayout: React.FC<RestaurantLayoutProps> = ({
  restaurant,
  activeSection,
  pendingOrdersCount,
  onSelectSection,
  onLogout,
  onGoHome,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeNavLabel =
    OWNER_NAV.find((n) => n.id === activeSection)?.label ?? 'Dashboard';

  const validity = computeSubscriptionValidity(
    restaurant.subscriptionStatus,
    restaurant.subscriptionExpiryDate
  );
  const orderingActive = isRestaurantOrderingAvailable(restaurant);

  const renderSidebar = () => (
    <div className="flex flex-col h-full">
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
        <button
          type="button"
          onClick={onGoHome}
          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-md"
          aria-label="ServeQR Home"
        >
          <ServeQRLogo variant="light" size="sm" />
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-slate-300 hover:text-white cursor-pointer"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Restaurant Brand Indicator with Uploaded Logo */}
      <div className="px-5 py-3.5 border-b border-white/10 flex items-center gap-3">
        <RestaurantBrandAvatar restaurant={restaurant} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{restaurant.name}</p>
          <p className="text-[11px] text-emerald-300 truncate">
            {restaurant.branches[0]?.name ?? restaurant.city}
          </p>
        </div>
      </div>

      <nav aria-label="Restaurant Owner Sidebar" className="flex-1 p-3 space-y-1 overflow-y-auto">
        {OWNER_NAV.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#087F5B] text-white'
                  : 'text-slate-300 hover:bg-white/8 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </span>
              {(item.id === 'kds' || item.id === 'orders') && pendingOrdersCount > 0 && (
                <span
                  className={`font-mono text-xs font-semibold tabular-nums ${
                    active ? 'text-emerald-100' : 'text-amber-300'
                  }`}
                >
                  {pendingOrdersCount}
                </span>
              )}
              {item.id === 'subscription' && !orderingActive && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/25 text-red-200">
                  {validity.effectiveStatus}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="px-3.5 pb-2 text-xs text-slate-400 truncate">
          {restaurant.ownerName} · {restaurant.id}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/8 hover:text-white transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex">
      <aside className="hidden lg:block w-64 shrink-0 bg-[#172B4D] text-white sticky top-0 h-screen no-print">
        {renderSidebar()}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="w-64 bg-[#172B4D] text-white h-full shadow-xl">{renderSidebar()}</div>
          <button
            type="button"
            className="flex-1 bg-slate-900/50"
            aria-label="Close sidebar overlay"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-[#172B4D] cursor-pointer"
              aria-label="Open restaurant menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline truncate">{restaurant.name}</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display font-bold text-[#172B4D] truncate">{activeNavLabel}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onSelectSection('subscription')}
              className="hidden md:inline-flex items-center gap-1.5 cursor-pointer"
              aria-label="View subscription plan status"
            >
              <StatusLabel status={validity.effectiveStatus} badge />
            </button>
            <button
              type="button"
              onClick={() => onSelectSection('kds')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#172B4D] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <ChefHat className="w-4 h-4 text-[#087F5B]" />
              Kitchen Display
            </button>
            <button
              type="button"
              onClick={() => onSelectSection('qr')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              Table QRs
            </button>
          </div>
        </header>

        {/* Inactive Subscription Banner — Restaurant Admin retains full dashboard/reports/orders visibility while new QR orders are paused */}
        {!orderingActive && (
          <div
            role="alert"
            className="bg-red-50 border-b border-red-200 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 no-print"
          >
            <div className="flex items-start sm:items-center gap-2.5 text-xs text-red-900">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>Subscription {validity.effectiveStatus}:</strong> New customer QR orders
                are temporarily disabled. You can still view historical orders, reports, and
                subscription details.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectSection('subscription')}
              className="text-xs font-bold text-red-700 hover:text-red-900 underline self-start sm:self-auto cursor-pointer whitespace-nowrap"
            >
              View My Plan
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
