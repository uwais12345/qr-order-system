import React from 'react';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import {
  formatCurrency,
  scopeBillsByRestaurant,
  scopeMenuItemsByRestaurant,
  scopeOrdersByRestaurant,
  scopeTablesByRestaurant,
} from '../../domain/serveqrLogic';
import type { Restaurant } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { StatusLabel } from '../../components/StatusText';

interface RestaurantInspectionViewProps {
  restaurantId: string;
  onBack: () => void;
}

export const RestaurantInspectionView: React.FC<RestaurantInspectionViewProps> = ({
  restaurantId,
  onBack,
}) => {
  const { state, updateRestaurantStatus } = useServeQR();
  const restaurant: Restaurant | undefined = state.restaurants.find(
    (r) => r.id === restaurantId
  );

  if (!restaurant) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-600">Restaurant workspace not found.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-[#172B4D] rounded-lg cursor-pointer"
        >
          Back to Restaurants
        </button>
      </div>
    );
  }

  const tables = scopeTablesByRestaurant(state.tables, restaurant.id);
  const menuItems = scopeMenuItemsByRestaurant(state.menuItems, restaurant.id);
  const orders = scopeOrdersByRestaurant(state.orders, restaurant.id);
  const bills = scopeBillsByRestaurant(state.bills, restaurant.id);

  const activeQrCount = tables.filter((t) => Boolean(t.qrGeneratedAt)).length;
  const totalRevenue = orders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + o.totalAmount, 0);
  const settledAmount = bills
    .filter((b) => b.paymentStatus === 'Paid')
    .reduce((sum, b) => sum + b.paidAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer shrink-0"
            aria-label="Back to restaurants list"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#172B4D] truncate">
                {restaurant.name}
              </h2>
              <StatusLabel status={restaurant.status} badge />
            </div>
            <p className="text-xs font-mono text-slate-500 mt-0.5 truncate">
              {restaurant.id} · {restaurant.businessType} · Reg: {restaurant.registeredAt}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {restaurant.status !== 'Active' ? (
            <button
              type="button"
              onClick={() => updateRestaurantStatus(restaurant.id, 'Active')}
              className="px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer"
            >
              Activate Workspace
            </button>
          ) : (
            <button
              type="button"
              onClick={() => updateRestaurantStatus(restaurant.id, 'Inactive')}
              className="px-4 py-2 min-h-[40px] text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg cursor-pointer"
            >
              Deactivate
            </button>
          )}
          {restaurant.status !== 'Suspended' && (
            <button
              type="button"
              onClick={() => updateRestaurantStatus(restaurant.id, 'Suspended')}
              className="px-4 py-2 min-h-[40px] text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg cursor-pointer"
            >
              Suspend
            </button>
          )}
        </div>
      </div>

      {/* Read-only audit guardrail notice */}
      <div className="px-4 py-3 rounded-lg bg-slate-100 border border-slate-200 flex items-center gap-2.5 text-xs text-slate-700">
        <ShieldAlert className="w-4 h-4 text-[#172B4D] shrink-0" />
        <span>
          Read-only Super Admin inspection mode. Operational data (menu items, orders, and bills) is
          isolated to this restaurant workspace and cannot be modified here.
        </span>
      </div>

      {/* Operational KPI Snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-slate-500">Branches</p>
          <p className="font-mono text-lg sm:text-xl font-bold text-[#172B4D] mt-1 tabular-nums">
            {restaurant.branches.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-slate-500">Tables / QRs</p>
          <p className="font-mono text-lg sm:text-xl font-bold text-[#172B4D] mt-1 tabular-nums">
            {tables.length} / {activeQrCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-slate-500">Menu Items</p>
          <p className="font-mono text-lg sm:text-xl font-bold text-[#172B4D] mt-1 tabular-nums">
            {menuItems.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-slate-500">Total Orders</p>
          <p className="font-mono text-lg sm:text-xl font-bold text-[#172B4D] mt-1 tabular-nums">
            {orders.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 col-span-2 sm:col-span-1">
          <p className="text-[11px] sm:text-xs text-slate-500">Gross Order Value</p>
          <p className="font-mono text-lg sm:text-xl font-bold text-[#087F5B] mt-1 tabular-nums truncate">
            {formatCurrency(totalRevenue, restaurant.settings.currencySymbol)}
          </p>
        </div>
      </div>

      {/* Profile, Owner, Subscription */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <h3 className="font-display text-base font-bold text-[#172B4D] mb-3 sm:mb-4">
            Restaurant Profile
          </h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Business Email</dt>
              <dd className="font-mono text-xs text-slate-800 mt-0.5 break-all">{restaurant.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Phone</dt>
              <dd className="font-mono text-xs text-slate-800 mt-0.5">{restaurant.phone}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Address</dt>
              <dd className="text-xs sm:text-sm text-slate-700 mt-0.5">
                {restaurant.address}, {restaurant.city}, {restaurant.state} {restaurant.postalCode},{' '}
                {restaurant.country}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Menu Slug</dt>
              <dd className="font-mono text-xs text-[#087F5B] mt-0.5">/menu/{restaurant.slug}</dd>
            </div>
          </dl>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <h3 className="font-display text-base font-bold text-[#172B4D] mb-3 sm:mb-4">
            Owner &amp; Onboarding
          </h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Owner Full Name</dt>
              <dd className="font-semibold text-[#172B4D] mt-0.5">{restaurant.ownerName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Owner Email</dt>
              <dd className="font-mono text-xs text-slate-800 mt-0.5 break-all">{restaurant.ownerEmail}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Owner Phone</dt>
              <dd className="font-mono text-xs text-slate-800 mt-0.5">{restaurant.ownerPhone}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Account Setup Status</dt>
              <dd className="text-xs font-semibold text-slate-700 mt-0.5">
                {restaurant.inviteSetupCompleted
                  ? 'Password configured & verified'
                  : `Invitation pending (${restaurant.inviteToken})`}
              </dd>
            </div>
          </dl>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <h3 className="font-display text-base font-bold text-[#172B4D] mb-3 sm:mb-4">
            Subscription &amp; Billing Overview
          </h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Plan Tier</dt>
              <dd className="font-semibold text-[#172B4D] mt-0.5">
                {restaurant.subscriptionPlan} ({restaurant.billingCycle})
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Subscription Status</dt>
              <dd className="mt-0.5">
                <StatusLabel status={restaurant.subscriptionStatus} badge />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Monthly Plan Rate</dt>
              <dd className="font-mono text-sm font-semibold text-[#172B4D] mt-0.5 tabular-nums">
                {formatCurrency(restaurant.monthlyPriceInr)}/mo
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Settled Dine-In Bills</dt>
              <dd className="font-mono text-sm text-[#087F5B] mt-0.5 tabular-nums">
                {formatCurrency(settledAmount, restaurant.settings.currencySymbol)} ({bills.length}{' '}
                receipts)
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Branches & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <h3 className="font-display text-base font-bold text-[#172B4D] mb-4">
            Branches &amp; QR Deployment
          </h3>
          <div className="divide-y divide-slate-100">
            {restaurant.branches.map((branch) => {
              const branchTables = tables.filter((t) => t.branchId === branch.id);
              return (
                <div key={branch.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm text-[#172B4D]">{branch.name}</p>
                    <span className="font-mono text-xs text-slate-500">{branch.id}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {branch.address}, {branch.city}
                  </p>
                  <p className="text-xs text-[#087F5B] font-medium mt-1">
                    {branchTables.length} tables · {branchTables.length} active QR codes
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
            <h3 className="font-display text-base font-bold text-[#172B4D]">
              Recent Orders (Read-Only)
            </h3>
          </div>

          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-5">Order ID</th>
                  <th className="py-3 px-4">Table</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      No dine-in orders recorded yet for this workspace.
                    </td>
                  </tr>
                ) : (
                  orders.slice(0, 6).map((order) => (
                    <tr key={order.id}>
                      <td className="py-3 px-5 font-mono text-xs font-semibold text-[#172B4D]">
                        {order.id}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700">
                        {order.tableNumber}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        {order.customerName || 'Guest'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                        {formatCurrency(order.totalAmount, restaurant.settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-5">
                        <StatusLabel status={order.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Orders View (< md) */}
          <div className="block md:hidden divide-y divide-slate-100">
            {orders.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No dine-in orders recorded yet for this workspace.
              </div>
            ) : (
              orders.slice(0, 6).map((order) => (
                <div key={order.id} className="p-4 space-y-2 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-[#172B4D]">{order.id}</span>
                    <StatusLabel status={order.status} badge />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Table {order.tableNumber} · {order.customerName || 'Guest'}</span>
                    <span className="font-mono text-xs font-bold text-[#172B4D]">
                      {formatCurrency(order.totalAmount, restaurant.settings.currencySymbol)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
