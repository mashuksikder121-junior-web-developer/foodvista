import { Coupon, OrderType, Product, ProductAddon, WebsiteSetting } from './types.ts';
import { getDhakaDateString } from './timezone.ts';

export interface PricedCartLineInput {
  productId: string;
  sizeName?: string;
  addons?: ProductAddon[];
  quantity: number;
}

export interface OrderCalculationResult {
  subtotal: number;
  discountAmount: number;
  deliveryCharge: number;
  totalAmount: number;
  appliedCouponCode: string | null;
  couponError?: string;
}

export function calculateItemUnitPrice(
  product: Product,
  sizeName?: string,
  addons: ProductAddon[] = [],
): number {
  const base =
    product.discountPrice != null && product.discountPrice >= 0 && product.discountPrice < product.price
      ? product.discountPrice
      : product.price;

  const sizeObj = sizeName
    ? (product.sizes || []).find((s) => s.name === sizeName)
    : undefined;
  const sizeDelta = sizeObj ? sizeObj.priceDelta : 0;

  const validAddons = addons.map((selected) => {
    const match = (product.addons || []).find((a) => a.name === selected.name);
    return match ? match.price : 0;
  });
  const addonsTotal = validAddons.reduce((sum, p) => sum + p, 0);

  return Math.max(0, Math.round((base + sizeDelta + addonsTotal) * 100) / 100);
}

export function calculateOrderTotals(params: {
  lines: PricedCartLineInput[];
  products: Product[];
  orderType: OrderType;
  deliveryArea?: string;
  coupon?: Coupon | null;
  settings: Pick<
    WebsiteSetting,
    'deliveryChargeInsideDhaka' | 'deliveryChargeOutsideDhaka' | 'freeDeliveryThreshold'
  >;
  todayDate?: string;
}): OrderCalculationResult {
  const productMap = new Map(params.products.map((p) => [p.id, p]));
  let subtotal = 0;

  for (const line of params.lines) {
    const prod = productMap.get(line.productId);
    if (!prod || line.quantity <= 0) continue;
    const unit = calculateItemUnitPrice(prod, line.sizeName, line.addons || []);
    subtotal += unit * Math.floor(line.quantity);
  }

  subtotal = Math.round(subtotal * 100) / 100;

  let discountAmount = 0;
  let appliedCouponCode: string | null = null;
  let couponError: string | undefined;

  if (params.coupon) {
    const c = params.coupon;
    const today = params.todayDate || getDhakaDateString();
    const expired = c.expiresAt && c.expiresAt.slice(0, 10) < today;
    if (!c.isActive) {
      couponError = 'This coupon is currently inactive.';
    } else if (expired) {
      couponError = 'This coupon has expired.';
    } else if (c.usedCount >= c.maxUses) {
      couponError = 'This coupon has reached its usage limit.';
    } else if (subtotal < c.minOrderValue) {
      couponError = `Minimum order of ৳${c.minOrderValue} required for ${c.code}.`;
    } else {
      appliedCouponCode = c.code;
      if (c.discountType === 'percentage') {
        discountAmount = Math.round((subtotal * c.discountValue) / 100);
      } else {
        discountAmount = Math.round(c.discountValue);
      }
      discountAmount = Math.min(subtotal, Math.max(0, discountAmount));
    }
  }

  let deliveryCharge = 0;
  if (params.orderType === 'delivery' && subtotal > 0) {
    const threshold = params.settings.freeDeliveryThreshold ?? 0;
    if (threshold > 0 && subtotal - discountAmount >= threshold) {
      deliveryCharge = 0;
    } else {
      const isOutside =
        (params.deliveryArea || '').toLowerCase().includes('outside') ||
        (params.deliveryArea || '').toLowerCase().includes('savar') ||
        (params.deliveryArea || '').toLowerCase().includes('gazipur');
      deliveryCharge = isOutside
        ? (params.settings.deliveryChargeOutsideDhaka ?? params.settings.deliveryChargeInsideDhaka)
        : params.settings.deliveryChargeInsideDhaka;
    }
  }

  const totalAmount = Math.max(0, Math.round(subtotal - discountAmount + deliveryCharge));

  return {
    subtotal,
    discountAmount,
    deliveryCharge,
    totalAmount,
    appliedCouponCode,
    couponError,
  };
}
