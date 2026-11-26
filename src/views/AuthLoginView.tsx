import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { ServeQRLogo } from '../components/ServeQRLogo';
import { validateLoginForm } from '../domain/serveqrLogic';
import { useServeQR } from '../store/ServeQRStore';

interface AuthLoginViewProps {
  role: 'super-admin' | 'restaurant-owner';
  onSuccess: () => void;
  onBack: () => void;
}

export const AuthLoginView: React.FC<AuthLoginViewProps> = ({
  role,
  onSuccess,
  onBack,
}) => {
  const {
    state,
    backendMode,
    authenticateWithBackend,
    loginSuperAdmin,
    loginRestaurantOwner,
  } = useServeQR();
  const isSuperAdmin = role === 'super-admin';

  const [email, setEmail] = useState(
    isSuperAdmin ? 'admin@serveqr.io' : 'rahul@abcrestaurant.in'
  );
  const [password, setPassword] = useState('serveqr2026');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateLoginForm(email, password);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    if (backendMode) {
      setSubmitting(true);
      const res = await authenticateWithBackend(email, password, role);
      setSubmitting(false);
      if (!res.ok) {
        setErrors({ form: res.error });
        return;
      }
      setErrors({});
      onSuccess();
      return;
    }

    if (isSuperAdmin) {
      loginSuperAdmin(email);
      setErrors({});
      onSuccess();
      return;
    }

    const res = loginRestaurantOwner(email);
    if (!res.ok) {
      setErrors({ form: res.error });
      return;
    }
    setErrors({});
    onSuccess();
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim() || !resetEmail.includes('@')) return;
    setResetSent(true);
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#172B4D] cursor-pointer min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to ServeQR</span>
        </button>
        <ServeQRLogo size="sm" />
      </header>

      <main className="flex-1 flex items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-5 sm:p-8 shadow-xs">
          <div className="mb-6">
            <p className="text-xs font-semibold text-[#087F5B]">
              {isSuperAdmin ? 'Platform Governance' : 'Restaurant Workspace'}
            </p>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#172B4D] mt-1">
              {isSuperAdmin ? 'Super Admin Login' : 'Restaurant Owner Login'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
              {isSuperAdmin
                ? 'Sign in to manage registered restaurants, subscriptions, and platform analytics.'
                : 'Sign in with your onboarding email to manage your menu, tables, QR codes, KDS, and billing.'}
            </p>
          </div>

          {errors.form && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            >
              {errors.form}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-[#202938] mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email || errors.form) setErrors({});
                  }}
                  placeholder={isSuperAdmin ? 'admin@serveqr.io' : 'owner@restaurant.in'}
                  autoComplete="email"
                  className={`w-full pl-10 pr-3.5 py-2.5 min-h-[42px] text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#087F5B]/25 focus:border-[#087F5B] ${
                    errors.email ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-[#202938] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password || errors.form) setErrors({});
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className={`w-full pl-10 pr-10 py-2.5 min-h-[42px] text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#087F5B]/25 focus:border-[#087F5B] ${
                    errors.password ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#087F5B] focus:ring-[#087F5B]"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setResetSent(false);
                  setShowForgotModal(true);
                }}
                className="text-sm font-medium text-[#087F5B] hover:text-[#06674A] cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 min-h-[44px] text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] disabled:opacity-60 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F5B] focus-visible:ring-offset-2"
            >
              {submitting
                ? 'Authenticating...'
                : isSuperAdmin
                ? 'Login to Super Admin'
                : 'Login to Restaurant Dashboard'}
            </button>
          </form>

          {!isSuperAdmin && (
            <div className="mt-6 pt-5 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-2.5">
                Quick-fill registered restaurant owner workspace:
              </p>
              <div className="space-y-2">
                {state.restaurants.slice(0, 5).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setEmail(r.ownerEmail);
                      setPassword('serveqr2026');
                      setErrors({});
                    }}
                    className="w-full text-left px-3 py-2 min-h-[44px] rounded-lg border border-slate-200 hover:border-[#087F5B]/50 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-[#172B4D] truncate">
                      {r.name} ({r.ownerName})
                      {r.subscriptionStatus !== 'ACTIVE' && (
                        <span className="ml-1.5 text-[10px] font-mono text-amber-700">
                          [{r.subscriptionStatus}]
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-mono text-slate-500 truncate">
                      {r.ownerEmail}
                    </span>
                  </button>
                ))}
                {backendMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('kitchen@abcrestaurant.in');
                      setPassword('serveqr2026');
                      setErrors({});
                    }}
                    className="w-full text-left px-3 py-2 min-h-[44px] rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 hover:border-[#087F5B] hover:bg-emerald-50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-[#087F5B] truncate">
                      ABC Restaurant (Kitchen Staff — KDS Role)
                    </span>
                    <span className="text-xs font-mono text-slate-600 truncate">
                      kitchen@abcrestaurant.in
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {showForgotModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-pw-title"
        >
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-2xl max-h-[90dvh] flex flex-col">
            <h2 id="forgot-pw-title" className="font-display text-lg font-bold text-[#172B4D]">
              Reset Password
            </h2>
            {resetSent ? (
              <div className="mt-4">
                <div className="flex items-start gap-2.5 text-sm text-[#087F5B]">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>
                    A secure password setup link has been queued for{' '}
                    <span className="font-mono font-medium">{resetEmail}</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="mt-5 w-full py-2.5 px-4 min-h-[44px] text-sm font-semibold text-white bg-[#172B4D] rounded-lg cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="mt-3 space-y-4">
                <p className="text-xs sm:text-sm text-slate-600">
                  Enter your account email and we will generate a secure password reset invitation.
                </p>
                <div>
                  <label htmlFor="reset-email" className="block text-xs sm:text-sm font-medium text-[#202938] mb-1">
                    Email address
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full px-3.5 py-2 min-h-[42px] text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#087F5B]/25 focus:border-[#087F5B]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-3.5 py-2 min-h-[44px] text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 min-h-[44px] text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer"
                  >
                    Send Reset Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
