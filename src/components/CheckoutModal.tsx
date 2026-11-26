import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  MapPin,
  QrCode,
  ShieldCheck,
  Store,
  Truck,
  Wallet,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext.tsx';
import { apiRequest } from '../services/apiClient.ts';
import { calculateItemUnitPrice, calculateOrderTotals } from '../shared/pricing.ts';
import { formatBDT } from '../shared/timezone.ts';
import type { Coupon, OrderType, PaymentMethod } from '../shared/types.ts';

interface CheckoutModalProps {
  open: boolean;
  initialOrderType: OrderType;
  initialCoupon: Coupon | null;
  onClose: () => void;
  onOrderCreated: (orderId: string) => void;
}

const DHAKA_AREAS = [
  'Banani',
  'Gulshan 1 & 2',
  'Dhanmondi',
  'Uttara',
  'Mirpur',
  'Bashundhara R/A',
  'Mohammadpur',
  'Motijheel',
  'Outside Dhaka (Savar / Gazipur)',
];

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  open,
  initialOrderType,
  initialCoupon,
  onClose,
  onOrderCreated,
}) => {
  const {
    user,
    signInWithGoogle,
    placeCustomerOrder,
    loadProfileDetails,
    cart,
    clearCart,
    products,
    availability,
    settings,
    addresses,
    qrTable,
    verifyAndAttachQrToken,
    showToast,
    t,
  } = useApp();

  const [orderType, setOrderType] = useState<OrderType>(initialOrderType);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryArea, setDeliveryArea] = useState('Banani');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pickupTime, setPickupTime] = useState('In 30 minutes');
  const [instructions, setInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentTxRef, setPaymentTxRef] = useState('');
  const [manualQrInput, setManualQrInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setOrderType(qrTable ? 'dine_in' : initialOrderType);
  }, [initialOrderType, qrTable, open]);

  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.displayName || '');
      void loadProfileDetails().then((priv) => {
        if (priv) {
          setCustomerPhone((prev) => prev || priv.phone || '');
          setDeliveryAddress((prev) => prev || priv.defaultAddress || '');
        }
      });
    }
  }, [user]);

  const totals = useMemo(
    () =>
      calculateOrderTotals({
        lines: cart.map((c) => ({
          productId: c.productId,
          sizeName: c.sizeName,
          addons: c.addons,
          quantity: c.quantity,
        })),
        products,
        orderType,
        deliveryArea,
        coupon: initialCoupon,
        settings,
      }),
    [cart, products, orderType, deliveryArea, initialCoupon, settings],
  );

  if (!open) return null;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!user) {
      await signInWithGoogle();
      return;
    }

    if (cart.length === 0) {
      setErrorMsg('Your cart is empty.');
      return;
    }

    if (!customerName.trim() || customerPhone.trim().length < 6) {
      setErrorMsg('Please enter your name and valid Bangladesh phone number.');
      return;
    }

    if (orderType === 'delivery' && !deliveryAddress.trim()) {
      setErrorMsg('Please enter your delivery street address.');
      return;
    }

    if (orderType === 'dine_in' && (!qrTable || !qrTable.verified)) {
      setErrorMsg('Dine-in orders require a verified table QR code.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Server-side authoritative pricing & Asia/Dhaka availability revalidation
      const calcRes = await apiRequest<{
        subtotal: number;
        discountAmount: number;
        deliveryCharge: number;
        totalAmount: number;
        appliedCouponCode: string | null;
      }>('/orders/calculate', {
        method: 'POST',
        body: {
          orderType,
          deliveryArea,
          lines: cart.map((c) => ({
            productId: c.productId,
            sizeName: c.sizeName,
            addons: c.addons,
            quantity: c.quantity,
          })),
          products,
          availabilityList: availability,
          coupon: initialCoupon,
          settings: {
            deliveryChargeInsideDhaka: settings.deliveryChargeInsideDhaka,
            deliveryChargeOutsideDhaka: settings.deliveryChargeOutsideDhaka,
            freeDeliveryThreshold: settings.freeDeliveryThreshold,
          },
        },
      });

      // 2. Payment Verification (zero PIN/OTP/raw card storage)
      const payRes = await apiRequest<{
        verified: boolean;
        paymentStatus: 'pending' | 'paid';
        paymentRef: string;
      }>('/payments/verify', {
        method: 'POST',
        body: {
          method: paymentMethod,
          amount: calcRes.totalAmount,
          transactionRef: paymentTxRef.trim() || undefined,
        },
      });

      // 3. Build immutable order items with snapshot prices
      const orderItems = cart.map((c) => {
        const prod = products.find((p) => p.id === c.productId)!;
        const unitPrice = calculateItemUnitPrice(prod, c.sizeName, c.addons);
        return {
          productId: c.productId,
          productName: c.productName,
          imageUrl: c.imageUrl,
          sizeName: c.sizeName || '',
          addons: c.addons,
          quantity: c.quantity,
          unitPrice,
          lineTotal: Math.round(unitPrice * c.quantity),
          instructions: c.instructions || '',
        };
      });

      const orderNumber = `FV-${Date.now().toString().slice(-6)}`;
      const created = await placeCustomerOrder({
        orderNumber,
        userId: user.uid,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        orderType,
        tableId: orderType === 'dine_in' ? qrTable?.tableId || null : null,
        tableNumber: orderType === 'dine_in' ? qrTable?.tableNumber || null : null,
        qrVerified: orderType === 'dine_in' ? Boolean(qrTable?.verified) : false,
        deliveryAddress: orderType === 'delivery' ? deliveryAddress.trim() : null,
        deliveryArea: orderType === 'delivery' ? deliveryArea : null,
        pickupTime: orderType === 'pickup' ? pickupTime : null,
        instructions: instructions.trim(),
        items: orderItems,
        subtotal: calcRes.subtotal,
        discountAmount: calcRes.discountAmount,
        couponCode: calcRes.appliedCouponCode,
        deliveryCharge: calcRes.deliveryCharge,
        totalAmount: calcRes.totalAmount,
        paymentMethod,
        paymentStatus: 'pending',
        paymentRef: payRes.paymentRef,
        status: 'pending',
        kitchenStatus: 'queued',
        inventoryDeducted: false,
      });

      clearCart();
      showToast(`Order ${created.orderNumber} placed successfully!`, 'success');
      onOrderCreated(created.id);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to place order.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-[#171717]">{t.checkoutTitle}</h2>
            <p className="text-xs text-neutral-500">
              Live availability & pricing verified in Asia/Dhaka time
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!user && (
          <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-[#171717]">
                Sign in with Google to confirm your order
              </p>
              <p className="text-xs text-neutral-600">
                Enables real-time order tracking and saved Dhaka delivery addresses.
              </p>
            </div>
            <button
              type="button"
              onClick={signInWithGoogle}
              className="rounded-xl bg-[#171717] px-4 py-2 text-xs font-semibold text-white hover:bg-[#F97316] whitespace-nowrap shrink-0"
            >
              {t.signInGoogleCta}
            </button>
          </div>
        )}

        <form onSubmit={handlePlaceOrder} className="mt-5 space-y-5">
          {/* Order Type */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'delivery' as const, label: t.delivery, icon: Truck },
              { id: 'pickup' as const, label: t.pickup, icon: Store },
              { id: 'dine_in' as const, label: t.dineIn, icon: QrCode },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = orderType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOrderType(opt.id)}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-[#F97316] bg-orange-50 text-[#171717]'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-[#F97316]' : ''}`} />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Customer Contact */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-[#171717]">Full Name</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Tariqul Islam"
                className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#171717]">Phone Number</label>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+880 17XX-XXXXXX"
                className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
              />
            </div>
          </div>

          {/* Order Type Specific Fields */}
          {orderType === 'delivery' && (
            <div className="space-y-3 rounded-xl border border-neutral-200 bg-[#F8FAFC] p-4">
              {addresses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-600">Saved Addresses</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {addresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => {
                          setDeliveryArea(addr.area);
                          setDeliveryAddress(addr.streetAddress);
                          setCustomerName(addr.recipientName);
                          setCustomerPhone(addr.phone);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#171717] hover:border-[#F97316]"
                      >
                        <MapPin className="h-3 w-3 text-[#F97316]" />
                        {addr.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[#171717]">Delivery Area</label>
                  <select
                    value={deliveryArea}
                    onChange={(e) => setDeliveryArea(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
                  >
                    {DHAKA_AREAS.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#171717]">
                    Street / House / Flat
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="House 14, Road 6, Apt 4B"
                    className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {orderType === 'pickup' && (
            <div className="rounded-xl border border-neutral-200 bg-[#F8FAFC] p-4">
              <label className="text-xs font-semibold text-[#171717]">Preferred Pickup Time</label>
              <select
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
              >
                <option value="In 20 minutes">In 20 minutes</option>
                <option value="In 30 minutes">In 30 minutes</option>
                <option value="In 45 minutes">In 45 minutes</option>
                <option value="In 1 hour">In 1 hour</option>
              </select>
            </div>
          )}

          {orderType === 'dine_in' && (
            <div className="rounded-xl border border-neutral-200 bg-[#F8FAFC] p-4">
              {qrTable && qrTable.verified ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-[#16A34A]" />
                    <div>
                      <p className="text-sm font-bold text-[#171717]">
                        Table {qrTable.tableNumber} · {qrTable.zone}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Cryptographic QR token verified on server
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-[#171717]">
                    Scan or paste your Table QR Token to verify your table
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={manualQrInput}
                      onChange={(e) => setManualQrInput(e.target.value)}
                      placeholder="fvqr.table_01.1...."
                      className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => void verifyAndAttachQrToken(manualQrInput)}
                      className="rounded-xl bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#F97316]"
                    >
                      Verify QR
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-[#171717]">
              Delivery / Kitchen Instructions (Optional)
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={250}
              placeholder="Ring doorbell or call on arrival..."
              className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
            />
          </div>

          {/* Payment Method: Clear Split Between COD & Online Transaction */}
          <div className="space-y-3">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#171717]">
              <CreditCard className="h-3.5 w-3.5 text-[#F97316]" />
              {t.paymentChoiceLabel}
            </label>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  paymentMethod === 'cash'
                    ? 'border-[#F97316] bg-orange-50 text-[#171717]'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <Banknote
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    paymentMethod === 'cash' ? 'text-[#F97316]' : 'text-neutral-400'
                  }`}
                />
                <div>
                  <p className="text-xs font-bold">{t.payCashTitle}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">{t.payCashDesc}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (paymentMethod === 'cash') setPaymentMethod('bkash');
                }}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                  paymentMethod !== 'cash'
                    ? 'border-[#F97316] bg-orange-50 text-[#171717]'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <Wallet
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    paymentMethod !== 'cash' ? 'text-[#F97316]' : 'text-neutral-400'
                  }`}
                />
                <div>
                  <p className="text-xs font-bold">{t.payOnlineTitle}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">{t.payOnlineDesc}</p>
                </div>
              </button>
            </div>

            {paymentMethod !== 'cash' && (
              <div className="rounded-xl border border-orange-200 bg-[#F8FAFC] p-4 space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {(['bkash', 'nagad', 'rocket', 'card'] as PaymentMethod[]).map((method) => {
                    const active = paymentMethod === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`rounded-xl border py-2 text-xs font-bold uppercase transition-colors ${
                          active
                            ? 'border-[#F97316] bg-[#171717] text-white'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        {method}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-700">
                  <p className="font-semibold text-[#171717]">
                    FoodVista {paymentMethod.toUpperCase()} Merchant Payment
                  </p>
                  <p className="mt-1">
                    Merchant Wallet / Hotline:{' '}
                    <span className="font-mono font-bold text-[#F97316]">{settings.phone}</span> ·
                    Amount:{' '}
                    <span className="font-mono font-bold text-[#171717]">
                      {formatBDT(totals.totalAmount)}
                    </span>
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-[#16A34A]" />
                    Enter only your verified Transaction ID (TrxID). Never enter your PIN, OTP,
                    CVV, or card number.
                  </p>
                </div>

                <input
                  type="text"
                  required
                  value={paymentTxRef}
                  onChange={(e) => setPaymentTxRef(e.target.value)}
                  placeholder={`Enter ${paymentMethod.toUpperCase()} TrxID (e.g. TXN8K94LM21)`}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-mono uppercase focus:border-[#F97316] focus:outline-none"
                />
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-[#DC2626]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Summary & Confirm */}
          <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
            <div className="tabular-nums">
              <p className="text-xs text-neutral-500">{t.totalLabel}</p>
              <p className="font-display text-2xl font-bold text-[#171717]">
                {formatBDT(totals.totalAmount)}
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[46px] rounded-xl bg-[#F97316] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-60"
            >
              {submitting ? 'Confirming...' : t.placeOrder}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
