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
import { CheckCircle2 } from 'lucide-react';
import {
  computePaymentBreakdown,
  computePopularItems,
  computeTablePerformance,
  formatCurrency,
  scopeBillsByRestaurant,
  scopeOrdersByRestaurant,
  scopeTablesByRestaurant,
} from '../../domain/serveqrLogic';
import type { Restaurant } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';

interface RestaurantProps {
  restaurant: Restaurant;
}

export const RestaurantReportsView: React.FC<RestaurantProps> = ({ restaurant }) => {
  const { state } = useServeQR();
  const [period, setPeriod] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');

  const orders = scopeOrdersByRestaurant(state.orders, restaurant.id);
  const tables = scopeTablesByRestaurant(state.tables, restaurant.id);
  const bills = scopeBillsByRestaurant(state.bills, restaurant.id);
  const cur = restaurant.settings.currencySymbol;

  const validOrders = orders.filter((o) => o.status !== 'Cancelled');
  const baseRevenue = validOrders.reduce((s, o) => s + o.totalAmount, 0);
  const multiplier = period === 'Daily' ? 1 : period === 'Weekly' ? 6.4 : 26.8;
  const periodRevenue = Math.round(baseRevenue * multiplier);
  const periodOrderCount = Math.round(validOrders.length * multiplier);
  const avgTicket = periodOrderCount > 0 ? Math.round(periodRevenue / periodOrderCount) : 0;

  const chartData =
    period === 'Daily'
      ? [
          { label: '12 PM', revenue: Math.round(baseRevenue * 0.16) },
          { label: '2 PM', revenue: Math.round(baseRevenue * 0.25) },
          { label: '5 PM', revenue: Math.round(baseRevenue * 0.14) },
          { label: '8 PM', revenue: Math.round(baseRevenue * 0.28) },
          { label: '10 PM', revenue: Math.round(baseRevenue * 0.17) },
        ]
      : period === 'Weekly'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, idx) => ({
          label: d,
          revenue: Math.round(baseRevenue * (0.7 + (idx % 4) * 0.22)),
        }))
      : ['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((w, idx) => ({
          label: w,
          revenue: Math.round(baseRevenue * (5.8 + idx * 0.7)),
        }));

  const popularItems = computePopularItems(orders);
  const paymentBreakdown = computePaymentBreakdown(bills);
  const tablePerformance = computeTablePerformance(tables, orders);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#172B4D]">
            Reports &amp; Analytics
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Sales velocity, popular menu items, payment method breakdown, and table turnover.
          </p>
        </div>

        <div className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex p-1 bg-slate-200/70 rounded-lg self-start">
          {(['Daily', 'Weekly', 'Monthly'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-2 min-h-[40px] text-xs font-semibold rounded-md cursor-pointer text-center transition-all ${
                period === p
                  ? 'bg-white text-[#172B4D] shadow-xs'
                  : 'text-slate-600 hover:text-[#172B4D]'
              }`}
            >
              {p} Sales
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">{period} Gross Revenue</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-[#087F5B] tabular-nums">
            {formatCurrency(periodRevenue, cur)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">{period} Total Orders</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-[#172B4D] tabular-nums">
            {periodOrderCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Average Order Value</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-[#172B4D] tabular-nums">
            {formatCurrency(avgTicket, cur)}
          </p>
        </div>
      </div>

      {/* Revenue Chart + Payment Report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="font-display text-base font-bold text-[#172B4D] mb-4">
            {period} Revenue Report
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [
                    `${cur}${Number(v ?? 0).toLocaleString('en-IN')}`,
                    'Revenue',
                  ]}
                />
                <Bar
                  dataKey="revenue"
                  fill="#087F5B"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="font-display text-base font-bold text-[#172B4D] mb-4">
            Payment Method Report
          </h3>
          <div className="divide-y divide-slate-100">
            {paymentBreakdown.map((row) => (
              <div key={row.method} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#172B4D]">{row.method}</p>
                  <p className="text-xs text-slate-500 font-mono">
                    {row.count} settled bill{row.count === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="font-mono font-semibold text-[#087F5B] tabular-nums">
                  {formatCurrency(row.amount, cur)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Popular Items + Table Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-display text-base font-bold text-[#172B4D]">Popular Items</h3>
          </div>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                <th className="py-3 px-6">Dish</th>
                <th className="py-3 px-4 text-right">Qty Sold</th>
                <th className="py-3 px-6 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {popularItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-xs text-slate-500">
                    No item sales recorded yet.
                  </td>
                </tr>
              ) : (
                popularItems.map((item) => (
                  <tr key={item.menuItemId}>
                    <td className="py-3 px-6 font-medium text-[#172B4D]">{item.name}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{item.quantity}</td>
                    <td className="py-3 px-6 text-right font-mono font-semibold text-[#087F5B] tabular-nums">
                      {formatCurrency(item.revenue, cur)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-display text-base font-bold text-[#172B4D]">Table Performance</h3>
          </div>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                <th className="py-3 px-6">Table</th>
                <th className="py-3 px-4">Section</th>
                <th className="py-3 px-4 text-right">Orders</th>
                <th className="py-3 px-6 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tablePerformance.map((row) => (
                <tr key={row.tableNumber}>
                  <td className="py-3 px-6 font-mono font-bold text-[#172B4D]">
                    {row.tableNumber}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">{row.section}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{row.orderCount}</td>
                  <td className="py-3 px-6 text-right font-mono font-semibold text-[#087F5B] tabular-nums">
                    {formatCurrency(row.revenue, cur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
};

export const RestaurantSettingsView: React.FC<RestaurantProps> = ({ restaurant }) => {
  const {
    updateRestaurantBranding,
    updateRestaurantProfile,
    updateBranchInfo,
    updateRestaurantSettings,
  } = useServeQR();
  const mainBranch = restaurant.branches[0];
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState({
    name: restaurant.name,
    businessType: restaurant.businessType,
    email: restaurant.email,
    phone: restaurant.phone,
    address: restaurant.address,
    city: restaurant.city,
  });

  const [branch, setBranch] = useState({
    name: mainBranch?.name ?? '',
    address: mainBranch?.address ?? '',
    city: mainBranch?.city ?? '',
    phone: mainBranch?.phone ?? '',
  });

  const [logoPreview, setLogoPreview] = useState<string | undefined>(restaurant.logoImageUrl);
  const [logoError, setLogoError] = useState('');
  const [settings, setSettings] = useState(restaurant.settings);
  const [savedBanner, setSavedBanner] = useState(false);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoError('Please upload a PNG, JPG, SVG, or WebP image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError('Logo image must be smaller than 5 MB.');
      return;
    }
    setLogoError('');
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : undefined;
      if (!rawDataUrl) return;

      // For vector SVG, store directly
      if (file.type === 'image/svg+xml') {
        setLogoPreview(rawDataUrl);
        updateRestaurantBranding(restaurant.id, { logoImageUrl: rawDataUrl });
        setSavedBanner(true);
        window.setTimeout(() => setSavedBanner(false), 2500);
        return;
      }

      // For bitmap images, resize using offscreen canvas to max 256x256 px (~15-30KB)
      // This protects localStorage from quota overflow while ensuring razor-sharp avatar display
      const img = new Image();
      img.onload = () => {
        const maxDim = 256;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const optimizedUrl = canvas.toDataURL('image/jpeg', 0.85);
          setLogoPreview(optimizedUrl);
          updateRestaurantBranding(restaurant.id, { logoImageUrl: optimizedUrl });
          setSavedBanner(true);
          window.setTimeout(() => setSavedBanner(false), 2500);
        } else {
          setLogoPreview(rawDataUrl);
          updateRestaurantBranding(restaurant.id, { logoImageUrl: rawDataUrl });
          setSavedBanner(true);
          window.setTimeout(() => setSavedBanner(false), 2500);
        }
      };
      img.onerror = () => {
        setLogoPreview(rawDataUrl);
        updateRestaurantBranding(restaurant.id, { logoImageUrl: rawDataUrl });
        setSavedBanner(true);
        window.setTimeout(() => setSavedBanner(false), 2500);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    setLogoPreview(undefined);
    setLogoError('');
    updateRestaurantBranding(restaurant.id, { logoImageUrl: null });
    setSavedBanner(true);
    window.setTimeout(() => setSavedBanner(false), 2500);
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    updateRestaurantBranding(restaurant.id, {
      name: profile.name,
      logoImageUrl: logoPreview ?? null,
    });
    updateRestaurantProfile(restaurant.id, profile);
    if (mainBranch) {
      updateBranchInfo(restaurant.id, mainBranch.id, branch);
    }
    updateRestaurantSettings(restaurant.id, {
      ...settings,
      customerSettings: {
        ...settings.customerSettings,
        customerNameRequirement: 'Mandatory',
        mobileNumberRequirement: 'Mandatory',
      },
    });
    setSavedBanner(true);
    window.setTimeout(() => setSavedBanner(false), 2500);
  };

  return (
    <form onSubmit={handleSaveAll} className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#172B4D]">Restaurant Settings</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Customize restaurant branding, payment options, tax rules, and guest checkout settings.
          </p>
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer self-start sm:self-auto"
        >
          Save Configuration
        </button>
      </div>

      {savedBanner && (
        <div
          role="status"
          className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-[#087F5B] font-medium flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Restaurant settings updated and synced immediately to your dashboard &amp; customer QR
          menu.
        </div>
      )}

      {/* RESTAURANT BRANDING SECTION */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#172B4D]">Restaurant Branding</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Your uploaded logo displays across the Restaurant Admin dashboard, Customer QR landing
            page, and Customer digital menu top bar.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-5 pt-1">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center bg-slate-50 shrink-0">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt={`${profile.name} logo preview`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span
                  className="w-full h-full flex items-center justify-center text-white font-display text-xl font-bold"
                  style={{ backgroundColor: restaurant.logoColor }}
                >
                  {restaurant.logoText}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#172B4D]">
                {logoPreview ? 'Custom Logo Active' : 'Using Initials Monogram'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                PNG, JPG, WebP, or SVG · Recommended square (256×256px, max 2 MB)
              </p>
              {logoError && (
                <p role="alert" className="text-xs text-red-600 mt-1">
                  {logoError}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:ml-auto flex-wrap">
            <input
              ref={fileInputRef}
              id="brand-logo-upload"
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="sr-only"
              aria-label="Upload restaurant logo"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-[#172B4D] hover:bg-[#10203A] rounded-lg cursor-pointer"
            >
              {logoPreview ? 'Replace Logo' : 'Upload Logo'}
            </button>
            {logoPreview && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer"
              >
                Remove Logo
              </button>
            )}
          </div>
        </div>
      </section>

      {/* PAYMENT SETTINGS SECTION */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#172B4D]">
            Customer Payment Settings
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Online Payment is always enabled by default. Optionally enable Pay at Restaurant for
            table-side cashier settlement.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[#172B4D]">Online Payment</p>
              <p className="text-xs text-slate-600 mt-1">
                Always available as the default customer checkout method (prototype demo gateway).
              </p>
            </div>
            <span className="px-2.5 py-1 text-[11px] font-bold text-[#087F5B] bg-emerald-100 rounded-md whitespace-nowrap">
              Always On
            </span>
          </div>

          <label className="p-4 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-3 cursor-pointer hover:border-slate-300 transition-colors">
            <div>
              <p className="text-sm font-bold text-[#172B4D]">Pay at Restaurant</p>
              <p className="text-xs text-slate-600 mt-1">
                Default: Disabled. When enabled, guests can choose between Online Payment and Pay at
                Restaurant at checkout.
              </p>
            </div>
            <input
              type="checkbox"
              aria-label="Enable Pay at Restaurant"
              checked={settings.payAtRestaurantEnabled}
              onChange={(e) => {
                const nextSettings = {
                  ...settings,
                  payAtRestaurantEnabled: e.target.checked,
                };
                setSettings(nextSettings);
                updateRestaurantSettings(restaurant.id, nextSettings);
              }}
              className="mt-1 w-5 h-5 rounded border-slate-300 text-[#087F5B] shrink-0 cursor-pointer"
            />
          </label>
        </div>
      </section>

      {/* Restaurant Profile & Branch */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="font-display text-base font-bold text-[#172B4D]">Restaurant Profile</h3>
          <div>
            <label htmlFor="set-r-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Restaurant Display Name
            </label>
            <input
              id="set-r-name"
              type="text"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="set-r-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Email
              </label>
              <input
                id="set-r-email"
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="set-r-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Phone
              </label>
              <input
                id="set-r-phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label htmlFor="set-r-hours" className="block text-xs font-semibold text-slate-700 mb-1">
              Operating Hours
            </label>
            <input
              id="set-r-hours"
              type="text"
              value={settings.operatingHours}
              onChange={(e) => setSettings({ ...settings, operatingHours: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-r-welcome" className="block text-xs font-semibold text-slate-700 mb-1">
              QR Entry Welcome Message
            </label>
            <textarea
              id="set-r-welcome"
              rows={2}
              value={settings.welcomeMessage}
              onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="font-display text-base font-bold text-[#172B4D]">
            Branch, Tax &amp; Currency
          </h3>
          <div>
            <label htmlFor="set-b-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Main Branch Name
            </label>
            <input
              id="set-b-name"
              type="text"
              value={branch.name}
              onChange={(e) => setBranch({ ...branch, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="set-b-addr" className="block text-xs font-semibold text-slate-700 mb-1">
              Branch Address
            </label>
            <input
              id="set-b-addr"
              type="text"
              value={branch.address}
              onChange={(e) => setBranch({ ...branch, address: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="set-tax-label" className="block text-xs font-semibold text-slate-700 mb-1">
                Tax Label
              </label>
              <input
                id="set-tax-label"
                type="text"
                value={settings.taxLabel}
                onChange={(e) => setSettings({ ...settings, taxLabel: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="set-tax-rate" className="block text-xs font-semibold text-slate-700 mb-1">
                Tax Rate (%)
              </label>
              <input
                id="set-tax-rate"
                type="number"
                min="0"
                max="28"
                step="0.5"
                value={settings.taxRatePercent}
                onChange={(e) =>
                  setSettings({ ...settings, taxRatePercent: Number(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="set-currency" className="block text-xs font-semibold text-slate-700 mb-1">
                Currency
              </label>
              <select
                id="set-currency"
                value={settings.currencyCode}
                onChange={(e) => {
                  const code = e.target.value;
                  const symbol = code === 'USD' ? '$' : code === 'EUR' ? '€' : '₹';
                  setSettings({ ...settings, currencyCode: code, currencySymbol: symbol });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      {/* Customer Verification & Order Settings */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#172B4D]">
            Customer Checkout &amp; Verification Controls
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Customer Name and 10-digit Indian Mobile Number are mandatory at checkout. No guest
            account registration or login is required.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.customerSettings.guestOrderingEnabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  customerSettings: {
                    ...settings.customerSettings,
                    guestOrderingEnabled: e.target.checked,
                  },
                })
              }
              className="mt-1 w-4 h-4 rounded border-slate-300 text-[#087F5B]"
            />
            <span>
              <span className="font-semibold text-[#172B4D] block text-xs">Guest QR Ordering</span>
              <span className="text-xs text-slate-500">Order directly without login</span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.customerSettings.otpVerificationEnabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  customerSettings: {
                    ...settings.customerSettings,
                    otpVerificationEnabled: e.target.checked,
                  },
                })
              }
              className="mt-1 w-4 h-4 rounded border-slate-300 text-[#087F5B]"
            />
            <span>
              <span className="font-semibold text-[#172B4D] block text-xs">Mobile OTP Check</span>
              <span className="text-xs text-slate-500">Require demo OTP before checkout</span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.customerSettings.waiterApprovalRequired}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  customerSettings: {
                    ...settings.customerSettings,
                    waiterApprovalRequired: e.target.checked,
                  },
                })
              }
              className="mt-1 w-4 h-4 rounded border-slate-300 text-[#087F5B]"
            />
            <span>
              <span className="font-semibold text-[#172B4D] block text-xs">Waiter Approval</span>
              <span className="text-xs text-slate-500">Hold orders until table confirmation</span>
            </span>
          </label>
        </div>
      </section>
    </form>
  );
};
