import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { scopeOrdersByRestaurant } from '../../domain/serveqrLogic';
import { useServeQR } from '../../store/ServeQRStore';
import { ServeQRLogo } from '../../components/ServeQRLogo';
import { AuthLoginView } from '../AuthLoginView';
import { RestaurantLayout, type RestaurantSection } from './RestaurantLayout';
import { RestaurantDashboard } from './RestaurantDashboard';
import { MenuManagementView } from './MenuManagementView';
import { TableManagementView } from './TableManagementView';
import { QrManagementView } from './QrManagementView';
import { OrdersView } from './OrdersView';
import { KitchenDisplayView } from './KitchenDisplayView';
import { BillingCashierView } from './BillingCashierView';
import { RestaurantSubscriptionView } from './RestaurantSubscriptionView';
import {
  RestaurantReportsView,
  RestaurantSettingsView,
} from './ReportsAndSettingsViews';

interface RestaurantOwnerModuleProps {
  onNavigate: (path: string) => void;
}

export const RestaurantOwnerModule: React.FC<RestaurantOwnerModuleProps> = ({
  onNavigate,
}) => {
  const {
    state,
    auth,
    logoutRestaurantOwner,
    completeOwnerFirstLoginPasswordChange,
  } = useServeQR();
  const [section, setSection] = useState<RestaurantSection>('dashboard');

  // Mandatory first-login password setup state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');

  const restaurant = auth.restaurantOwnerLoggedIn
    ? state.restaurants.find((r) => r.id === auth.restaurantId) ?? null
    : null;

  if (!restaurant) {
    return (
      <AuthLoginView
        role="restaurant-owner"
        onSuccess={() => onNavigate('/restaurant/dashboard')}
        onBack={() => onNavigate('/')}
      />
    );
  }

  // Requirement §7: Mandatory password change on first login for newly provisioned restaurants
  if (restaurant.mustChangePassword) {
    const handleSetPassword = (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword.trim().length < 8) {
        setPwError('New password must be at least 8 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setPwError('Passwords do not match. Please re-enter carefully.');
        return;
      }
      setPwError('');
      setNewPassword('');
      setConfirmPassword('');
      completeOwnerFirstLoginPasswordChange(restaurant.id);
    };

    return (
      <div className="min-h-screen bg-[#F7F9FC] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <ServeQRLogo size="sm" />
            <span className="text-xs font-mono font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
              First Login Setup
            </span>
          </div>

          <div>
            <h1 className="font-display text-xl font-bold text-[#172B4D]">
              Set Your Permanent Password
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
              Welcome, <strong>{restaurant.ownerName}</strong>. For security, please replace your
              temporary onboarding access for <strong>{restaurant.name}</strong> before entering the
              dashboard.
            </p>
          </div>

          {pwError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
            >
              {pwError}
            </div>
          )}

          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label htmlFor="first-new-pw" className="block text-xs font-semibold text-slate-700 mb-1">
                New Password (min 8 characters) *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="first-new-pw"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label htmlFor="first-confirm-pw" className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm New Password *
              </label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="first-confirm-pw"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer transition-colors"
            >
              Update Password &amp; Enter Workspace
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              logoutRestaurantOwner();
              onNavigate('/');
            }}
            className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            Sign out and return to home
          </button>
        </div>
      </div>
    );
  }

  const tenantOrders = scopeOrdersByRestaurant(state.orders, restaurant.id);
  const pendingCount = tenantOrders.filter(
    (o) =>
      o.status === 'Pending' ||
      o.status === 'Accepted' ||
      o.status === 'Preparing' ||
      o.status === 'Ready'
  ).length;

  return (
    <RestaurantLayout
      restaurant={restaurant}
      activeSection={section}
      pendingOrdersCount={pendingCount}
      onSelectSection={setSection}
      onLogout={() => {
        logoutRestaurantOwner();
        onNavigate('/');
      }}
      onGoHome={() => onNavigate('/')}
    >
      {section === 'dashboard' && (
        <RestaurantDashboard restaurant={restaurant} onNavigateSection={setSection} />
      )}
      {section === 'menu' && <MenuManagementView restaurant={restaurant} />}
      {section === 'tables' && (
        <TableManagementView
          restaurant={restaurant}
          onOpenQrManagement={() => setSection('qr')}
        />
      )}
      {section === 'qr' && (
        <QrManagementView
          restaurant={restaurant}
          onTestQrRoute={(path) => onNavigate(path)}
          onGoToTables={() => setSection('tables')}
        />
      )}
      {section === 'orders' && <OrdersView restaurant={restaurant} />}
      {section === 'kds' && <KitchenDisplayView restaurant={restaurant} />}
      {section === 'billing' && <BillingCashierView restaurant={restaurant} />}
      {section === 'reports' && <RestaurantReportsView restaurant={restaurant} />}
      {section === 'subscription' && <RestaurantSubscriptionView restaurant={restaurant} />}
      {section === 'settings' && <RestaurantSettingsView restaurant={restaurant} />}
    </RestaurantLayout>
  );
};
