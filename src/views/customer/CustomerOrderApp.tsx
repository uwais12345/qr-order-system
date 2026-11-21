import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  Grid2x2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import {
  calculateCartItemUnitPrice,
  calculateOrderTotals,
  formatCurrency,
  getAvailableCustomerPaymentMethods,
  getCustomerTrackingStepIndex,
  hasConfiguredCustomizations,
  isRestaurantOrderingAvailable,
  isValidIndianMobile,
  scopeMenuItemsByRestaurant,
  scopeOrdersByRestaurant,
  scopeTablesByRestaurant,
  upsertCustomizedCartItem,
  validateCustomerCheckout,
  type ValidationErrors,
} from '../../domain/serveqrLogic';
import type {
  CartItem,
  MenuItem,
  Order,
  OrderCheckoutPaymentMethod,
  SelectedCustomization,
} from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { FoodImage } from '../../components/FoodImage';
import { RestaurantBrandAvatar } from '../../components/RestaurantBrandAvatar';
import { ServeQRLogo } from '../../components/ServeQRLogo';
import { StatusLabel, VegIndicator } from '../../components/StatusText';
import { DemoPaymentModal } from './DemoPaymentModal';
import { FoodCustomizationSheet } from './FoodCustomizationSheet';

interface CustomerOrderAppProps {
  restaurantSlug: string;
  tableNumber: string;
  branchId?: string;
  autoStart?: boolean;
}

type CustomerTab = 'menu' | 'categories' | 'search' | 'cart' | 'orders';

const TRACKING_STEPS = [
  { label: 'Order Placed', desc: 'Sent directly to the restaurant' },
  { label: 'Order Accepted', desc: 'Confirmed by kitchen staff' },
  { label: 'Preparing', desc: 'Chef is freshly cooking your dishes' },
  { label: 'Ready', desc: 'Plated and ready for table pickup' },
  { label: 'Served', desc: 'Delivered to your dining table' },
];

export const CustomerOrderApp: React.FC<CustomerOrderAppProps> = ({
  restaurantSlug,
  tableNumber,
  branchId,
  autoStart = false,
}) => {
  const { state, guestSessionId, getGuestCart, setGuestCart, placeCustomerOrder } = useServeQR();

  const restaurant = state.restaurants.find((r) => r.slug === restaurantSlug);
  const tables = restaurant ? scopeTablesByRestaurant(state.tables, restaurant.id) : [];
  const table = tables.find(
    (t) => t.tableNumber.toUpperCase() === tableNumber.toUpperCase()
  );
  const branch =
    restaurant?.branches.find((b) => b.id === (branchId || table?.branchId)) ??
    restaurant?.branches[0];

  const [enteredMenu, setEnteredMenu] = useState<boolean>(autoStart);
  const [activeTab, setActiveTab] = useState<CustomerTab>('menu');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'nonveg'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);

  // Mandatory Customer Details & Payment state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [checkoutErrors, setCheckoutErrors] = useState<ValidationErrors>({});
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<OrderCheckoutPaymentMethod>('Online Payment');
  const [showDemoPaymentModal, setShowDemoPaymentModal] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);

  const availablePaymentMethods = useMemo(
    () =>
      getAvailableCustomerPaymentMethods(
        Boolean(restaurant?.settings.payAtRestaurantEnabled)
      ),
    [restaurant?.settings.payAtRestaurantEnabled]
  );

  // If restaurant disables Pay at Restaurant, immediately reset selection to Online Payment
  useEffect(() => {
    if (!availablePaymentMethods.includes(selectedPaymentMethod)) {
      setSelectedPaymentMethod('Online Payment');
    }
  }, [availablePaymentMethods, selectedPaymentMethod]);

  const menuItems = useMemo(
    () => (restaurant ? scopeMenuItemsByRestaurant(state.menuItems, restaurant.id) : []),
    [restaurant, state.menuItems]
  );

  const categories = useMemo(() => {
    if (!restaurant) return [];
    const configured = state.categoriesByRestaurant[restaurant.id] ?? [];
    const fromItems = Array.from(new Set(menuItems.map((m) => m.category)));
    return Array.from(new Set([...configured, ...fromItems]));
  }, [menuItems, restaurant, state.categoriesByRestaurant]);

  const cart = restaurant && table ? getGuestCart(restaurant.id, table.tableNumber) : [];

  const cur = restaurant?.settings.currencySymbol ?? '₹';
  const taxRate = restaurant?.settings.taxRatePercent ?? 5;
  const pricing = calculateOrderTotals(
    cart,
    taxRate,
    restaurant?.settings.estimatedPrepBufferMin ?? 3
  );

  const mySessionOrders: Order[] = useMemo(() => {
    if (!restaurant || !table) return [];
    return scopeOrdersByRestaurant(state.orders, restaurant.id).filter(
      (o) =>
        o.tableNumber === table.tableNumber && o.customerSessionId === guestSessionId
    );
  }, [guestSessionId, restaurant, state.orders, table]);

  const confirmedOrder = confirmedOrderId
    ? state.orders.find((o) => o.id === confirmedOrderId) ?? null
    : null;

  const filteredMenuItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return menuItems.filter((item) => {
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
  }, [dietFilter, menuItems, searchQuery, selectedCategory]);

  // Invalid QR guard
  if (!restaurant || !table) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <ServeQRLogo size="md" />
          <h1 className="font-display text-lg font-bold text-[#172B4D] pt-1">
            Table QR Code Not Recognized
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            This table QR link does not match an active dining table. Please scan the QR standee on
            your table again or ask a server for assistance.
          </p>
        </div>
      </div>
    );
  }

  // Requirement §8: Inactive / Suspended subscription guard on Customer QR Side
  if (!isRestaurantOrderingAvailable(restaurant)) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl overflow-hidden text-center">
          <div className="bg-[#172B4D] px-6 py-5 text-white flex flex-col items-center">
            <RestaurantBrandAvatar restaurant={restaurant} size="lg" className="border-2 border-white/20" />
            <h1 className="font-display text-lg font-bold mt-2.5">{restaurant.name}</h1>
            <p className="text-xs text-emerald-300 mt-0.5">
              {branch?.name ?? restaurant.city} · Table {table.tableNumber}
            </p>
          </div>
          <div className="p-6 space-y-3">
            <p className="font-display text-base font-bold text-[#172B4D]">
              Online ordering is temporarily unavailable for this restaurant.
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Please place your order directly with a restaurant server at Table {table.tableNumber}.
            </p>
          </div>
          <div className="py-3 bg-slate-50 border-t border-slate-100 flex justify-center">
            <ServeQRLogo size="sm" />
          </div>
        </div>
      </div>
    );
  }

  const updateCart = (next: CartItem[]) => {
    setGuestCart(restaurant.id, table.tableNumber, next);
  };

  const openCustomizationSheet = (item: MenuItem, cartLine: CartItem | null = null) => {
    if (!item.available && !cartLine) return;
    setEditingCartItem(cartLine);
    setCustomizingItem(item);
  };

  const handlePrimaryAddClick = (item: MenuItem) => {
    if (!item.available) return;
    // Swiggy-style behavior: if the dish has configured options/portions/add-ons, open the customization bottom sheet
    if (hasConfiguredCustomizations(item)) {
      openCustomizationSheet(item, null);
      return;
    }

    // Items with no configured options add directly for minimal friction
    const next = upsertCustomizedCartItem(cart, item, {
      selectedCustomizations: [],
      specialInstructions: '',
      quantity: 1,
    });
    updateCart(next);
  };

  // Swiggy-style inline stepper handlers for menu cards
  const handleMenuCardIncrement = (item: MenuItem) => {
    const matching = cart.filter((ci) => ci.menuItemId === item.id);
    if (matching.length === 0) {
      handlePrimaryAddClick(item);
      return;
    }
    const lastEntry = matching[matching.length - 1];
    updateCart(
      cart.map((ci) =>
        ci.cartItemId === lastEntry.cartItemId ? { ...ci, quantity: ci.quantity + 1 } : ci
      )
    );
  };

  const handleMenuCardDecrement = (item: MenuItem) => {
    const matching = cart.filter((ci) => ci.menuItemId === item.id);
    if (matching.length === 0) return;
    const lastEntry = matching[matching.length - 1];
    const next = cart
      .map((ci) =>
        ci.cartItemId === lastEntry.cartItemId ? { ...ci, quantity: ci.quantity - 1 } : ci
      )
      .filter((ci) => ci.quantity > 0);
    updateCart(next);
  };

  const handleCustomizationConfirm = (payload: {
    selectedCustomizations: SelectedCustomization[];
    specialInstructions: string;
    quantity: number;
  }) => {
    if (!customizingItem) return;
    const next = upsertCustomizedCartItem(
      cart,
      customizingItem,
      payload,
      editingCartItem?.cartItemId ?? null
    );
    updateCart(next);
    setCustomizingItem(null);
    setEditingCartItem(null);
  };

  const handleUpdateQty = (cartItemId: string, delta: number) => {
    const next = cart
      .map((ci) =>
        ci.cartItemId === cartItemId ? { ...ci, quantity: ci.quantity + delta } : ci
      )
      .filter((ci) => ci.quantity > 0);
    updateCart(next);
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    updateCart(cart.filter((ci) => ci.cartItemId !== cartItemId));
  };

  const handleSendOtp = () => {
    if (!isValidIndianMobile(customerPhone)) {
      setCheckoutErrors({
        customerPhone: 'Enter a valid 10-digit Indian mobile number (starts with 6–9).',
      });
      return;
    }
    setCheckoutErrors({});
    setOtpSent(true);
  };

  const handleVerifyOtp = () => {
    if (otpInput.trim().length >= 4) {
      setOtpVerified(true);
      setCheckoutErrors({});
    } else {
      setCheckoutErrors({ otp: 'Enter the 4-digit verification code (demo code: 1234).' });
    }
  };

  const finalizeOrder = (
    method: OrderCheckoutPaymentMethod,
    paymentStatus: 'Paid' | 'Pending',
    onlinePaymentRef?: string
  ) => {
    const placed = placeCustomerOrder({
      restaurantId: restaurant.id,
      branchId: branch?.id ?? table.branchId,
      tableId: table.id,
      tableNumber: table.tableNumber,
      cartItems: cart,
      customerName,
      customerPhone,
      otpVerified,
      orderPaymentMethod: method,
      paymentStatus,
      onlinePaymentRef,
    });
    setCheckoutErrors({});
    setShowDemoPaymentModal(false);
    setConfirmedOrderId(placed.id);
    setActiveTab('orders');
  };

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const errors = validateCustomerCheckout(
      customerName,
      customerPhone,
      restaurant.settings.customerSettings,
      otpVerified
    );
    if (Object.keys(errors).length > 0) {
      setCheckoutErrors(errors);
      return;
    }
    setCheckoutErrors({});

    if (selectedPaymentMethod === 'Online Payment') {
      setShowDemoPaymentModal(true);
      return;
    }

    finalizeOrder('Pay at Restaurant', 'Pending');
  };

  // COMPACT, BALANCED MOBILE-FIRST QR LANDING PAGE
  if (!enteredMenu) {
    return (
      <div className="min-h-[100svh] w-full box-border bg-[#F7F9FC] flex flex-col items-center px-[clamp(12px,4vw,24px)] pt-[max(clamp(16px,4vw,28px),env(safe-area-inset-top))] pb-[max(clamp(16px,4vw,28px),env(safe-area-inset-bottom))]">
        <main className="my-auto w-full max-w-[388px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          {/* Compact Navy Restaurant Header */}
          <div className="bg-[#172B4D] text-white px-4 py-3.5 flex items-center gap-3">
            <RestaurantBrandAvatar
              restaurant={restaurant}
              size="md"
              className="border-2 border-white/25 shrink-0"
            />
            <div className="min-w-0 text-left">
              <h1 className="font-display text-[17px] sm:text-lg font-bold leading-tight truncate">
                {restaurant.name}
              </h1>
              <p className="text-xs text-emerald-300 mt-0.5 truncate">
                {branch?.name ?? restaurant.city}
              </p>
            </div>
          </div>

          {/* Balanced Table Verification & Primary View Menu CTA */}
          <div className="p-4 space-y-3">
            <div className="py-2.5 px-3.5 rounded-xl bg-emerald-50/75 border border-emerald-200/80 flex items-center justify-between gap-2">
              <div className="text-left min-w-0">
                <p className="text-[11px] font-semibold text-slate-600">Verified Dining Table</p>
                <p className="text-xs text-slate-500 truncate">{table.section}</p>
              </div>
              <p className="font-mono text-lg sm:text-xl font-bold text-[#087F5B] whitespace-nowrap shrink-0">
                Table {table.tableNumber}
              </p>
            </div>

            <p className="text-xs text-slate-600 text-center leading-snug text-balance">
              Browse the live menu and order directly from your table.
            </p>

            <button
              type="button"
              onClick={() => setEnteredMenu(true)}
              className="w-full min-h-[46px] px-5 text-sm font-bold text-white bg-[#087F5B] hover:bg-[#06674A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087F5B] focus-visible:ring-offset-2 rounded-xl transition-colors cursor-pointer"
            >
              View Menu
            </button>

            <p className="text-[11px] text-slate-500 text-center">
              No login required · Instant kitchen sync
            </p>
          </div>

          <div className="py-2.5 bg-slate-50 border-t border-slate-100 flex justify-center">
            <ServeQRLogo size="sm" />
          </div>
        </main>
      </div>
    );
  }

  const showStickyCartBar =
    pricing.itemCount > 0 && activeTab !== 'cart' && activeTab !== 'orders';

  return (
    <div
      className={`min-h-screen bg-[#F7F9FC] flex flex-col ${
        showStickyCartBar ? 'pb-32' : 'pb-20'
      }`}
    >
      {/* Compact Sticky Top Bar with Uploaded Logo */}
      <header className="sticky top-0 z-30 h-[52px] bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-4">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <RestaurantBrandAvatar restaurant={restaurant} size="sm" />
            <div className="min-w-0">
              <p className="font-display text-[13px] sm:text-sm font-bold text-[#172B4D] truncate leading-tight">
                {restaurant.name}
              </p>
              <p className="text-[11px] text-slate-500 truncate leading-tight">
                {branch?.name ?? restaurant.city}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-[11px] sm:text-xs font-bold text-[#087F5B] bg-emerald-50 border border-emerald-200/80 px-2 py-1 rounded-md whitespace-nowrap">
              Table {table.tableNumber}
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('cart')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg cursor-pointer whitespace-nowrap"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Cart ({pricing.itemCount})
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 py-3.5 sm:py-4 space-y-3.5">
        {/* MENU / SEARCH / CATEGORIES VIEW */}
        {(activeTab === 'menu' || activeTab === 'search' || activeTab === 'categories') && (
          <>
            {/* Search & Filters */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search dishes at ${restaurant.name}...`}
                  aria-label="Search digital menu"
                  className="w-full min-h-[42px] pl-10 pr-4 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#087F5B]/25 focus:border-[#087F5B]"
                />
              </div>

              {activeTab === 'categories' ? (
                <section className="space-y-3">
                  <h1 className="font-display text-base font-bold text-[#172B4D]">
                    Menu Categories
                  </h1>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {['All', ...categories].map((cat) => {
                      const count =
                        cat === 'All'
                          ? menuItems.length
                          : menuItems.filter((m) => m.category === cat).length;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(cat);
                            setActiveTab('menu');
                          }}
                          className={`min-h-[58px] p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                            selectedCategory === cat
                              ? 'border-[#087F5B] bg-emerald-50/50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <p className="font-display font-bold text-sm text-[#172B4D]">{cat}</p>
                          <p className="text-xs text-slate-500 mt-0.5 font-mono">
                            {count} item{count === 1 ? '' : 's'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {['All', ...categories].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`min-h-[34px] px-3 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          selectedCategory === cat
                            ? 'bg-[#172B4D] text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="inline-flex p-0.5 bg-slate-200/70 rounded-lg self-start shrink-0">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'veg', label: 'Veg' },
                      { id: 'nonveg', label: 'Non-Veg' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDietFilter(opt.id as 'all' | 'veg' | 'nonveg')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                          dietFilter === opt.id
                            ? 'bg-white text-[#172B4D] shadow-xs'
                            : 'text-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* B & C. COMPACT MOBILE FOOD CARDS WITH SWIGGY-STYLE STEPPER */}
            {activeTab !== 'categories' && (
              <>
                {filteredMenuItems.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
                    <p className="text-sm font-semibold text-[#172B4D]">
                      No dishes match your search
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('All');
                        setDietFilter('all');
                      }}
                      className="mt-2.5 text-xs font-semibold text-[#087F5B] cursor-pointer"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                    {filteredMenuItems.map((item) => {
                      const inCartQty = cart
                        .filter((ci) => ci.menuItemId === item.id)
                        .reduce((s, ci) => s + ci.quantity, 0);
                      const isCustomizable = hasConfiguredCustomizations(item);

                      return (
                        <article
                          key={item.id}
                          className={`bg-white border border-slate-200 rounded-xl p-3 flex gap-3 justify-between items-start ${
                            !item.available ? 'opacity-65' : ''
                          }`}
                        >
                          {/* LEFT: Veg Indicator, Dish Name, Price, Concise Description & Options */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                            <div>
                              <button
                                type="button"
                                onClick={() => openCustomizationSheet(item, null)}
                                disabled={!item.available}
                                className="w-full text-left cursor-pointer disabled:cursor-default group"
                              >
                                <div className="flex items-center gap-1.5">
                                  <VegIndicator isVeg={item.isVeg} />
                                  <h2 className="font-display font-bold text-[#172B4D] group-hover:text-[#087F5B] text-[14px] sm:text-[15px] leading-snug truncate transition-colors">
                                    {item.name}
                                  </h2>
                                </div>

                                <div className="mt-1 flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-[#172B4D] text-[14px] sm:text-[15px] tabular-nums">
                                    {formatCurrency(item.price, cur)}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    · {item.prepTimeMinutes} min
                                    {!item.available ? ' · Sold out' : ''}
                                  </span>
                                </div>

                                <p className="mt-1 text-xs text-slate-600 leading-[1.35] line-clamp-2">
                                  {item.description}
                                </p>
                              </button>
                            </div>

                            {item.available && isCustomizable && (
                              <div className="mt-2 flex items-center">
                                <button
                                  type="button"
                                  onClick={() => openCustomizationSheet(item, null)}
                                  aria-label={`Customize ${item.name}`}
                                  className="min-h-[32px] px-2.5 text-[11px] font-semibold text-[#172B4D] bg-slate-100 hover:bg-slate-200/80 rounded-lg inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                                >
                                  <SlidersHorizontal className="w-3 h-3 text-[#087F5B]" />
                                  Options
                                </button>
                              </div>
                            )}
                          </div>

                          {/* RIGHT: Compact Food Image + Anchored Swiggy-Style Add / Qty Stepper */}
                          <div className="w-[96px] sm:w-[106px] shrink-0 flex flex-col items-center">
                            <button
                              type="button"
                              onClick={() => openCustomizationSheet(item, null)}
                              disabled={!item.available}
                              aria-label={`View details for ${item.name}`}
                              className="w-[96px] h-[84px] sm:w-[106px] sm:h-[92px] rounded-xl overflow-hidden bg-slate-100 border border-slate-100 block cursor-pointer disabled:cursor-default"
                            >
                              <FoodImage
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full"
                              />
                            </button>

                            {item.available ? (
                              <div className="-mt-3.5 relative z-10 w-[86px] sm:w-[92px]">
                                {inCartQty === 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => handlePrimaryAddClick(item)}
                                    aria-label={`Add ${item.name} to cart`}
                                    className="w-full min-h-[34px] px-2.5 text-xs font-bold text-white bg-[#087F5B] hover:bg-[#06674A] active:scale-[0.98] rounded-lg ring-2 ring-white shadow-sm cursor-pointer whitespace-nowrap transition-all"
                                  >
                                    + Add
                                  </button>
                                ) : (
                                  <div
                                    className="w-full inline-flex items-center justify-between bg-[#087F5B] text-white rounded-lg ring-2 ring-white shadow-sm overflow-hidden min-h-[34px]"
                                    role="group"
                                    aria-label={`Quantity controls for ${item.name}`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => handleMenuCardDecrement(item)}
                                      aria-label={`Decrease ${item.name} quantity`}
                                      className="min-h-[34px] w-7 flex items-center justify-center hover:bg-[#06674A] cursor-pointer"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <span
                                      className="min-w-[20px] text-center font-mono text-xs font-bold tabular-nums"
                                      aria-live="polite"
                                    >
                                      {inCartQty}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleMenuCardIncrement(item)}
                                      aria-label={`Increase ${item.name} quantity`}
                                      className="min-h-[34px] w-7 flex items-center justify-center hover:bg-[#06674A] cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="mt-1.5 text-[11px] font-semibold text-slate-400">
                                Sold Out
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* CART & CHECKOUT TAB */}
        {activeTab === 'cart' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                <div>
                  <h1 className="font-display text-lg font-bold text-[#172B4D]">Your Cart</h1>
                  <p className="text-xs text-slate-500">
                    {restaurant.name} · Table {table.tableNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('menu')}
                  className="text-xs font-semibold text-[#087F5B] hover:text-[#06674A] cursor-pointer"
                >
                  + Add more items
                </button>
              </div>

              {cart.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <ShoppingBag className="w-9 h-9 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-[#172B4D]">Your cart is empty</p>
                  <p className="text-xs text-slate-500">
                    Browse the digital menu to add freshly prepared dishes.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('menu')}
                    className="px-4 py-2.5 text-xs font-semibold text-white bg-[#087F5B] rounded-xl cursor-pointer"
                  >
                    Browse Menu
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {cart.map((ci) => {
                    const unit = calculateCartItemUnitPrice(
                      ci.basePrice,
                      ci.selectedCustomizations
                    );
                    const fullMenuItem = menuItems.find((m) => m.id === ci.menuItemId);

                    return (
                      <div key={ci.cartItemId} className="py-3.5 flex items-start gap-3">
                        {/* Food Image Thumbnail in Cart */}
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-100 shrink-0">
                          <FoodImage src={ci.imageUrl} alt={ci.name} className="w-full h-full" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <VegIndicator isVeg={ci.isVeg} />
                                <p className="font-semibold text-sm text-[#172B4D] truncate">
                                  {ci.name}
                                </p>
                              </div>
                              {ci.selectedCustomizations.length > 0 && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {ci.selectedCustomizations.map((c) => c.choiceLabel).join(' · ')}
                                </p>
                              )}
                              {ci.specialInstructions && (
                                <p className="text-xs text-amber-800 mt-0.5">
                                  Note: {ci.specialInstructions}
                                </p>
                              )}
                            </div>

                            <span className="font-mono text-sm font-bold text-[#172B4D] tabular-nums shrink-0">
                              {formatCurrency(unit * ci.quantity, cur)}
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-3 text-xs">
                              {fullMenuItem && (
                                <button
                                  type="button"
                                  onClick={() => openCustomizationSheet(fullMenuItem, ci)}
                                  className="font-semibold text-[#087F5B] hover:text-[#06674A] cursor-pointer whitespace-nowrap"
                                >
                                  {hasConfiguredCustomizations(fullMenuItem)
                                    ? 'Edit options'
                                    : 'Edit note'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveCartItem(ci.cartItemId)}
                                aria-label={`Remove ${ci.name}`}
                                className="text-red-600 inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                              >
                                <Trash2 className="w-3 h-3" />
                                Remove
                              </button>
                            </div>

                            <div className="inline-flex items-center border border-[#087F5B] rounded-lg overflow-hidden shrink-0">
                              <button
                                type="button"
                                onClick={() => handleUpdateQty(ci.cartItemId, -1)}
                                aria-label={`Decrease quantity of ${ci.name}`}
                                className="min-h-[32px] min-w-[32px] flex items-center justify-center text-[#087F5B] hover:bg-emerald-50 cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="px-2.5 font-mono text-xs font-bold text-[#172B4D] tabular-nums">
                                {ci.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateQty(ci.cartItemId, 1)}
                                aria-label={`Increase quantity of ${ci.name}`}
                                className="min-h-[32px] min-w-[32px] flex items-center justify-center text-[#087F5B] hover:bg-emerald-50 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Checkout Form: Pricing + Mandatory Customer Details + Payment Method */}
            {cart.length > 0 && (
              <form
                onSubmit={handleCheckoutSubmit}
                noValidate
                className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 self-start"
              >
                <div>
                  <h2 className="font-display text-base font-bold text-[#172B4D]">
                    Bill Summary &amp; Checkout
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Table {table.tableNumber} · Est. preparation {pricing.estimatedPrepMinutes} mins
                  </p>
                </div>

                {/* Pricing Breakdown */}
                <div className="space-y-1.5 text-sm border-t border-b border-slate-100 py-3">
                  <div className="flex justify-between text-slate-600 text-xs sm:text-sm">
                    <span>Subtotal ({pricing.itemCount} items)</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(pricing.subtotal, cur)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 text-xs sm:text-sm">
                    <span>
                      {restaurant.settings.taxLabel} ({taxRate}%)
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(pricing.taxAmount, cur)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-[#172B4D] text-base pt-2 border-t border-slate-100">
                    <span>Total Amount</span>
                    <span className="font-mono text-[#087F5B] tabular-nums">
                      {formatCurrency(pricing.totalAmount, cur)}
                    </span>
                  </div>
                </div>

                {/* D. MANDATORY CUSTOMER DETAILS (NO OPTIONAL LABELS) */}
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="guest-name"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Your Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="guest-name"
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        if (checkoutErrors.customerName) {
                          setCheckoutErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.customerName;
                            return copy;
                          });
                        }
                      }}
                      placeholder="Enter your full name"
                      className={`w-full min-h-[42px] px-3.5 text-sm border rounded-xl ${
                        checkoutErrors.customerName ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                      }`}
                    />
                    {checkoutErrors.customerName && (
                      <p role="alert" className="text-xs text-red-600 mt-1">
                        {checkoutErrors.customerName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="guest-phone"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Mobile Number <span className="text-red-600">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="guest-phone"
                        type="tel"
                        inputMode="numeric"
                        maxLength={14}
                        required
                        value={customerPhone}
                        onChange={(e) => {
                          setCustomerPhone(e.target.value);
                          setOtpVerified(false);
                          if (checkoutErrors.customerPhone) {
                            setCheckoutErrors((prev) => {
                              const copy = { ...prev };
                              delete copy.customerPhone;
                              return copy;
                            });
                          }
                        }}
                        placeholder="10-digit mobile (e.g. 9876543210)"
                        className={`flex-1 min-h-[42px] px-3.5 text-sm font-mono border rounded-xl ${
                          checkoutErrors.customerPhone
                            ? 'border-red-400 bg-red-50/30'
                            : 'border-slate-300'
                        }`}
                      />
                      {restaurant.settings.customerSettings.otpVerificationEnabled && (
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          className="px-3 text-xs font-semibold text-[#087F5B] border border-[#087F5B] rounded-xl cursor-pointer whitespace-nowrap"
                        >
                          {otpSent ? 'Resend OTP' : 'Send OTP'}
                        </button>
                      )}
                    </div>
                    {checkoutErrors.customerPhone && (
                      <p role="alert" className="text-xs text-red-600 mt-1">
                        {checkoutErrors.customerPhone}
                      </p>
                    )}
                  </div>

                  {restaurant.settings.customerSettings.otpVerificationEnabled && otpSent && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <label htmlFor="guest-otp" className="block text-xs font-semibold text-slate-700">
                        Enter 4-digit OTP (demo: 1234)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="guest-otp"
                          type="text"
                          maxLength={6}
                          value={otpInput}
                          onChange={(e) => setOtpInput(e.target.value)}
                          placeholder="1234"
                          className="flex-1 min-h-[40px] px-3 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          className="px-3.5 text-xs font-semibold text-white bg-[#172B4D] rounded-lg cursor-pointer"
                        >
                          {otpVerified ? 'Verified' : 'Verify'}
                        </button>
                      </div>
                      {checkoutErrors.otp && (
                        <p className="text-xs text-red-600">{checkoutErrors.otp}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* PAYMENT METHOD SELECTION */}
                <fieldset className="space-y-2 pt-1">
                  <legend className="text-xs font-semibold text-slate-700 mb-1.5">
                    Payment Method
                  </legend>
                  <div className="space-y-2">
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        selectedPaymentMethod === 'Online Payment'
                          ? 'border-[#087F5B] bg-emerald-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="customer-payment-method"
                        value="Online Payment"
                        checked={selectedPaymentMethod === 'Online Payment'}
                        onChange={() => setSelectedPaymentMethod('Online Payment')}
                        className="mt-0.5 text-[#087F5B]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#172B4D] inline-flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-[#087F5B]" />
                            Online Payment
                          </span>
                          <span className="text-[10px] font-semibold text-[#087F5B]">
                            Default
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          UPI, Debit/Credit Card, or NetBanking (Prototype Demo Flow)
                        </p>
                      </div>
                    </label>

                    {availablePaymentMethods.includes('Pay at Restaurant') && (
                      <label
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          selectedPaymentMethod === 'Pay at Restaurant'
                            ? 'border-[#087F5B] bg-emerald-50/40'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="customer-payment-method"
                          value="Pay at Restaurant"
                          checked={selectedPaymentMethod === 'Pay at Restaurant'}
                          onChange={() => setSelectedPaymentMethod('Pay at Restaurant')}
                          className="mt-0.5 text-[#087F5B]"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-[#172B4D] inline-flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-[#172B4D]" />
                            Pay at Restaurant
                          </span>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Pay via cash, card, or UPI at the table or cashier desk after dining.
                          </p>
                        </div>
                      </label>
                    )}
                  </div>
                </fieldset>

                <button
                  type="submit"
                  className="w-full min-h-[48px] px-5 text-sm font-bold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-xl transition-colors cursor-pointer"
                >
                  {selectedPaymentMethod === 'Online Payment'
                    ? `Proceed to Online Payment · ${formatCurrency(pricing.totalAmount, cur)}`
                    : `Place Order (Pay at Restaurant) · ${formatCurrency(pricing.totalAmount, cur)}`}
                </button>
              </form>
            )}
          </div>
        )}

        {/* MY ORDERS & LIVE TRACKING TAB */}
        {activeTab === 'orders' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            {confirmedOrder && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#087F5B] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h2 className="font-display text-sm sm:text-base font-bold text-[#172B4D]">
                    {confirmedOrder.paymentStatus === 'Paid'
                      ? 'Payment Confirmed & Order Placed!'
                      : 'Order Successfully Placed!'}
                  </h2>
                  <p className="text-xs text-slate-700 mt-1 font-mono">
                    Order <strong>{confirmedOrder.id}</strong> · Table {confirmedOrder.tableNumber}{' '}
                    · {confirmedOrder.orderPaymentMethod ?? 'Online Payment'} (
                    {confirmedOrder.paymentStatus})
                  </p>
                  {confirmedOrder.onlinePaymentRef && (
                    <p className="text-[11px] text-[#087F5B] font-mono mt-0.5">
                      Demo Payment Ref: {confirmedOrder.onlinePaymentRef}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-lg font-bold text-[#172B4D]">My Table Orders</h1>
                <p className="text-xs text-slate-500">
                  Live kitchen status updates for your orders at Table {table.tableNumber}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('menu')}
                className="text-xs font-semibold text-[#087F5B] cursor-pointer"
              >
                Order more food
              </button>
            </div>

            {mySessionOrders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
                <ClipboardList className="w-9 h-9 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-[#172B4D]">No orders placed yet</p>
                <p className="text-xs text-slate-500">
                  Once you place an order from Table {table.tableNumber}, you can track every step
                  from Kitchen Acceptance to Served right here.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('menu')}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-[#087F5B] rounded-xl cursor-pointer"
                >
                  Open Digital Menu
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {mySessionOrders.map((order) => {
                  const activeIdx = getCustomerTrackingStepIndex(order.status);
                  return (
                    <article
                      key={order.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-100">
                        <div>
                          <p className="font-mono text-base font-bold text-[#172B4D]">{order.id}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {restaurant.name} · Table {order.tableNumber}
                            {order.customerName ? ` · ${order.customerName}` : ''}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Payment: <strong>{order.orderPaymentMethod ?? 'Pay at Restaurant'}</strong>{' '}
                            · <StatusLabel status={order.paymentStatus} />
                          </p>
                        </div>
                        <div className="text-right">
                          <StatusLabel status={order.status} />
                          <p className="text-xs text-slate-500 mt-1 flex items-center justify-end gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            Est. {order.estimatedPrepMinutes} min
                          </p>
                        </div>
                      </div>

                      {order.status === 'Cancelled' ? (
                        <p className="text-sm text-red-700 font-medium">
                          This order was cancelled. Please check with your server if you need help.
                        </p>
                      ) : (
                        <ol className="space-y-2.5" aria-label={`Order ${order.id} progress`}>
                          {TRACKING_STEPS.map((step, idx) => {
                            const completed = idx <= activeIdx;
                            const isCurrent = idx === activeIdx;
                            return (
                              <li key={step.label} className="flex items-start gap-3">
                                <span
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${
                                    completed
                                      ? 'bg-[#087F5B] text-white'
                                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                                  }`}
                                >
                                  {idx + 1}
                                </span>
                                <div>
                                  <p
                                    className={`text-sm font-semibold ${
                                      isCurrent
                                        ? 'text-[#087F5B]'
                                        : completed
                                        ? 'text-[#172B4D]'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {step.label}
                                  </p>
                                  <p className="text-xs text-slate-500">{step.desc}</p>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}

                      <div className="pt-3.5 border-t border-slate-100 space-y-1.5 text-xs">
                        {order.items.map((oi) => (
                          <div key={oi.id} className="flex justify-between text-slate-700">
                            <span>
                              {oi.quantity}× {oi.name}
                              {oi.selectedCustomizations.length > 0 && (
                                <span className="text-slate-400">
                                  {' '}
                                  ({oi.selectedCustomizations.map((c) => c.choiceLabel).join(', ')})
                                </span>
                              )}
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatCurrency(oi.unitPrice * oi.quantity, cur)}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between font-bold text-[#172B4D] pt-2 border-t border-slate-100 text-sm">
                          <span>Total (incl. {restaurant.settings.taxLabel})</span>
                          <span className="font-mono text-[#087F5B] tabular-nums">
                            {formatCurrency(order.totalAmount, cur)}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* C. STICKY BOTTOM CART SUMMARY BAR (SWIGGY-STYLE) */}
      {showStickyCartBar && (
        <div className="fixed bottom-[56px] left-0 right-0 z-35 px-3 pb-2 pointer-events-none">
          <div className="max-w-5xl mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={() => setActiveTab('cart')}
              aria-label={`View Cart, ${pricing.itemCount} ${
                pricing.itemCount === 1 ? 'Item' : 'Items'
              }, ${formatCurrency(pricing.totalAmount, cur)}`}
              className="w-full min-h-[46px] px-3.5 sm:px-4 py-2 bg-[#087F5B] hover:bg-[#06674A] text-white rounded-xl shadow-lg flex items-center justify-between gap-2 cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold min-w-0">
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">
                  {pricing.itemCount} {pricing.itemCount === 1 ? 'Item' : 'Items'}
                </span>
                <span className="opacity-60">|</span>
                <span className="font-mono tabular-nums whitespace-nowrap">
                  {formatCurrency(pricing.totalAmount, cur)}
                </span>
              </span>
              <span className="text-xs sm:text-sm font-bold tracking-tight whitespace-nowrap shrink-0">
                View Cart →
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Customer Mobile-First Bottom Navigation (NO Admin / Owner links) */}
      <nav
        aria-label="Customer Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200"
      >
        <div className="max-w-5xl mx-auto h-full grid grid-cols-5">
          {[
            { id: 'menu' as CustomerTab, label: 'Menu', icon: UtensilsCrossed },
            { id: 'categories' as CustomerTab, label: 'Categories', icon: Grid2x2 },
            { id: 'search' as CustomerTab, label: 'Search', icon: Search },
            {
              id: 'cart' as CustomerTab,
              label: pricing.itemCount > 0 ? `Cart (${pricing.itemCount})` : 'Cart',
              icon: ShoppingBag,
            },
            {
              id: 'orders' as CustomerTab,
              label: mySessionOrders.length > 0 ? `Orders (${mySessionOrders.length})` : 'Orders',
              icon: ClipboardList,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'search') {
                    window.setTimeout(() => searchInputRef.current?.focus(), 60);
                  }
                }}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] sm:text-[11px] font-semibold transition-colors cursor-pointer ${
                  active ? 'text-[#087F5B]' : 'text-slate-500 hover:text-[#172B4D]'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span className="truncate max-w-full px-0.5">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Food Customization Bottom Sheet */}
      {customizingItem && (
        <FoodCustomizationSheet
          item={customizingItem}
          currencySymbol={cur}
          initialCartItem={editingCartItem}
          onClose={() => {
            setCustomizingItem(null);
            setEditingCartItem(null);
          }}
          onConfirm={handleCustomizationConfirm}
        />
      )}

      {/* Prototype Online Payment Gateway Demo Modal */}
      {showDemoPaymentModal && (
        <DemoPaymentModal
          restaurantName={restaurant.name}
          tableNumber={table.tableNumber}
          customerName={customerName}
          customerPhone={customerPhone}
          amount={pricing.totalAmount}
          currencySymbol={cur}
          onClose={() => setShowDemoPaymentModal(false)}
          onPaymentSuccess={(ref) => finalizeOrder('Online Payment', 'Paid', ref)}
        />
      )}
    </div>
  );
};
