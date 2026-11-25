import React, { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext.tsx';
import { lookupCouponByCode } from '../services/firestoreService.ts';
import { checkProductAvailability } from '../shared/availability.ts';
import { calculateOrderTotals } from '../shared/pricing.ts';
import { formatBDT } from '../shared/timezone.ts';
import type { Coupon, OrderType } from '../shared/types.ts';
import { FoodImage } from './FoodImage.tsx';

interface CartDrawerProps {
  onProceedToCheckout: (params: {
    orderType: OrderType;
    coupon: Coupon | null;
  }) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onProceedToCheckout }) => {
  const {
    cart,
    cartDrawerOpen,
    setCartDrawerOpen,
    updateCartQty,
    removeFromCart,
    products,
    availability,
    settings,
    qrTable,
    user,
    showToast,
    t,
  } = useApp();

  const [orderType, setOrderType] = useState<OrderType>(qrTable ? 'dine_in' : 'delivery');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  React.useEffect(() => {
    if (qrTable) {
      setOrderType('dine_in');
    }
  }, [qrTable]);

  const availabilityChecks = useMemo(() => {
    return cart.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return { cartKey: item.cartKey, available: false, message: 'Item removed from catalog.' };
      }
      const res = checkProductAvailability(product, availability);
      return { cartKey: item.cartKey, available: res.available, message: res.message };
    });
  }, [cart, products, availability]);

  const hasUnavailableItem = availabilityChecks.some((c) => !c.available);

  const totals = useMemo(() => {
    return calculateOrderTotals({
      lines: cart.map((c) => ({
        productId: c.productId,
        sizeName: c.sizeName,
        addons: c.addons,
        quantity: c.quantity,
      })),
      products,
      orderType,
      coupon: appliedCoupon,
      settings,
    });
  }, [cart, products, orderType, appliedCoupon, settings]);

  if (!cartDrawerOpen) return null;

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    if (!user) {
      showToast('Please sign in first to apply promo coupons.', 'info');
      return;
    }
    setApplyingCoupon(true);
    try {
      const found = await lookupCouponByCode(couponInput);
      if (!found) {
        showToast('Coupon code not found or expired.', 'error');
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon(found);
        showToast(`Coupon ${found.code} applied!`, 'success');
      }
    } catch {
      showToast('Could not validate coupon right now.', 'error');
    } finally {
      setApplyingCoupon(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs"
      onClick={() => setCartDrawerOpen(false)}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-[#F97316]" />
            <h2 className="font-display text-lg font-bold text-[#171717]">
              {t.yourOrder} ({cart.reduce((s, i) => s + i.quantity, 0)})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setCartDrawerOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-[#F97316]">
                <ShoppingBag className="h-8 w-8" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-[#171717]">
                {t.emptyCartTitle}
              </h3>
              <p className="mt-1 max-w-xs text-sm text-neutral-500">{t.emptyCartDesc}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Order Type Selector */}
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1">
                {(['delivery', 'pickup', 'dine_in'] as OrderType[]).map((type) => {
                  const labels: Record<OrderType, string> = {
                    delivery: t.delivery,
                    pickup: t.pickup,
                    dine_in: t.dineIn,
                  };
                  const active = orderType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOrderType(type)}
                      className={`rounded-lg py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#171717] text-white shadow-xs'
                          : 'text-neutral-600 hover:text-[#171717]'
                      }`}
                    >
                      {labels[type]}
                    </button>
                  );
                })}
              </div>

              {hasUnavailableItem && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-[#DC2626]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    One or more items in your cart became unavailable today. Please remove them to
                    proceed.
                  </span>
                </div>
              )}

              {/* Cart Items */}
              <div className="divide-y divide-neutral-100">
                {cart.map((item) => {
                  const unit =
                    item.basePrice +
                    item.sizePriceDelta +
                    item.addons.reduce((s, a) => s + a.price, 0);
                  const check = availabilityChecks.find((c) => c.cartKey === item.cartKey);

                  return (
                    <div key={item.cartKey} className="py-3.5">
                      <div className="flex gap-3">
                        <FoodImage
                          src={item.imageUrl}
                          alt={item.productName}
                          className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="truncate font-display text-sm font-bold text-[#171717]">
                              {item.productName}
                            </h4>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.cartKey)}
                              className="text-neutral-400 hover:text-[#DC2626]"
                              aria-label={`Remove ${item.productName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {(item.sizeName || item.addons.length > 0) && (
                            <p className="mt-0.5 text-xs text-neutral-500">
                              {[item.sizeName, ...item.addons.map((a) => a.name)]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                          {item.instructions && (
                            <p className="mt-0.5 text-xs italic text-neutral-500">
                              “{item.instructions}”
                            </p>
                          )}
                          {check && !check.available && (
                            <p className="mt-1 text-xs font-semibold text-[#DC2626]">
                              {check.message}
                            </p>
                          )}

                          <div className="mt-2.5 flex items-center justify-between">
                            <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-50">
                              <button
                                type="button"
                                onClick={() => updateCartQty(item.cartKey, item.quantity - 1)}
                                className="flex h-7 w-7 items-center justify-center text-neutral-700 hover:bg-white"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-7 text-center text-xs font-bold tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateCartQty(item.cartKey, item.quantity + 1)}
                                className="flex h-7 w-7 items-center justify-center text-neutral-700 hover:bg-white"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <span className="font-display text-sm font-bold tabular-nums text-[#171717]">
                              {formatBDT(unit * item.quantity)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Coupon Box */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[#171717]">
                  <Tag className="h-3.5 w-3.5 text-[#F97316]" />
                  Promo Coupon (Try VISTA10)
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-mono uppercase text-[#171717] focus:border-[#F97316] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={applyingCoupon}
                    onClick={handleApplyCoupon}
                    className="rounded-lg bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {applyingCoupon ? '...' : 'Apply'}
                  </button>
                </div>
                {totals.couponError && (
                  <p className="mt-1.5 text-xs text-[#DC2626]">{totals.couponError}</p>
                )}
                {totals.appliedCouponCode && (
                  <p className="mt-1.5 text-xs font-medium text-[#16A34A]">
                    Applied {totals.appliedCouponCode}: −{formatBDT(totals.discountAmount)}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-neutral-200 bg-white p-5">
            <div className="space-y-1.5 text-sm tabular-nums">
              <div className="flex justify-between text-neutral-600">
                <span>{t.subtotal}</span>
                <span>{formatBDT(totals.subtotal)}</span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-[#16A34A]">
                  <span>{t.discount}</span>
                  <span>−{formatBDT(totals.discountAmount)}</span>
                </div>
              )}
              {orderType === 'delivery' && (
                <div className="flex justify-between text-neutral-600">
                  <span>{t.deliveryCharge}</span>
                  <span>
                    {totals.deliveryCharge === 0 ? t.freeLabel : formatBDT(totals.deliveryCharge)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-neutral-100 pt-2 font-display text-base font-bold text-[#171717]">
                <span>{t.totalLabel}</span>
                <span>{formatBDT(totals.totalAmount)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={hasUnavailableItem}
              onClick={() => {
                setCartDrawerOpen(false);
                onProceedToCheckout({ orderType, coupon: appliedCoupon });
              }}
              className="mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {t.proceedCheckout}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
