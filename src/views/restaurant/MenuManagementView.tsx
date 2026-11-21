import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FolderEdit,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { CURATED_FOOD_IMAGE_OPTIONS, FOOD_IMAGES } from '../../domain/seedData';
import {
  formatCurrency,
  scopeMenuItemsByRestaurant,
  validateCategoryName,
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
    renameCategory,
    deleteCategory,
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
  const [newCategoryError, setNewCategoryError] = useState('');
  const [showCategoryInput, setShowCategoryInput] = useState(false);

  // Category Manager Modal and CRUD state
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [catManagerNewName, setCatManagerNewName] = useState('');
  const [catManagerNewError, setCatManagerNewError] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('');
  const [deleteError, setDeleteError] = useState('');
  const [categoryNotice, setCategoryNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setCategoryNotice({ type, message });
    window.setTimeout(() => {
      setCategoryNotice((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

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

  const handleQuickAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateCategoryName(newCategoryName, categories);
    if (!validation.valid) {
      setNewCategoryError(validation.error || 'Invalid category name.');
      return;
    }
    const res = addCategory(restaurant.id, validation.cleanName);
    if (!res.ok) {
      setNewCategoryError(res.error || 'Failed to create category.');
      return;
    }
    const createdName = validation.cleanName;
    setNewCategoryName('');
    setNewCategoryError('');
    setShowCategoryInput(false);
    showFeedback(`Category "${createdName}" created successfully!`);
  };

  const handleManagerAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateCategoryName(catManagerNewName, categories);
    if (!validation.valid) {
      setCatManagerNewError(validation.error || 'Invalid category name.');
      return;
    }
    const res = addCategory(restaurant.id, validation.cleanName);
    if (!res.ok) {
      setCatManagerNewError(res.error || 'Failed to create category.');
      return;
    }
    const createdName = validation.cleanName;
    setCatManagerNewName('');
    setCatManagerNewError('');
    showFeedback(`Category "${createdName}" created successfully!`);
  };

  const handleStartRename = (cat: string) => {
    setEditingCategory(cat);
    setRenameInput(cat);
    setRenameError('');
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    const validation = validateCategoryName(renameInput, categories, editingCategory);
    if (!validation.valid) {
      setRenameError(validation.error || 'Invalid category name.');
      return;
    }
    const res = renameCategory(restaurant.id, editingCategory, validation.cleanName);
    if (!res.ok) {
      setRenameError(res.error || 'Failed to rename category.');
      return;
    }
    if (selectedCategory === editingCategory) {
      setSelectedCategory(validation.cleanName);
    }
    const oldName = editingCategory;
    const newName = validation.cleanName;
    setEditingCategory(null);
    setRenameInput('');
    setRenameError('');
    showFeedback(`Category "${oldName}" renamed to "${newName}". Associated dishes updated.`);
  };

  const handleOpenDelete = (cat: string) => {
    if (categories.length <= 1) {
      showFeedback(
        'Cannot delete the only remaining category. A restaurant must have at least one category.',
        'error'
      );
      return;
    }
    const otherCats = categories.filter((c) => c !== cat);
    setDeletingCategory(cat);
    setReassignTarget(otherCats[0] ?? '');
    setDeleteError('');
  };

  const handleConfirmDelete = () => {
    if (!deletingCategory || !reassignTarget) return;
    const count = items.filter((i) => i.category === deletingCategory).length;
    const catName = deletingCategory;
    const targetName = reassignTarget;
    const res = deleteCategory(restaurant.id, deletingCategory, reassignTarget);
    if (!res.ok) {
      setDeleteError(res.error || 'Failed to delete category.');
      return;
    }
    if (selectedCategory === deletingCategory) {
      setSelectedCategory(reassignTarget);
    }
    setDeletingCategory(null);
    setReassignTarget('');
    setDeleteError('');
    showFeedback(
      count > 0
        ? `Category "${catName}" deleted. ${count} dish${count === 1 ? '' : 'es'} reassigned to "${targetName}".`
        : `Category "${catName}" deleted successfully.`
    );
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowCategoryManager(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-semibold text-[#172B4D] bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Layers className="w-4 h-4 text-[#087F5B]" />
            Manage Categories
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCategoryInput((v) => !v);
              setNewCategoryError('');
            }}
            className="px-3.5 py-2 min-h-[40px] text-xs font-semibold text-[#172B4D] bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
          >
            + Quick Add
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add Food Item
          </button>
        </div>
      </div>

      {/* Category operation notification banner */}
      {categoryNotice && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-sm font-medium transition-all ${
            categoryNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-[#087F5B]'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {categoryNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#087F5B]" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            )}
            <span>{categoryNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setCategoryNotice(null)}
            className="p-1 hover:bg-black/5 rounded-md text-slate-500 cursor-pointer"
            aria-label="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showCategoryInput && (
        <form
          onSubmit={handleQuickAddCategory}
          className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs"
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <label htmlFor="new-cat-name" className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              New Category Name
            </label>
            <input
              id="new-cat-name"
              type="text"
              value={newCategoryName}
              onChange={(e) => {
                setNewCategoryName(e.target.value);
                if (newCategoryError) setNewCategoryError('');
              }}
              placeholder="e.g., Wood-Fired Breads"
              className={`flex-1 px-3 py-2 text-sm border rounded-lg ${
                newCategoryError ? 'border-red-500 focus:ring-red-500' : 'border-slate-300'
              }`}
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer min-h-[38px]"
              >
                Save Category
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCategoryInput(false);
                  setNewCategoryError('');
                }}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer min-h-[38px]"
              >
                Cancel
              </button>
            </div>
          </div>
          {newCategoryError && (
            <p role="alert" className="text-xs text-red-600 font-medium pl-0.5">
              {newCategoryError}
            </p>
          )}
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

      {/* CATEGORY MANAGEMENT MODAL */}
      {showCategoryManager && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cat-manager-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90dvh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-[#087F5B]">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="cat-manager-title" className="font-display font-bold text-base text-[#172B4D]">
                    Category Management
                  </h3>
                  <p className="text-xs text-slate-500">
                    {categories.length} categories · Create, rename, or reassign & delete
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCategoryManager(false);
                  setEditingCategory(null);
                  setRenameError('');
                  setCatManagerNewError('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Close category manager"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto p-4 sm:p-5 space-y-5 flex-1">
              {/* Inline Create Category Form */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                <p className="text-xs font-bold text-[#172B4D]">Add New Category</p>
                <form onSubmit={handleManagerAddCategory} className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={catManagerNewName}
                      onChange={(e) => {
                        setCatManagerNewName(e.target.value);
                        if (catManagerNewError) setCatManagerNewError('');
                      }}
                      placeholder="e.g., Signature Platters"
                      className={`flex-1 px-3 py-2 text-sm bg-white border rounded-lg min-h-[42px] ${
                        catManagerNewError ? 'border-red-500 focus:ring-red-500' : 'border-slate-300'
                      }`}
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 min-h-[42px] text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer whitespace-nowrap shadow-xs"
                    >
                      + Add
                    </button>
                  </div>
                  {catManagerNewError && (
                    <p role="alert" className="text-xs text-red-600 font-medium">
                      {catManagerNewError}
                    </p>
                  )}
                </form>
              </div>

              {/* Categories List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
                  <span>Category Name</span>
                  <span>Dishes Assigned</span>
                </div>

                <div className="space-y-2">
                  {categories.map((cat) => {
                    const dishCount = items.filter((i) => i.category === cat).length;
                    const isEditing = editingCategory === cat;

                    if (isEditing) {
                      return (
                        <form
                          key={cat}
                          onSubmit={handleRenameSubmit}
                          className="p-3 bg-emerald-50/50 border border-[#087F5B] rounded-xl space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={renameInput}
                              onChange={(e) => {
                                setRenameInput(e.target.value);
                                if (renameError) setRenameError('');
                              }}
                              className={`flex-1 px-3 py-2 text-sm bg-white border rounded-lg min-h-[40px] ${
                                renameError ? 'border-red-500' : 'border-slate-300'
                              }`}
                              autoFocus
                            />
                            <button
                              type="submit"
                              className="px-3.5 py-2 min-h-[40px] text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer inline-flex items-center gap-1 shadow-xs"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategory(null);
                                setRenameError('');
                              }}
                              className="px-3 py-2 min-h-[40px] text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                          {renameError && (
                            <p role="alert" className="text-xs text-red-600 font-medium">
                              {renameError}
                            </p>
                          )}
                        </form>
                      );
                    }

                    return (
                      <div
                        key={cat}
                        className="p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-between gap-3 transition-colors shadow-2xs"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-display font-bold text-sm text-[#172B4D] truncate">
                            {cat}
                          </span>
                          <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">
                            {dishCount} {dishCount === 1 ? 'dish' : 'dishes'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartRename(cat)}
                            className="p-2 sm:px-2.5 sm:py-1.5 min-h-[38px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1 cursor-pointer transition-colors"
                            aria-label={`Rename category ${cat}`}
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-600" />
                            <span className="hidden sm:inline">Rename</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(cat)}
                            disabled={categories.length <= 1}
                            className={`p-2 sm:px-2.5 sm:py-1.5 min-h-[38px] text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition-colors ${
                              categories.length <= 1
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                                : 'text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/80 cursor-pointer'
                            }`}
                            aria-label={`Delete category ${cat}`}
                            title={
                              categories.length <= 1
                                ? 'Cannot delete the only remaining category'
                                : `Delete ${cat}`
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowCategoryManager(false);
                  setEditingCategory(null);
                  setRenameError('');
                  setCatManagerNewError('');
                }}
                className="px-4 py-2 min-h-[40px] text-xs font-semibold text-[#172B4D] bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CATEGORY CONFIRMATION & REASSIGNMENT MODAL */}
      {deletingCategory && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-cat-dialog-title"
          className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl border border-red-200 shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="delete-cat-dialog-title" className="font-display font-bold text-lg text-[#172B4D]">
                  Delete Category: {deletingCategory}
                </h3>
                <p className="text-xs text-slate-500">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            {(() => {
              const affectedDishes = items.filter((i) => i.category === deletingCategory);
              const otherCategories = categories.filter((c) => c !== deletingCategory);

              return (
                <div className="space-y-3.5">
                  {affectedDishes.length > 0 ? (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                      <p className="font-semibold text-[13px]">
                        {affectedDishes.length} {affectedDishes.length === 1 ? 'dish' : 'dishes'} will be affected
                      </p>
                      <p className="text-slate-600 leading-relaxed">
                        To maintain data integrity and prevent broken digital menu links, select which category these dishes should be moved to before deleting:
                      </p>
                      <div>
                        <label
                          htmlFor="reassign-select-target"
                          className="font-bold text-slate-800 block mb-1 text-xs"
                        >
                          Reassign dishes to:
                        </label>
                        <select
                          id="reassign-select-target"
                          value={reassignTarget}
                          onChange={(e) => setReassignTarget(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg min-h-[44px] font-medium text-slate-800"
                        >
                          {otherCategories.map((c) => {
                            const count = items.filter((i) => i.category === c).length;
                            return (
                              <option key={c} value={c}>
                                {c} ({count} existing {count === 1 ? 'dish' : 'dishes'})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      There are currently no menu items assigned to <strong>{deletingCategory}</strong>. It will be permanently removed from your menu categories.
                    </p>
                  )}

                  {deleteError && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
                    >
                      {deleteError}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingCategory(null);
                        setDeleteError('');
                      }}
                      className="px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      className="px-4 py-2.5 min-h-[44px] text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      {affectedDishes.length > 0 ? 'Reassign & Delete' : 'Confirm Delete'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
