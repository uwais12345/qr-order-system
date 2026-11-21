import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Plus } from 'lucide-react';
import { computeSuperAdminMetrics, formatCurrency } from '../../domain/serveqrLogic';
import type { Restaurant } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { StatusLabel } from '../../components/StatusText';

interface SuperAdminDashboardProps {
  onOpenAddRestaurant: () => void;
  onInspectRestaurant: (restaurant: Restaurant) => void;
  onViewAllRestaurants: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  onOpenAddRestaurant,
  onInspectRestaurant,
  onViewAllRestaurants,
}) => {
  const { state } = useServeQR();
  const metrics = computeSuperAdminMetrics(state.restaurants, state.orders);

  const revenueByRestaurant = state.restaurants.map((rest) => {
    const restOrders = state.orders.filter(
      (o) => o.restaurantId === rest.id && o.status !== 'Cancelled'
    );
    const revenue = restOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    return {
      name: rest.name.length > 16 ? `${rest.name.slice(0, 15)}…` : rest.name,
      revenue: Math.round(revenue),
      orders: restOrders.length,
    };
  });

  const statusBreakdown = [
    { label: 'Active', count: state.restaurants.filter((r) => r.status === 'Active').length, color: 'bg-[#087F5B]' },
    { label: 'Setup Pending', count: state.restaurants.filter((r) => r.status === 'Setup Pending').length, color: 'bg-amber-500' },
    { label: 'Inactive', count: state.restaurants.filter((r) => r.status === 'Inactive').length, color: 'bg-slate-400' },
    { label: 'Suspended', count: state.restaurants.filter((r) => r.status === 'Suspended').length, color: 'bg-red-500' },
  ];

  const kpis = [
    { label: 'Total Restaurants', value: String(metrics.totalRestaurants) },
    { label: 'Active Restaurants', value: String(metrics.activeRestaurants) },
    { label: 'Inactive / Suspended', value: String(metrics.inactiveRestaurants) },
    { label: 'Total Orders', value: String(metrics.totalOrders) },
    { label: 'Total Revenue', value: formatCurrency(metrics.totalRevenue) },
    { label: 'Pending Setups', value: String(metrics.pendingSetups) },
  ];

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div>
        <h2 className="font-display text-2xl font-bold text-[#172B4D]">Platform Overview</h2>
        <p className="text-sm text-slate-600 mt-0.5">
          Monitor tenant workspaces, order volume, and revenue across ServeQR.
        </p>
      </div>

      {/* 6 KPI Stat Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
          >
            <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-[#172B4D] tabular-nums">
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Revenue Chart + Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="font-display text-base font-bold text-[#172B4D]">
                Revenue &amp; Orders by Restaurant
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Live gross order value across registered tenants (INR)
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              Subscription MRR: {formatCurrency(metrics.subscriptionMrr)}
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByRestaurant} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`₹${Number(value ?? 0).toLocaleString('en-IN')}`, 'Order Revenue']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="revenue"
                  fill="#087F5B"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={52}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-[#172B4D]">
              Restaurant Status Overview
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribution of workspace lifecycle states
            </p>

            <div className="mt-6 space-y-4">
              {statusBreakdown.map((row) => {
                const pct =
                  metrics.totalRestaurants > 0
                    ? Math.round((row.count / metrics.totalRestaurants) * 100)
                    : 0;
                return (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium text-[#202938]">{row.label}</span>
                      <span className="font-mono text-xs text-slate-600 tabular-nums">
                        {row.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${row.color} rounded-full transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Active QR Tables Platform-Wide</span>
            <span className="font-mono font-semibold text-[#172B4D] tabular-nums">
              {state.tables.length} tables
            </span>
          </div>
        </section>
      </div>

      {/* Recent Registrations + Platform Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-[#172B4D]">
              Recent Restaurant Registrations
            </h3>
            <button
              type="button"
              onClick={onViewAllRestaurants}
              className="text-xs font-semibold text-[#087F5B] hover:text-[#06674A] inline-flex items-center gap-1 cursor-pointer"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 bg-slate-50/70">
                  <th className="py-3 px-6">Restaurant</th>
                  <th className="py-3 px-4">Owner</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {state.restaurants.slice(0, 5).map((rest) => (
                  <tr key={rest.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-6">
                      <p className="font-semibold text-[#172B4D]">{rest.name}</p>
                      <p className="text-xs font-mono text-slate-500">
                        {rest.id} · {rest.city}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{rest.ownerName}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {rest.subscriptionPlan} · {rest.billingCycle}
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel status={rest.status} />
                    </td>
                    <td className="py-3 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => onInspectRestaurant(rest)}
                        className="text-xs font-semibold text-[#087F5B] hover:text-[#06674A] cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="font-display text-base font-bold text-[#172B4D] mb-4">
            Recent Platform Activity
          </h3>
          <div className="divide-y divide-slate-100">
            {state.activities.slice(0, 6).map((act) => (
              <div key={act.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#172B4D] truncate">
                    {act.restaurantName}
                  </p>
                  <span className="text-xs font-mono text-slate-400 shrink-0 tabular-nums">
                    {new Date(act.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-xs text-[#087F5B] font-medium mt-0.5">{act.action}</p>
                <p className="text-xs text-slate-600 mt-0.5">{act.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
