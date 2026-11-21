import React from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CreditCard,
  Lock,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react';
import {
  computeSubscriptionValidity,
  formatCurrency,
  getEffectiveSubscriptionAmount,
  getPlanConfig,
} from '../../domain/serveqrLogic';
import type { Restaurant } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { StatusLabel } from '../../components/StatusText';

interface RestaurantSubscriptionViewProps {
  restaurant: Restaurant;
}

export const RestaurantSubscriptionView: React.FC<RestaurantSubscriptionViewProps> = ({
  restaurant,
}) => {
  const { state } = useServeQR();
  const planConfig = getPlanConfig(restaurant.subscriptionPlan, state.planCatalog);
  const validity = computeSubscriptionValidity(
    restaurant.subscriptionStatus,
    restaurant.subscriptionExpiryDate
  );
  const pricing = getEffectiveSubscriptionAmount(restaurant);

  // Compute remaining validity progress percentage
  const startMs = new Date(`${restaurant.subscriptionStartDate}T00:00:00Z`).getTime();
  const endMs = new Date(`${restaurant.subscriptionExpiryDate}T00:00:00Z`).getTime();
  const totalDays = Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));
  const remainingPct = validity.isExpired
    ? 0
    : Math.max(0, Math.min(100, Math.round((validity.daysRemaining / totalDays) * 100)));

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#172B4D]">
            Subscription &amp; My Plan
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Membership summary, validity timeline, included platform capabilities, and billing
            records for {restaurant.name}.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 self-start whitespace-nowrap shrink-0">
          <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          Read-Only · Managed by Super Admin
        </div>
      </div>

      {/* Inactive / Expiring Soon Alert */}
      {!validity.isOrderAcceptanceAllowed ? (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-red-900">
              Subscription is {validity.effectiveStatus} — New QR Ordering Paused
            </p>
            <p className="text-xs text-red-800 mt-1 leading-relaxed">
              Your dashboard, historical orders, and reports remain accessible. Customers scanning
              table QR codes will see that online ordering is temporarily unavailable until ServeQR
              Super Admin reactivates your subscription.
            </p>
          </div>
        </div>
      ) : validity.effectiveStatus === 'EXPIRING SOON' ? (
        <div
          role="status"
          className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-amber-950">
              Plan Expiring Soon ({validity.validitySummary})
            </p>
            <p className="text-xs text-amber-900 mt-1">
              Contact your ServeQR account administrator before{' '}
              <span className="font-mono font-semibold">{restaurant.subscriptionExpiryDate}</span>{' '}
              to avoid any interruption to customer table ordering.
            </p>
          </div>
        </div>
      ) : null}

      {/* Clean Membership Overview Card (Netflix-inspired membership layout) */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="bg-[#172B4D] text-white px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Current Membership
              </span>
              <StatusLabel status={validity.effectiveStatus} badge />
              {restaurant.hasCustomPricing && (
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-white/15 text-white">
                  Custom Rate
                </span>
              )}
            </div>
            <h3 className="font-display text-2xl font-bold mt-1.5">
              ServeQR {restaurant.subscriptionPlan}
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">{planConfig.audience}</p>
          </div>

          <div className="sm:text-right">
            <p className="text-xs text-slate-300">Assigned Subscription Rate</p>
            <p className="font-mono text-3xl font-bold text-white tabular-nums mt-0.5">
              {formatCurrency(pricing.amountInr)}
              <span className="text-xs font-sans font-normal text-emerald-300">
                {pricing.periodLabel}
              </span>
            </p>
            <p className="text-[11px] text-slate-300 mt-0.5">
              {restaurant.billingCycle} Billing · Payment:{' '}
              <span className="font-semibold text-white">
                {restaurant.subscriptionPaymentStatus}
              </span>
            </p>
          </div>
        </div>

        {/* Key Validity & Dates Strip */}
        <div className="p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                Billing Cycle
              </p>
              <p className="font-display font-bold text-sm text-[#172B4D] mt-1">
                {restaurant.billingCycle}
              </p>
            </div>
            <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Start Date
              </p>
              <p className="font-mono font-bold text-xs sm:text-sm text-[#172B4D] mt-1 tabular-nums">
                {restaurant.subscriptionStartDate}
              </p>
            </div>
            <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Expiry Date
              </p>
              <p className="font-mono font-bold text-xs sm:text-sm text-[#172B4D] mt-1 tabular-nums">
                {restaurant.subscriptionExpiryDate}
              </p>
            </div>
            <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                Remaining
              </p>
              <p
                className={`font-mono font-bold text-xs sm:text-sm mt-1 tabular-nums ${
                  validity.isOrderAcceptanceAllowed ? 'text-[#087F5B]' : 'text-red-700'
                }`}
              >
                {validity.validitySummary}
              </p>
            </div>
          </div>

          {/* Validity Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-600">Current Billing Term Validity</span>
              <span className="font-mono font-semibold text-[#172B4D] tabular-nums">
                {remainingPct}% remaining
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  !validity.isOrderAcceptanceAllowed
                    ? 'bg-red-500'
                    : validity.effectiveStatus === 'EXPIRING SOON'
                    ? 'bg-amber-500'
                    : 'bg-[#087F5B]'
                }`}
                style={{ width: `${remainingPct}%` }}
              />
            </div>
          </div>

          {/* Included Plan Features */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="font-display text-sm font-bold text-[#172B4D] mb-3">
              Included in {restaurant.subscriptionPlan} Plan
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {planConfig.features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-2 text-xs sm:text-sm text-slate-700"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#087F5B] shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500 font-mono">
              Plan Limits: Up to {planConfig.maxBranches} branch
              {planConfig.maxBranches > 1 ? 'es' : ''} · {planConfig.maxTables} QR dining tables
            </p>
          </div>
        </div>
      </section>

      {/* Billing History */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-[#087F5B]" />
            <h3 className="font-display text-base font-bold text-[#172B4D]">Billing History</h3>
          </div>
          <span className="text-xs text-slate-500">
            {restaurant.subscriptionBillingHistory.length} record
            {restaurant.subscriptionBillingHistory.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                <th className="py-3 px-6">Invoice ID</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Cycle</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {restaurant.subscriptionBillingHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No subscription invoices recorded yet.
                  </td>
                </tr>
              ) : (
                restaurant.subscriptionBillingHistory.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 px-6 font-mono text-xs font-semibold text-[#172B4D] whitespace-nowrap">
                      {inv.id}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {inv.date}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{inv.description}</td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {inv.billingCycle}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs font-bold text-[#172B4D] whitespace-nowrap tabular-nums">
                      {formatCurrency(inv.amountInr)}
                    </td>
                    <td className="py-3 px-6 text-right whitespace-nowrap">
                      <StatusLabel status={inv.status} badge />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View (< md) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {restaurant.subscriptionBillingHistory.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No subscription invoices recorded yet.
            </div>
          ) : (
            restaurant.subscriptionBillingHistory.map((inv) => (
              <div key={inv.id} className="p-4 space-y-2 bg-white">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-[#172B4D]">{inv.id}</span>
                  <StatusLabel status={inv.status} badge />
                </div>
                <div className="text-xs font-medium text-slate-800">{inv.description}</div>
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>
                    {inv.date} · {inv.billingCycle}
                  </span>
                  <span className="font-mono text-xs font-bold text-[#172B4D]">
                    {formatCurrency(inv.amountInr)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Super Admin Managed Policy Footer */}
      <div className="px-4 py-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600 leading-relaxed">
        <strong>Need to change your plan, billing cycle, or custom pricing?</strong> Subscription
        modifications and plan reactivations are managed exclusively by ServeQR Super Admin. Contact{' '}
        <span className="font-mono text-[#172B4D]">billing@serveqr.io</span> with your Restaurant ID{' '}
        <span className="font-mono font-semibold text-[#172B4D]">{restaurant.id}</span>.
      </div>
    </div>
  );
};
