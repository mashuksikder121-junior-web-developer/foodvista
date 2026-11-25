import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
import { apiRequest } from '../services/apiClient.ts';
import {
  resolveUserRole,
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
  syncUserProfileOnSignIn,
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
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  staffRole: StaffRole | null;
  staffPermissions: AdminTabId[];
  signInWithGoogle: () => Promise<void>;
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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
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

  const [orders, setOrders] = useState<Order[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);

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

  const isBootstrapAdmin = Boolean(
    user && user.email === 'mashuksikder121@gmail.com' && user.emailVerified,
  );

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
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
      setAuthReady(true);
    });
  }, []);

  // Public real-time Firestore listeners
  useEffect(() => {
    const unsubs = [
      subscribeSettings(setDbSettings),
      subscribeCategories(setDbCategories),
      subscribeProducts(setDbProducts),
      subscribeAvailability(setDbAvailability),
      subscribeTables(setDbTables),
      subscribeApprovedReviews(setDbReviews),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // User / Admin orders & reservations listeners
  useEffect(() => {
    if (!authReady || !user) {
      setOrders([]);
      setReservations([]);
      setAddresses([]);
      return;
    }

    const unsubs = [
      isBootstrapAdmin ? subscribeAllOrders(setOrders) : subscribeUserOrders(user.uid, setOrders),
      isBootstrapAdmin
        ? subscribeAllReservations(setReservations)
        : subscribeUserReservations(user.uid, setReservations),
      subscribeUserAddresses(user.uid, setAddresses),
    ];
    return () => unsubs.forEach((u) => u());
  }, [authReady, user, isBootstrapAdmin]);

  // Real-time Socket.IO listener for instant cross-device notifications
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
    });

    socket.on('order:updated', (data: { status?: string }) => {
      if (data.status) {
        showToast(`Order status updated to ${data.status.replace(/_/g, ' ')}`, 'info');
      }
    });

    socket.on('availability:updated', () => {
      if (!isAdmin) {
        showToast('Today’s menu availability was just updated.', 'info');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isAdmin]);

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
  const approvedReviews = useMemo(
    () => (dbReviews.length > 0 ? dbReviews : DEFAULT_REVIEWS),
    [dbReviews],
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
      const res = await apiRequest<{ valid: boolean; tableId: string; version: number; reason?: string }>(
        '/table-qr/verify',
        {
          method: 'POST',
          body: {
            token,
            expectedSignature: matchingTable.qrSignature,
            expectedVersion: matchingTable.qrTokenVersion,
          },
        },
      );
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
      const guestName =
        cred.user.displayName || cred.user.email?.split('@')[0] || 'Guest';
      speakWelcomeGreeting(guestName, lang);
      showToast(`${guestName}, welcome to our FoodVista!`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in cancelled.';
      showToast(msg, 'error');
    }
  };

  const logout = async () => {
    await signOut(auth);
    showToast('Signed out.', 'info');
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
        authReady,
        isAdmin,
        staffRole,
        staffPermissions,
        signInWithGoogle,
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
