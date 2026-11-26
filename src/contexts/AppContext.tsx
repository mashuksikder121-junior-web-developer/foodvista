import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { io, type Socket } from 'socket.io-client';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_PRODUCTS,
  DEFAULT_REVIEWS,
  DEFAULT_TABLES,
  DEFAULT_WEBSITE_SETTINGS,
  getDefaultAvailability,
} from '../data/seedDefaults.ts';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import {
  apiRequest,
  getStoredDemoToken,
  setStoredDemoToken,
} from '../services/apiClient.ts';
import {
  cancelPendingOrder,
  cancelReservation,
  createOrder,
  createReservation,
  deleteCustomerAddress,
  getUserPrivateProfile,
  resolveUserRole,
  saveCustomerAddress,
  seedInitialDatabaseIfEmpty,
  subscribeAllOrders,
  subscribeAllReservations,
  subscribeApprovedReviews,
  subscribeAvailability,
  subscribeCategories,
  subscribeProducts,
  subscribeSettings,
  subscribeTables,
  subscribeUserAddresses,
  subscribeUserOrders,
  subscribeUserReservations,
  submitCustomerReview,
  syncUserProfileOnSignIn,
  updateUserProfileInfo,
} from '../services/firestoreService.ts';
import { speakWelcomeGreeting } from '../services/welcomeAudio.ts';
import { TRANSLATIONS, type Language, type TranslationSet } from '../shared/i18n.ts';
import { getDhakaDateString } from '../shared/timezone.ts';
import type {
  AdminTabId,
  CartItem,
  Category,
  CustomerAddress,
  FoodAvailability,
  Order,
  Product,
  ProductAddon,
  Reservation,
  RestaurantTable,
  Review,
  StaffRole,
  WebsiteSetting,
} from '../shared/types.ts';

export interface DemoSessionProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: null;
  emailVerified: false;
  phone: string;
  defaultAddress: string;
  isDemo: true;
}

export type AppAuthUser = User | DemoSessionProfile;

export interface QrTableContext {
  tableId: string;
  tableNumber: string;
  zone: string;
  token: string;
  verified: boolean;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AppContextValue {
  user: AppAuthUser | null;
  firebaseUser: User | null;
  isDemoUser: boolean;
  authReady: boolean;
  isAdmin: boolean;
  staffRole: StaffRole | null;
  staffPermissions: AdminTabId[];
  signInWithGoogle: () => Promise<void>;
  signUpDemo: (params: { email: string; password: string; displayName?: string }) => Promise<void>;
  signInDemo: (params: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  replayWelcomeAudio: () => void;

  lang: Language;
  setLang: (lang: Language) => void;
  t: TranslationSet;

  settings: WebsiteSetting;
  categories: Category[];
  products: Product[];
  availability: FoodAvailability[];
  tables: RestaurantTable[];
  approvedReviews: Review[];

  orders: Order[];
  reservations: Reservation[];
  addresses: CustomerAddress[];
  demoAdminReviews: Review[];

  // Unified customer operations (works for both Demo & Google accounts)
  loadProfileDetails: () => Promise<{ phone: string; defaultAddress: string } | null>;
  saveProfileInfo: (data: {
    displayName: string;
    phone: string;
    defaultAddress: string;
  }) => Promise<void>;
  addCustomerAddress: (
    address: Omit<CustomerAddress, 'id' | 'userId' | 'createdAt'>,
  ) => Promise<void>;
  removeCustomerAddress: (addressId: string) => Promise<void>;
  placeCustomerOrder: (
    payload: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<Order>;
  cancelCustomerOrder: (orderId: string) => Promise<void>;
  submitCustomerReservation: (
    payload: Omit<Reservation, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  ) => Promise<string>;
  cancelCustomerReservation: (reservationId: string) => Promise<void>;
  submitReview: (payload: {
    authorName: string;
    productId?: string;
    productName?: string;
    rating: number;
    comment: string;
  }) => Promise<void>;
  refreshDemoAdminSnapshot: () => Promise<void>;

  cart: CartItem[];
  addToCart: (params: {
    product: Product;
    sizeName?: string;
    sizePriceDelta?: number;
    addons?: ProductAddon[];
    quantity: number;
    instructions?: string;
  }) => void;
  updateCartQty: (cartKey: string, quantity: number) => void;
  removeFromCart: (cartKey: string) => void;
  clearCart: () => void;
  cartDrawerOpen: boolean;
  setCartDrawerOpen: (open: boolean) => void;

  qrTable: QrTableContext | null;
  qrError: string | null;
  verifyAndAttachQrToken: (token: string) => Promise<boolean>;
  clearQrTable: () => void;

  toasts: ToastMessage[];
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  isOnline: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [demoUser, setDemoUser] = useState<DemoSessionProfile | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [demoReady, setDemoReady] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [staffPermissions, setStaffPermissions] = useState<AdminTabId[]>([]);
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('foodvista_lang');
      if (saved === 'bn' || saved === 'en') return saved;
    }
    return 'en';
  });

  const setLang = (nextLang: Language) => {
    setLangState(nextLang);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('foodvista_lang', nextLang);
    }
  };

  const t = useMemo(() => TRANSLATIONS[lang], [lang]);

  const [dbSettings, setDbSettings] = useState<WebsiteSetting | null>(null);
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [dbAvailability, setDbAvailability] = useState<FoodAvailability[]>([]);
  const [dbTables, setDbTables] = useState<RestaurantTable[]>([]);
  const [dbReviews, setDbReviews] = useState<Review[]>([]);
  const [demoApprovedReviews, setDemoApprovedReviews] = useState<Review[]>([]);

  const [fsOrders, setFsOrders] = useState<Order[]>([]);
  const [fsReservations, setFsReservations] = useState<Reservation[]>([]);
  const [fsAddresses, setFsAddresses] = useState<CustomerAddress[]>([]);

  const [demoOrders, setDemoOrders] = useState<Order[]>([]);
  const [demoReservations, setDemoReservations] = useState<Reservation[]>([]);
  const [demoAddresses, setDemoAddresses] = useState<CustomerAddress[]>([]);

  const [demoAdminOrders, setDemoAdminOrders] = useState<Order[]>([]);
  const [demoAdminReservations, setDemoAdminReservations] = useState<Reservation[]>([]);
  const [demoAdminReviews, setDemoAdminReviews] = useState<Review[]>([]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

  const [qrTable, setQrTable] = useState<QrTableContext | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  };

  useEffect(() => {
    const onOn = () => setIsOnline(true);
    const onOff = () => setIsOnline(false);
    window.addEventListener('online', onOn);
    window.addEventListener('offline', onOff);
    return () => {
      window.removeEventListener('online', onOn);
      window.removeEventListener('offline', onOff);
    };
  }, []);

  const authReady = firebaseReady && demoReady;
  const user: AppAuthUser | null = firebaseUser || demoUser;
  const isDemoUser = Boolean(!firebaseUser && demoUser);

  // Admin role strictly requires a verified Firebase Google login
  const isBootstrapAdmin = Boolean(
    firebaseUser &&
      firebaseUser.email === 'mashuksikder121@gmail.com' &&
      firebaseUser.emailVerified,
  );

  // Restore Demo Session on load
  useEffect(() => {
    const token = getStoredDemoToken();
    if (!token) {
      setDemoReady(true);
      return;
    }
    apiRequest<{
      user: {
        uid: string;
        email: string;
        displayName: string;
        phone: string;
        defaultAddress: string;
      };
    }>('/demo-auth/me')
      .then((res) => {
        setDemoUser({
          ...res.user,
          photoURL: null,
          emailVerified: false,
          isDemo: true,
        });
      })
      .catch(() => {
        setStoredDemoToken(null);
        setDemoUser(null);
      })
      .finally(() => {
        setDemoReady(true);
      });
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      if (currentUser) {
        try {
          const roleInfo = await resolveUserRole(currentUser);
          setIsAdmin(roleInfo.isAdmin);
          setStaffRole(roleInfo.staffRole);
          setStaffPermissions(roleInfo.staffPermissions);
        } catch (err) {
          console.error('Role resolution error:', err);
          setIsAdmin(false);
          setStaffRole(null);
          setStaffPermissions([]);
        }
        syncUserProfileOnSignIn(currentUser).catch((err) =>
          console.warn('Profile sync skipped:', err),
        );
        if (currentUser.email === 'mashuksikder121@gmail.com' && currentUser.emailVerified) {
          seedInitialDatabaseIfEmpty(currentUser).catch((err) =>
            console.warn('Initial seed skipped:', err),
          );
        }
      } else {
        setIsAdmin(false);
        setStaffRole(null);
        setStaffPermissions([]);
      }
      setFirebaseReady(true);
    });
  }, []);

  const refreshDemoCustomerData = useCallback(async () => {
    if (!getStoredDemoToken() || auth.currentUser) {
      setDemoOrders([]);
      setDemoReservations([]);
      setDemoAddresses([]);
      return;
    }
    try {
      const data = await apiRequest<{
        orders: Order[];
        reservations: Reservation[];
        addresses: CustomerAddress[];
        profile: {
          uid: string;
          email: string;
          displayName: string;
          phone: string;
          defaultAddress: string;
        } | null;
      }>('/demo-customer/data');
      setDemoOrders(data.orders || []);
      setDemoReservations(data.reservations || []);
      setDemoAddresses(data.addresses || []);
      if (data.profile) {
        setDemoUser({
          ...data.profile,
          photoURL: null,
          emailVerified: false,
          isDemo: true,
        });
      }
    } catch {
      // Ignore if session expired
    }
  }, []);

  const refreshDemoAdminSnapshot = useCallback(async () => {
    if (!isBootstrapAdmin) {
      setDemoAdminOrders([]);
      setDemoAdminReservations([]);
      setDemoAdminReviews([]);
      return;
    }
    try {
      const snap = await apiRequest<{
        orders: Order[];
        reservations: Reservation[];
        reviews: Review[];
      }>('/demo-customer/admin/snapshot');
      setDemoAdminOrders(snap.orders || []);
      setDemoAdminReservations(snap.reservations || []);
      setDemoAdminReviews(snap.reviews || []);
    } catch {
      // Non-fatal
    }
  }, [isBootstrapAdmin]);

  // Public real-time Firestore listeners + approved demo reviews
  useEffect(() => {
    const unsubs = [
      subscribeSettings(setDbSettings),
      subscribeCategories(setDbCategories),
      subscribeProducts(setDbProducts),
      subscribeAvailability(setDbAvailability),
      subscribeTables(setDbTables),
      subscribeApprovedReviews(setDbReviews),
    ];
    apiRequest<{ reviews: Review[] }>('/demo-customer/reviews/approved')
      .then((res) => setDemoApprovedReviews(res.reviews || []))
      .catch(() => undefined);
    return () => unsubs.forEach((u) => u());
  }, []);

  // User / Admin orders & reservations listeners
  useEffect(() => {
    if (!authReady) return;

    if (firebaseUser) {
      const unsubs = [
        isBootstrapAdmin
          ? subscribeAllOrders(setFsOrders)
          : subscribeUserOrders(firebaseUser.uid, setFsOrders),
        isBootstrapAdmin
          ? subscribeAllReservations(setFsReservations)
          : subscribeUserReservations(firebaseUser.uid, setFsReservations),
        subscribeUserAddresses(firebaseUser.uid, setFsAddresses),
      ];
      if (isBootstrapAdmin) {
        void refreshDemoAdminSnapshot();
      }
      return () => unsubs.forEach((u) => u());
    }

    setFsOrders([]);
    setFsReservations([]);
    setFsAddresses([]);
    setDemoAdminOrders([]);
    setDemoAdminReservations([]);
    setDemoAdminReviews([]);

    if (demoUser) {
      void refreshDemoCustomerData();
    } else {
      setDemoOrders([]);
      setDemoReservations([]);
      setDemoAddresses([]);
    }
  }, [
    authReady,
    firebaseUser,
    demoUser?.uid,
    isBootstrapAdmin,
    refreshDemoCustomerData,
    refreshDemoAdminSnapshot,
  ]);

  // Real-time Socket.IO listener for instant cross-device notifications & demo sync
  useEffect(() => {
    const socket: Socket = io({
      transports: ['websocket', 'polling'],
    });

    socket.on('order:created', (data: { orderNumber?: string; orderType?: string }) => {
      if (isAdmin) {
        showToast(
          `New ${data.orderType || ''} order received: ${data.orderNumber || ''}`.trim(),
          'info',
        );
      }
      if (isBootstrapAdmin) void refreshDemoAdminSnapshot();
      if (isDemoUser) void refreshDemoCustomerData();
    });

    socket.on('order:updated', (data: { status?: string }) => {
      if (data.status) {
        showToast(`Order status updated to ${data.status.replace(/_/g, ' ')}`, 'info');
      }
      if (isBootstrapAdmin) void refreshDemoAdminSnapshot();
      if (isDemoUser) void refreshDemoCustomerData();
    });

    socket.on('reservation:updated', () => {
      if (isBootstrapAdmin) void refreshDemoAdminSnapshot();
      if (isDemoUser) void refreshDemoCustomerData();
    });

    socket.on('availability:updated', () => {
      if (!isAdmin) {
        showToast('Today’s menu availability was just updated.', 'info');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isAdmin, isBootstrapAdmin, isDemoUser, refreshDemoAdminSnapshot, refreshDemoCustomerData]);

  const settings = useMemo(() => dbSettings || DEFAULT_WEBSITE_SETTINGS, [dbSettings]);
  const categories = useMemo(
    () => (dbCategories.length > 0 ? dbCategories : DEFAULT_CATEGORIES),
    [dbCategories],
  );
  const products = useMemo(
    () => (dbProducts.length > 0 ? dbProducts : DEFAULT_PRODUCTS),
    [dbProducts],
  );
  const availability = useMemo(() => {
    if (dbAvailability.length > 0) return dbAvailability;
    return getDefaultAvailability(getDhakaDateString());
  }, [dbAvailability]);
  const tables = useMemo(() => (dbTables.length > 0 ? dbTables : DEFAULT_TABLES), [dbTables]);

  const approvedReviews = useMemo(() => {
    const base = dbReviews.length > 0 ? dbReviews : DEFAULT_REVIEWS;
    return [...demoApprovedReviews, ...base];
  }, [dbReviews, demoApprovedReviews]);

  const orders = useMemo(() => {
    if (firebaseUser) {
      return isBootstrapAdmin ? [...demoAdminOrders, ...fsOrders] : fsOrders;
    }
    return demoOrders;
  }, [firebaseUser, isBootstrapAdmin, demoAdminOrders, fsOrders, demoOrders]);

  const reservations = useMemo(() => {
    if (firebaseUser) {
      return isBootstrapAdmin ? [...demoAdminReservations, ...fsReservations] : fsReservations;
    }
    return demoReservations;
  }, [firebaseUser, isBootstrapAdmin, demoAdminReservations, fsReservations, demoReservations]);

  const addresses = useMemo(
    () => (firebaseUser ? fsAddresses : demoAddresses),
    [firebaseUser, fsAddresses, demoAddresses],
  );

  // Verify QR Token from URL (?table_qr=...)
  const verifyAndAttachQrToken = async (token: string): Promise<boolean> => {
    setQrError(null);
    const parts = token.trim().split('.');
    const parsedTableId = parts.length === 4 ? parts[1] : '';
    const matchingTable = tables.find((t) => t.id === parsedTableId);

    if (!matchingTable || !matchingTable.isActive) {
      setQrTable(null);
      setQrError('This table is inactive or does not exist.');
      return false;
    }

    try {
      const res = await apiRequest<{
        valid: boolean;
        tableId: string;
        version: number;
        reason?: string;
      }>('/table-qr/verify', {
        method: 'POST',
        body: {
          token,
          expectedSignature: matchingTable.qrSignature,
          expectedVersion: matchingTable.qrTokenVersion,
        },
      });
      if (res.valid) {
        setQrTable({
          tableId: matchingTable.id,
          tableNumber: matchingTable.tableNumber,
          zone: matchingTable.zone || 'Main Hall',
          token,
          verified: true,
        });
        showToast(`Seated at ${matchingTable.name} (QR Verified)`, 'success');
        return true;
      }
      setQrError(res.reason || 'QR verification failed.');
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid or revoked QR code.';
      setQrTable(null);
      setQrError(msg);
      return false;
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('table_qr');
    if (token && tables.length > 0 && !qrTable) {
      void verifyAndAttachQrToken(token);
    }
  }, [tables.length]);

  const clearQrTable = () => {
    setQrTable(null);
    setQrError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('table_qr');
    window.history.replaceState({}, '', url.toString());
  };

  const replayWelcomeAudio = () => {
    const name = user?.displayName || user?.email?.split('@')[0] || 'Guest';
    speakWelcomeGreeting(name, lang);
  };

  const signInWithGoogle = async () => {
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      // Clear demo session if switching to Google account
      setStoredDemoToken(null);
      setDemoUser(null);
      const guestName = cred.user.displayName || cred.user.email?.split('@')[0] || 'Guest';
      speakWelcomeGreeting(guestName, lang);
      showToast(`${guestName}, welcome to our FoodVista!`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in cancelled.';
      showToast(msg, 'error');
    }
  };

  const signUpDemo = async (params: {
    email: string;
    password: string;
    displayName?: string;
  }) => {
    const res = await apiRequest<{
      token: string;
      user: {
        uid: string;
        email: string;
        displayName: string;
        phone: string;
        defaultAddress: string;
      };
    }>('/demo-auth/signup', {
      method: 'POST',
      body: params,
    });
    if (auth.currentUser) {
      await signOut(auth);
    }
    setStoredDemoToken(res.token);
    setDemoUser({
      ...res.user,
      photoURL: null,
      emailVerified: false,
      isDemo: true,
    });
    const guestName = res.user.displayName || res.user.email.split('@')[0] || 'Guest';
    speakWelcomeGreeting(guestName, lang);
    showToast(`${guestName}, welcome to our FoodVista!`, 'success');
  };

  const signInDemo = async (params: { email: string; password: string }) => {
    const res = await apiRequest<{
      token: string;
      user: {
        uid: string;
        email: string;
        displayName: string;
        phone: string;
        defaultAddress: string;
      };
    }>('/demo-auth/login', {
      method: 'POST',
      body: params,
    });
    if (auth.currentUser) {
      await signOut(auth);
    }
    setStoredDemoToken(res.token);
    setDemoUser({
      ...res.user,
      photoURL: null,
      emailVerified: false,
      isDemo: true,
    });
    const guestName = res.user.displayName || res.user.email.split('@')[0] || 'Guest';
    speakWelcomeGreeting(guestName, lang);
    showToast(`${guestName}, welcome to our FoodVista!`, 'success');
  };

  const logout = async () => {
    setStoredDemoToken(null);
    setDemoUser(null);
    setDemoOrders([]);
    setDemoReservations([]);
    setDemoAddresses([]);
    if (auth.currentUser) {
      await signOut(auth);
    }
    showToast('Signed out.', 'info');
  };

  // Unified customer operations
  const loadProfileDetails = async () => {
    if (firebaseUser) {
      const priv = await getUserPrivateProfile(firebaseUser.uid);
      return priv ? { phone: priv.phone || '', defaultAddress: priv.defaultAddress || '' } : null;
    }
    if (demoUser) {
      return { phone: demoUser.phone || '', defaultAddress: demoUser.defaultAddress || '' };
    }
    return null;
  };

  const saveProfileInfo = async (data: {
    displayName: string;
    phone: string;
    defaultAddress: string;
  }) => {
    if (firebaseUser) {
      await updateUserProfileInfo(firebaseUser.uid, data);
      return;
    }
    if (demoUser) {
      const res = await apiRequest<{
        profile: {
          uid: string;
          email: string;
          displayName: string;
          phone: string;
          defaultAddress: string;
        };
      }>('/demo-customer/profile', {
        method: 'PUT',
        body: data,
      });
      if (res.profile) {
        setDemoUser({ ...res.profile, photoURL: null, emailVerified: false, isDemo: true });
      }
    }
  };

  const addCustomerAddress = async (
    address: Omit<CustomerAddress, 'id' | 'userId' | 'createdAt'>,
  ) => {
    if (firebaseUser) {
      await saveCustomerAddress(firebaseUser.uid, address);
      return;
    }
    if (demoUser) {
      const res = await apiRequest<{ address: CustomerAddress }>('/demo-customer/addresses', {
        method: 'POST',
        body: address,
      });
      setDemoAddresses((prev) => [res.address, ...prev]);
    }
  };

  const removeCustomerAddress = async (addressId: string) => {
    if (firebaseUser) {
      await deleteCustomerAddress(firebaseUser.uid, addressId);
      return;
    }
    if (demoUser) {
      await apiRequest(`/demo-customer/addresses/${addressId}`, { method: 'DELETE' });
      setDemoAddresses((prev) => prev.filter((a) => a.id !== addressId));
    }
  };

  const placeCustomerOrder = async (
    payload: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Order> => {
    if (firebaseUser) {
      return createOrder(payload);
    }
    const res = await apiRequest<{ order: Order }>('/demo-customer/orders', {
      method: 'POST',
      body: payload,
    });
    setDemoOrders((prev) => [res.order, ...prev]);
    return res.order;
  };

  const cancelCustomerOrder = async (orderId: string) => {
    if (firebaseUser && !orderId.startsWith('demo_ord_')) {
      await cancelPendingOrder(orderId);
      return;
    }
    const res = await apiRequest<{ order: Order }>(`/demo-customer/orders/${orderId}/cancel`, {
      method: 'POST',
    });
    setDemoOrders((prev) => prev.map((o) => (o.id === orderId ? res.order : o)));
  };

  const submitCustomerReservation = async (
    payload: Omit<Reservation, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> => {
    if (firebaseUser) {
      return createReservation(payload);
    }
    const res = await apiRequest<{ reservation: Reservation }>('/demo-customer/reservations', {
      method: 'POST',
      body: payload,
    });
    setDemoReservations((prev) => [res.reservation, ...prev]);
    return res.reservation.id;
  };

  const cancelCustomerReservation = async (reservationId: string) => {
    if (firebaseUser && !reservationId.startsWith('demo_res_')) {
      await cancelReservation(reservationId);
      return;
    }
    const res = await apiRequest<{ reservation: Reservation }>(
      `/demo-customer/reservations/${reservationId}/cancel`,
      { method: 'POST' },
    );
    setDemoReservations((prev) =>
      prev.map((r) => (r.id === reservationId ? res.reservation : r)),
    );
  };

  const submitReview = async (payload: {
    authorName: string;
    productId?: string;
    productName?: string;
    rating: number;
    comment: string;
  }) => {
    if (firebaseUser) {
      await submitCustomerReview({
        userId: firebaseUser.uid,
        ...payload,
      });
      return;
    }
    await apiRequest('/demo-customer/reviews', {
      method: 'POST',
      body: payload,
    });
  };

  const addToCart: AppContextValue['addToCart'] = ({
    product,
    sizeName,
    sizePriceDelta = 0,
    addons = [],
    quantity,
    instructions = '',
  }) => {
    const basePrice =
      product.discountPrice != null && product.discountPrice < product.price
        ? product.discountPrice
        : product.price;
    const addonKey = addons
      .map((a) => a.name)
      .sort()
      .join(',');
    const cartKey = `${product.id}__${sizeName || 'default'}__${addonKey}__${instructions.trim()}`;

    setCart((prev) => {
      const existing = prev.find((i) => i.cartKey === cartKey);
      if (existing) {
        return prev.map((i) =>
          i.cartKey === cartKey ? { ...i, quantity: i.quantity + quantity } : i,
        );
      }
      return [
        ...prev,
        {
          cartKey,
          productId: product.id,
          productName: product.name,
          imageUrl: product.images[0] || '',
          basePrice,
          sizeName,
          sizePriceDelta,
          addons,
          quantity,
          instructions,
        },
      ];
    });
    showToast(`Added ${product.name} to cart`, 'success');
  };

  const updateCartQty = (cartKey: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartKey);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.cartKey === cartKey ? { ...item, quantity } : item)),
    );
  };

  const removeFromCart = (cartKey: string) => {
    setCart((prev) => prev.filter((item) => item.cartKey !== cartKey));
  };

  const clearCart = () => setCart([]);

  return (
    <AppContext.Provider
      value={{
        user,
        firebaseUser,
        isDemoUser,
        authReady,
        isAdmin,
        staffRole,
        staffPermissions,
        signInWithGoogle,
        signUpDemo,
        signInDemo,
        logout,
        replayWelcomeAudio,
        lang,
        setLang,
        t,
        settings,
        categories,
        products,
        availability,
        tables,
        approvedReviews,
        orders,
        reservations,
        addresses,
        demoAdminReviews,
        loadProfileDetails,
        saveProfileInfo,
        addCustomerAddress,
        removeCustomerAddress,
        placeCustomerOrder,
        cancelCustomerOrder,
        submitCustomerReservation,
        cancelCustomerReservation,
        submitReview,
        refreshDemoAdminSnapshot,
        cart,
        addToCart,
        updateCartQty,
        removeFromCart,
        clearCart,
        cartDrawerOpen,
        setCartDrawerOpen,
        qrTable,
        qrError,
        verifyAndAttachQrToken,
        clearQrTable,
        toasts,
        showToast,
        isOnline,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
