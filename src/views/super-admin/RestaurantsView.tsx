import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { BillingCycle, Restaurant, RestaurantStatus, SubscriptionPlan } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { RestaurantBrandAvatar } from '../../components/RestaurantBrandAvatar';
import { StatusLabel } from '../../components/StatusText';

interface RestaurantsViewProps {
  onOpenAddRestaurant: () => void;
  onInspectRestaurant: (restaurant: Restaurant) => void;
}

const STATUS_FILTERS: Array<'All' | RestaurantStatus> = [
  'All',
  'Active',
  'Inactive',
  'Setup Pending',
  'Suspended',
];

export const RestaurantsView: React.FC<RestaurantsViewProps> = ({
  onOpenAddRestaurant,
  onInspectRestaurant,
}) => {
  const { state, updateRestaurantStatus, updateRestaurantProfile } = useServeQR();
  const [statusFilter, setStatusFilter] = useState<'All' | RestaurantStatus>('All');
  const [query, setQuery] = useState('');
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    ownerName: '',
    ownerEmail: '',
    city: '',
    subscriptionPlan: 'Professional' as SubscriptionPlan,
    billingCycle: 'Monthly' as BillingCycle,
  });

  const filteredRestaurants = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.restaurants.filter((r) => {
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.ownerName.toLowerCase().includes(q) ||
        r.ownerEmail.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q)
      );
    });
  }, [query, state.restaurants, statusFilter]);

  const startEdit = (rest: Restaurant) => {
    setEditingRestaurant(rest);
    setEditForm({
      name: rest.name,
      ownerName: rest.ownerName,
      ownerEmail: rest.ownerEmail,
      city: rest.city,
      subscriptionPlan: rest.subscriptionPlan,
      billingCycle: rest.billingCycle,
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRestaurant || !editForm.name.trim()) return;
    updateRestaurantProfile(editingRestaurant.id, editForm);
    setEditingRestaurant(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#172B4D]">Restaurants</h2>
        <p className="text-sm text-slate-600 mt-0.5">
          Manage all onboarded restaurant workspaces, subscriptions, and access statuses.
        </p>
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Filter restaurants by status"
          className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto max-w-full"
        >
          {STATUS_FILTERS.map((status) => {
            const active = statusFilter === status;
            const count =
              status === 'All'
                ? state.restaurants.length
                : state.restaurants.filter((r) => r.status === status).length;
            return (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-2 min-h-[38px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-[#172B4D] shadow-xs'
                    : 'text-slate-600 hover:text-[#172B4D]'
                }`}
              >
                {status} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, ID, owner, city..."
            aria-label="Search restaurants"
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#087F5B]/25 focus:border-[#087F5B]"
          />
        </div>
      </div>

      {/* Restaurants List Container */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {/* Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 bg-slate-50">
                <th className="py-3.5 px-5">Restaurant Name</th>
                <th className="py-3.5 px-4">Restaurant ID</th>
                <th className="py-3.5 px-4">Owner</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Location</th>
                <th className="py-3.5 px-4">Subscription</th>
                <th className="py-3.5 px-4">Registered</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredRestaurants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 px-6 text-center text-slate-500">
                    No restaurants match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredRestaurants.map((rest) => (
                  <tr key={rest.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <RestaurantBrandAvatar restaurant={rest} size="sm" />
                        <div>
                          <p className="font-semibold text-[#172B4D] whitespace-nowrap">
                            {rest.name}
                          </p>
                          <p className="text-xs text-slate-500">{rest.businessType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                      {rest.id}
                    </td>
                    <td className="py-3.5 px-4 text-slate-800 whitespace-nowrap">
                      {rest.ownerName}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                      {rest.ownerEmail}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {rest.city}, {rest.state}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                      <p>
                        {rest.subscriptionPlan} · {rest.billingCycle}
                      </p>
                      <StatusLabel status={rest.subscriptionStatus} className="text-[11px] mt-0.5" />
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                      {rest.registeredAt}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusLabel status={rest.status} badge />
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => onInspectRestaurant(rest)}
                          className="text-[#087F5B] hover:text-[#06674A] cursor-pointer"
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(rest)}
                          className="text-slate-600 hover:text-[#172B4D] cursor-pointer"
                        >
                          Edit
                        </button>
                        {rest.status !== 'Active' ? (
                          <button
                            type="button"
                            onClick={() => updateRestaurantStatus(rest.id, 'Active')}
                            className="text-[#087F5B] hover:text-[#06674A] cursor-pointer"
                          >
                            Activate
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateRestaurantStatus(rest.id, 'Inactive')}
                            className="text-amber-700 hover:text-amber-800 cursor-pointer"
                          >
                            Deactivate
                          </button>
                        )}
                        {rest.status !== 'Suspended' && (
                          <button
                            type="button"
                            onClick={() => updateRestaurantStatus(rest.id, 'Suspended')}
                            className="text-red-600 hover:text-red-700 cursor-pointer"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View (< md) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {filteredRestaurants.length === 0 ? (
            <div className="py-12 px-6 text-center text-sm text-slate-500">
              No restaurants match the selected filter.
            </div>
          ) : (
            filteredRestaurants.map((rest) => (
              <div key={rest.id} className="p-4 space-y-3 bg-white">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <RestaurantBrandAvatar restaurant={rest} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#172B4D] truncate">{rest.name}</p>
                      <p className="text-xs font-mono text-slate-500 truncate">
                        {rest.id} · {rest.city}, {rest.state}
                      </p>
                    </div>
                  </div>
                  <StatusLabel status={rest.status} badge />
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 text-xs text-slate-600 border border-slate-100">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Owner</span>
                    <strong className="text-slate-800 truncate block">{rest.ownerName}</strong>
                    <span className="text-[11px] text-slate-500 truncate block font-mono">
                      {rest.ownerEmail}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Plan &amp; Cycle</span>
                    <strong className="text-slate-800 block">
                      {rest.subscriptionPlan} · {rest.billingCycle}
                    </strong>
                    <StatusLabel
                      status={rest.subscriptionStatus}
                      className="text-[10px] mt-0.5 inline-block"
                    />
                  </div>
                </div>

                {/* Touch-Friendly Action Buttons */}
                <div className="pt-1 flex items-center justify-between gap-2 flex-wrap border-t border-slate-50">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {rest.status !== 'Active' ? (
                      <button
                        type="button"
                        onClick={() => updateRestaurantStatus(rest.id, 'Active')}
                        className="px-3 py-1.5 min-h-[38px] text-xs font-semibold text-[#087F5B] bg-emerald-50 hover:bg-emerald-100 rounded-md cursor-pointer"
                      >
                        Activate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateRestaurantStatus(rest.id, 'Inactive')}
                        className="px-3 py-1.5 min-h-[38px] text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md cursor-pointer"
                      >
                        Deactivate
                      </button>
                    )}
                    {rest.status !== 'Suspended' && (
                      <button
                        type="button"
                        onClick={() => updateRestaurantStatus(rest.id, 'Suspended')}
                        className="px-3 py-1.5 min-h-[38px] text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-md cursor-pointer"
                      >
                        Suspend
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(rest)}
                      className="px-3 py-1.5 min-h-[38px] text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onInspectRestaurant(rest)}
                    className="px-3.5 py-1.5 min-h-[38px] text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-md cursor-pointer ml-auto"
                  >
                    View Details →
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit Restaurant Modal */}
      {editingRestaurant && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-rest-title"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-4 sm:p-6 max-h-[90dvh] flex flex-col shadow-2xl">
            <div className="shrink-0">
              <h3 id="edit-rest-title" className="font-display text-lg font-bold text-[#172B4D]">
                Edit Restaurant Account ({editingRestaurant.id})
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Update account metadata or subscription tier without affecting restaurant menu or orders.
              </p>
            </div>
            <form onSubmit={handleSaveEdit} className="mt-4 sm:mt-5 space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                <div>
                  <label htmlFor="edit-r-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    Restaurant Name
                  </label>
                  <input
                    id="edit-r-name"
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="edit-r-city" className="block text-xs font-semibold text-slate-700 mb-1">
                    City
                  </label>
                  <input
                    id="edit-r-city"
                    type="text"
                    required
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="edit-r-owner" className="block text-xs font-semibold text-slate-700 mb-1">
                    Owner Name
                  </label>
                  <input
                    id="edit-r-owner"
                    type="text"
                    required
                    value={editForm.ownerName}
                    onChange={(e) => setEditForm({ ...editForm, ownerName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="edit-r-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Owner Email
                  </label>
                  <input
                    id="edit-r-email"
                    type="email"
                    required
                    value={editForm.ownerEmail}
                    onChange={(e) => setEditForm({ ...editForm, ownerEmail: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="edit-r-plan" className="block text-xs font-semibold text-slate-700 mb-1">
                    Subscription Plan
                  </label>
                  <select
                    id="edit-r-plan"
                    value={editForm.subscriptionPlan}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        subscriptionPlan: e.target.value as SubscriptionPlan,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Basic">Basic</option>
                    <option value="Professional">Professional</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-r-cycle" className="block text-xs font-semibold text-slate-700 mb-1">
                    Billing Cycle
                  </label>
                  <select
                    id="edit-r-cycle"
                    value={editForm.billingCycle}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        billingCycle: e.target.value as BillingCycle,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
              </div>
              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingRestaurant(null)}
                  className="px-4 py-2 min-h-[44px] text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 min-h-[44px] text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
