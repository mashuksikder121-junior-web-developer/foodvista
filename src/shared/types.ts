export type OrderType = 'delivery' | 'pickup' | 'dine_in';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type KitchenStatus = 'queued' | 'cooking' | 'ready' | 'served';

export type PaymentMethod = 'cash' | 'bkash' | 'nagad' | 'rocket' | 'card';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'inactive';

export type StaffRole = 'super_admin' | 'manager' | 'cashier' | 'chef' | 'delivery';

export type ReservationStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed';

export interface ProductSize {
  name: string;
  priceDelta: number;
}

export interface ProductAddon {
  name: string;
  price: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  discountPrice?: number | null;
  images: string[];
  videoUrl?: string;
  sizes?: ProductSize[];
  addons?: ProductAddon[];
  isPopular?: boolean;
  isBestSeller?: boolean;
  isFeatured?: boolean;
  isOffer?: boolean;
  offerLabel?: string;
  prepTimeMins?: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FoodAvailability {
  id: string;
  productId: string;
  date: string; // YYYY-MM-DD in Asia/Dhaka
  isAvailable: boolean;
  unavailableMessage: string;
  openTime?: string;
  closeTime?: string;
  updatedBy?: string;
  updatedAt?: unknown;
}

export interface RestaurantTable {
  id: string;
  tableNumber: string;
  name: string;
  capacity: number;
  zone?: string;
  status: TableStatus;
  isActive: boolean;
  qrTokenVersion: number;
  qrSignature: string;
  activeOrderId?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrderItem {
  productId: string;
  productName: string;
  imageUrl?: string;
  sizeName?: string;
  addons: ProductAddon[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  instructions?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  tableId?: string | null;
  tableNumber?: string | null;
  qrVerified?: boolean;
  deliveryAddress?: string | null;
  deliveryArea?: string | null;
  pickupTime?: string | null;
  instructions?: string;
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  couponCode?: string | null;
  deliveryCharge: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentRef?: string | null;
  status: OrderStatus;
  kitchenStatus: KitchenStatus;
  inventoryDeducted: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Reservation {
  id: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  date: string;
  timeSlot: string;
  guestCount: number;
  tableId: string;
  tableNumber: string;
  specialRequests?: string;
  status: ReservationStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: 'kg' | 'g' | 'L' | 'ml' | 'pcs';
  currentStock: number;
  minStockAlert: number;
  unitCost: number;
  supplier?: string;
  updatedAt?: unknown;
}

export interface RecipeIngredient {
  inventoryItemId: string;
  ingredientName: string;
  quantityRequired: number;
  unit: string;
}

export interface Recipe {
  id: string;
  productId: string;
  productName: string;
  ingredients: RecipeIngredient[];
  updatedAt?: unknown;
}

export interface StockMovement {
  id: string;
  inventoryItemId: string;
  ingredientName: string;
  type: 'purchase' | 'order_deduction' | 'adjustment' | 'waste';
  quantityDelta: number;
  orderId?: string;
  note?: string;
  performedBy: string;
  createdAt?: unknown;
}

export interface Expense {
  id: string;
  title: string;
  category: 'ingredients' | 'utilities' | 'staff' | 'marketing' | 'maintenance' | 'other';
  amount: number;
  date: string;
  note?: string;
  recordedBy: string;
  createdAt?: unknown;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderValue: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Review {
  id: string;
  userId: string;
  authorName: string;
  productId?: string;
  productName?: string;
  rating: number;
  comment: string;
  status: 'pending' | 'approved' | 'hidden';
  adminReply?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'order' | 'reservation' | 'stock' | 'system';
  orderId?: string;
  isRead: boolean;
  createdAt?: unknown;
}

export interface WebsiteSetting {
  restaurantName: string;
  tagline: string;
  logoUrl?: string;
  heroBannerUrl?: string;
  heroTitle: string;
  heroSubtitle?: string;
  phone: string;
  email?: string;
  address: string;
  openingHours: string;
  deliveryChargeInsideDhaka: number;
  deliveryChargeOutsideDhaka?: number;
  freeDeliveryThreshold?: number;
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
  dineInEnabled?: boolean;
  aboutText?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  footerText?: string;
  termsText?: string;
  privacyText?: string;
  specialOfferBanner?: string;
  updatedAt?: unknown;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  createdAt?: unknown;
}

export type AdminTabId =
  | 'overview'
  | 'availability'
  | 'orders'
  | 'kds'
  | 'tables'
  | 'catalog'
  | 'reservations'
  | 'inventory'
  | 'coupons'
  | 'customers'
  | 'reports'
  | 'settings';

export type StaffAccountStatus = 'active' | 'suspended' | 'terminated';

export interface StaffMember {
  id?: string;
  uid: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  photoUrl?: string;
  role: StaffRole;
  status?: StaffAccountStatus;
  permissions?: AdminTabId[];
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CustomerAddress {
  id: string;
  userId: string;
  label: string;
  recipientName: string;
  phone: string;
  area: string;
  streetAddress: string;
  instructions?: string;
  isDefault: boolean;
  createdAt?: unknown;
}

export interface CartItem {
  cartKey: string;
  productId: string;
  productName: string;
  imageUrl: string;
  basePrice: number;
  sizeName?: string;
  sizePriceDelta: number;
  addons: ProductAddon[];
  quantity: number;
  instructions?: string;
}
