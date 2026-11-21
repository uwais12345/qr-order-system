import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { formatCurrency } from '../../domain/serveqrLogic';

interface DemoPaymentModalProps {
  restaurantName: string;
  tableNumber: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  currencySymbol: string;
  onClose: () => void;
  onPaymentSuccess: (paymentRef: string) => void;
}

export const DemoPaymentModal: React.FC<DemoPaymentModalProps> = ({
  restaurantName,
  tableNumber,
  customerName,
  customerPhone,
  amount,
  currencySymbol,
  onClose,
  onPaymentSuccess,
}) => {
  const [selectedRail, setSelectedRail] = useState<'UPI' | 'Card' | 'NetBanking'>('UPI');
  const [status, setStatus] = useState<'ready' | 'processing' | 'failed'>('ready');
  const [failureReason, setFailureReason] = useState('');

  const handleSimulateSuccess = () => {
    setStatus('processing');
    window.setTimeout(() => {
      const ref = `DEMO-PAY-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      onPaymentSuccess(ref);
    }, 220);
  };

  const handleSimulateFailure = () => {
    setStatus('processing');
    window.setTimeout(() => {
      setStatus('failed');
      setFailureReason(
        'Demo payment declined by issuer (simulated failure). No amount was debited and your order was not placed.'
      );
    }, 220);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-pay-title"
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 overflow-hidden shadow-xl">
        {/* Header */}
        <div className="bg-[#172B4D] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
              Online Payment Demo · Prototype Mode
            </p>
            <h2 id="demo-pay-title" className="font-display text-base font-bold mt-0.5">
              {restaurantName} · Table {tableNumber}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment modal"
            className="p-1.5 text-slate-300 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Amount & Guest Info */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Payable Amount</p>
              <p className="font-mono text-2xl font-bold text-[#087F5B] tabular-nums">
                {formatCurrency(amount, currencySymbol)}
              </p>
            </div>
            <div className="text-right text-xs text-slate-600">
              <p className="font-semibold text-[#172B4D]">{customerName}</p>
              <p className="font-mono text-slate-500">{customerPhone}</p>
            </div>
          </div>

          {/* Transparent Prototype Notice */}
          <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
            <strong>Prototype Payment Demonstration:</strong> No real payment gateway is charged.
            Use the controls below to test payment success or payment failure handling.
          </div>

          {/* Demo Payment Method Selector */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Select Payment Instrument (Demo)</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'UPI', label: 'UPI / QR', icon: Smartphone },
                  { id: 'Card', label: 'Card', icon: CreditCard },
                  { id: 'NetBanking', label: 'NetBanking', icon: ShieldCheck },
                ] as const
              ).map((rail) => {
                const Icon = rail.icon;
                const active = selectedRail === rail.id;
                return (
                  <button
                    key={rail.id}
                    type="button"
                    onClick={() => setSelectedRail(rail.id)}
                    className={`py-2.5 px-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                      active
                        ? 'border-[#087F5B] bg-emerald-50 text-[#087F5B]'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{rail.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Failure Banner if simulated */}
          {status === 'failed' && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800"
            >
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Payment Failed</p>
                <p>{failureReason}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              disabled={status === 'processing'}
              onClick={handleSimulateSuccess}
              className="w-full min-h-[46px] px-4 text-sm font-bold text-white bg-[#087F5B] hover:bg-[#06674A] disabled:opacity-60 rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              {status === 'processing'
                ? 'Processing Demo Payment...'
                : status === 'failed'
                ? `Retry & Simulate Payment Success (${selectedRail})`
                : `Simulate Payment Success · ${formatCurrency(amount, currencySymbol)}`}
            </button>

            <button
              type="button"
              disabled={status === 'processing'}
              onClick={handleSimulateFailure}
              className="w-full min-h-[42px] px-4 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-60 rounded-xl cursor-pointer transition-colors"
            >
              Simulate Payment Failure
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
