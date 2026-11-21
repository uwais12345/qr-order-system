import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Check, Minus, Plus, X } from 'lucide-react';
import {
  calculateCartItemUnitPrice,
  formatCurrency,
  hasConfiguredCustomizations,
  validateCustomizationSelections,
} from '../../domain/serveqrLogic';
import type { CartItem, MenuItem, SelectedCustomization } from '../../domain/types';
import { FoodImage } from '../../components/FoodImage';
import { VegIndicator } from '../../components/StatusText';

interface FoodCustomizationSheetProps {
  item: MenuItem;
  currencySymbol: string;
  initialCartItem?: CartItem | null;
  onClose: () => void;
  onConfirm: (payload: {
    selectedCustomizations: SelectedCustomization[];
    specialInstructions: string;
    quantity: number;
  }) => void;
}

export const FoodCustomizationSheet: React.FC<FoodCustomizationSheetProps> = ({
  item,
  currencySymbol,
  initialCartItem,
  onClose,
  onConfirm,
}) => {
  const configuredGroups = useMemo(
    () => item.customizations.filter((g) => g.choices.length > 0),
    [item.customizations]
  );
  const hasOptions = hasConfiguredCustomizations(item);

  const [selected, setSelected] = useState<SelectedCustomization[]>(
    () => initialCartItem?.selectedCustomizations ?? []
  );
  const [instructions, setInstructions] = useState(
    initialCartItem?.specialInstructions ?? ''
  );
  const [quantity, setQuantity] = useState(initialCartItem?.quantity ?? 1);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const groupRefs = useRef<Record<string, HTMLFieldSetElement | null>>({});

  // Close cleanly on Escape key & lock background scroll while sheet is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const validation = useMemo(
    () => validateCustomizationSelections(configuredGroups, selected),
    [configuredGroups, selected]
  );

  const unitPrice = calculateCartItemUnitPrice(item.price, selected);
  const totalPrice = unitPrice * quantity;

  const isChoiceSelected = (groupId: string, choiceId: string) =>
    selected.some((s) => s.groupId === groupId && s.choiceId === choiceId);

  const handleToggleChoice = (
    groupId: string,
    groupName: string,
    type: 'single' | 'multiple',
    choice: { id: string; label: string; priceDelta: number }
  ) => {
    setSelected((prev) => {
      const exists = prev.some((s) => s.groupId === groupId && s.choiceId === choice.id);
      if (type === 'single') {
        const withoutGroup = prev.filter((s) => s.groupId !== groupId);
        return [
          ...withoutGroup,
          {
            groupId,
            groupName,
            choiceId: choice.id,
            choiceLabel: choice.label,
            priceDelta: choice.priceDelta,
          },
        ];
      }
      if (exists) {
        return prev.filter((s) => !(s.groupId === groupId && s.choiceId === choice.id));
      }
      return [
        ...prev,
        {
          groupId,
          groupName,
          choiceId: choice.id,
          choiceLabel: choice.label,
          priceDelta: choice.priceDelta,
        },
      ];
    });
  };

  const handleConfirm = () => {
    if (!validation.valid) {
      setAttemptedSubmit(true);
      const firstMissingId = validation.missingGroupIds[0];
      const targetEl = firstMissingId ? groupRefs.current[firstMissingId] : null;
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    onConfirm({
      selectedCustomizations: selected,
      specialInstructions: instructions.trim(),
      quantity,
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-dish-title"
      >
        <motion.div
          initial={{ y: 40, opacity: 0.96 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 32, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl overflow-hidden max-h-[88dvh] flex flex-col"
        >
          {/* Mobile grab handle */}
          <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
            <span className="w-10 h-1 rounded-full bg-slate-300" aria-hidden="true" />
          </div>

          {/* Compact Swiggy-Style Dish Header */}
          <div className="px-4 sm:px-5 pt-2 pb-3.5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 shrink-0">
                <FoodImage
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <VegIndicator isVeg={item.isVeg} />
                  <h2
                    id="custom-dish-title"
                    className="font-display font-bold text-[#172B4D] text-[15px] sm:text-base leading-snug truncate"
                  >
                    {item.name}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <span className="font-mono font-bold text-[#172B4D] tabular-nums">
                    {formatCurrency(item.price, currencySymbol)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{item.prepTimeMinutes} min</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close customization sheet"
              className="min-h-[44px] min-w-[44px] -mr-1.5 rounded-full flex items-center justify-center text-slate-500 hover:text-[#172B4D] hover:bg-slate-100 cursor-pointer shrink-0 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="px-4 sm:px-5 py-4 overflow-y-auto space-y-4 flex-1 overscroll-contain">
            {item.description && (
              <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
            )}

            {/* Inline Mandatory Validation Banner */}
            {attemptedSubmit && !validation.valid && (
              <div
                role="alert"
                className="px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <span>
                  Please select a required option for{' '}
                  <strong>{validation.missingGroupNames.join(', ')}</strong> before adding to cart.
                </span>
              </div>
            )}

            {/* Configured Customization Groups (Portions, Options, Add-ons) */}
            {hasOptions && (
              <div className="space-y-4">
                {configuredGroups.map((group) => {
                  const isMissing =
                    attemptedSubmit && validation.missingGroupIds.includes(group.id);
                  const selectedInGroup = selected.filter((s) => s.groupId === group.id).length;

                  return (
                    <fieldset
                      key={group.id}
                      ref={(el) => {
                        groupRefs.current[group.id] = el;
                      }}
                      className={`rounded-xl border p-3.5 transition-colors ${
                        isMissing
                          ? 'border-red-300 bg-red-50/30'
                          : 'border-slate-200/90 bg-slate-50/40'
                      }`}
                    >
                      <legend className="sr-only">{group.name}</legend>
                      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2 border-b border-slate-200/70">
                        <div className="min-w-0">
                          <p className="font-display text-sm font-bold text-[#172B4D] leading-tight">
                            {group.name}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {group.required ? 'Required' : 'Optional'}
                            <span aria-hidden="true"> · </span>
                            {group.type === 'single' ? 'Select any 1' : 'Select multiple'}
                          </p>
                        </div>
                        {group.required ? (
                          <span
                            className={`text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                              selectedInGroup > 0
                                ? 'text-[#087F5B]'
                                : isMissing
                                ? 'text-red-600'
                                : 'text-[#172B4D]'
                            }`}
                          >
                            {selectedInGroup > 0 ? 'Selected' : 'Required'}
                          </span>
                        ) : (
                          selectedInGroup > 0 && (
                            <span className="text-[11px] font-semibold text-[#087F5B] whitespace-nowrap shrink-0">
                              {selectedInGroup} selected
                            </span>
                          )
                        )}
                      </div>

                      <div className="divide-y divide-slate-200/60">
                        {group.choices.map((choice) => {
                          const checked = isChoiceSelected(group.id, choice.id);
                          return (
                            <label
                              key={choice.id}
                              className="min-h-[44px] py-2 flex items-center justify-between gap-3 cursor-pointer select-none"
                            >
                              <span className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type={group.type === 'single' ? 'radio' : 'checkbox'}
                                  name={group.id}
                                  checked={checked}
                                  onChange={() =>
                                    handleToggleChoice(group.id, group.name, group.type, choice)
                                  }
                                  className="sr-only"
                                />
                                {group.type === 'single' ? (
                                  <span
                                    aria-hidden="true"
                                    className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                      checked
                                        ? 'border-[#087F5B]'
                                        : 'border-slate-300 bg-white'
                                    }`}
                                  >
                                    {checked && (
                                      <span className="w-2.5 h-2.5 rounded-full bg-[#087F5B]" />
                                    )}
                                  </span>
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className={`w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center shrink-0 transition-colors ${
                                      checked
                                        ? 'border-[#087F5B] bg-[#087F5B] text-white'
                                        : 'border-slate-300 bg-white'
                                    }`}
                                  >
                                    {checked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </span>
                                )}
                                <span
                                  className={`text-sm leading-snug ${
                                    checked
                                      ? 'font-semibold text-[#172B4D]'
                                      : 'font-normal text-slate-700'
                                  }`}
                                >
                                  {choice.label}
                                </span>
                              </span>

                              <span className="font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap shrink-0">
                                {choice.priceDelta > 0
                                  ? `+${formatCurrency(choice.priceDelta, currencySymbol)}`
                                  : 'Included'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            )}

            {/* Optional Special Instructions */}
            <div>
              <label
                htmlFor="dish-special-instructions"
                className="flex items-center justify-between text-xs font-bold text-[#172B4D] mb-1.5"
              >
                <span>Special Instructions</span>
                <span className="font-normal text-slate-500">Optional</span>
              </label>
              <textarea
                id="dish-special-instructions"
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Less oil, serve raita separately, no onions..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#087F5B]/25 focus:border-[#087F5B] resize-none"
              />
            </div>
          </div>

          {/* Fixed Bottom Action Bar (Quantity + Dynamic Total Add to Cart) */}
          <div className="px-4 sm:px-5 py-3 bg-white border-t border-slate-200 flex items-center gap-2.5 shrink-0">
            <div
              className="inline-flex items-center border border-slate-300 bg-slate-50 rounded-xl overflow-hidden shrink-0"
              role="group"
              aria-label="Item quantity"
            >
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="min-h-[44px] w-9 sm:w-10 flex items-center justify-center text-[#172B4D] hover:bg-slate-200/70 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span
                className="min-w-[26px] text-center font-mono text-sm font-bold text-[#172B4D] tabular-nums"
                aria-live="polite"
              >
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
                className="min-h-[44px] w-9 sm:w-10 flex items-center justify-center text-[#172B4D] hover:bg-slate-200/70 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              className={`flex-1 min-h-[46px] px-3.5 sm:px-4 text-xs sm:text-sm font-bold text-white rounded-xl transition-colors flex items-center justify-between gap-2 cursor-pointer whitespace-nowrap ${
                validation.valid
                  ? 'bg-[#087F5B] hover:bg-[#06674A] active:scale-[0.99]'
                  : 'bg-[#172B4D] hover:bg-[#10203A]'
              }`}
            >
              <span className="truncate">
                {initialCartItem ? 'Update Cart' : 'Add to Cart'}
              </span>
              <span className="font-mono tabular-nums shrink-0">
                {formatCurrency(totalPrice, currencySymbol)}
              </span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
