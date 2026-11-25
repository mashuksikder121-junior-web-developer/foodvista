import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_COUPONS,
  DEFAULT_INVENTORY,
  DEFAULT_PRODUCTS,
  DEFAULT_RECIPES,
  DEFAULT_REVIEWS,
  DEFAULT_TABLES,
  DEFAULT_WEBSITE_SETTINGS,
  getDefaultAvailability,
} from '../data/seedDefaults.ts';
import { auth, db } from '../lib/firebase.ts';
import { handleFirestoreError, OperationType } from '../lib/firestoreError.ts';
import { computeRecipeDeductions } from '../shared/inventory.ts';
import { getDhakaDateString } from '../shared/timezone.ts';
import type {
  AppNotification,
  AuditLog,
  Category,
  Coupon,
  CustomerAddress,
  Expense,
  FoodAvailability,
  InventoryItem,
  KitchenStatus,
  Order,
  OrderStatus,
  PaymentStatus,
  Product,
  Recipe,
  Reservation,
  ReservationStatus,
  RestaurantTable,
  Review,
  StaffMember,
  StaffRole,
  StockMovement,
  TableStatus,
  WebsiteSetting,
} from '../shared/types.ts';
import { apiRequest, broadcastRealtimeEvent } from './apiClient.ts';

export const BOOTSTRAP_ADMIN_EMAIL = 'mashuksikder121@gmail.com';

export function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export async function resolveUserRole(user: User): Promise<{
  isAdmin: boolean;
  staffRole: StaffRole | null;
}> {
  if (user.email === BOOTSTRAP_ADMIN_EMAIL && user.emailVerified) {
    return { isAdmin: true, staffRole: 'super_admin' };
  }
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    if (adminSnap.exists()) {
      return { isAdmin: true, staffRole: 'super_admin' };
    }
    const staffSnap = await getDoc(doc(db, 'staff', user.uid));
    if (staffSnap.exists()) {
      const data = staffSnap.data() as StaffMember;
      if (data.isActive) {
        return {
          isAdmin: data.role === 'super_admin' || data.role === 'manager',
          staffRole: data.role,
        };
      }
    }
  } catch {
    // Non-staff user
  }
  return { isAdmin: false, staffRole: null };
}

export async function syncUserProfileOnSignIn(user: User): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: (user.displayName || user.email?.split('@')[0] || 'Guest').slice(0, 100),
        photoURL: (user.photoURL || '').slice(0, 500),
        role: 'customer',
        loyaltyPoints: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName: (user.displayName || snap.data().displayName || 'Guest').slice(0, 100),
        photoURL: (user.photoURL || snap.data().photoURL || '').slice(0, 500),
        updatedAt: serverTimestamp(),
      });
    }

    const privSnap = await getDoc(privateRef);
    await setDoc(
      privateRef,
      {
        uid: user.uid,
        email: user.email || '',
        phone: privSnap.exists() ? privSnap.data().phone || '' : '',
        defaultAddress: privSnap.exists() ? privSnap.data().defaultAddress || '' : '',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function getUserPrivateProfile(uid: string): Promise<{
  email: string;
  phone: string;
  defaultAddress: string;
} | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      email: d.email || '',
      phone: d.phone || '',
      defaultAddress: d.defaultAddress || '',
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}/private/info`);
  }
}

export async function updateUserProfileInfo(
  uid: string,
  payload: { displayName: string; phone: string; defaultAddress: string },
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: payload.displayName.slice(0, 100),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
      phone: payload.phone.slice(0, 30),
      defaultAddress: payload.defaultAddress.slice(0, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function seedInitialDatabaseIfEmpty(adminUser: User): Promise<boolean> {
  try {
    const settingsSnap = await getDoc(doc(db, 'settings', 'website'));
    if (settingsSnap.exists()) return false;

    const batch = writeBatch(db);
    const today = getDhakaDateString();

    batch.set(doc(db, 'settings', 'website'), {
      ...DEFAULT_WEBSITE_SETTINGS,
      updatedAt: serverTimestamp(),
    });

    for (const cat of DEFAULT_CATEGORIES) {
      batch.set(doc(db, 'categories', cat.id), {
        name: cat.name,
        slug: cat.slug,
        description: cat.description || '',
        imageUrl: cat.imageUrl || '',
        displayOrder: cat.displayOrder,
        isActive: cat.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const prod of DEFAULT_PRODUCTS) {
      batch.set(doc(db, 'products', prod.id), {
        categoryId: prod.categoryId,
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        price: prod.price,
        discountPrice: prod.discountPrice ?? null,
        images: prod.images,
        sizes: prod.sizes || [],
        addons: prod.addons || [],
        isPopular: Boolean(prod.isPopular),
        isBestSeller: Boolean(prod.isBestSeller),
        isFeatured: Boolean(prod.isFeatured),
        isOffer: Boolean(prod.isOffer),
        offerLabel: prod.offerLabel || '',
        prepTimeMins: prod.prepTimeMins || 15,
        isActive: prod.isActive,
        isDeleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const avail of getDefaultAvailability(today)) {
      batch.set(doc(db, 'availability', avail.id), {
        productId: avail.productId,
        date: avail.date,
        isAvailable: avail.isAvailable,
        unavailableMessage: avail.unavailableMessage,
        openTime: avail.openTime || '11:00',
        closeTime: avail.closeTime || '23:30',
        updatedBy: adminUser.uid,
        updatedAt: serverTimestamp(),
      });
    }

    for (const table of DEFAULT_TABLES) {
      let sig = table.qrSignature;
      try {
        const signed = await apiRequest<{ signature: string }>('/table-qr/sign', {
          method: 'POST',
          body: {
            tableId: table.id,
            tableNumber: table.tableNumber,
            version: table.qrTokenVersion,
            originUrl: window.location.origin,
          },
        });
        sig = signed.signature;
      } catch {
        // fallback seed sig
      }
      batch.set(doc(db, 'tables', table.id), {
        tableNumber: table.tableNumber,
        name: table.name,
        capacity: table.capacity,
        zone: table.zone || 'Main Hall',
        status: table.status,
        isActive: table.isActive,
        qrTokenVersion: table.qrTokenVersion,
        qrSignature: sig,
        activeOrderId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const inv of DEFAULT_INVENTORY) {
      batch.set(doc(db, 'inventory', inv.id), {
        name: inv.name,
        unit: inv.unit,
        currentStock: inv.currentStock,
        minStockAlert: inv.minStockAlert,
        unitCost: inv.unitCost,
        supplier: inv.supplier || '',
        updatedAt: serverTimestamp(),
      });
    }

    for (const rec of DEFAULT_RECIPES) {
      batch.set(doc(db, 'recipes', rec.id), {
        productId: rec.productId,
        productName: rec.productName,
        ingredients: rec.ingredients,
        updatedAt: serverTimestamp(),
      });
    }

    for (const coup of DEFAULT_COUPONS) {
      batch.set(doc(db, 'coupons', coup.id), {
        code: coup.code,
        discountType: coup.discountType,
        discountValue: coup.discountValue,
        minOrderValue: coup.minOrderValue,
        maxUses: coup.maxUses,
        usedCount: coup.usedCount,
        expiresAt: coup.expiresAt,
        isActive: coup.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const rev of DEFAULT_REVIEWS) {
      batch.set(doc(db, 'reviews', rev.id), {
        userId: rev.userId,
        authorName: rev.authorName,
        productId: rev.productId || '',
        productName: rev.productName || '',
        rating: rev.rating,
        comment: rev.comment,
        status: rev.status,
        adminReply: rev.adminReply || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return true;
  } catch (err) {
    console.warn('Seed skipped or failed:', err);
    return false;
  }
}

export async function recordAuditLog(
  action: string,
  targetCollection: string,
  targetId: string,
  summary: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const id = makeDocId('aud');
    await setDoc(doc(db, 'auditLogs', id), {
      actorUid: user.uid,
      actorEmail: user.email || 'unknown',
      action: action.slice(0, 100),
      targetCollection: targetCollection.slice(0, 60),
      targetId: targetId.slice(0, 128),
      summary: summary.slice(0, 400),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Audit failure should not block primary action
  }
}

// ---------------------------------------------------------------------------
// Public & Real-time Subscriptions
// ---------------------------------------------------------------------------

export function subscribeSettings(onData: (settings: WebsiteSetting | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'settings', 'website'),
    (snap) => {
      onData(snap.exists() ? (snap.data() as WebsiteSetting) : null);
    },
    (err) => handleFirestoreError(err, OperationType.GET, 'settings/website'),
  );
}

export function subscribeCategories(onData: (categories: Category[]) => void): Unsubscribe {
  const q = query(collection(db, 'categories'), orderBy('displayOrder', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Category, 'id'>) })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'categories'),
  );
}

export function subscribeProducts(onData: (products: Product[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'products'),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }))
        .filter((p) => !p.isDeleted);
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'products'),
  );
}

export function subscribeAvailability(onData: (list: FoodAvailability[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'availability'),
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FoodAvailability, 'id'>) })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'availability'),
  );
}

export function subscribeTables(onData: (tables: RestaurantTable[]) => void): Unsubscribe {
  const q = query(collection(db, 'tables'), orderBy('tableNumber', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RestaurantTable, 'id'>) })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'tables'),
  );
}

export function subscribeApprovedReviews(onData: (reviews: Review[]) => void): Unsubscribe {
  const q = query(collection(db, 'reviews'), where('status', '==', 'approved'));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Review, 'id'>) })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'reviews'),
  );
}

export function subscribeUserOrders(uid: string, onData: (orders: Order[]) => void): Unsubscribe {
  const q = query(collection(db, 'orders'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }));
      list.sort((a, b) => (b.orderNumber > a.orderNumber ? 1 : -1));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'orders'),
  );
}

export function subscribeAllOrders(onData: (orders: Order[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'orders'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }));
      list.sort((a, b) => (b.orderNumber > a.orderNumber ? 1 : -1));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'orders'),
  );
}

export function subscribeUserReservations(
  uid: string,
  onData: (reservations: Reservation[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'reservations'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Reservation, 'id'>),
      }));
      list.sort((a, b) => (b.date > a.date ? 1 : -1));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'reservations'),
  );
}

export function subscribeAllReservations(onData: (reservations: Reservation[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'reservations'),
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Reservation, 'id'>),
      }));
      list.sort((a, b) => (b.date > a.date ? 1 : -1));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'reservations'),
  );
}

export function subscribeUserAddresses(
  uid: string,
  onData: (addresses: CustomerAddress[]) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'users', uid, 'addresses'),
    (snap) => {
      onData(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomerAddress, 'id'>) })),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/addresses`),
  );
}

export function subscribeNotifications(
  uid: string,
  onData: (notifications: AppNotification[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'notifications'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) })),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'),
  );
}

export function subscribeAdminCollections(callbacks: {
  onInventory: (items: InventoryItem[]) => void;
  onRecipes: (recipes: Recipe[]) => void;
  onMovements: (movements: StockMovement[]) => void;
  onExpenses: (expenses: Expense[]) => void;
  onCoupons: (coupons: Coupon[]) => void;
  onAllReviews: (reviews: Review[]) => void;
  onStaff: (staff: StaffMember[]) => void;
  onAuditLogs: (logs: AuditLog[]) => void;
}): Unsubscribe[] {
  const unsubs: Unsubscribe[] = [];
  unsubs.push(
    onSnapshot(
      collection(db, 'inventory'),
      (s) => callbacks.onInventory(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InventoryItem, 'id'>) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'inventory'),
    ),
  );
  unsubs.push(
    onSnapshot(
      collection(db, 'recipes'),
      (s) => callbacks.onRecipes(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Recipe, 'id'>) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'recipes'),
    ),
  );
  unsubs.push(
    onSnapshot(
      collection(db, 'stockMovements'),
      (s) => callbacks.onMovements(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StockMovement, 'id'>) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'stockMovements'),
    ),
  );
  unsubs.push(
    onSnapshot(
      collection(db, 'expenses'),
      (s) => callbacks.onExpenses(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Expense, 'id'>) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'expenses'),
    ),
  );
  unsubs.push(
    onSnapshot(
      collection(db, 'coupons'),
      (s) => callbacks.onCoupons(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Coupon, 'id'>) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'coupons'),
    ),
  );
  unsubs.push(
    onSnapshot(
      collection(db, 'reviews'),
      (s) => callbacks.onAllReviews(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Review, 'id'>) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'reviews'),
    ),
  );
  unsubs.push(
    onSnapshot(
      collection(db, 'staff'),
      (s) => callbacks.onStaff(s.docs.map((d) => d.data() as StaffMember)),
      (e) => handleFirestoreError(e, OperationType.LIST, 'staff'),
    ),
  );
  unsubs.push(
    onSnapshot(
      collection(db, 'auditLogs'),
      (s) => callbacks.onAuditLogs(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }))),
      (e) => handleFirestoreError(e, OperationType.LIST, 'auditLogs'),
    ),
  );
  return unsubs;
}

// ---------------------------------------------------------------------------
// Customer Mutations
// ---------------------------------------------------------------------------

export async function lookupCouponByCode(code: string): Promise<Coupon | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  try {
    const q = query(
      collection(db, 'coupons'),
      where('code', '==', clean),
      where('isActive', '==', true),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() as Omit<Coupon, 'id'>) };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'coupons');
  }
}

export async function createOrder(
  orderPayload: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Order> {
  const id = makeDocId('ord');
  try {
    await setDoc(doc(db, 'orders', id), {
      ...orderPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await broadcastRealtimeEvent('order:created', {
      orderId: id,
      orderNumber: orderPayload.orderNumber,
      orderType: orderPayload.orderType,
      tableNumber: orderPayload.tableNumber || null,
    });
    return { id, ...orderPayload };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `orders/${id}`);
  }
}

export async function cancelPendingOrder(orderId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
    await broadcastRealtimeEvent('order:updated', { orderId, status: 'cancelled' });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function saveCustomerAddress(
  uid: string,
  address: Omit<CustomerAddress, 'id' | 'userId' | 'createdAt'>,
): Promise<void> {
  const id = makeDocId('addr');
  try {
    await setDoc(doc(db, 'users', uid, 'addresses', id), {
      ...address,
      userId: uid,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}/addresses/${id}`);
  }
}

export async function deleteCustomerAddress(uid: string, addressId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'addresses', addressId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/addresses/${addressId}`);
  }
}

export async function createReservation(
  payload: Omit<Reservation, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const id = makeDocId('res');
  try {
    await setDoc(doc(db, 'reservations', id), {
      ...payload,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await broadcastRealtimeEvent('reservation:updated', { reservationId: id });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `reservations/${id}`);
  }
}

export async function cancelReservation(reservationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'reservations', reservationId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
    await broadcastRealtimeEvent('reservation:updated', { reservationId, status: 'cancelled' });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `reservations/${reservationId}`);
  }
}

export async function submitCustomerReview(payload: {
  userId: string;
  authorName: string;
  productId?: string;
  productName?: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const id = makeDocId('rev');
  try {
    await setDoc(doc(db, 'reviews', id), {
      userId: payload.userId,
      authorName: payload.authorName.slice(0, 100),
      productId: payload.productId || '',
      productName: payload.productName || '',
      rating: Math.min(5, Math.max(1, Math.round(payload.rating))),
      comment: payload.comment.slice(0, 600),
      status: 'pending',
      adminReply: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `reviews/${id}`);
  }
}

// ---------------------------------------------------------------------------
// Admin & Operational Mutations (Dynamic CMS, Availability, Orders, KDS, Inventory)
// ---------------------------------------------------------------------------

export async function saveWebsiteSettings(settings: WebsiteSetting): Promise<void> {
  try {
    await setDoc(doc(db, 'settings', 'website'), {
      restaurantName: settings.restaurantName,
      tagline: settings.tagline,
      logoUrl: settings.logoUrl || '',
      heroBannerUrl: settings.heroBannerUrl || '',
      heroTitle: settings.heroTitle,
      heroSubtitle: settings.heroSubtitle || '',
      phone: settings.phone,
      email: settings.email || '',
      address: settings.address,
      openingHours: settings.openingHours,
      deliveryChargeInsideDhaka: Number(settings.deliveryChargeInsideDhaka) || 0,
      deliveryChargeOutsideDhaka: Number(settings.deliveryChargeOutsideDhaka) || 0,
      freeDeliveryThreshold: Number(settings.freeDeliveryThreshold) || 0,
      pickupEnabled: settings.pickupEnabled ?? true,
      deliveryEnabled: settings.deliveryEnabled ?? true,
      dineInEnabled: settings.dineInEnabled ?? true,
      aboutText: settings.aboutText || '',
      facebookUrl: settings.facebookUrl || '',
      instagramUrl: settings.instagramUrl || '',
      footerText: settings.footerText || '',
      termsText: settings.termsText || '',
      privacyText: settings.privacyText || '',
      specialOfferBanner: settings.specialOfferBanner || '',
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog('UPDATE_SETTINGS', 'settings', 'website', 'Updated website settings');
    await broadcastRealtimeEvent('settings:updated', { updated: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/website');
  }
}

export async function saveCategory(
  category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>,
  existingId?: string,
): Promise<string> {
  const id = existingId || makeDocId('cat');
  const payload = {
    name: category.name,
    slug: category.slug,
    description: category.description || '',
    imageUrl: category.imageUrl || '',
    displayOrder: Number(category.displayOrder) || 0,
    isActive: Boolean(category.isActive),
  };
  try {
    if (existingId) {
      await updateDoc(doc(db, 'categories', id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'categories', id), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await recordAuditLog(existingId ? 'UPDATE_CATEGORY' : 'CREATE_CATEGORY', 'categories', id, category.name);
    await broadcastRealtimeEvent('catalog:updated', { categoryId: id });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `categories/${id}`);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'categories', id));
    await recordAuditLog('DELETE_CATEGORY', 'categories', id, `Deleted category ${id}`);
    await broadcastRealtimeEvent('catalog:updated', { categoryId: id });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `categories/${id}`);
  }
}

export async function saveProduct(
  product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
  existingId?: string,
): Promise<string> {
  const id = existingId || makeDocId('prod');
  const payload = {
    categoryId: product.categoryId,
    name: product.name,
    slug: product.slug,
    description: product.description || '',
    price: Number(product.price) || 0,
    discountPrice: product.discountPrice ?? null,
    images: product.images || [],
    sizes: product.sizes || [],
    addons: product.addons || [],
    isPopular: Boolean(product.isPopular),
    isBestSeller: Boolean(product.isBestSeller),
    isFeatured: Boolean(product.isFeatured),
    isOffer: Boolean(product.isOffer),
    offerLabel: product.offerLabel || '',
    prepTimeMins: Number(product.prepTimeMins) || 15,
    isActive: Boolean(product.isActive),
    isDeleted: Boolean(product.isDeleted),
  };
  try {
    if (existingId) {
      await updateDoc(doc(db, 'products', id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'products', id), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await recordAuditLog(existingId ? 'UPDATE_PRODUCT' : 'CREATE_PRODUCT', 'products', id, product.name);
    await broadcastRealtimeEvent('catalog:updated', { productId: id });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `products/${id}`);
  }
}

export async function softDeleteProduct(id: string, name: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'products', id), {
      isDeleted: true,
      isActive: false,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog('SOFT_DELETE_PRODUCT', 'products', id, `Soft deleted ${name}`);
    await broadcastRealtimeEvent('catalog:updated', { productId: id });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `products/${id}`);
  }
}

export async function upsertBulkAvailability(params: {
  productIds: string[];
  date: string;
  isAvailable: boolean;
  unavailableMessage: string;
  openTime?: string;
  closeTime?: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid || 'admin';
  try {
    const batch = writeBatch(db);
    for (const productId of params.productIds) {
      const availId = `${productId}_${params.date}`;
      batch.set(doc(db, 'availability', availId), {
        productId,
        date: params.date,
        isAvailable: params.isAvailable,
        unavailableMessage: params.isAvailable ? '' : params.unavailableMessage.slice(0, 300),
        openTime: params.openTime || '11:00',
        closeTime: params.closeTime || '23:30',
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    await recordAuditLog(
      'BULK_AVAILABILITY',
      'availability',
      params.date,
      `Set ${params.productIds.length} items to ${params.isAvailable ? 'Available' : 'Unavailable'} on ${params.date}`,
    );
    await broadcastRealtimeEvent('availability:updated', {
      date: params.date,
      count: params.productIds.length,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'availability');
  }
}

export async function saveTable(
  table: Omit<RestaurantTable, 'id' | 'createdAt' | 'updatedAt'>,
  existingId?: string,
): Promise<string> {
  const id = existingId || makeDocId('table');
  const payload = {
    tableNumber: table.tableNumber,
    name: table.name,
    capacity: Number(table.capacity) || 4,
    zone: table.zone || 'Main Hall',
    status: table.status,
    isActive: Boolean(table.isActive),
    qrTokenVersion: Number(table.qrTokenVersion) || 1,
    qrSignature: table.qrSignature,
    activeOrderId: table.activeOrderId ?? null,
  };
  try {
    const ref = doc(db, 'tables', id);
    const snap = existingId ? await getDoc(ref) : null;
    if (snap && snap.exists()) {
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await recordAuditLog(existingId ? 'UPDATE_TABLE' : 'CREATE_TABLE', 'tables', id, table.name);
    await broadcastRealtimeEvent('table:updated', { tableId: id });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `tables/${id}`);
  }
}

export async function updateTableStatus(
  tableId: string,
  status: TableStatus,
  activeOrderId: string | null = null,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'tables', tableId), {
      status,
      activeOrderId,
      updatedAt: serverTimestamp(),
    });
    await broadcastRealtimeEvent('table:updated', { tableId, status });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `tables/${tableId}`);
  }
}

// Confirms order + atomically deducts recipe ingredients once (prevents duplicate stock deduction)
export async function updateOrderWorkflow(params: {
  orderId: string;
  status?: OrderStatus;
  kitchenStatus?: KitchenStatus;
  paymentStatus?: PaymentStatus;
  recipes?: Recipe[];
}): Promise<void> {
  const uid = auth.currentUser?.uid || 'staff';
  const orderRef = doc(db, 'orders', params.orderId);

  try {
    await runTransaction(db, async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) throw new Error('Order not found');
      const order = { id: orderSnap.id, ...(orderSnap.data() as Omit<Order, 'id'>) };

      const nextStatus = params.status || order.status;
      const nextKitchen = params.kitchenStatus || order.kitchenStatus;
      const nextPayment = params.paymentStatus || order.paymentStatus;
      let inventoryDeducted = order.inventoryDeducted;

      const shouldDeduct =
        !order.inventoryDeducted &&
        (nextStatus === 'confirmed' || nextStatus === 'preparing') &&
        params.recipes &&
        params.recipes.length > 0;

      if (shouldDeduct && params.recipes) {
        const deductions = computeRecipeDeductions(order, params.recipes);
        for (const ded of deductions) {
          const invRef = doc(db, 'inventory', ded.inventoryItemId);
          const invSnap = await tx.get(invRef);
          if (invSnap.exists()) {
            const currentStock = Number(invSnap.data().currentStock || 0);
            const nextStock = Math.max(0, Math.round((currentStock - ded.quantityToDeduct) * 1000) / 1000);
            tx.update(invRef, {
              currentStock: nextStock,
              updatedAt: serverTimestamp(),
            });
            const movRef = doc(db, 'stockMovements', makeDocId('mov'));
            tx.set(movRef, {
              inventoryItemId: ded.inventoryItemId,
              ingredientName: ded.ingredientName,
              type: 'order_deduction',
              quantityDelta: -ded.quantityToDeduct,
              orderId: order.id,
              note: `Auto deduction for Order ${order.orderNumber}`,
              performedBy: uid,
              createdAt: serverTimestamp(),
            });
          }
        }
        inventoryDeducted = true;
      }

      tx.update(orderRef, {
        status: nextStatus,
        kitchenStatus: nextKitchen,
        paymentStatus: nextPayment,
        inventoryDeducted,
        updatedAt: serverTimestamp(),
      });

      if (order.orderType === 'dine_in' && order.tableId) {
        const tableRef = doc(db, 'tables', order.tableId);
        const tableSnap = await tx.get(tableRef);
        if (tableSnap.exists()) {
          if (nextStatus === 'completed' || nextStatus === 'cancelled') {
            tx.update(tableRef, {
              status: 'available',
              activeOrderId: null,
              updatedAt: serverTimestamp(),
            });
          } else if (nextStatus === 'confirmed' || nextStatus === 'preparing') {
            tx.update(tableRef, {
              status: 'occupied',
              activeOrderId: order.id,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    });

    await recordAuditLog(
      'UPDATE_ORDER',
      'orders',
      params.orderId,
      `Updated order (${params.status || ''} ${params.kitchenStatus || ''} ${params.paymentStatus || ''})`,
    );
    await broadcastRealtimeEvent('order:updated', {
      orderId: params.orderId,
      status: params.status,
      kitchenStatus: params.kitchenStatus,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${params.orderId}`);
  }
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reservations', reservationId), {
      status,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog('UPDATE_RESERVATION', 'reservations', reservationId, `Set reservation to ${status}`);
    await broadcastRealtimeEvent('reservation:updated', { reservationId, status });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `reservations/${reservationId}`);
  }
}

export async function saveInventoryItem(
  item: Omit<InventoryItem, 'id' | 'updatedAt'>,
  existingId?: string,
): Promise<string> {
  const id = existingId || makeDocId('inv');
  try {
    await setDoc(doc(db, 'inventory', id), {
      name: item.name,
      unit: item.unit,
      currentStock: Number(item.currentStock) || 0,
      minStockAlert: Number(item.minStockAlert) || 0,
      unitCost: Number(item.unitCost) || 0,
      supplier: item.supplier || '',
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog(existingId ? 'UPDATE_INVENTORY' : 'CREATE_INVENTORY', 'inventory', id, item.name);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `inventory/${id}`);
  }
}

export async function recordStockAdjustment(params: {
  inventoryItemId: string;
  ingredientName: string;
  type: 'purchase' | 'adjustment' | 'waste';
  quantityDelta: number;
  note: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid || 'admin';
  const invRef = doc(db, 'inventory', params.inventoryItemId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(invRef);
      if (!snap.exists()) throw new Error('Inventory item not found');
      const current = Number(snap.data().currentStock || 0);
      const next = Math.max(0, Math.round((current + params.quantityDelta) * 1000) / 1000);
      tx.update(invRef, { currentStock: next, updatedAt: serverTimestamp() });
      tx.set(doc(db, 'stockMovements', makeDocId('mov')), {
        inventoryItemId: params.inventoryItemId,
        ingredientName: params.ingredientName,
        type: params.type,
        quantityDelta: params.quantityDelta,
        note: params.note.slice(0, 300),
        performedBy: uid,
        createdAt: serverTimestamp(),
      });
    });
    await recordAuditLog('STOCK_ADJUSTMENT', 'inventory', params.inventoryItemId, `${params.type} ${params.quantityDelta} ${params.ingredientName}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `inventory/${params.inventoryItemId}`);
  }
}

export async function saveRecipe(recipe: Omit<Recipe, 'id' | 'updatedAt'>): Promise<void> {
  try {
    await setDoc(doc(db, 'recipes', recipe.productId), {
      productId: recipe.productId,
      productName: recipe.productName,
      ingredients: recipe.ingredients,
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog('SAVE_RECIPE', 'recipes', recipe.productId, `Saved recipe for ${recipe.productName}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `recipes/${recipe.productId}`);
  }
}

export async function createExpense(
  expense: Omit<Expense, 'id' | 'recordedBy' | 'createdAt'>,
): Promise<void> {
  const uid = auth.currentUser?.uid || 'admin';
  const id = makeDocId('exp');
  try {
    await setDoc(doc(db, 'expenses', id), {
      title: expense.title,
      category: expense.category,
      amount: Number(expense.amount) || 0,
      date: expense.date,
      note: expense.note || '',
      recordedBy: uid,
      createdAt: serverTimestamp(),
    });
    await recordAuditLog('CREATE_EXPENSE', 'expenses', id, `${expense.title} (৳${expense.amount})`);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `expenses/${id}`);
  }
}

export async function saveCoupon(
  coupon: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt'>,
  existingId?: string,
): Promise<void> {
  const id = existingId || makeDocId('coup');
  const payload = {
    code: coupon.code.toUpperCase(),
    discountType: coupon.discountType,
    discountValue: Number(coupon.discountValue) || 1,
    minOrderValue: Number(coupon.minOrderValue) || 0,
    maxUses: Number(coupon.maxUses) || 1,
    usedCount: Number(coupon.usedCount) || 0,
    expiresAt: coupon.expiresAt,
    isActive: Boolean(coupon.isActive),
  };
  try {
    if (existingId) {
      await updateDoc(doc(db, 'coupons', id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'coupons', id), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await recordAuditLog(existingId ? 'UPDATE_COUPON' : 'CREATE_COUPON', 'coupons', id, coupon.code);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `coupons/${id}`);
  }
}

export async function deleteCoupon(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'coupons', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `coupons/${id}`);
  }
}

export async function moderateReview(
  reviewId: string,
  status: 'approved' | 'hidden',
  adminReply: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reviews', reviewId), {
      status,
      adminReply: adminReply.slice(0, 400),
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog('MODERATE_REVIEW', 'reviews', reviewId, `Set review ${status}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `reviews/${reviewId}`);
  }
}

export async function saveStaffMember(member: Omit<StaffMember, 'createdAt' | 'updatedAt'>): Promise<void> {
  const payload = {
    uid: member.uid,
    email: member.email,
    name: member.name,
    role: member.role,
    isActive: Boolean(member.isActive),
  };
  try {
    const ref = doc(db, 'staff', member.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await recordAuditLog('SAVE_STAFF', 'staff', member.uid, `${member.name} (${member.role})`);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `staff/${member.uid}`);
  }
}
