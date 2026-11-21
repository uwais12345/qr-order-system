import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { CURATED_FOOD_IMAGE_OPTIONS, FOOD_IMAGES } from '../../domain/seedData';
import {
  formatCurrency,
  scopeMenuItemsByRestaurant,
  validateMenuItemForm,
  type ValidationErrors,
} from '../../domain/serveqrLogic';
import type { CustomizationGroup, MenuItem, Restaurant } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { FoodImage } from '../../components/FoodImage';
import { VegIndicator } from '../../components/StatusText';

interface MenuManagementViewProps {
  restaurant: Restaurant;
}

export const MenuManagementView: React.FC<MenuManagementViewProps> = ({ restaurant }) => {
  const {
    state,
    addCategory,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    toggleMenuItemAvailability,
  } = useServeQR();

  const items = scopeMenuItemsByRestaurant(state.menuItems, restaurant.id);
  const categories = state.categoriesByRestaurant[restaurant.id] ?? [
    'Biryani & Rice',
    'Meals & Thalis',
    'Starters',
    'Grill & Tandoor',
    'Beverages',
    'Desserts',
  ];
  const cur = restaurant.settings.currencySymbol;

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'nonveg'>('all');
  const [search, setSearch] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCategoryInput, setShowCategoryInput] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formErrors, setFormErrors] = useState<ValidationErrors>({});
  const [form, setForm] = useState({
    name: '',
    description: '',
    imageUrl: FOOD_IMAGES.biryani as string,
    price: '180',
    category: categories[0] ?? 'Starters',
    isVeg: true,
    available: true,
    prepTimeMinutes: '15',
    customizations: [] as CustomizationGroup[],
  });

  // Customization group builder state inside Add/Edit Item modal
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<'single' | 'multiple'>('single');
  const [newGroupRequired, setNewGroupRequired] = useState(true);
  const [choiceDrafts, setChoiceDrafts] = useState<
    Record<string, { label: string; price: string }>
  >({});

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (dietFilter === 'veg' && !item.isVeg) return false;
      if (dietFilter === 'nonveg' && item.isVeg) return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q) &&
        !item.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [dietFilter, items, search, selectedCategory]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormErrors({});
    setNewGroupName('');
    setNewGroupType('single');
    setNewGroupRequired(true);
    setChoiceDrafts({});
    setForm({
      name: '',
      description: '',
      imageUrl: FOOD_IMAGES.paneerStarter,
      price: '',
      category: categories[0] ?? 'Starters',
      isVeg: true,
      available: true,
      prepTimeMinutes: '15',
      customizations: [],
    });
    setModalOpen(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormErrors({});
    setNewGroupName('');
    setNewGroupType('single');
    setNewGroupRequired(true);
    setChoiceDrafts({});
    setForm({
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      price: String(item.price),
      category: item.category,
      isVeg: item.isVeg,
      available: item.available,
      prepTimeMinutes: String(item.prepTimeMinutes),
      customizations: item.customizations.map((g) => ({
        ...g,
        choices: [...g.choices],
      })),
    });
    setModalOpen(true);
  };

  const handleAddCustomizationGroup = (preset?: {
    name: string;
    type: 'single' | 'multiple';
    required: boolean;
    choices: { label: string; priceDelta: number }[];
  }) => {
    const groupName = (preset ? preset.name : newGroupName).trim();
    if (!groupName) return;
    const baseTs = Date.now();
    const newGroup: CustomizationGroup = {
      id: `grp-${baseTs}-${Math.random().toString(36).slice(2, 5)}`,
      name: groupName,
      type: preset ? preset.type : newGroupType,
      required: preset ? preset.required : newGroupRequired,
      choices: preset
        ? preset.choices.map((c, idx) => ({
            id: `ch-${baseTs}-${idx}`,
            label: c.label,
            priceDelta: c.priceDelta,
          }))
        : [],
    };
    setForm((prev) => ({
      ...prev,
      customizations: [...prev.customizations, newGroup],
    }));
    if (!preset) {
      setNewGroupName('');
    }
  };

  const handleUpdateGroupMeta = (
    groupId: string,
    patch: Partial<Pick<CustomizationGroup, 'type' | 'required'>>
  ) => {
    setForm((prev) => ({
      ...prev,
      customizations: prev.customizations.map((g) =>
        g.id === groupId ? { ...g, ...patch } : g
      ),
    }));
  };

  const handleRemoveCustomizationGroup = (groupId: string) => {
    setForm((prev) => ({
      ...prev,
      customizations: prev.customizations.filter((g) => g.id !== groupId),
    }));
  };

  const handleAddChoiceToGroup = (groupId: string) => {
    const draft = choiceDrafts[groupId] ?? { label: '', price: '' };
    const label = draft.label.trim();
    const priceDelta = Number(draft.price || 0);
    if (!label || !Number.isFinite(priceDelta) || priceDelta < 0) return;

    const newChoice = {
      id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      label,
      priceDelta,
    };
    setForm((prev) => ({
      ...prev,
      customizations: prev.customizations.map((g) =>
        g.id === groupId ? { ...g, choices: [...g.choices, newChoice] } : g
      ),
    }));
    setChoiceDrafts((prev) => ({ ...prev, [groupId]: { label: '', price: '' } }));
  };

  const handleRemoveChoiceFromGroup = (groupId: string, choiceId: string) => {
    setForm((prev) => ({
      ...prev,
      customizations: prev.customizations.map((g) =>
        g.id === groupId
          ? { ...g, choices: g.choices.filter((c) => c.id !== choiceId) }
          : g
      ),
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, imageUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(form.price);
    const prepTimeMinutes = Number(form.prepTimeMinutes);
    const errors = validateMenuItemForm({
      name: form.name,
      price,
      category: form.category,
      prepTimeMinutes,
    });
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      imageUrl: form.imageUrl,
      price,
      category: form.category,
      isVeg: form.isVeg,
      available: form.available,
      prepTimeMinutes,
      customizations: form.customizations.filter((g) => g.choices.length > 0),
    };

    if (editingItem) {
      updateMenuItem(editingItem.id, payload);
    } else {
      addMenuItem({
        restaurantId: restaurant.id,
        ...payload,
      });
    }
    setModalOpen(false);
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    addCategory(restaurant.id, newCategoryName.trim());
    setNewCategoryName('');
    setShowCategoryInput(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#172B4D]">Menu Management</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            {items.length} dishes across {categories.length} categories · Changes reflect
            immediately on table QR menus.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowCategoryInput((v) => !v)}
            className="px-3.5 py-2 text-xs font-semibold text-[#172B4D] bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
          >
            + Add Category
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Food Item
          </button>
        </div>
      </div>

      {showCategoryInput && (
        <form
          onSubmit={handleAddCategory}
          className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
        >
          <label htmlFor="new-cat-name" className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            New Category Name
          </label>
          <input
            id="new-cat-name"
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="e.g., Wood-Fired Breads"
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#087F5B] rounded-lg cursor-pointer"
            >
              Save Category
            </button>
            <button
              type="button"
              onClick={() => setShowCategoryInput(false)}
              className="px-3 py-2 text-xs font-medium text-slate-600 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {['All', ...categories].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-white text-[#172B4D] shadow-xs'
                  : 'text-slate-600 hover:text-[#172B4D]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex p-1 bg-slate-200/70 rounded-lg shrink-0">
            {[
              { id: 'all', label: 'All' },
              { id: 'veg', label: 'Veg' },
              { id: 'nonveg', label: 'Non-Veg' },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDietFilter(d.id as 'all' | 'veg' | 'nonveg')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  dietFilter === d.id
                    ? 'bg-white text-[#172B4D] shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes..."
              aria-label="Search menu items"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Menu Grid */}
      {filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-sm font-semibold text-[#172B4D]">No menu items found</p>
          <p className="text-xs text-slate-500 mt-1">
            Add your first dish or clear your category filter to view items.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[#087F5B] rounded-lg cursor-pointer"
          >
            Add Food Item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <FoodImage src={item.imageUrl} alt={item.name} className="w-full h-full" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <VegIndicator isVeg={item.isVeg} />
                        <h3 className="font-display font-bold text-[#172B4D] text-base">
                          {item.name}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {item.category} · {item.prepTimeMinutes} min prep
                        {item.customizations.length > 0
                          ? ` · ${item.customizations.length} option group${
                              item.customizations.length > 1 ? 's' : ''
                            }`
                          : ''}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-[#172B4D] text-base tabular-nums shrink-0">
                      {formatCurrency(item.price, cur)}
                    </span>
                  </div>
                  <p className="mt-2.5 text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {item.description || 'Freshly prepared to order.'}
                  </p>
                </div>
              </div>

              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={item.available}
                    onChange={() => toggleMenuItemAvailability(item.id)}
                    className="w-4 h-4 rounded border-slate-300 text-[#087F5B] focus:ring-[#087F5B]"
                  />
                  <span className={item.available ? 'text-[#087F5B]' : 'text-slate-500'}>
                    {item.available ? 'Available' : 'Unavailable'}
                  </span>
                </label>

                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    aria-label={`Edit ${item.name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMenuItem(item.id)}
                    aria-label={`Delete ${item.name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Add / Edit Food Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="menu-item-modal-title"
        >
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 id="menu-item-modal-title" className="font-display text-lg font-bold text-[#172B4D]">
                {editingItem ? `Edit ${editingItem.name}` : 'Add Food Item'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="mi-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    Food Name *
                  </label>
                  <input
                    id="mi-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Hyderabadi Veg Dum Biryani"
                    className={`w-full px-3 py-2 text-sm border rounded-lg ${
                      formErrors.name ? 'border-red-400' : 'border-slate-300'
                    }`}
                  />
                  {formErrors.name && <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>}
                </div>

                <div>
                  <label htmlFor="mi-price" className="block text-xs font-semibold text-slate-700 mb-1">
                    Price ({cur}) *
                  </label>
                  <input
                    id="mi-price"
                    type="number"
                    min="1"
                    step="1"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className={`w-full px-3 py-2 text-sm font-mono border rounded-lg ${
                      formErrors.price ? 'border-red-400' : 'border-slate-300'
                    }`}
                  />
                  {formErrors.price && <p className="text-xs text-red-600 mt-1">{formErrors.price}</p>}
                </div>

                <div>
                  <label htmlFor="mi-prep" className="block text-xs font-semibold text-slate-700 mb-1">
                    Preparation Time (mins) *
                  </label>
                  <input
                    id="mi-prep"
                    type="number"
                    min="1"
                    max="120"
                    value={form.prepTimeMinutes}
                    onChange={(e) => setForm({ ...form, prepTimeMinutes: e.target.value })}
                    className={`w-full px-3 py-2 text-sm font-mono border rounded-lg ${
                      formErrors.prepTimeMinutes ? 'border-red-400' : 'border-slate-300'
                    }`}
                  />
                </div>

                <div>
                  <label htmlFor="mi-category" className="block text-xs font-semibold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    id="mi-category"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-1">
                    Dietary Classification
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, isVeg: true })}
                      className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer ${
                        form.isVeg
                          ? 'border-[#087F5B] bg-emerald-50 text-[#087F5B]'
                          : 'border-slate-300 text-slate-600'
                      }`}
                    >
                      Vegetarian
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, isVeg: false })}
                      className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer ${
                        !form.isVeg
                          ? 'border-red-600 bg-red-50 text-red-700'
                          : 'border-slate-300 text-slate-600'
                      }`}
                    >
                      Non-Vegetarian
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="mi-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="mi-desc"
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Key ingredients, cooking method, and accompaniments..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="mi-photo-select" className="block text-xs font-semibold text-slate-700 mb-1">
                    Food Photography
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      id="mi-photo-select"
                      value={
                        CURATED_FOOD_IMAGE_OPTIONS.some((o) => o.url === form.imageUrl)
                          ? form.imageUrl
                          : ''
                      }
                      onChange={(e) => {
                        if (e.target.value) setForm({ ...form, imageUrl: e.target.value });
                      }}
                      className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {CURATED_FOOD_IMAGE_OPTIONS.map((opt) => (
                        <option key={opt.label} value={opt.url}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      aria-label="Upload custom food photo"
                      className="text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:text-xs file:font-semibold"
                    />
                  </div>
                </div>

                {/* Configurable Customization Groups (Portions, Mandatory/Optional, Single/Multi-select) */}
                <div className="sm:col-span-2 pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-[#172B4D]">
                        Food Customizations, Portions &amp; Add-ons
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Configure mandatory or optional single/multi-select groups. Leave empty for
                        direct 1-tap add.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          handleAddCustomizationGroup({
                            name: 'Portion Size',
                            type: 'single',
                            required: true,
                            choices: [
                              { label: 'Regular', priceDelta: 0 },
                              { label: 'Full', priceDelta: 100 },
                            ],
                          })
                        }
                        className="px-2 py-1 text-[11px] font-semibold text-[#172B4D] bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                      >
                        + Portion Preset
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddCustomizationGroup({
                            name: 'Add-ons',
                            type: 'multiple',
                            required: false,
                            choices: [{ label: 'Extra Dip / Side', priceDelta: 30 }],
                          })
                        }
                        className="px-2 py-1 text-[11px] font-semibold text-[#172B4D] bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                      >
                        + Add-ons Preset
                      </button>
                    </div>
                  </div>

                  {/* Add Custom Group Bar */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Group name (e.g., Portion Size, Spice Level, Add-ons)"
                        aria-label="Customization group name"
                        className="sm:col-span-6 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                      <select
                        value={newGroupType}
                        onChange={(e) =>
                          setNewGroupType(e.target.value as 'single' | 'multiple')
                        }
                        aria-label="Selection type"
                        className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="single">Single-select</option>
                        <option value="multiple">Multi-select</option>
                      </select>
                      <select
                        value={newGroupRequired ? 'required' : 'optional'}
                        onChange={(e) => setNewGroupRequired(e.target.value === 'required')}
                        aria-label="Requirement type"
                        className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="required">Mandatory</option>
                        <option value="optional">Optional</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddCustomizationGroup()}
                      className="px-3 py-1.5 text-xs font-semibold text-[#087F5B] bg-white border border-[#087F5B] rounded-lg hover:bg-emerald-50 cursor-pointer"
                    >
                      + Create Customization Group
                    </button>
                  </div>

                  {/* Existing Groups & Choices */}
                  {form.customizations.length > 0 && (
                    <div className="space-y-2.5">
                      {form.customizations.map((group) => {
                        const draft = choiceDrafts[group.id] ?? { label: '', price: '' };
                        return (
                          <div
                            key={group.id}
                            className="p-3 rounded-xl border border-slate-200 bg-white space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-[#172B4D]">
                                  {group.name}
                                </span>
                                <select
                                  value={group.type}
                                  onChange={(e) =>
                                    handleUpdateGroupMeta(group.id, {
                                      type: e.target.value as 'single' | 'multiple',
                                    })
                                  }
                                  aria-label={`Selection mode for ${group.name}`}
                                  className="px-2 py-0.5 text-[11px] border border-slate-200 rounded bg-slate-50"
                                >
                                  <option value="single">Single-select</option>
                                  <option value="multiple">Multi-select</option>
                                </select>
                                <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={group.required}
                                    onChange={(e) =>
                                      handleUpdateGroupMeta(group.id, {
                                        required: e.target.checked,
                                      })
                                    }
                                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#087F5B]"
                                  />
                                  Mandatory
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveCustomizationGroup(group.id)}
                                className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer"
                              >
                                Remove Group
                              </button>
                            </div>

                            {group.choices.length > 0 && (
                              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                                {group.choices.map((ch) => (
                                  <li
                                    key={ch.id}
                                    className="px-2.5 py-1.5 flex items-center justify-between text-xs"
                                  >
                                    <span className="text-slate-700 font-medium">{ch.label}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono text-slate-500 tabular-nums">
                                        {ch.priceDelta > 0
                                          ? `+${formatCurrency(ch.priceDelta, cur)}`
                                          : 'Included'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveChoiceFromGroup(group.id, ch.id)
                                        }
                                        aria-label={`Remove ${ch.label}`}
                                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={draft.label}
                                onChange={(e) =>
                                  setChoiceDrafts((prev) => ({
                                    ...prev,
                                    [group.id]: { ...draft, label: e.target.value },
                                  }))
                                }
                                placeholder={`Add choice to ${group.name}...`}
                                aria-label={`New choice name for ${group.name}`}
                                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                              />
                              <input
                                type="number"
                                min="0"
                                value={draft.price}
                                onChange={(e) =>
                                  setChoiceDrafts((prev) => ({
                                    ...prev,
                                    [group.id]: { ...draft, price: e.target.value },
                                  }))
                                }
                                placeholder="+₹"
                                aria-label={`New choice price for ${group.name}`}
                                className="w-20 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddChoiceToGroup(group.id)}
                                className="px-2.5 py-1.5 text-xs font-semibold text-[#087F5B] border border-[#087F5B] rounded-lg hover:bg-emerald-50 cursor-pointer whitespace-nowrap"
                              >
                                + Add
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.available}
                    onChange={(e) => setForm({ ...form, available: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-[#087F5B]"
                  />
                  Available on digital menu immediately
                </label>
                <div className="flex items-center gap-2">
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
                    {editingItem ? 'Save Item' : 'Add Item'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
