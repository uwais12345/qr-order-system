import React, { useState } from 'react';
import { Pencil, Plus, QrCode, Trash2, X } from 'lucide-react';
import {
  scopeOrdersByRestaurant,
  scopeTablesByRestaurant,
  validateTableForm,
  type ValidationErrors,
} from '../../domain/serveqrLogic';
import type { DiningTable, Restaurant, TableStatus } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { StatusLabel } from '../../components/StatusText';

interface TableManagementViewProps {
  restaurant: Restaurant;
  onOpenQrManagement: () => void;
}

export const TableManagementView: React.FC<TableManagementViewProps> = ({
  restaurant,
  onOpenQrManagement,
}) => {
  const { state, addTable, updateTable, deleteTable } = useServeQR();
  const tables = scopeTablesByRestaurant(state.tables, restaurant.id);
  const orders = scopeOrdersByRestaurant(state.orders, restaurant.id);

  const [sectionFilter, setSectionFilter] = useState<string>('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [form, setForm] = useState({
    tableNumber: '',
    section: 'Main Hall',
    capacity: '4',
    status: 'Available' as TableStatus,
  });

  const sections = Array.from(
    new Set(['Main Hall', 'Family Section', 'Outdoor', ...tables.map((t) => t.section)])
  );

  const filteredTables =
    sectionFilter === 'All' ? tables : tables.filter((t) => t.section === sectionFilter);

  const openAdd = () => {
    const nextNum = tables.length + 1;
    setEditingTable(null);
    setErrors({});
    setForm({
      tableNumber: `T${String(nextNum).padStart(2, '0')}`,
      section: 'Main Hall',
      capacity: '4',
      status: 'Available',
    });
    setModalOpen(true);
  };

  const openEdit = (table: DiningTable) => {
    setEditingTable(table);
    setErrors({});
    setForm({
      tableNumber: table.tableNumber,
      section: table.section,
      capacity: String(table.capacity),
      status: table.status,
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const capacity = Number(form.capacity);
    const v = validateTableForm(
      form.tableNumber,
      form.section,
      capacity,
      tables.map((t) => t.tableNumber),
      editingTable?.tableNumber
    );
    if (Object.keys(v).length > 0) {
      setErrors(v);
      return;
    }

    if (editingTable) {
      updateTable(editingTable.id, {
        tableNumber: form.tableNumber,
        section: form.section,
        capacity,
        status: form.status,
      });
    } else {
      addTable({
        restaurantId: restaurant.id,
        branchId: restaurant.branches[0]?.id ?? `${restaurant.id}-BR1`,
        tableNumber: form.tableNumber,
        section: form.section,
        capacity,
        status: form.status,
      });
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#172B4D]">Table Management</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            {tables.length} configured dining tables · Each table automatically receives a unique
            QR ordering code.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenQrManagement}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#172B4D] bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
          >
            <QrCode className="w-4 h-4 text-[#087F5B]" />
            View QR Codes
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Table
          </button>
        </div>
      </div>

      {/* Section Filter */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
        {['All', ...sections].map((sec) => (
          <button
            key={sec}
            type="button"
            onClick={() => setSectionFilter(sec)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap cursor-pointer ${
              sectionFilter === sec
                ? 'bg-white text-[#172B4D] shadow-xs'
                : 'text-slate-600 hover:text-[#172B4D]'
            }`}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* Table Directory */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-3.5 px-6">Table</th>
                <th className="py-3.5 px-4">Table ID</th>
                <th className="py-3.5 px-4">Section</th>
                <th className="py-3.5 px-4 text-right">Seats</th>
                <th className="py-3.5 px-4 text-right">Active Orders</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTables.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-500">
                    No dining tables configured in this section.
                  </td>
                </tr>
              ) : (
                filteredTables.map((table) => {
                  const activeOrdersCount = orders.filter(
                    (o) =>
                      o.tableNumber === table.tableNumber &&
                      o.status !== 'Completed' &&
                      o.status !== 'Cancelled'
                  ).length;
                  return (
                    <tr key={table.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-6 font-mono font-bold text-[#172B4D]">
                        {table.tableNumber}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500">{table.id}</td>
                      <td className="py-3.5 px-4 text-slate-700">{table.section}</td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {table.capacity}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {activeOrdersCount}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <StatusLabel status={table.status} />
                          <select
                            aria-label={`Change status for table ${table.tableNumber}`}
                            value={table.status}
                            onChange={(e) =>
                              updateTable(table.id, { status: e.target.value as TableStatus })
                            }
                            className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-600"
                          >
                            <option value="Available">Available</option>
                            <option value="Occupied">Occupied</option>
                            <option value="Reserved">Reserved</option>
                          </select>
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => openEdit(table)}
                            aria-label={`Edit table ${table.tableNumber}`}
                            className="inline-flex items-center gap-1 text-slate-600 hover:text-[#172B4D] cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTable(table.id)}
                            aria-label={`Delete table ${table.tableNumber}`}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
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

      {/* Add/Edit Table Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="table-modal-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 id="table-modal-title" className="font-display text-lg font-bold text-[#172B4D]">
                {editingTable ? `Edit Table ${editingTable.tableNumber}` : 'Add Dining Table'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close table modal"
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="tbl-num" className="block text-xs font-semibold text-slate-700 mb-1">
                  Table Number *
                </label>
                <input
                  id="tbl-num"
                  type="text"
                  value={form.tableNumber}
                  onChange={(e) => setForm({ ...form, tableNumber: e.target.value.toUpperCase() })}
                  placeholder="T06"
                  className={`w-full px-3 py-2 text-sm font-mono border rounded-lg ${
                    errors.tableNumber ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                {errors.tableNumber && (
                  <p className="text-xs text-red-600 mt-1">{errors.tableNumber}</p>
                )}
              </div>

              <div>
                <label htmlFor="tbl-sec" className="block text-xs font-semibold text-slate-700 mb-1">
                  Dining Section *
                </label>
                <input
                  id="tbl-sec"
                  type="text"
                  list="section-suggestions"
                  value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value })}
                  placeholder="Main Hall"
                  className={`w-full px-3 py-2 text-sm border rounded-lg ${
                    errors.section ? 'border-red-400' : 'border-slate-300'
                  }`}
                />
                <datalist id="section-suggestions">
                  <option value="Main Hall" />
                  <option value="Family Section" />
                  <option value="Outdoor" />
                  <option value="Terrace Lounge" />
                  <option value="Private Dining" />
                </datalist>
                {errors.section && <p className="text-xs text-red-600 mt-1">{errors.section}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tbl-cap" className="block text-xs font-semibold text-slate-700 mb-1">
                    Seating Capacity *
                  </label>
                  <input
                    id="tbl-cap"
                    type="number"
                    min="1"
                    max="24"
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    className={`w-full px-3 py-2 text-sm font-mono border rounded-lg ${
                      errors.capacity ? 'border-red-400' : 'border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label htmlFor="tbl-status" className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Status
                  </label>
                  <select
                    id="tbl-status"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as TableStatus })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Available">Available</option>
                    <option value="Occupied">Occupied</option>
                    <option value="Reserved">Reserved</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer"
                >
                  {editingTable ? 'Save Table' : 'Create Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
