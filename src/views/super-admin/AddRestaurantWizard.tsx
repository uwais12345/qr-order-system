import React, { useState } from 'react';
import { CheckCircle2, Copy, MailCheck, ShieldCheck, X } from 'lucide-react';
import {
  computeDefaultExpiryDate,
  formatCurrency,
  getPlanConfig,
  validateRestaurantStep1,
  validateRestaurantStep2,
  type ValidationErrors,
} from '../../domain/serveqrLogic';
import type {
  BillingCycle,
  Restaurant,
  RestaurantStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';

interface AddRestaurantWizardProps {
  onClose: () => void;
  onCreated: (restaurant: Restaurant) => void;
}

const BRAND_SWATCHES = ['#087F5B', '#172B4D', '#0F766E', '#B45309', '#991B1B', '#334155'];
const DEMO_EMAIL_OTP = '482910';

export const AddRestaurantWizard: React.FC<AddRestaurantWizardProps> = ({
  onClose,
  onCreated,
}) => {
  const { state, createRestaurant } = useServeQR();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [createdRestaurant, setCreatedRestaurant] = useState<Restaurant | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Prototype Email OTP Verification state
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);

  const defaultStart = new Date().toISOString().slice(0, 10);
  const defaultPro = getPlanConfig('Professional', state.planCatalog);

  const [form, setForm] = useState({
    name: '',
    logoText: '',
    logoColor: '#087F5B',
    businessType: 'Fine Casual Dining',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: 'India',
    postalCode: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    accountStatus: 'Setup Pending' as RestaurantStatus,
    subscriptionPlan: 'Professional' as SubscriptionPlan,
    billingCycle: 'Monthly' as BillingCycle,
    customMonthlyPriceInr: defaultPro.monthlyPriceInr,
    customAnnualPriceInr: defaultPro.annualPriceInr,
    subscriptionStartDate: defaultStart,
    subscriptionExpiryDate: computeDefaultExpiryDate(defaultStart, 'Monthly'),
    subscriptionStatus: 'ACTIVE' as SubscriptionStatus,
  });

  const handleSendEmailOtp = () => {
    const emailToVerify = form.ownerEmail.trim() || form.email.trim();
    if (!emailToVerify || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToVerify)) {
      setErrors({ ownerEmail: 'Enter a valid owner email address before sending OTP.' });
      return;
    }
    setErrors({});
    setEmailOtpSent(true);
    setEmailVerified(false);
  };

  const handleVerifyEmailOtp = () => {
    if (emailOtpInput.trim() === DEMO_EMAIL_OTP) {
      setEmailVerified(true);
      setErrors((prev) => {
        const next = { ...prev };
        delete next.emailOtp;
        return next;
      });
    } else {
      setErrors((prev) => ({
        ...prev,
        emailOtp: `Invalid verification code. Use demo OTP ${DEMO_EMAIL_OTP}.`,
      }));
    }
  };

  const handleNext = () => {
    if (step === 1) {
      const v = validateRestaurantStep1(form);
      if (Object.keys(v).length > 0) {
        setErrors(v);
        return;
      }
      setErrors({});
      if (!form.ownerEmail) {
        setForm((prev) => ({ ...prev, ownerEmail: prev.email }));
      }
      setStep(2);
    } else if (step === 2) {
      const v = validateRestaurantStep2(form);
      if (!emailVerified) {
        v.emailOtp = 'Verify the restaurant account email with OTP before continuing.';
      }
      if (Object.keys(v).length > 0) {
        setErrors(v);
        return;
      }
      setErrors({});
      setStep(3);
    } else if (step === 3) {
      setErrors({});
      setStep(4);
    }
  };

  const handleCreate = () => {
    const rest = createRestaurant({
      ...form,
      emailVerified,
    });
    setCreatedRestaurant(rest);
  };

  const inviteUrl = createdRestaurant
    ? `${
        typeof window !== 'undefined' ? window.location.origin : 'https://serveqr.demo'
      }/restaurant/login?invite=${createdRestaurant.inviteToken}`
    : '';

  const handleCopyInvite = () => {
    if (!inviteUrl) return;
    navigator.clipboard?.writeText(inviteUrl).catch(() => {});
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-rest-wizard-title"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl overflow-hidden my-3 sm:my-6 max-h-[90dvh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="add-rest-wizard-title"
              className="font-display text-base sm:text-lg font-bold text-[#172B4D] truncate"
            >
              {createdRestaurant ? 'Restaurant Workspace Provisioned' : 'Register New Restaurant'}
            </h2>
            {!createdRestaurant && (
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">
                Step {step} of 4 ·{' '}
                {step === 1
                  ? 'Restaurant Information'
                  : step === 2
                  ? 'Owner Account & Email OTP'
                  : step === 3
                  ? 'Subscription & Pricing'
                  : 'Review & Provision'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close registration wizard"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        {!createdRestaurant && (
          <div className="px-3 sm:px-6 py-2.5 sm:py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-4 gap-1.5 sm:gap-2 shrink-0">
            {[
              { n: 1, label: 'Info' },
              { n: 2, label: 'Account' },
              { n: 3, label: 'Plan' },
              { n: 4, label: 'Review' },
            ].map((s) => (
              <div key={s.n} className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[11px] sm:text-xs font-bold flex items-center justify-center shrink-0 ${
                    step >= s.n ? 'bg-[#087F5B] text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {s.n}
                </span>
                <span
                  className={`text-[11px] sm:text-xs font-medium truncate ${
                    step >= s.n ? 'text-[#172B4D]' : 'text-slate-500'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {createdRestaurant ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <CheckCircle2 className="w-6 h-6 text-[#087F5B] shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display text-base font-bold text-[#172B4D]">
                    {createdRestaurant.name} provisioned &amp; email verified
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Isolated tenant workspace created. No permanent passwords are exposed in the
                    dashboard—the restaurant owner will be required to set a new permanent password
                    on their first login.
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-t border-b border-slate-100 py-4">
                <div>
                  <dt className="text-xs text-slate-500">Unique Restaurant ID</dt>
                  <dd className="font-mono font-semibold text-[#172B4D] mt-0.5">
                    {createdRestaurant.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Main Branch ID</dt>
                  <dd className="font-mono font-semibold text-[#172B4D] mt-0.5">
                    {createdRestaurant.branches[0]?.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Verified Account Email</dt>
                  <dd className="font-mono text-slate-800 mt-0.5">
                    {createdRestaurant.ownerEmail}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Subscription &amp; Rate</dt>
                  <dd className="font-medium text-slate-800 mt-0.5">
                    {createdRestaurant.subscriptionPlan} ({createdRestaurant.billingCycle}) ·{' '}
                    {formatCurrency(
                      createdRestaurant.billingCycle === 'Annual'
                        ? createdRestaurant.customAnnualPriceInr
                        : createdRestaurant.customMonthlyPriceInr
                    )}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#087F5B]" />
                  Temporary Owner Onboarding Link (Mandatory First-Login Password Setup)
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteUrl}
                    aria-label="Owner invitation link"
                    className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#172B4D] bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedInvite ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
              </div>
            </div>
          ) : step === 1 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="wiz-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Restaurant Name *
                </label>
                <input
                  id="wiz-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Green Leaf Bistro"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    errors.name ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="wiz-type" className="block text-xs font-semibold text-slate-700 mb-1">
                  Restaurant Category *
                </label>
                <select
                  id="wiz-type"
                  value={form.businessType}
                  onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Fine Casual Dining">Fine Casual Dining</option>
                  <option value="Multi-Cuisine Kitchen">Multi-Cuisine Kitchen</option>
                  <option value="Cafe & Bistro">Cafe &amp; Bistro</option>
                  <option value="Family Restaurant">Family Restaurant</option>
                  <option value="Coastal Dining">Coastal Dining</option>
                  <option value="Quick Service Dine-In">Quick Service Dine-In</option>
                </select>
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1">
                  Brand Monogram &amp; Color
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={2}
                    value={form.logoText}
                    onChange={(e) => setForm({ ...form, logoText: e.target.value.toUpperCase() })}
                    placeholder="GL"
                    aria-label="Logo monogram"
                    className="w-16 px-2.5 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg text-center"
                  />
                  <div className="flex items-center gap-1.5">
                    {BRAND_SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setForm({ ...form, logoColor: swatch })}
                        aria-label={`Select color ${swatch}`}
                        className={`w-6 h-6 rounded-md cursor-pointer ${
                          form.logoColor === swatch ? 'ring-2 ring-offset-1 ring-[#172B4D]' : ''
                        }`}
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="wiz-email" className="block text-xs font-semibold text-slate-700 mb-1">
                  Restaurant Email *
                </label>
                <input
                  id="wiz-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="desk@greenleaf.in"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    errors.email ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
              </div>

              <div>
                <label htmlFor="wiz-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Number *
                </label>
                <input
                  id="wiz-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 80 4111 2233"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    errors.phone ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="wiz-address" className="block text-xs font-semibold text-slate-700 mb-1">
                  Address *
                </label>
                <input
                  id="wiz-address"
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="24 Church Street"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    errors.address ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                {errors.address && <p className="text-xs text-red-600 mt-1">{errors.address}</p>}
              </div>

              <div>
                <label htmlFor="wiz-city" className="block text-xs font-semibold text-slate-700 mb-1">
                  City *
                </label>
                <input
                  id="wiz-city"
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Bengaluru"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    errors.city ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                {errors.city && <p className="text-xs text-red-600 mt-1">{errors.city}</p>}
              </div>

              <div>
                <label htmlFor="wiz-state" className="block text-xs font-semibold text-slate-700 mb-1">
                  State *
                </label>
                <input
                  id="wiz-state"
                  type="text"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  placeholder="Karnataka"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    errors.state ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                {errors.state && <p className="text-xs text-red-600 mt-1">{errors.state}</p>}
              </div>

              <div>
                <label htmlFor="wiz-country" className="block text-xs font-semibold text-slate-700 mb-1">
                  Country *
                </label>
                <input
                  id="wiz-country"
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    errors.country ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                {errors.country && <p className="text-xs text-red-600 mt-1">{errors.country}</p>}
              </div>

              <div>
                <label htmlFor="wiz-postal" className="block text-xs font-semibold text-slate-700 mb-1">
                  Postal Code *
                </label>
                <input
                  id="wiz-postal"
                  type="text"
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                  placeholder="560001"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    errors.postalCode ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                {errors.postalCode && <p className="text-xs text-red-600 mt-1">{errors.postalCode}</p>}
              </div>
            </div>
          ) : step === 2 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="wiz-owner-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    Owner Name *
                  </label>
                  <input
                    id="wiz-owner-name"
                    type="text"
                    value={form.ownerName}
                    onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                    placeholder="e.g., Priya Menon"
                    className={`w-full px-3 py-2 text-sm border rounded-lg ${
                      errors.ownerName ? 'border-red-400' : 'border-slate-300'
                    }`}
                  />
                  {errors.ownerName && (
                    <p className="text-xs text-red-600 mt-1">{errors.ownerName}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="wiz-owner-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                    Owner Contact Number *
                  </label>
                  <input
                    id="wiz-owner-phone"
                    type="tel"
                    value={form.ownerPhone}
                    onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })}
                    placeholder="+91 98450 99881"
                    className={`w-full px-3 py-2 text-sm border rounded-lg ${
                      errors.ownerPhone ? 'border-red-400' : 'border-slate-300'
                    }`}
                  />
                  {errors.ownerPhone && (
                    <p className="text-xs text-red-600 mt-1">{errors.ownerPhone}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="wiz-owner-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Account Email (Login) *
                  </label>
                  <input
                    id="wiz-owner-email"
                    type="email"
                    value={form.ownerEmail}
                    onChange={(e) => {
                      setForm({ ...form, ownerEmail: e.target.value });
                      setEmailVerified(false);
                      setEmailOtpSent(false);
                    }}
                    placeholder="priya@greenleaf.in"
                    className={`w-full px-3 py-2 text-sm border rounded-lg ${
                      errors.ownerEmail ? 'border-red-400' : 'border-slate-300'
                    }`}
                  />
                  {errors.ownerEmail && (
                    <p className="text-xs text-red-600 mt-1">{errors.ownerEmail}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="wiz-acc-status" className="block text-xs font-semibold text-slate-700 mb-1">
                    Account Status
                  </label>
                  <select
                    id="wiz-acc-status"
                    value={form.accountStatus}
                    onChange={(e) =>
                      setForm({ ...form, accountStatus: e.target.value as RestaurantStatus })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Setup Pending">Setup Pending (Recommended)</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Prototype Email OTP Verification Step */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-[#172B4D] flex items-center gap-1.5">
                      <MailCheck className="w-4 h-4 text-[#087F5B]" />
                      Email OTP Verification (Prototype Demo)
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Verify the restaurant owner email before creating the account.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendEmailOtp}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#172B4D] hover:bg-[#10203A] rounded-lg cursor-pointer self-start sm:self-auto whitespace-nowrap"
                  >
                    {emailOtpSent ? 'Resend Verification OTP' : 'Send Verification OTP'}
                  </button>
                </div>

                {emailOtpSent && !emailVerified && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-200">
                    <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      Prototype Mode: Demo OTP sent to{' '}
                      <span className="font-mono font-semibold">{form.ownerEmail}</span> — use code{' '}
                      <strong className="font-mono">{DEMO_EMAIL_OTP}</strong>
                    </div>
                    <div className="flex gap-2">
                      <input
                        id="wiz-email-otp"
                        type="text"
                        maxLength={6}
                        value={emailOtpInput}
                        onChange={(e) => setEmailOtpInput(e.target.value)}
                        placeholder="Enter 6-digit OTP"
                        aria-label="Email verification OTP"
                        className="flex-1 px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyEmailOtp}
                        className="px-4 py-2 text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer"
                      >
                        Verify Email
                      </button>
                    </div>
                  </div>
                )}

                {emailVerified && (
                  <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-[#087F5B] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Email verified ({form.ownerEmail}). Ready to configure subscription.
                  </div>
                )}

                {errors.emailOtp && (
                  <p role="alert" className="text-xs text-red-600">
                    {errors.emailOtp}
                  </p>
                )}
              </div>
            </div>
          ) : step === 3 ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-[#172B4D]">Select Subscription Plan</p>
                <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                  {(['Monthly', 'Annual'] as BillingCycle[]).map((cycle) => (
                    <button
                      key={cycle}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          billingCycle: cycle,
                          subscriptionExpiryDate: computeDefaultExpiryDate(
                            form.subscriptionStartDate,
                            cycle
                          ),
                        })
                      }
                      className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                        form.billingCycle === cycle
                          ? 'bg-white text-[#172B4D] shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {cycle}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {state.planCatalog.map((plan) => {
                  const selected = form.subscriptionPlan === plan.name;
                  const price =
                    form.billingCycle === 'Annual' ? plan.annualPriceInr : plan.monthlyPriceInr;
                  return (
                    <button
                      key={plan.name}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          subscriptionPlan: plan.name,
                          customMonthlyPriceInr: plan.monthlyPriceInr,
                          customAnnualPriceInr: plan.annualPriceInr,
                        })
                      }
                      className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? 'border-[#087F5B] bg-emerald-50/40 ring-1 ring-[#087F5B]'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <p className="font-display font-bold text-[#172B4D]">{plan.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{plan.audience}</p>
                      <p className="mt-3 font-mono text-lg font-bold text-[#087F5B] tabular-nums">
                        {formatCurrency(price)}
                        <span className="text-xs font-sans font-normal text-slate-500">
                          /{form.billingCycle === 'Annual' ? 'yr' : 'mo'}
                        </span>
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        Up to {plan.maxBranches} branch{plan.maxBranches > 1 ? 'es' : ''} ·{' '}
                        {plan.maxTables} tables
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label htmlFor="wiz-custom-mo" className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Monthly Price (₹)
                  </label>
                  <input
                    id="wiz-custom-mo"
                    type="number"
                    min="0"
                    value={form.customMonthlyPriceInr}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        customMonthlyPriceInr: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="wiz-custom-yr" className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Annual Price (₹)
                  </label>
                  <input
                    id="wiz-custom-yr"
                    type="number"
                    min="0"
                    value={form.customAnnualPriceInr}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        customAnnualPriceInr: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="wiz-start-date" className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    id="wiz-start-date"
                    type="date"
                    value={form.subscriptionStartDate}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        subscriptionStartDate: e.target.value,
                        subscriptionExpiryDate: computeDefaultExpiryDate(
                          e.target.value,
                          form.billingCycle
                        ),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="wiz-expiry-date" className="block text-xs font-semibold text-slate-700 mb-1">
                    Expiry Date
                  </label>
                  <input
                    id="wiz-expiry-date"
                    type="date"
                    value={form.subscriptionExpiryDate}
                    onChange={(e) =>
                      setForm({ ...form, subscriptionExpiryDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="wiz-sub-status" className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Subscription Status
                  </label>
                  <select
                    id="wiz-sub-status"
                    value={form.subscriptionStatus}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        subscriptionStatus: e.target.value as SubscriptionStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5 text-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-display font-bold text-[#172B4D]">Restaurant Information</h3>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-semibold text-[#087F5B] cursor-pointer"
                >
                  Edit
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-slate-500">Name</dt>
                  <dd className="font-semibold text-[#172B4D] mt-0.5">{form.name}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Category</dt>
                  <dd className="font-medium text-slate-800 mt-0.5">{form.businessType}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Email / Contact</dt>
                  <dd className="font-mono text-slate-700 mt-0.5">
                    {form.email} · {form.phone}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Location</dt>
                  <dd className="text-slate-700 mt-0.5">
                    {form.address}, {form.city}, {form.state} {form.postalCode}
                  </dd>
                </div>
              </dl>

              <div className="flex items-center justify-between pb-2 pt-2 border-b border-slate-100">
                <h3 className="font-display font-bold text-[#172B4D]">Account &amp; Verification</h3>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs font-semibold text-[#087F5B] cursor-pointer min-h-[36px] px-2 py-1"
                >
                  Edit
                </button>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 text-xs">
                <div>
                  <dt className="text-slate-500">Owner</dt>
                  <dd className="font-semibold text-[#172B4D] mt-0.5">{form.ownerName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Account Email</dt>
                  <dd className="font-mono text-slate-700 mt-0.5 break-all">{form.ownerEmail}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Email Verification</dt>
                  <dd className="font-semibold text-[#087F5B] mt-0.5">Verified via OTP</dd>
                </div>
              </dl>

              <div className="flex items-center justify-between pb-2 pt-2 border-b border-slate-100">
                <h3 className="font-display font-bold text-[#172B4D]">Subscription &amp; Billing</h3>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="text-xs font-semibold text-[#087F5B] cursor-pointer min-h-[36px] px-2 py-1"
                >
                  Edit
                </button>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 text-xs">
                <div>
                  <dt className="text-slate-500">Plan &amp; Cycle</dt>
                  <dd className="font-semibold text-[#172B4D] mt-0.5">
                    {form.subscriptionPlan} ({form.billingCycle})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Assigned Rate</dt>
                  <dd className="font-mono font-bold text-[#087F5B] mt-0.5">
                    {formatCurrency(
                      form.billingCycle === 'Annual'
                        ? form.customAnnualPriceInr
                        : form.customMonthlyPriceInr
                    )}
                    /{form.billingCycle === 'Annual' ? 'yr' : 'mo'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Validity</dt>
                  <dd className="font-mono text-slate-700 mt-0.5">
                    {form.subscriptionStartDate} → {form.subscriptionExpiryDate}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          {createdRestaurant ? (
            <>
              <span className="text-xs text-slate-500">
                Owner will set a permanent password on first login ({createdRestaurant.ownerEmail})
              </span>
              <button
                type="button"
                onClick={() => onCreated(createdRestaurant)}
                className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer"
              >
                Inspect Workspace
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between w-full gap-3">
              <button
                type="button"
                onClick={() => (step === 1 ? onClose() : setStep((s) => (s - 1) as 1 | 2 | 3))}
                className="px-4 py-2 min-h-[44px] text-sm font-medium text-slate-600 hover:text-[#172B4D] cursor-pointer"
              >
                {step === 1 ? 'Cancel' : 'Back'}
              </button>
              {step < 4 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-5 py-2 min-h-[44px] text-sm font-semibold text-white bg-[#172B4D] hover:bg-[#10203A] rounded-lg cursor-pointer"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  className="px-5 py-2 min-h-[44px] text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer"
                >
                  Create Restaurant
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
