import React from 'react';
import type {
  OrderStatus,
  PaymentStatus,
  RestaurantStatus,
  SubscriptionStatus,
  TableStatus,
} from '../domain/types';

type AnyStatus =
  | OrderStatus
  | PaymentStatus
  | RestaurantStatus
  | SubscriptionStatus
  | TableStatus
  | string;

function getStatusColorClass(status: AnyStatus): string {
  switch (status) {
    case 'Active':
    case 'ACTIVE':
    case 'Available':
    case 'Ready':
    case 'Served':
    case 'Completed':
    case 'Paid':
      return 'text-[#087F5B]';
    case 'Pending':
    case 'Setup Pending':
    case 'Preparing':
    case 'Partially Paid':
    case 'Reserved':
    case 'Trial':
    case 'EXPIRING SOON':
      return 'text-amber-700';
    case 'Accepted':
    case 'Occupied':
      return 'text-[#172B4D]';
    case 'Suspended':
    case 'SUSPENDED':
    case 'Cancelled':
    case 'Inactive':
    case 'INACTIVE':
    case 'Past Due':
    case 'Overdue':
    case 'Refunded':
      return 'text-red-700';
    default:
      return 'text-slate-700';
  }
}

function getStatusBadgeClass(status: AnyStatus): string {
  switch (status) {
    case 'Active':
    case 'ACTIVE':
    case 'Paid':
      return 'bg-emerald-50 text-[#087F5B] border-emerald-200';
    case 'EXPIRING SOON':
    case 'Pending':
    case 'Setup Pending':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'INACTIVE':
    case 'Inactive':
      return 'bg-slate-100 text-slate-700 border-slate-300';
    case 'SUSPENDED':
    case 'Suspended':
    case 'Overdue':
    case 'Cancelled':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export const StatusLabel: React.FC<{
  status: AnyStatus;
  badge?: boolean;
  className?: string;
}> = ({ status, badge = false, className = '' }) => {
  if (badge) {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-bold tracking-wide rounded-md border whitespace-nowrap ${getStatusBadgeClass(
          status
        )} ${className}`}
      >
        {status}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${getStatusColorClass(
        status
      )} ${className}`}
    >
      {status}
    </span>
  );
};

export const VegIndicator: React.FC<{ isVeg: boolean; showText?: boolean }> = ({
  isVeg,
  showText = false,
}) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] border shrink-0 ${
        isVeg ? 'border-[#087F5B]' : 'border-red-600'
      }`}
      aria-label={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-[#087F5B]' : 'bg-red-600'}`}
      />
    </span>
    {showText && (
      <span className="text-xs font-medium text-slate-600">
        {isVeg ? 'Veg' : 'Non-Veg'}
      </span>
    )}
  </span>
);
