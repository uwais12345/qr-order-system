import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Check, Pencil, ReceiptText, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import {
  computeDefaultExpiryDate,
  computeSubscriptionValidity,
  computeSuperAdminMetrics,
  formatCurrency,
  getEffectiveSubscriptionAmount,
  getPlanConfig,
} from '../../domain/serveqrLogic';
import type {
  BillingCycle,
  Restaurant,
  SubscriptionPaymentStatus,
  SubscriptionPlan,
  SubscriptionPlanConfig,
  SubscriptionStatus,
} from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { RestaurantBrandAvatar } from '../../components/RestaurantBrandAvatar';
import { StatusLabel } from '../../components/StatusText';

export const SuperAdminSubscriptionsView: React.FC = () => {
  const {
    state,
    updateRestaurantBilling,
    updateSubscriptionStatus,
    updateStandardPlanPrices,
  } = useServeQR();
  const [billingView, setBillingView] = useState<BillingCycle>('Monthly');

  // Edit Standard Catalog Plan Modal
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanConfig | null>(null);
  const [planMonthlyInput, setPlanMonthlyInput] = useState('');
  const [planAnnualInput, setPlanAnnualInput] = useState('');

  // Edit Individual Restaurant Billing Modal
  const [editingRest, setEditingRest] = useState<Restaurant | null>(null);
  const [billingForm, setBillingForm] = useState<{
    subscriptionPlan: SubscriptionPlan;
    billingCycle: BillingCycle;
    customMonthlyPriceInr: number;
    customAnnualPriceInr: number;
    subscriptionStartDate: string;
    subscriptionExpiryDate: string;
    subscriptionStatus: SubscriptionStatus;
    subscriptionPaymentStatus: SubscriptionPaymentStatus;
    invoiceNote: string;
  } | null>(null);

  const openEditPlan = (plan: SubscriptionPlanConfig) => {
    setEditingPlan(plan);
    setPlanMonthlyInput(String(plan.monthlyPriceInr));
    setPlanAnnualInput(String(plan.annualPriceInr));
  };

  const handleSavePlanPrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    const monthly = Math.max(0, Number(planMonthlyInput) || 0);
    const annual = Math.max(0, Number(planAnnualInput) || 0);
    updateStandardPlanPrices(editingPlan.name, monthly, annual);
    setEditingPlan(null);
  };

  const openEditBilling = (rest: Restaurant) => {
    setEditingRest(rest);
    setBillingForm({
      subscriptionPlan: rest.subscriptionPlan,
      billingCycle: rest.billingCycle,
      customMonthlyPriceInr: rest.customMonthlyPriceInr,
      customAnnualPriceInr: rest.customAnnualPriceInr,
      subscriptionStartDate: rest.subscriptionStartDate,
      subscriptionExpiryDate: rest.subscriptionExpiryDate,
      subscriptionStatus: rest.subscriptionStatus,
      subscriptionPaymentStatus: rest.subscriptionPaymentStatus,
      invoiceNote: '',
    });
  };

  const handleSaveRestaurantBilling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRest || !billingForm) return;
    updateRestaurantBilling(editingRest.id, billingForm);
    setEditingRest(null);
    setBillingForm(null);
  };

  const activeModalRest = editingRest
    ? state.restaurants.find((r) => r.id === editingRest.id) ?? editingRest
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#172B4D]">
            Subscription Plans &amp; Custom Billing
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Manage standard SaaS tiers and customize individual restaurant pricing, validity, and
            status.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-200/70 rounded-lg self-start">
          {(['Monthly', 'Annual'] as BillingCycle[]).map((cycle) => (
            <button
              key={cycle}
              type="button"
              onClick={() => setBillingView(cycle)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                billingView === cycle
                  ? 'bg-white text-[#172B4D] shadow-xs'
                  : 'text-slate-600 hover:text-[#172B4D]'
              }`}
            >
              {cycle} Pricing
            </button>
          ))}
        </div>
      </div>

      {/* Standard Plan Catalog Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {state.planCatalog.map((plan) => {
          const price =
            billingView === 'Annual' ? plan.annualPriceInr : plan.monthlyPriceInr;
          const activeCount = state.restaurants.filter(
            (r) => r.subscriptionPlan === plan.name
          ).length;

          return (
            <article
              key={plan.name}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-lg font-bold text-[#172B4D]">{plan.name}</h3>
                  <button
                    type="button"
                    onClick={() => openEditPlan(plan)}
                    aria-label={`Edit ${plan.name} standard price`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#087F5B] hover:text-[#06674A] cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit Default
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">{plan.audience}</p>
                <p className="mt-4 font-mono text-3xl font-bold text-[#087F5B] tabular-nums">
                  {formatCurrency(price)}
                  <span className="text-xs font-sans font-normal text-slate-500">
                    /{billingView === 'Annual' ? 'year' : 'month'}
                  </span>
                </p>

                <ul className="mt-4 space-y-2 text-xs sm:text-sm text-slate-700 border-t border-slate-100 pt-4">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#087F5B] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>
                  {plan.maxBranches} branch{plan.maxBranches > 1 ? 'es' : ''} · {plan.maxTables}{' '}
                  tables
                </span>
                <span>
                  {activeCount} tenant{activeCount === 1 ? '' : 's'}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {/* Individual Restaurant Billing Container */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-[#172B4D]">
              Restaurant Subscriptions &amp; Custom Billing
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Each restaurant can have custom monthly/annual rates independent of standard catalog
              tiers.
            </p>
          </div>
        </div>

        {/* Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                <th className="py-3 px-5">Restaurant</th>
                <th className="py-3 px-4">Plan &amp; Cycle</th>
                <th className="py-3 px-4">Validity</th>
                <th className="py-3 px-4">Subscription Status</th>
                <th className="py-3 px-4 text-right">Assigned Rate</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.restaurants.map((rest) => {
                const validity = computeSubscriptionValidity(
                  rest.subscriptionStatus,
                  rest.subscriptionExpiryDate
                );
                const eff = getEffectiveSubscriptionAmount(rest);

                return (
                  <tr key={rest.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2.5">
                        <RestaurantBrandAvatar restaurant={rest} size="sm" />
                        <div>
                          <p className="font-semibold text-[#172B4D] whitespace-nowrap">
                            {rest.name}
                          </p>
                          <p className="text-xs font-mono text-slate-500">{rest.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-[#172B4D]">
                          {rest.subscriptionPlan}
                        </span>
                        {rest.hasCustomPricing && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {rest.billingCycle} · {rest.subscriptionPaymentStatus}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <p className="font-mono text-xs text-slate-700 tabular-nums">
                        {rest.subscriptionStartDate} → {rest.subscriptionExpiryDate}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {validity.validitySummary}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusLabel status={validity.effectiveStatus} badge />
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <p className="font-mono font-bold text-[#172B4D] tabular-nums">
                        {formatCurrency(eff.amountInr)}
                        <span className="text-[11px] font-sans font-normal text-slate-500">
                          {eff.periodLabel}
                        </span>
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                        Mo: {formatCurrency(rest.customMonthlyPriceInr)} · Yr:{' '}
                        {formatCurrency(rest.customAnnualPriceInr)}
                      </p>
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2.5 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => openEditBilling(rest)}
                          aria-label={`Edit billing for ${rest.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#172B4D] text-white hover:bg-[#10203A] cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          Edit Billing
                        </button>
                        {validity.isOrderAcceptanceAllowed ? (
                          <button
                            type="button"
                            onClick={() => updateSubscriptionStatus(rest.id, 'INACTIVE')}
                            aria-label={`Deactivate ${rest.name}`}
                            className="px-2.5 py-1.5 rounded-lg text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 cursor-pointer"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateSubscriptionStatus(rest.id, 'ACTIVE')}
                            aria-label={`Activate ${rest.name}`}
                            className="px-2.5 py-1.5 rounded-lg text-[#087F5B] bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View (< md) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {state.restaurants.map((rest) => {
            const validity = computeSubscriptionValidity(
              rest.subscriptionStatus,
              rest.subscriptionExpiryDate
            );
            const eff = getEffectiveSubscriptionAmount(rest);

            return (
              <div key={rest.id} className="p-4 space-y-3 bg-white">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <RestaurantBrandAvatar restaurant={rest} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#172B4D] truncate">{rest.name}</p>
                      <p className="text-xs font-mono text-slate-500 truncate">{rest.id}</p>
                    </div>
                  </div>
                  <StatusLabel status={validity.effectiveStatus} badge />
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 text-xs border border-slate-100">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Plan &amp; Cycle</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <strong className="text-slate-800">{rest.subscriptionPlan}</strong>
                      {rest.hasCustomPricing && (
                        <span className="px-1 py-0.2 text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
                          Custom
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 block">
                      {rest.billingCycle} · {rest.subscriptionPaymentStatus}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Effective Rate</span>
                    <span className="font-mono text-sm font-bold text-[#172B4D] block mt-0.5">
                      {formatCurrency(eff.amountInr)}
                      <span className="text-[10px] font-sans font-normal text-slate-500 ml-0.5">
                        {eff.periodLabel}
                      </span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono block">
                      {validity.validitySummary}
                    </span>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-50">
                  {validity.isOrderAcceptanceAllowed ? (
                    <button
                      type="button"
                      onClick={() => updateSubscriptionStatus(rest.id, 'INACTIVE')}
                      aria-label={`Deactivate ${rest.name}`}
                      className="px-3 py-1.5 min-h-[38px] text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg cursor-pointer"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateSubscriptionStatus(rest.id, 'ACTIVE')}
                      aria-label={`Activate ${rest.name}`}
                      className="px-3 py-1.5 min-h-[38px] text-xs font-semibold text-[#087F5B] bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer"
                    >
                      Activate
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEditBilling(rest)}
                    aria-label={`Edit billing for ${rest.name}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 min-h-[38px] rounded-lg bg-[#172B4D] text-white hover:bg-[#10203A] text-xs font-semibold cursor-pointer ml-auto"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Edit Billing
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* EDIT STANDARD PLAN CATALOG MODAL */}
      {editingPlan && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-plan-catalog-title"
        >
          <form
            onSubmit={handleSavePlanPrice}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4 max-h-[90dvh] flex flex-col shadow-2xl overflow-y-auto"
          >
            <div className="flex items-center justify-between shrink-0">
              <h3
                id="edit-plan-catalog-title"
                className="font-display text-lg font-bold text-[#172B4D]"
              >
                Edit Standard {editingPlan.name} Pricing
              </h3>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                aria-label="Close modal"
                className="p-2 text-slate-400 hover:text-slate-700 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Updates default catalog pricing for new registrations. Existing restaurants with
              individual/custom pricing will <strong>not</strong> be overwritten.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="cat-mo" className="block text-xs font-semibold text-slate-700 mb-1">
                  Standard Monthly (₹)
                </label>
                <input
                  id="cat-mo"
                  type="number"
                  min="0"
                  required
                  value={planMonthlyInput}
                  onChange={(e) => setPlanMonthlyInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="cat-yr" className="block text-xs font-semibold text-slate-700 mb-1">
                  Standard Annual (₹)
                </label>
                <input
                  id="cat-yr"
                  type="number"
                  min="0"
                  required
                  value={planAnnualInput}
                  onChange={(e) => setPlanAnnualInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="px-4 py-2 min-h-[44px] text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 min-h-[44px] text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer"
              >
                Save Default Plan Price
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT INDIVIDUAL RESTAURANT BILLING MODAL */}
      {activeModalRest && billingForm && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-billing-modal-title"
        >
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl overflow-hidden my-3 sm:my-6 max-h-[90dvh] flex flex-col shadow-2xl">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3
                  id="edit-billing-modal-title"
                  className="font-display text-base sm:text-lg font-bold text-[#172B4D] truncate"
                >
                  Edit Billing — {activeModalRest.name}
                </h3>
                <p className="text-xs font-mono text-slate-500 truncate">
                  {activeModalRest.id} · Custom per-restaurant subscription pricing &amp; lifecycle
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingRest(null);
                  setBillingForm(null);
                }}
                aria-label="Close billing modal"
                className="p-2 text-slate-400 hover:text-slate-700 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveRestaurantBilling}
              className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="eb-plan" className="block text-xs font-semibold text-slate-700 mb-1">
                    Assigned Plan
                  </label>
                  <select
                    id="eb-plan"
                    value={billingForm.subscriptionPlan}
                    onChange={(e) => {
                      const nextPlan = e.target.value as SubscriptionPlan;
                      setBillingForm({ ...billingForm, subscriptionPlan: nextPlan });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Basic">Basic</option>
                    <option value="Professional">Professional</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="eb-cycle" className="block text-xs font-semibold text-slate-700 mb-1">
                    Billing Cycle
                  </label>
                  <select
                    id="eb-cycle"
                    value={billingForm.billingCycle}
                    onChange={(e) => {
                      const nextCycle = e.target.value as BillingCycle;
                      setBillingForm({
                        ...billingForm,
                        billingCycle: nextCycle,
                        subscriptionExpiryDate: computeDefaultExpiryDate(
                          billingForm.subscriptionStartDate,
                          nextCycle
                        ),
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="eb-monthly" className="text-xs font-semibold text-slate-700">
                      Custom Monthly Price (₹)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const cfg = getPlanConfig(
                          billingForm.subscriptionPlan,
                          state.planCatalog
                        );
                        setBillingForm({
                          ...billingForm,
                          customMonthlyPriceInr: cfg.monthlyPriceInr,
                          customAnnualPriceInr: cfg.annualPriceInr,
                        });
                      }}
                      className="text-[11px] font-semibold text-[#087F5B] cursor-pointer"
                    >
                      Use Plan Default
                    </button>
                  </div>
                  <input
                    id="eb-monthly"
                    type="number"
                    min="0"
                    required
                    value={billingForm.customMonthlyPriceInr}
                    onChange={(e) =>
                      setBillingForm({
                        ...billingForm,
                        customMonthlyPriceInr: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="eb-annual" className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Annual Price (₹)
                  </label>
                  <input
                    id="eb-annual"
                    type="number"
                    min="0"
                    required
                    value={billingForm.customAnnualPriceInr}
                    onChange={(e) =>
                      setBillingForm({
                        ...billingForm,
                        customAnnualPriceInr: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="eb-start" className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    id="eb-start"
                    type="date"
                    required
                    value={billingForm.subscriptionStartDate}
                    onChange={(e) =>
                      setBillingForm({ ...billingForm, subscriptionStartDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="eb-expiry" className="block text-xs font-semibold text-slate-700 mb-1">
                    Expiry Date
                  </label>
                  <input
                    id="eb-expiry"
                    type="date"
                    required
                    value={billingForm.subscriptionExpiryDate}
                    onChange={(e) =>
                      setBillingForm({ ...billingForm, subscriptionExpiryDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="eb-status" className="block text-xs font-semibold text-slate-700 mb-1">
                    Subscription Status
                  </label>
                  <select
                    id="eb-status"
                    value={billingForm.subscriptionStatus}
                    onChange={(e) =>
                      setBillingForm({
                        ...billingForm,
                        subscriptionStatus: e.target.value as SubscriptionStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="EXPIRING SOON">EXPIRING SOON</option>
                    <option value="INACTIVE">INACTIVE (Pauses QR Ordering)</option>
                    <option value="SUSPENDED">SUSPENDED (Pauses QR Ordering)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="eb-pay-status" className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Status
                  </label>
                  <select
                    id="eb-pay-status"
                    value={billingForm.subscriptionPaymentStatus}
                    onChange={(e) =>
                      setBillingForm({
                        ...billingForm,
                        subscriptionPaymentStatus: e.target.value as SubscriptionPaymentStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="eb-note" className="block text-xs font-semibold text-slate-700 mb-1">
                    Billing Ledger Note (Optional)
                  </label>
                  <input
                    id="eb-note"
                    type="text"
                    value={billingForm.invoiceNote}
                    onChange={(e) =>
                      setBillingForm({ ...billingForm, invoiceNote: e.target.value })
                    }
                    placeholder="e.g., Negotiated partner discount or annual renewal"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Billing History Preview inside Modal */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5">
                <p className="text-xs font-bold text-[#172B4D] flex items-center gap-1.5">
                  <ReceiptText className="w-3.5 h-3.5 text-[#087F5B]" />
                  Recent Billing History ({activeModalRest.subscriptionBillingHistory.length})
                </p>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-36 overflow-y-auto">
                  {activeModalRest.subscriptionBillingHistory.map((inv) => (
                    <div
                      key={inv.id}
                      className="px-3 py-2 text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[#172B4D] truncate">{inv.description}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {inv.id} · {inv.date}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-semibold text-[#172B4D]">
                          {formatCurrency(inv.amountInr)}
                        </span>
                        <StatusLabel status={inv.status} badge />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRest(null);
                    setBillingForm(null);
                  }}
                  className="px-4 py-2 min-h-[44px] text-sm font-medium text-slate-600 hover:text-[#172B4D] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 min-h-[44px] text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer"
                >
                  Save Billing Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const SuperAdminReportsView: React.FC = () => {
  const { state } = useServeQR();
  const metrics = computeSuperAdminMetrics(state.restaurants, state.orders);

  const tenantRows = state.restaurants.map((r) => {
    const orders = state.orders.filter((o) => o.restaurantId === r.id && o.status !== 'Cancelled');
    const tables = state.tables.filter((t) => t.restaurantId === r.id);
    const revenue = orders.reduce((s, o) => s + o.totalAmount, 0);
    return {
      id: r.id,
      name: r.name,
      city: r.city,
      tables: tables.length,
      orders: orders.length,
      revenue: Math.round(revenue),
      plan: r.subscriptionPlan,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#172B4D]">Platform Reports</h2>
        <p className="text-sm text-slate-600 mt-0.5">
          Aggregated order volume, dine-in GMV, and tenant adoption metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <p className="text-xs text-slate-500">Gross Platform Order Volume</p>
          <p className="mt-1.5 font-mono text-xl sm:text-2xl font-bold text-[#087F5B] tabular-nums truncate">
            {formatCurrency(metrics.totalRevenue)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <p className="text-xs text-slate-500">Monthly Recurring Revenue (MRR)</p>
          <p className="mt-1.5 font-mono text-xl sm:text-2xl font-bold text-[#172B4D] tabular-nums truncate">
            {formatCurrency(metrics.subscriptionMrr)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <p className="text-xs text-slate-500">Average Order Value (Platform)</p>
          <p className="mt-1.5 font-mono text-xl sm:text-2xl font-bold text-[#172B4D] tabular-nums truncate">
            {formatCurrency(
              metrics.totalOrders > 0 ? Math.round(metrics.totalRevenue / metrics.totalOrders) : 0
            )}
          </p>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
        <h3 className="font-display text-base font-bold text-[#172B4D] mb-4">
          Orders Processed by Restaurant
        </h3>
        <div className="h-60 sm:h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tenantRows} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip />
              <Bar
                dataKey="orders"
                name="Orders"
                fill="#172B4D"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
          <h3 className="font-display text-base font-bold text-[#172B4D]">
            Tenant Performance Summary
          </h3>
        </div>

        {/* Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                <th className="py-3 px-6">Restaurant</th>
                <th className="py-3 px-4">City</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4 text-right">QR Tables</th>
                <th className="py-3 px-4 text-right">Orders</th>
                <th className="py-3 px-6 text-right">Order GMV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenantRows.map((row) => (
                <tr key={row.id}>
                  <td className="py-3.5 px-6 font-semibold text-[#172B4D]">{row.name}</td>
                  <td className="py-3.5 px-4 text-slate-600">{row.city}</td>
                  <td className="py-3.5 px-4 text-xs text-slate-600">{row.plan}</td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums">{row.tables}</td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums">{row.orders}</td>
                  <td className="py-3.5 px-6 text-right font-mono font-semibold text-[#087F5B] tabular-nums">
                    {formatCurrency(row.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View (< md) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {tenantRows.map((row) => (
            <div key={row.id} className="p-4 space-y-2 bg-white">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-[#172B4D]">{row.name}</span>
                <span className="text-xs text-slate-500 font-mono">{row.city}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  Plan: <strong>{row.plan}</strong>
                </span>
                <span>
                  {row.tables} Tables · {row.orders} Orders
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-50">
                <span className="text-slate-500">Order GMV</span>
                <span className="font-mono text-sm font-bold text-[#087F5B]">
                  {formatCurrency(row.revenue)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export const SuperAdminSettingsView: React.FC = () => {
  const { resetDemoData } = useServeQR();
  const [defaultCurrency, setDefaultCurrency] = useState('INR (₹)');
  const [defaultTax, setDefaultTax] = useState('5');
  const [savedNotice, setSavedNotice] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleReset = () => {
    resetDemoData();
    setConfirmReset(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#172B4D]">Platform Settings</h2>
        <p className="text-sm text-slate-600 mt-0.5">
          Global defaults for newly onboarded ServeQR restaurant workspaces.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4"
      >
        <h3 className="font-display text-base font-bold text-[#172B4D]">
          New Tenant Onboarding Defaults
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sa-currency" className="block text-xs font-semibold text-slate-700 mb-1">
              Default Currency
            </label>
            <select
              id="sa-currency"
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white min-h-[42px]"
            >
              <option value="INR (₹)">INR (₹)</option>
              <option value="USD ($)">USD ($)</option>
              <option value="EUR (€)">EUR (€)</option>
            </select>
          </div>
          <div>
            <label htmlFor="sa-tax" className="block text-xs font-semibold text-slate-700 mb-1">
              Default Tax Rate (%)
            </label>
            <input
              id="sa-tax"
              type="number"
              min="0"
              max="28"
              step="0.5"
              value={defaultTax}
              onChange={(e) => setDefaultTax(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono min-h-[42px]"
            />
          </div>
        </div>
        <div className="pt-2 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-[#087F5B] font-medium">
            {savedNotice ? 'Platform defaults saved.' : ''}
          </span>
          <button
            type="submit"
            className="px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer ml-auto"
          >
            Save Settings
          </button>
        </div>
      </form>

      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#172B4D]">
            Reset Prototype Demo Data
          </h3>
          <p className="text-xs text-slate-600 mt-1">
            Restore ABC Restaurant, sample menu items, T01–T05 tables, and seed orders to their
            initial state.
          </p>
        </div>

        {confirmReset ? (
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-2 min-h-[44px] text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Yes, Reset Everything
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="px-3.5 py-2 min-h-[44px] text-xs font-medium text-slate-600 hover:text-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Demo Data
          </button>
        )}
      </section>
    </div>
  );
};
