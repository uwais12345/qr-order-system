import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  formatCurrency,
  getNextOrderStatus,
  scopeOrdersByRestaurant,
} from '../../domain/serveqrLogic';
import type { OrderStatus, Restaurant } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { StatusLabel } from '../../components/StatusText';

interface OrdersViewProps {
  restaurant: Restaurant;
}

const ORDER_FILTERS: Array<'All' | OrderStatus> = [
  'All',
  'Pending',
  'Accepted',
  'Preparing',
  'Ready',
  'Served',
  'Completed',
  'Cancelled',
];

export const OrdersView: React.FC<OrdersViewProps> = ({ restaurant }) => {
  const { state, updateOrderStatus } = useServeQR();
  const orders = scopeOrdersByRestaurant(state.orders, restaurant.id);
  const cur = restaurant.settings.currencySymbol;

  const [statusFilter, setStatusFilter] = useState<'All' | OrderStatus>('All');
  const [query, setQuery] = useState('');

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== 'All' && order.status !== statusFilter) return false;
      if (!q) return true;
      return (
        order.id.toLowerCase().includes(q) ||
        order.tableNumber.toLowerCase().includes(q) ||
        (order.customerName || 'guest').toLowerCase().includes(q) ||
        order.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [orders, query, statusFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#172B4D]">Order Management</h2>
        <p className="text-sm text-slate-600 mt-0.5">
          Track every incoming dine-in order across tables and advance preparation status in real
          time.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {ORDER_FILTERS.map((st) => {
            const count =
              st === 'All' ? orders.length : orders.filter((o) => o.status === st).length;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-[#172B4D] shadow-xs'
                    : 'text-slate-600 hover:text-[#172B4D]'
                }`}
              >
                {st} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order ID, table, guest..."
            aria-label="Search orders"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      {/* Desktop Orders Table (md and above) */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-3.5 px-5">Order ID</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Table</th>
                <th className="py-3.5 px-4">Ordered Items</th>
                <th className="py-3.5 px-4 text-right">Qty</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-4">Time</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-5 text-right">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-slate-500">
                    No orders match the current filter.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                  const nextStatus = getNextOrderStatus(order.status);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-5 font-mono text-xs font-bold text-[#172B4D] whitespace-nowrap">
                        {order.id}
                      </td>
                      <td className="py-3.5 px-4 text-slate-800 whitespace-nowrap">
                        <p className="font-medium text-xs">
                          {order.customerName || 'Walk-in Guest'}
                        </p>
                        {order.customerPhone && (
                          <p className="text-[11px] font-mono text-slate-500">
                            {order.customerPhone}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-[#172B4D]">
                        {order.tableNumber}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-700 max-w-xs">
                        {order.items.map((item) => (
                          <div key={item.id} className="truncate">
                            {item.quantity}× {item.name}
                            {item.selectedCustomizations.length > 0 && (
                              <span className="text-slate-400">
                                {' '}
                                ({item.selectedCustomizations.map((c) => c.choiceLabel).join(', ')})
                              </span>
                            )}
                          </div>
                        ))}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">
                        {totalQty}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <p className="font-mono text-xs font-semibold text-[#172B4D] tabular-nums">
                          {formatCurrency(order.totalAmount, cur)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {order.orderPaymentMethod ?? 'Pay at Restaurant'} ·{' '}
                          <span
                            className={
                              order.paymentStatus === 'Paid'
                                ? 'text-[#087F5B] font-semibold'
                                : 'text-amber-700 font-semibold'
                            }
                          >
                            {order.paymentStatus}
                          </span>
                        </p>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                        {new Date(order.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusLabel status={order.status} />
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {nextStatus && order.status !== 'Cancelled' && (
                            <button
                              type="button"
                              onClick={() => updateOrderStatus(order.id, nextStatus)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-md cursor-pointer transition-colors"
                            >
                              Mark {nextStatus}
                            </button>
                          )}
                          {(order.status === 'Pending' || order.status === 'Accepted') && (
                            <button
                              type="button"
                              onClick={() => updateOrderStatus(order.id, 'Cancelled')}
                              className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-md cursor-pointer transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Orders Card View (screens below md: 320px - 767px) */}
      <div className="block md:hidden space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            No orders match the current filter.
          </div>
        ) : (
          filteredOrders.map((order) => {
            const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
            const nextStatus = getNextOrderStatus(order.status);
            return (
              <article
                key={order.id}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs"
              >
                {/* Header Row: Table Badge, Order ID & Status */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-[#087F5B]/10 text-[#087F5B] font-mono font-bold text-xs">
                      Table {order.tableNumber}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#172B4D]">
                      {order.id}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusLabel status={order.status} />
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {new Date(order.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {/* Customer Details */}
                <div className="text-xs text-slate-600 flex items-center justify-between">
                  <span className="font-semibold text-[#172B4D]">
                    {order.customerName || 'Walk-in Guest'}
                  </span>
                  {order.customerPhone && (
                    <span className="font-mono text-slate-500">{order.customerPhone}</span>
                  )}
                </div>

                {/* Items Breakdown */}
                <div className="bg-slate-50/80 rounded-lg p-2.5 space-y-1.5 text-xs text-slate-700">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-2">
                      <span className="leading-snug">
                        <strong className="text-[#172B4D] font-mono">{item.quantity}×</strong>{' '}
                        {item.name}
                        {item.selectedCustomizations.length > 0 && (
                          <span className="text-slate-400 block text-[11px]">
                            {item.selectedCustomizations.map((c) => c.choiceLabel).join(', ')}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  <div className="pt-1 border-t border-slate-200/60 flex justify-between text-[11px] text-slate-500 font-medium">
                    <span>Total items</span>
                    <span className="font-mono font-semibold text-slate-700">{totalQty}</span>
                  </div>
                </div>

                {/* Amount and Payment Status */}
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <div>
                    <span className="text-slate-500">Total: </span>
                    <span className="font-mono font-bold text-base text-[#172B4D] tabular-nums">
                      {formatCurrency(order.totalAmount, cur)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        order.paymentStatus === 'Paid'
                          ? 'bg-emerald-50 text-[#087F5B]'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {order.paymentStatus}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {order.orderPaymentMethod ?? 'Pay at Restaurant'}
                    </p>
                  </div>
                </div>

                {/* Order Status Action Buttons (touch friendly: min-h-[44px]) */}
                <div className="pt-1 flex items-center gap-2">
                  {nextStatus && order.status !== 'Cancelled' && (
                    <button
                      type="button"
                      onClick={() => updateOrderStatus(order.id, nextStatus)}
                      className="flex-1 min-h-[44px] px-4 py-2 text-xs font-bold text-white bg-[#087F5B] hover:bg-[#06674A] active:bg-[#05513A] rounded-xl cursor-pointer transition-colors text-center shadow-xs"
                    >
                      Mark as {nextStatus}
                    </button>
                  )}
                  {(order.status === 'Pending' || order.status === 'Accepted') && (
                    <button
                      type="button"
                      onClick={() => updateOrderStatus(order.id, 'Cancelled')}
                      className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl cursor-pointer transition-colors"
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
