import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { scopeOrdersByRestaurant } from '../../domain/serveqrLogic';
import type { Order, OrderStatus, Restaurant } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { VegIndicator } from '../../components/StatusText';

interface KitchenDisplayViewProps {
  restaurant: Restaurant;
}

interface KdsColumn {
  status: OrderStatus;
  title: string;
  actionLabel: string;
  nextStatus: OrderStatus;
  headerAccent: string;
}

const KDS_COLUMNS: KdsColumn[] = [
  {
    status: 'Pending',
    title: 'New Orders',
    actionLabel: 'Accept Order',
    nextStatus: 'Accepted',
    headerAccent: 'text-amber-700',
  },
  {
    status: 'Accepted',
    title: 'Accepted',
    actionLabel: 'Start Preparing',
    nextStatus: 'Preparing',
    headerAccent: 'text-[#172B4D]',
  },
  {
    status: 'Preparing',
    title: 'Preparing',
    actionLabel: 'Mark Ready',
    nextStatus: 'Ready',
    headerAccent: 'text-[#172B4D]',
  },
  {
    status: 'Ready',
    title: 'Ready',
    actionLabel: 'Mark Served',
    nextStatus: 'Served',
    headerAccent: 'text-[#087F5B]',
  },
];

function formatElapsedMinutes(createdAtIso: string, nowMs: number): string {
  const diffMin = Math.max(0, Math.floor((nowMs - new Date(createdAtIso).getTime()) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m elapsed`;
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return `${hrs}h ${mins}m`;
}

export const KitchenDisplayView: React.FC<KitchenDisplayViewProps> = ({ restaurant }) => {
  const { state, updateOrderStatus } = useServeQR();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [mobileTab, setMobileTab] = useState<OrderStatus>('Pending');

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const orders = scopeOrdersByRestaurant(state.orders, restaurant.id);
  const activeKitchenCount = orders.filter((o) =>
    ['Pending', 'Accepted', 'Preparing', 'Ready'].includes(o.status)
  ).length;

  const activeMobileCol = KDS_COLUMNS.find((c) => c.status === mobileTab) ?? KDS_COLUMNS[0];
  const activeMobileOrders = orders
    .filter((o) => o.status === activeMobileCol.status)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#172B4D]">
            Kitchen Display System (KDS)
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Live order queue synced with table QR menus · {activeKitchenCount} active kitchen
            ticket{activeKitchenCount === 1 ? '' : 's'}.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500 tabular-nums">
          Updated {new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Mobile Horizontal Status Tabs (screens below lg: 320px - 1023px) */}
      <div className="block lg:hidden space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 bg-slate-200/80 rounded-xl">
          {KDS_COLUMNS.map((col) => {
            const count = orders.filter((o) => o.status === col.status).length;
            const active = mobileTab === col.status;
            return (
              <button
                key={col.status}
                type="button"
                onClick={() => setMobileTab(col.status)}
                className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  active
                    ? 'bg-white text-[#172B4D] shadow-xs ring-1 ring-black/5'
                    : 'text-slate-600 hover:text-[#172B4D]'
                }`}
              >
                <span>{col.title}</span>
                <span
                  className={`font-mono text-xs px-1.5 py-0.5 rounded-full ${
                    count > 0
                      ? active
                        ? 'bg-[#087F5B] text-white'
                        : 'bg-slate-300 text-slate-800'
                      : 'bg-transparent text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Mobile Tickets Feed for Active Tab */}
        <div className="space-y-3">
          {activeMobileOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl py-12 px-4 text-center">
              <p className="text-sm font-semibold text-slate-700">No active tickets in {activeMobileCol.title}</p>
              <p className="text-xs text-slate-400 mt-1">
                New incoming orders will appear here automatically.
              </p>
            </div>
          ) : (
            activeMobileOrders.map((order) => (
              <article
                key={order.id}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div>
                    <span className="px-2.5 py-1 rounded-lg bg-[#087F5B]/10 text-[#087F5B] font-mono font-bold text-sm">
                      Table {order.tableNumber}
                    </span>
                    <p className="font-mono text-xs font-bold text-[#172B4D] mt-1.5">{order.id}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {order.customerName || 'Table Guest'}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <span className="text-xs font-mono text-slate-500 tabular-nums flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-md">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {formatElapsedMinutes(order.createdAt, nowMs)}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums mt-1">
                      {new Date(order.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                <ul className="space-y-2 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id} className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#202938]">
                          <VegIndicator isVeg={item.isVeg} />
                          {item.name}
                        </span>
                        <span className="font-mono font-bold text-base text-[#172B4D] tabular-nums shrink-0">
                          ×{item.quantity}
                        </span>
                      </div>
                      {item.selectedCustomizations.length > 0 && (
                        <p className="text-xs text-slate-600 pl-5">
                          {item.selectedCustomizations.map((c) => c.choiceLabel).join(' · ')}
                        </p>
                      )}
                      {item.specialInstructions && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/70 rounded-md px-2 py-1 mt-1 font-medium">
                          Note: {item.specialInstructions}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => updateOrderStatus(order.id, activeMobileCol.nextStatus)}
                    className={`w-full min-h-[46px] py-2.5 px-4 text-xs font-bold rounded-xl text-white cursor-pointer transition-colors shadow-xs ${
                      activeMobileCol.status === 'Ready'
                        ? 'bg-[#087F5B] hover:bg-[#06674A]'
                        : 'bg-[#172B4D] hover:bg-[#10203A]'
                    }`}
                  >
                    {activeMobileCol.actionLabel}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      {/* Desktop 4-Column Kanban (lg and above: 1024px+) */}
      <div className="hidden lg:grid grid-cols-2 xl:grid-cols-4 gap-5 items-start">
        {KDS_COLUMNS.map((col) => {
          const colOrders: Order[] = orders
            .filter((o) => o.status === col.status)
            .sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );

          return (
            <section
              key={col.status}
              aria-label={col.title}
              className="bg-slate-100/80 border border-slate-200 rounded-xl p-3.5 min-h-[420px] flex flex-col"
            >
              <div className="flex items-center justify-between px-1 pb-3 mb-3 border-b border-slate-200">
                <h3 className={`font-display text-sm font-bold ${col.headerAccent}`}>
                  {col.title}
                </h3>
                <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
                  {colOrders.length}
                </span>
              </div>

              {colOrders.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-10 text-center">
                  <p className="text-xs text-slate-500">No tickets in {col.title}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {colOrders.map((order) => (
                    <article
                      key={order.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div>
                          <p className="font-mono text-sm font-bold text-[#172B4D]">{order.id}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {order.customerName || 'Table Guest'}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-sm font-bold text-[#087F5B]">
                            Table {order.tableNumber}
                          </span>
                          <p className="text-[11px] font-mono text-slate-500 tabular-nums flex items-center justify-end gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {formatElapsedMinutes(order.createdAt, nowMs)}
                          </p>
                        </div>
                      </div>

                      <ul className="space-y-2.5 text-sm">
                        {order.items.map((item) => (
                          <li key={item.id} className="space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-[#202938]">
                                <VegIndicator isVeg={item.isVeg} />
                                {item.name}
                              </span>
                              <span className="font-mono font-bold text-[#172B4D] tabular-nums shrink-0">
                                ×{item.quantity}
                              </span>
                            </div>
                            {item.selectedCustomizations.length > 0 && (
                              <p className="text-xs text-slate-600 pl-5">
                                {item.selectedCustomizations.map((c) => c.choiceLabel).join(' · ')}
                              </p>
                            )}
                            {item.specialInstructions && (
                              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/70 rounded px-2 py-1 mt-1">
                                Note: {item.specialInstructions}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>

                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {new Date(order.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateOrderStatus(order.id, col.nextStatus)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg text-white cursor-pointer transition-colors ${
                            col.status === 'Ready'
                              ? 'bg-[#087F5B] hover:bg-[#06674A]'
                              : 'bg-[#172B4D] hover:bg-[#10203A]'
                          }`}
                        >
                          {col.actionLabel}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
