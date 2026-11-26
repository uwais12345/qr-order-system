import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import { ServeQRLogo } from '../../components/ServeQRLogo';

export type SuperAdminSection =
  | 'dashboard'
  | 'restaurants'
  | 'subscriptions'
  | 'reports'
  | 'settings';

interface SuperAdminLayoutProps {
  activeSection: SuperAdminSection;
  breadcrumbTitle: string;
  adminEmail: string;
  backendMode?: boolean;
  backendSyncing?: boolean;
  backendError?: string | null;
  onRefresh?: () => void;
  onDismissError?: () => void;
  onSelectSection: (section: SuperAdminSection) => void;
  onOpenAddRestaurant: () => void;
  onLogout: () => void;
  onGoHome: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ id: SuperAdminSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'restaurants', label: 'Restaurants', icon: Building2 },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'reports', label: 'Platform Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const SuperAdminLayout: React.FC<SuperAdminLayoutProps> = ({
  activeSection,
  breadcrumbTitle,
  adminEmail,
  backendMode = false,
  backendSyncing = false,
  backendError = null,
  onRefresh,
  onDismissError,
  onSelectSection,
  onOpenAddRestaurant,
  onLogout,
  onGoHome,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderNavContent = () => (
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
          className="lg:hidden p-2 text-slate-300 hover:text-white cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 py-3 border-b border-white/10">
        <p className="text-[11px] font-medium text-emerald-300">Super Admin Workspace</p>
        <p className="text-xs text-slate-300 truncate mt-0.5">{adminEmail}</p>
      </div>

      <nav aria-label="Super Admin Sidebar" className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
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
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#087F5B] text-white'
                  : 'text-slate-300 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-lg text-sm font-medium text-slate-300 hover:bg-white/8 hover:text-white transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 bg-[#172B4D] text-white sticky top-0 h-screen">
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 max-w-[85vw] bg-[#172B4D] text-white h-full shadow-xl">
            {renderNavContent()}
          </div>
          <button
            type="button"
            className="flex-1 bg-slate-900/50 cursor-pointer"
            aria-label="Close sidebar overlay"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 sm:-ml-2 text-slate-600 hover:text-[#172B4D] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                Super Admin
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display font-bold text-sm sm:text-base text-[#172B4D] truncate">
                {breadcrumbTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {backendMode && onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={backendSyncing}
                aria-label="Sync platform data with server"
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-[40px] text-xs font-semibold text-[#172B4D] bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#087F5B] ${backendSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{backendSyncing ? 'Syncing...' : 'Sync'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenAddRestaurant}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 min-h-[40px] text-xs sm:text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Add Restaurant</span>
            </button>
          </div>
        </header>

        {backendMode && backendError && (
          <div
            role="alert"
            className="bg-red-50 border-b border-red-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs text-red-900"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="truncate font-medium">Server sync error: {backendError}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="font-bold text-red-700 hover:text-red-900 underline cursor-pointer"
                >
                  Retry
                </button>
              )}
              {onDismissError && (
                <button
                  type="button"
                  onClick={onDismissError}
                  aria-label="Dismiss server error"
                  className="p-1 text-red-600 hover:text-red-900 cursor-pointer rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
