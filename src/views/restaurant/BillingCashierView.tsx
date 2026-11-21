import React, { useMemo, useState } from 'react';
import { CheckCircle2, Printer, Receipt, X } from 'lucide-react';
import {
  calculateBillTotals,
  formatCurrency,
  scopeBillsByRestaurant,
  scopeOrdersByRestaurant,
} from '../../domain/serveqrLogic';
import type { Bill, PaymentMethod, PaymentStatus, Restaurant } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { StatusLabel } from '../../components/StatusText';
import { ServeQRLogo } from '../../components/ServeQRLogo';

interface BillingCashierViewProps {
  restaurant: Restaurant;
}

const PAYMENT_METHODS: PaymentMethod[] = ['UPI', 'Card', 'Cash', 'Online Payment'];

export const BillingCashierView: React.FC<BillingCashierViewProps> = ({ restaurant }) => {
  const { state, createBillAndRecordPayment } = useServeQR();
  const orders = scopeOrdersByRestaurant(state.orders, restaurant.id);
  const bills = scopeBillsByRestaurant(state.bills, restaurant.id);
  const cur = restaurant.settings.currencySymbol;
  const taxRate = restaurant.settings.taxRatePercent;

  const unpaidOrders = useMemo(
    () => orders.filter((o) => o.status !== 'Cancelled' && o.paymentStatus !== 'Paid'),
    [orders]
  );

  const tablesWithUnpaid = useMemo(() => {
    const map = new Map<string, typeof unpaidOrders>();
    for (const order of unpaidOrders) {
      const list = map.get(order.tableNumber) ?? [];
      list.push(order);
      map.set(order.tableNumber, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [unpaidOrders]);

  const [billingMode, setBillingMode] = useState<'combined' | 'individual'>('combined');
  const [selectedTableNumber, setSelectedTableNumber] = useState<string>(
    () => tablesWithUnpaid[0]?.[0] ?? ''
  );
  const [selectedIndividualOrderId, setSelectedIndividualOrderId] = useState<string>(
    () => unpaidOrders[0]?.id ?? ''
  );
  const [discountPercent, setDiscountPercent] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [paymentStatusChoice, setPaymentStatusChoice] = useState<PaymentStatus>('Paid');
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [activeReceipt, setActiveReceipt] = useState<Bill | null>(null);

  const effectiveTable = tablesWithUnpaid.some(([tn]) => tn === selectedTableNumber)
    ? selectedTableNumber
    : tablesWithUnpaid[0]?.[0] ?? '';

  const effectiveIndividualOrder =
    unpaidOrders.find((o) => o.id === selectedIndividualOrderId) ?? unpaidOrders[0] ?? null;

  const selectedOrdersForBill = useMemo(() => {
    if (billingMode === 'combined') {
      return unpaidOrders.filter((o) => o.tableNumber === effectiveTable);
    }
    return effectiveIndividualOrder ? [effectiveIndividualOrder] : [];
  }, [billingMode, effectiveIndividualOrder, effectiveTable, unpaidOrders]);

  const parsedDiscount = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const calc = calculateBillTotals(selectedOrdersForBill, taxRate, parsedDiscount);

  const handleRecordPayment = () => {
    if (selectedOrdersForBill.length === 0) return;
    const paidAmount =
      paymentStatusChoice === 'Paid'
        ? calc.totalAmount
        : paymentStatusChoice === 'Partially Paid'
        ? Math.min(calc.totalAmount, Math.max(0, Number(partialAmount) || Math.round(calc.totalAmount / 2)))
        : 0;

    const bill = createBillAndRecordPayment({
      restaurantId: restaurant.id,
      branchId: restaurant.branches[0]?.id ?? selectedOrdersForBill[0].branchId,
      tableNumber: selectedOrdersForBill[0].tableNumber,
      mode: billingMode,
      orderIds: selectedOrdersForBill.map((o) => o.id),
      discountPercent: parsedDiscount,
      paymentMethod,
      paidAmount,
      overridePaymentStatus: paymentStatusChoice,
    });

    if (bill) {
      setActiveReceipt(bill);
      setDiscountPercent('0');
      setPartialAmount('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#172B4D]">Billing &amp; Cashier</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Generate individual guest bills or combined table bills for multiple diners at the same
            table.
          </p>
        </div>

        <div className="w-full sm:w-auto grid grid-cols-2 sm:flex p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setBillingMode('combined')}
            className={`px-3.5 py-2 min-h-[40px] text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap text-center transition-all ${
              billingMode === 'combined'
                ? 'bg-white text-[#172B4D] shadow-xs'
                : 'text-slate-600 hover:text-[#172B4D]'
            }`}
          >
            Combined Table Bill
          </button>
          <button
            type="button"
            onClick={() => setBillingMode('individual')}
            className={`px-3.5 py-2 min-h-[40px] text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap text-center transition-all ${
              billingMode === 'individual'
                ? 'bg-white text-[#172B4D] shadow-xs'
                : 'text-slate-600 hover:text-[#172B4D]'
            }`}
          >
            Individual Order Bill
          </button>
        </div>
      </div>

      {/* Main Billing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
        {/* Left Selection List */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-display text-base font-bold text-[#172B4D] mb-4">
            {billingMode === 'combined'
              ? `Open Tables (${tablesWithUnpaid.length})`
              : `Open Individual Orders (${unpaidOrders.length})`}
          </h3>

          {unpaidOrders.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="w-8 h-8 text-[#087F5B] mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#172B4D]">All bills settled</p>
              <p className="text-xs text-slate-500 mt-1">
                New unpaid dine-in orders will appear here automatically.
              </p>
            </div>
          ) : billingMode === 'combined' ? (
            <div className="space-y-2.5">
              {tablesWithUnpaid.map(([tableNum, tableOrders]) => {
                const selected = tableNum === effectiveTable;
                const combinedTotal = tableOrders.reduce((s, o) => s + o.totalAmount, 0);
                return (
                  <button
                    key={tableNum}
                    type="button"
                    onClick={() => setSelectedTableNumber(tableNum)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                      selected
                        ? 'border-[#087F5B] bg-emerald-50/40 ring-1 ring-[#087F5B]'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display font-bold text-[#172B4D]">
                        Table {tableNum}
                      </span>
                      <span className="font-mono font-bold text-[#087F5B] tabular-nums">
                        {formatCurrency(combinedTotal, cur)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {tableOrders.length} independent order{tableOrders.length > 1 ? 's' : ''} ·{' '}
                      {tableOrders.map((o) => o.customerName || 'Guest').join(', ')}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              {unpaidOrders.map((order) => {
                const selected = order.id === effectiveIndividualOrder?.id;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setSelectedIndividualOrderId(order.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                      selected
                        ? 'border-[#087F5B] bg-emerald-50/40 ring-1 ring-[#087F5B]'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-[#172B4D]">
                        {order.id} · Table {order.tableNumber}
                      </span>
                      <span className="font-mono font-bold text-[#087F5B] tabular-nums">
                        {formatCurrency(order.totalAmount, cur)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {order.customerName || 'Walk-in Guest'} · {order.items.length} item
                      {order.items.length > 1 ? 's' : ''} · {order.status}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Bill Breakdown & Payment Settlement */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          {selectedOrdersForBill.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              Select an open table or individual order on the left to generate a bill.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-[#087F5B]">
                    {billingMode === 'combined'
                      ? 'Combined Table Bill'
                      : 'Individual Guest Bill'}
                  </p>
                  <h3 className="font-display text-xl font-bold text-[#172B4D] mt-0.5">
                    Table {selectedOrdersForBill[0].tableNumber}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    Orders: {selectedOrdersForBill.map((o) => o.id).join(', ')}
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  Tax: {restaurant.settings.taxLabel} ({taxRate}%)
                </span>
              </div>

              {/* Line Items */}
              <div className="divide-y divide-slate-100">
                {selectedOrdersForBill.map((order) => (
                  <div key={order.id} className="py-3 first:pt-0">
                    <p className="text-xs font-semibold text-slate-500 mb-2">
                      {order.id} · {order.customerName || 'Walk-in Guest'}
                    </p>
                    <div className="space-y-1.5">
                      {order.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-sm gap-4"
                        >
                          <span className="text-slate-700">
                            {item.quantity}× {item.name}
                          </span>
                          <span className="font-mono text-slate-800 tabular-nums">
                            {formatCurrency(item.unitPrice * item.quantity, cur)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Discount + Totals */}
              <div className="pt-4 border-t border-slate-200 space-y-2.5 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(calc.subtotal, cur)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 text-slate-600">
                  <label htmlFor="bill-discount" className="text-sm">
                    Discount (%)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="bill-discount"
                      type="number"
                      min="0"
                      max="100"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      className="w-20 px-2.5 py-1 text-right font-mono text-sm border border-slate-300 rounded-md"
                    />
                    <span className="font-mono text-xs text-slate-500 tabular-nums w-20 text-right">
                      -{formatCurrency(calc.discountAmount, cur)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>
                    {restaurant.settings.taxLabel} ({calc.taxRatePercent}%)
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(calc.taxAmount, cur)}
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-base font-bold text-[#172B4D]">
                  <span>Total Payable</span>
                  <span className="font-mono text-xl text-[#087F5B] tabular-nums">
                    {formatCurrency(calc.totalAmount, cur)}
                  </span>
                </div>
              </div>

              {/* Payment Method & Status */}
              <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    Payment Method
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer ${
                          paymentMethod === m
                            ? 'border-[#087F5B] bg-emerald-50 text-[#087F5B]'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="pay-status-select"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Payment Status
                    </label>
                    <select
                      id="pay-status-select"
                      value={paymentStatusChoice}
                      onChange={(e) => setPaymentStatusChoice(e.target.value as PaymentStatus)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Paid">Paid (Full Settlement)</option>
                      <option value="Partially Paid">Partially Paid</option>
                      <option value="Pending">Pending</option>
                      <option value="Refunded">Refunded</option>
                    </select>
                  </div>

                  {paymentStatusChoice === 'Partially Paid' && (
                    <div>
                      <label
                        htmlFor="partial-amt"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Amount Collected ({cur})
                      </label>
                      <input
                        id="partial-amt"
                        type="number"
                        min="1"
                        max={calc.totalAmount}
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value)}
                        placeholder={String(Math.round(calc.totalAmount / 2))}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleRecordPayment}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                Record Payment &amp; Generate Receipt ({formatCurrency(calc.totalAmount, cur)})
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Settled Receipts History */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-[#172B4D]">
            Recent Receipts ({bills.length})
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            {bills.filter((b) => b.paymentStatus === 'Paid').length} paid
          </span>
        </div>

        {/* Desktop Receipts Table (md and above) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
                <th className="py-3 px-5">Receipt #</th>
                <th className="py-3 px-4">Table</th>
                <th className="py-3 px-4">Bill Type</th>
                <th className="py-3 px-4">Orders</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-5 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bills.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                    No receipts generated yet.
                  </td>
                </tr>
              ) : (
                bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-5 font-mono text-xs font-bold text-[#172B4D]">
                      {bill.receiptNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold">
                      {bill.tableNumber}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 capitalize">{bill.mode}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {bill.orderIds.join(', ')}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{bill.paymentMethod}</td>
                    <td className="py-3 px-4">
                      <StatusLabel status={bill.paymentStatus} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums">
                      {formatCurrency(bill.totalAmount, cur)}
                    </td>
                    <td className="py-3 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveReceipt(bill)}
                        className="text-xs font-semibold text-[#087F5B] hover:text-[#06674A] cursor-pointer"
                      >
                        View Receipt
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Receipts Cards (screens below md: 320px - 767px) */}
        <div className="block md:hidden divide-y divide-slate-100 p-3 space-y-3">
          {bills.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No receipts generated yet.</p>
          ) : (
            bills.map((bill) => (
              <div
                key={bill.id}
                className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#172B4D]">
                      {bill.receiptNumber}
                    </span>
                    <span className="text-[11px] font-mono text-[#087F5B] bg-emerald-50 px-2 py-0.5 rounded font-semibold">
                      Table {bill.tableNumber}
                    </span>
                  </div>
                  <StatusLabel status={bill.paymentStatus} />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="capitalize">{bill.mode} mode · {bill.paymentMethod}</span>
                  <span className="font-mono font-bold text-sm text-[#172B4D] tabular-nums">
                    {formatCurrency(bill.totalAmount, cur)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveReceipt(bill)}
                  className="w-full min-h-[44px] py-2 px-3 text-xs font-bold text-[#087F5B] bg-white border border-[#087F5B]/30 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors text-center inline-flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  View &amp; Print Receipt
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Printable Receipt Modal */}
      {activeReceipt && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-modal-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col max-h-[90dvh] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 no-print">
              <h3 id="receipt-modal-title" className="font-display text-base font-bold text-[#172B4D]">
                Payment Receipt · {activeReceipt.receiptNumber}
              </h3>
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                aria-label="Close receipt modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 text-sm overflow-y-auto flex-1">
              <div className="text-center border-b border-dashed border-slate-300 pb-4">
                <p className="font-display text-lg font-bold text-[#172B4D]">{restaurant.name}</p>
                <p className="text-xs text-slate-500">{restaurant.branches[0]?.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{restaurant.address}</p>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Receipt No</dt>
                  <dd className="font-mono font-semibold text-[#172B4D]">
                    {activeReceipt.receiptNumber}
                  </dd>
                </div>
                <div className="text-right">
                  <dt className="text-slate-500">Table</dt>
                  <dd className="font-mono font-semibold text-[#172B4D]">
                    {activeReceipt.tableNumber} ({activeReceipt.mode})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Orders</dt>
                  <dd className="font-mono text-slate-700">{activeReceipt.orderIds.join(', ')}</dd>
                </div>
                <div className="text-right">
                  <dt className="text-slate-500">Payment</dt>
                  <dd className="font-semibold text-[#087F5B]">
                    {activeReceipt.paymentMethod} · {activeReceipt.paymentStatus}
                  </dd>
                </div>
              </dl>

              <div className="border-t border-b border-dashed border-slate-300 py-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(activeReceipt.subtotal, cur)}
                  </span>
                </div>
                {activeReceipt.discountAmount > 0 && (
                  <div className="flex justify-between text-[#087F5B]">
                    <span>Discount ({activeReceipt.discountPercent}%)</span>
                    <span className="font-mono tabular-nums">
                      -{formatCurrency(activeReceipt.discountAmount, cur)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    {restaurant.settings.taxLabel} ({activeReceipt.taxRatePercent}%)
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(activeReceipt.taxAmount, cur)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-bold text-[#172B4D]">
                  <span>Grand Total</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(activeReceipt.totalAmount, cur)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Amount Paid</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatCurrency(activeReceipt.paidAmount, cur)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center pt-1">
                <p className="text-xs text-slate-500 mb-2">Thank you for dining with us!</p>
                <ServeQRLogo size="sm" />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] text-xs font-semibold text-white bg-[#172B4D] hover:bg-[#10203A] rounded-xl cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
