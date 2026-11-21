import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight } from 'lucide-react';
import {
  computePopularItems,
  computeRestaurantMetrics,
  formatCurrency,
  scopeOrdersByRestaurant,
  scopeTablesByRestaurant,
} from '../../domain/serveqrLogic';
import type { Restaurant } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { StatusLabel } from '../../components/StatusText';
import { RestaurantBrandAvatar } from '../../components/RestaurantBrandAvatar';
import type { RestaurantSection } from './RestaurantLayout';

interface RestaurantDashboardProps {
  restaurant: Restaurant;
  onNavigateSection: (section: RestaurantSection) => void;
}

export const RestaurantDashboard: React.FC<RestaurantDashboardProps> = ({
  restaurant,
  onNavigateSection,
}) => {
  const { state } = useServeQR();
  const orders = scopeOrdersByRestaurant(state.orders, restaurant.id);
  const tables = scopeTablesByRestaurant(state.tables, restaurant.id);
  const metrics = computeRestaurantMetrics(orders, tables);
  const popularItems = computePopularItems(orders);
  const cur = restaurant.settings.currencySymbol;

  const salesSeries = [
    { slot: '12 PM', sales: Math.round(metrics.totalSales * 0.14) },
    { slot: '2 PM', sales: Math.round(metrics.totalSales * 0.24) },
    { slot: '4 PM', sales: Math.round(metrics.totalSales * 0.12) },
    { slot: '6 PM', sales: Math.round(metrics.totalSales * 0.18) },
    { slot: '8 PM', sales: Math.round(metrics.totalSales * 0.32) },
  ];

  const kpis = [
    { label: "Today's Orders", value: String(metrics.todayOrders) },
    { label: 'Total Sales', value: formatCurrency(metrics.totalSales, cur) },
    { label: 'Pending Orders', value: String(metrics.pendingOrders) },
    { label: 'Preparing Orders', value: String(metrics.preparingOrders) },
    { label: 'Completed Orders', value: String(metrics.completedOrders) },
    { label: 'Total Tables', value: String(metrics.totalTables) },
    { label: 'Active QR Tables', value: String(metrics.activeQrTables) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <RestaurantBrandAvatar restaurant={restaurant} size="lg" />
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold text-[#172B4D] truncate">
              {restaurant.name} Overview
            </h2>
            <p className="text-sm text-slate-600 mt-0.5 truncate">
              {restaurant.branches[0]?.name} · {restaurant.settings.operatingHours}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigateSection('kds')}
            className="px-4 py-2 text-xs font-semibold text-[#172B4D] bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
          >
            Open Kitchen Display
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('billing')}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer whitespace-nowrap"
          >
            Cashier &amp; Billing
          </button>
        </div>
      </div>

      {/* 7 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3.5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">{kpi.label}</p>
            <p className="mt-2 font-mono text-xl font-bold text-[#172B4D] tabular-nums">
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Sales Chart + Table Occupancy Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-base font-bold text-[#172B4D]">
                Intraday Sales Trend
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Live dine-in order volume distribution ({restaurant.settings.currencyCode})
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('reports')}
              className="text-xs font-semibold text-[#087F5B] inline-flex items-center gap-1 cursor-pointer"
            >
              Full reports <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="serveqrSalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#087F5B" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#087F5B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="slot" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [`${cur}${Number(v ?? 0).toLocaleString('en-IN')}`, 'Sales']}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#087F5B"
                  strokeWidth={2}
                  fill="url(#serveqrSalesGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-bold text-[#172B4D]">
                Table Occupancy
              </h3>
              <button
                type="button"
                onClick={() => onNavigateSection('tables')}
                className="text-xs font-semibold text-[#087F5B] cursor-pointer"
              >
                Manage
              </button>
            </div>

            {tables.length === 0 ? (
              <p className="text-xs text-slate-500 py-6">
                No tables configured yet. Add tables to generate QR codes.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {tables.slice(0, 8).map((table) => (
                  <div
                    key={table.id}
                    className={`p-3 rounded-lg border ${
                      table.status === 'Occupied'
                        ? 'border-[#172B4D]/25 bg-slate-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold text-[#172B4D]">
                        {table.tableNumber}
                      </span>
                      <StatusLabel status={table.status} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {table.section} · {table.capacity} seats
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Occupied Now</span>
            <span className="font-mono font-semibold text-[#172B4D] tabular-nums">
              {metrics.occupiedTables} / {metrics.totalTables}
            </span>
          </div>
        </section>
      </div>

      {/* Recent Orders + Popular Items */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-[#172B4D]">Recent Orders</h3>
            <button
              type="button"
              onClick={() => onNavigateSection('orders')}
              className="text-xs font-semibold text-[#087F5B] inline-flex items-center gap-1 cursor-pointer"
            >
              All orders <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-5">Order</th>
                  <th className="py-3 px-4">Table</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-slate-500">
                      No orders yet. Test a Table QR code to place your first live dine-in order.
                    </td>
                  </tr>
                ) : (
                  orders.slice(0, 6).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-5">
                        <p className="font-mono text-xs font-semibold text-[#172B4D]">{order.id}</p>
                        <p className="text-xs text-slate-500">
                          {order.customerName || 'Guest'}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-700">
                        {order.tableNumber}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                        {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums">
                        {formatCurrency(order.totalAmount, cur)}
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
        </section>

        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base font-bold text-[#172B4D]">
              Popular Food Items
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSection('menu')}
              className="text-xs font-semibold text-[#087F5B] cursor-pointer"
            >
              Edit Menu
            </button>
          </div>
          {popularItems.length === 0 ? (
            <p className="text-xs text-slate-500 py-6">
              Popular item rankings will appear once guests place orders.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {popularItems.slice(0, 5).map((item, idx) => (
                <div
                  key={item.menuItemId}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#172B4D] truncate">
                      {idx + 1}. {item.name}
                    </p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      {item.quantity} ordered
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-[#087F5B] tabular-nums shrink-0">
                    {formatCurrency(item.revenue, cur)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
