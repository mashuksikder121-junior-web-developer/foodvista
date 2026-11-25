import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Home,
  LogIn,
  LogOut,
  MapPin,
  Menu as MenuIcon,
  Package,
  Phone,
  QrCode,
  Search,
  Shield,
  ShoppingBag,
  Star,
  Trash2,
  User as UserIcon,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext.tsx';
import {
  cancelPendingOrder,
  cancelReservation,
  createReservation,
  deleteCustomerAddress,
  getUserPrivateProfile,
  saveCustomerAddress,
  submitCustomerReview,
  updateUserProfileInfo,
} from '../services/firestoreService.ts';
import { checkProductAvailability } from '../shared/availability.ts';
import { findAvailableTablesForSlot } from '../shared/reservations.ts';
import { formatBDT, getDhakaDateString } from '../shared/timezone.ts';
import type { Coupon, OrderStatus, OrderType, Product } from '../shared/types.ts';
import { CartDrawer } from './CartDrawer.tsx';
import { CheckoutModal } from './CheckoutModal.tsx';
import { FoodCard } from './FoodCard.tsx';
import { FoodDetailModal } from './FoodDetailModal.tsx';
import { FoodImage } from './FoodImage.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';

export type PublicTab = 'home' | 'menu' | 'reserve' | 'track' | 'account';

interface PublicWebsiteProps {
  onOpenAdmin: () => void;
}

const ORDER_STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'out_for_delivery', label: 'On the Way' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
];

const TIME_SLOTS = ['12:30 PM', '02:00 PM', '04:00 PM', '06:30 PM', '08:00 PM', '09:30 PM'];

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({ onOpenAdmin }) => {
  const {
    user,
    isAdmin,
    staffRole,
    signInWithGoogle,
    logout,
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
    setCartDrawerOpen,
    qrTable,
    qrError,
    clearQrTable,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<PublicTab>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [checkoutState, setCheckoutState] = useState<{
    open: boolean;
    orderType: OrderType;
    coupon: Coupon | null;
  }>({ open: false, orderType: 'delivery', coupon: null });

  // Menu Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [priceFilter, setPriceFilter] = useState<'all' | 'under350' | '350to550' | 'over550'>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [menuLimit, setMenuLimit] = useState(9);

  // Reservation State
  const [resDate, setResDate] = useState(getDhakaDateString());
  const [resTime, setResTime] = useState(TIME_SLOTS[3]);
  const [resGuests, setResGuests] = useState(2);
  const [resSelectedTableId, setResSelectedTableId] = useState('');
  const [resName, setResName] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resNotes, setResNotes] = useState('');
  const [resSubmitting, setResSubmitting] = useState(false);

  // Order tracking focus
  const [trackedOrderId, setTrackedOrderId] = useState<string | null>(null);

  // Account Profile & Address Forms
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddr, setProfileAddr] = useState('');
  const [newAddrLabel, setNewAddrLabel] = useState('Home');
  const [newAddrArea, setNewAddrArea] = useState('Banani');
  const [newAddrStreet, setNewAddrStreet] = useState('');
  const [newAddrPhone, setNewAddrPhone] = useState('');

  // Review Form
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewProductId, setReviewProductId] = useState('');
  const [reviewComment, setReviewComment] = useState('');

  // Legal Modal
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  React.useEffect(() => {
    if (user) {
      setProfileName(user.displayName || '');
      setResName((prev) => prev || user.displayName || '');
      void getUserPrivateProfile(user.uid).then((priv) => {
        if (priv) {
          setProfilePhone(priv.phone || '');
          setProfileAddr(priv.defaultAddress || '');
          setResPhone((prev) => prev || priv.phone || '');
          setNewAddrPhone((prev) => prev || priv.phone || '');
        }
      });
    }
  }, [user]);

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [categories],
  );

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.isActive || p.isDeleted) return false;
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) {
          return false;
        }
      }
      const effPrice = p.discountPrice != null && p.discountPrice < p.price ? p.discountPrice : p.price;
      if (priceFilter === 'under350' && effPrice >= 350) return false;
      if (priceFilter === '350to550' && (effPrice < 350 || effPrice > 550)) return false;
      if (priceFilter === 'over550' && effPrice <= 550) return false;

      if (onlyAvailable && !checkProductAvailability(p, availability).available) return false;
      return true;
    });
  }, [products, selectedCategoryId, searchQuery, priceFilter, onlyAvailable, availability]);

  const availableTablesForSlot = useMemo(
    () => findAvailableTablesForSlot(tables, reservations, resDate, resTime, resGuests),
    [tables, reservations, resDate, resTime, resGuests],
  );

  const handleQuickAdd = (product: Product) => {
    const avail = checkProductAvailability(product, availability);
    if (!avail.available) {
      showToast(avail.message, 'error');
      return;
    }
    const defaultSize = product.sizes?.[0];
    addToCart({
      product,
      sizeName: defaultSize?.name,
      sizePriceDelta: defaultSize?.priceDelta || 0,
      addons: [],
      quantity: 1,
    });
  };

  const handleReservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    const chosenTable =
      availableTablesForSlot.find((t) => t.id === resSelectedTableId) ||
      availableTablesForSlot[0];
    if (!chosenTable) {
      showToast('No tables available for that slot and party size.', 'error');
      return;
    }
    if (!resName.trim() || resPhone.trim().length < 6) {
      showToast('Please enter your name and valid phone number.', 'error');
      return;
    }
    setResSubmitting(true);
    try {
      await createReservation({
        userId: user.uid,
        customerName: resName.trim(),
        customerPhone: resPhone.trim(),
        date: resDate,
        timeSlot: resTime,
        guestCount: resGuests,
        tableId: chosenTable.id,
        tableNumber: chosenTable.tableNumber,
        specialRequests: resNotes.trim(),
      });
      setResNotes('');
      showToast(`Reservation requested for ${chosenTable.name} on ${resDate} at ${resTime}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create reservation', 'error');
    } finally {
      setResSubmitting(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await updateUserProfileInfo(user.uid, {
      displayName: profileName,
      phone: profilePhone,
      defaultAddress: profileAddr,
    });
    showToast('Profile saved.', 'success');
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newAddrStreet.trim() || newAddrPhone.trim().length < 6) {
      showToast('Enter a valid street address and phone number.', 'error');
      return;
    }
    await saveCustomerAddress(user.uid, {
      label: newAddrLabel.trim() || 'Home',
      recipientName: profileName || user.displayName || 'Customer',
      phone: newAddrPhone.trim(),
      area: newAddrArea,
      streetAddress: newAddrStreet.trim(),
      instructions: '',
      isDefault: addresses.length === 0,
    });
    setNewAddrStreet('');
    showToast('Delivery address saved.', 'success');
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (reviewComment.trim().length < 3) {
      showToast('Please write a short review comment.', 'error');
      return;
    }
    const prod = products.find((p) => p.id === reviewProductId);
    await submitCustomerReview({
      userId: user.uid,
      authorName: profileName || user.displayName || 'Guest',
      productId: prod?.id || '',
      productName: prod?.name || '',
      rating: reviewRating,
      comment: reviewComment.trim(),
    });
    setReviewComment('');
    showToast('Review submitted for approval. Thank you!', 'success');
  };

  const activeOrder = useMemo(() => {
    if (orders.length === 0) return null;
    if (trackedOrderId) {
      const match = orders.find((o) => o.id === trackedOrderId);
      if (match) return match;
    }
    return orders[0];
  }, [orders, trackedOrderId]);

  const popularDishes = useMemo(
    () => products.filter((p) => p.isActive && !p.isDeleted && (p.isPopular || p.isBestSeller)).slice(0, 6),
    [products],
  );

  const offerDishes = useMemo(
    () => products.filter((p) => p.isActive && !p.isDeleted && (p.isOffer || (p.discountPrice != null && p.discountPrice < p.price))).slice(0, 3),
    [products],
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20 text-[#171717] md:pb-0">
      {/* Slim Top Promotional Strip */}
      {settings.specialOfferBanner && (
        <div className="bg-[#171717] px-4 py-2 text-center text-xs font-medium text-white">
          <span className="text-[#F97316]">Special Offer</span> · {settings.specialOfferBanner}
        </div>
      )}

      {/* Top Bar Contract: 3 Zones Separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Brand Wordmark Only */}
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="font-display text-xl font-extrabold tracking-tight text-[#171717] whitespace-nowrap shrink-0"
          >
            {settings.restaurantName || 'FoodVista'}
          </button>

          {/* Zone 2: Concise Single-Line Nav Links */}
          <nav className="hidden items-center gap-6 text-sm font-medium text-neutral-600 md:flex">
            {[
              { id: 'home' as const, label: 'Home' },
              { id: 'menu' as const, label: 'Menu' },
              { id: 'reserve' as const, label: 'Reserve' },
              { id: 'track' as const, label: 'Track Order' },
              { id: 'account' as const, label: user ? 'Account' : 'Sign In' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`whitespace-nowrap shrink-0 border-b-2 py-1 transition-colors ${
                  activeTab === item.id
                    ? 'border-[#F97316] font-semibold text-[#171717]'
                    : 'border-transparent hover:text-[#171717]'
                }`}
              >
                {item.label}
              </button>
            ))}
            {(isAdmin || staffRole) && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="whitespace-nowrap shrink-0 font-semibold text-[#F97316] hover:text-[#EA580C]"
              >
                Admin Panel
              </button>
            )}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setCartDrawerOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#171717] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#F97316] whitespace-nowrap shrink-0 tabular-nums"
            >
              <ShoppingBag className="h-4 w-4" />
              Cart · {cartCount}
            </button>
          </div>
        </div>
      </header>

      {/* Active QR Table Verification Banner */}
      {qrTable && qrTable.verified && (
        <div className="border-b border-orange-200 bg-orange-50 px-4 py-2.5">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 text-xs sm:px-2">
            <div className="flex items-center gap-2 font-medium text-[#171717]">
              <QrCode className="h-4 w-4 text-[#F97316]" />
              <span>
                Dine-In QR Verified: <strong>Table {qrTable.tableNumber}</strong> ({qrTable.zone})
              </span>
            </div>
            <button
              type="button"
              onClick={clearQrTable}
              className="font-semibold text-neutral-600 hover:text-[#DC2626] whitespace-nowrap"
            >
              Exit Table
            </button>
          </div>
        </div>
      )}

      {qrError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-medium text-[#DC2626]">
          {qrError}
        </div>
      )}

      {/* MAIN CONTENT */}
      <main>
        {/* ================= HOME PAGE ================= */}
        {activeTab === 'home' && (
          <div>
            {/* Hero Section */}
            <section className="bg-[#171717] text-white">
              <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-8 px-4 py-10 sm:px-6 lg:grid-cols-12 lg:py-16">
                <div className="flex flex-col justify-center lg:col-span-6">
                  <p className="text-xs font-semibold tracking-wide text-[#F97316]">
                    {settings.tagline || 'Good Food • Good Mood'} · Dhaka, Bangladesh
                  </p>
                  <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-balance sm:text-5xl">
                    {settings.heroTitle}
                  </h1>
                  <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-300">
                    {settings.heroSubtitle}
                  </p>

                  {/* Hero Search Bar */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setActiveTab('menu');
                    }}
                    className="mt-6 flex max-w-lg items-center gap-2 rounded-2xl bg-white p-1.5 shadow-lg"
                  >
                    <Search className="ml-3 h-4 w-4 shrink-0 text-neutral-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search Kacchi biryani, burgers, pasta..."
                      className="w-full bg-transparent px-2 py-2 text-sm text-[#171717] placeholder:text-neutral-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-[#F97316] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#EA580C] whitespace-nowrap shrink-0"
                    >
                      Find Food
                    </button>
                  </form>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('menu')}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#F97316] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#EA580C]"
                    >
                      Explore Full Menu
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('reserve')}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-neutral-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
                    >
                      Reserve a Table
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="relative h-64 overflow-hidden rounded-2xl border border-neutral-800 sm:h-80 lg:h-full lg:min-h-[380px]">
                    <FoodImage
                      src={settings.heroBannerUrl}
                      alt={settings.restaurantName}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-200">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-[#F97316]" />
                        {settings.openingHours}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-[#F97316]" />
                        Banani, Dhaka
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Categories Strip */}
            <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[#171717]">
                    Browse by Category
                  </h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Freshly prepared to order across five signature kitchens
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryId('all');
                    setActiveTab('menu');
                  }}
                  className="text-sm font-semibold text-[#F97316] hover:underline whitespace-nowrap"
                >
                  View all dishes
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {activeCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(cat.id);
                      setActiveTab('menu');
                    }}
                    className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left transition-all hover:-translate-y-0.5 hover:border-[#F97316]"
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-neutral-900">
                      <FoodImage
                        src={cat.imageUrl}
                        alt={cat.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-3.5">
                      <h3 className="font-display text-sm font-bold text-[#171717] group-hover:text-[#F97316]">
                        {cat.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-neutral-500 line-clamp-1">
                        {cat.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Popular & Best-Selling Dishes */}
            <section className="border-y border-neutral-200 bg-white py-12">
              <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-[#171717]">
                      Popular & Best-Selling Dishes
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      Live availability synced in real time with our Dhaka kitchen
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('menu')}
                    className="text-sm font-semibold text-[#F97316] hover:underline whitespace-nowrap"
                  >
                    Full Menu
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {popularDishes.map((prod) => (
                    <FoodCard
                      key={prod.id}
                      product={prod}
                      category={categories.find((c) => c.id === prod.categoryId)}
                      availabilityList={availability}
                      onSelect={setSelectedProduct}
                      onQuickAdd={handleQuickAdd}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* Special Offers */}
            {offerDishes.length > 0 && (
              <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
                <h2 className="font-display text-2xl font-bold text-[#171717]">
                  Chef Specials & Combos
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Featured seasonal pairings and combo savings
                </p>
                <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {offerDishes.map((prod) => (
                    <FoodCard
                      key={prod.id}
                      product={prod}
                      category={categories.find((c) => c.id === prod.categoryId)}
                      availabilityList={availability}
                      onSelect={setSelectedProduct}
                      onQuickAdd={handleQuickAdd}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Customer Reviews & Restaurant Story */}
            <section className="border-t border-neutral-200 bg-white py-12">
              <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <h2 className="font-display text-2xl font-bold text-[#171717]">
                    Guest Reviews
                  </h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Verified feedback from dine-in and delivery guests
                  </p>
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {approvedReviews.slice(0, 4).map((rev) => (
                      <div
                        key={rev.id}
                        className="rounded-2xl border border-neutral-200 bg-[#F8FAFC] p-4"
                      >
                        <div className="flex items-center justify-between text-xs text-neutral-500">
                          <span className="font-semibold text-[#171717]">{rev.authorName}</span>
                          <span className="flex items-center gap-0.5 text-[#F97316]">
                            {Array.from({ length: rev.rating }).map((_, idx) => (
                              <Star key={idx} className="h-3.5 w-3.5 fill-current" />
                            ))}
                          </span>
                        </div>
                        {rev.productName && (
                          <p className="mt-1 text-xs text-neutral-500">{rev.productName}</p>
                        )}
                        <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                          “{rev.comment}”
                        </p>
                        {rev.adminReply && (
                          <p className="mt-2 border-t border-neutral-200 pt-2 text-xs text-neutral-600">
                            <strong>FoodVista:</strong> {rev.adminReply}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-[#171717] p-6 text-white lg:col-span-5">
                  <h2 className="font-display text-xl font-bold">
                    Visit {settings.restaurantName}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                    {settings.aboutText}
                  </p>
                  <div className="mt-6 space-y-3 border-t border-neutral-800 pt-5 text-sm">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#F97316]" />
                      <span>{settings.address}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 shrink-0 text-[#F97316]" />
                      <span>{settings.openingHours}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 shrink-0 text-[#F97316]" />
                      <span>{settings.phone}</span>
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('reserve')}
                      className="rounded-xl bg-[#F97316] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#EA580C]"
                    >
                      Book a Table
                    </button>
                    <PWAInstallButton variant="dark" />
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ================= FOOD MENU PAGE ================= */}
        {activeTab === 'menu' && (
          <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-6 md:flex-row md:items-end">
              <div>
                <h1 className="font-display text-3xl font-bold text-[#171717]">Our Menu</h1>
                <p className="mt-1 text-sm text-neutral-500">
                  Live daily availability for {getDhakaDateString()} (Asia/Dhaka)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 sm:w-64 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dishes..."
                    className="w-full rounded-xl border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-[#F97316] focus:outline-none"
                  />
                </div>

                <select
                  value={priceFilter}
                  onChange={(e) =>
                    setPriceFilter(e.target.value as 'all' | 'under350' | '350to550' | 'over550')
                  }
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none"
                >
                  <option value="all">All Prices</option>
                  <option value="under350">Under ৳350</option>
                  <option value="350to550">৳350 – ৳550</option>
                  <option value="over550">Above ৳550</option>
                </select>

                <button
                  type="button"
                  onClick={() => setOnlyAvailable((v) => !v)}
                  className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    onlyAvailable
                      ? 'border-[#16A34A] bg-green-50 text-[#16A34A]'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  Available Today Only
                </button>
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategoryId === 'all'
                    ? 'bg-[#171717] text-white'
                    : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                All Categories
              </button>
              {activeCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    selectedCategoryId === cat.id
                      ? 'bg-[#F97316] text-white'
                      : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {filteredProducts.length === 0 ? (
              <div className="mt-10 rounded-2xl border border-neutral-200 bg-white p-12 text-center">
                <p className="font-display text-lg font-bold text-[#171717]">No dishes matched</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Try clearing your search or price filters.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProducts.slice(0, menuLimit).map((prod) => (
                    <FoodCard
                      key={prod.id}
                      product={prod}
                      category={categories.find((c) => c.id === prod.categoryId)}
                      availabilityList={availability}
                      onSelect={setSelectedProduct}
                      onQuickAdd={handleQuickAdd}
                    />
                  ))}
                </div>
                {filteredProducts.length > menuLimit && (
                  <div className="mt-8 text-center">
                    <button
                      type="button"
                      onClick={() => setMenuLimit((n) => n + 9)}
                      className="rounded-xl border border-neutral-300 bg-white px-6 py-2.5 text-sm font-semibold text-[#171717] hover:bg-neutral-50"
                    >
                      Load More Dishes ({filteredProducts.length - menuLimit} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ================= TABLE RESERVATION PAGE ================= */}
        {activeTab === 'reserve' && (
          <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 lg:col-span-7">
                <h1 className="font-display text-2xl font-bold text-[#171717]">
                  Reserve a Table
                </h1>
                <p className="mt-1 text-sm text-neutral-500">
                  Live table availability check prevents conflicting reservations
                </p>

                <form onSubmit={handleReservationSubmit} className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold text-[#171717]">Date</label>
                      <input
                        type="date"
                        min={getDhakaDateString()}
                        value={resDate}
                        onChange={(e) => setResDate(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[#171717]">Time Slot</label>
                      <select
                        value={resTime}
                        onChange={(e) => setResTime(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
                      >
                        {TIME_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>
                            {slot}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[#171717]">Guests</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={resGuests}
                        onChange={(e) => setResGuests(Number(e.target.value) || 2)}
                        className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm tabular-nums focus:border-[#F97316] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#171717]">
                      Available Tables for {resGuests} Guests ({availableTablesForSlot.length} open)
                    </label>
                    {availableTablesForSlot.length === 0 ? (
                      <p className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-[#DC2626]">
                        No tables open for this slot. Try another time or smaller party size.
                      </p>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {availableTablesForSlot.map((table) => {
                          const selected =
                            resSelectedTableId === table.id ||
                            (!resSelectedTableId && availableTablesForSlot[0]?.id === table.id);
                          return (
                            <button
                              key={table.id}
                              type="button"
                              onClick={() => setResSelectedTableId(table.id)}
                              className={`rounded-xl border p-3 text-left text-xs transition-colors ${
                                selected
                                  ? 'border-[#F97316] bg-orange-50 text-[#171717]'
                                  : 'border-neutral-200 hover:bg-neutral-50'
                              }`}
                            >
                              <p className="font-display font-bold">{table.name}</p>
                              <p className="mt-0.5 text-neutral-500">
                                {table.capacity} seats · {table.zone || 'Main Hall'}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-[#171717]">Your Name</label>
                      <input
                        type="text"
                        required
                        value={resName}
                        onChange={(e) => setResName(e.target.value)}
                        placeholder="Full name"
                        className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[#171717]">Phone Number</label>
                      <input
                        type="tel"
                        required
                        value={resPhone}
                        onChange={(e) => setResPhone(e.target.value)}
                        placeholder="+880 17XX-XXXXXX"
                        className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#171717]">
                      Special Requests (Optional)
                    </label>
                    <input
                      type="text"
                      value={resNotes}
                      onChange={(e) => setResNotes(e.target.value)}
                      placeholder="Birthday setup, baby chair, quiet corner..."
                      className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-[#F97316] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resSubmitting || availableTablesForSlot.length === 0}
                    className="min-h-[46px] w-full rounded-xl bg-[#F97316] px-5 py-3 text-sm font-semibold text-white hover:bg-[#EA580C] disabled:bg-neutral-300"
                  >
                    {resSubmitting
                      ? 'Submitting Booking...'
                      : user
                        ? 'Confirm Table Reservation'
                        : 'Sign In with Google to Book'}
                  </button>
                </form>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-6 lg:col-span-5">
                <h2 className="font-display text-lg font-bold text-[#171717]">
                  Your Reservations
                </h2>
                {!user ? (
                  <p className="mt-3 text-sm text-neutral-500">
                    Sign in to view and manage your table bookings.
                  </p>
                ) : reservations.length === 0 ? (
                  <p className="mt-3 text-sm text-neutral-500">No table reservations yet.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {reservations.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-neutral-200 bg-[#F8FAFC] p-3.5 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold">
                            Table {r.tableNumber} · {r.guestCount} Guests
                          </span>
                          <span
                            className={`text-xs font-semibold capitalize ${
                              r.status === 'confirmed'
                                ? 'text-[#16A34A]'
                                : r.status === 'cancelled' || r.status === 'rejected'
                                  ? 'text-[#DC2626]'
                                  : 'text-[#F97316]'
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-neutral-600 tabular-nums">
                          {r.date} · {r.timeSlot}
                        </p>
                        {(r.status === 'pending' || r.status === 'confirmed') && (
                          <button
                            type="button"
                            onClick={() => void cancelReservation(r.id)}
                            className="mt-2 text-xs font-semibold text-[#DC2626] hover:underline"
                          >
                            Cancel Booking
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ================= ORDER TRACKING PAGE ================= */}
        {activeTab === 'track' && (
          <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
            <h1 className="font-display text-2xl font-bold text-[#171717]">
              Live Order Tracking
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Real-time kitchen & delivery updates
            </p>

            {!user ? (
              <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-8 text-center">
                <p className="text-sm text-neutral-600">
                  Sign in with Google to view real-time progress for your orders.
                </p>
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#171717] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#F97316]"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in with Google
                </button>
              </div>
            ) : !activeOrder ? (
              <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-10 text-center">
                <Package className="mx-auto h-10 w-10 text-neutral-300" />
                <p className="mt-3 font-display text-lg font-bold text-[#171717]">
                  No active orders yet
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('menu')}
                  className="mt-4 rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {orders.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {orders.slice(0, 6).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setTrackedOrderId(o.id)}
                        className={`rounded-xl border px-3.5 py-2 text-xs font-mono font-semibold whitespace-nowrap ${
                          activeOrder.id === o.id
                            ? 'border-[#F97316] bg-orange-50 text-[#171717]'
                            : 'border-neutral-200 bg-white text-neutral-600'
                        }`}
                      >
                        {o.orderNumber} · {o.status.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                )}

                <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-100 pb-4">
                    <div>
                      <p className="font-mono text-xs text-neutral-500">
                        Order {activeOrder.orderNumber} · {activeOrder.orderType.replace(/_/g, ' ')}
                        {activeOrder.tableNumber ? ` · Table ${activeOrder.tableNumber}` : ''}
                      </p>
                      <h2 className="mt-1 font-display text-xl font-bold capitalize text-[#171717]">
                        Status: {activeOrder.status.replace(/_/g, ' ')}
                      </h2>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="text-xs text-neutral-500">
                        Payment: {activeOrder.paymentMethod.toUpperCase()} ({activeOrder.paymentStatus})
                      </p>
                      <p className="font-display text-xl font-bold text-[#F97316]">
                        {formatBDT(activeOrder.totalAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Stepper */}
                  {activeOrder.status === 'cancelled' ? (
                    <div className="my-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-[#DC2626]">
                      This order was cancelled.
                    </div>
                  ) : (
                    <div className="my-6 grid grid-cols-2 gap-3 sm:grid-cols-7">
                      {ORDER_STEPS.map((step, idx) => {
                        const currentIdx = ORDER_STEPS.findIndex(
                          (s) => s.key === activeOrder.status,
                        );
                        const done = idx <= currentIdx;
                        return (
                          <div key={step.key} className="flex flex-col items-center text-center">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                                done
                                  ? 'bg-[#16A34A] text-white'
                                  : 'border border-neutral-200 bg-neutral-100 text-neutral-400'
                              }`}
                            >
                              {done ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                            </div>
                            <span
                              className={`mt-1.5 text-[11px] font-medium ${
                                done ? 'text-[#171717]' : 'text-neutral-400'
                              }`}
                            >
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Items */}
                  <div className="divide-y divide-neutral-100 border-t border-neutral-100 pt-4">
                    {activeOrder.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                        <div>
                          <span className="font-semibold">
                            {item.quantity}× {item.productName}
                          </span>
                          {item.sizeName && (
                            <span className="ml-2 text-xs text-neutral-500">({item.sizeName})</span>
                          )}
                        </div>
                        <span className="tabular-nums font-medium">
                          {formatBDT(item.lineTotal)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {activeOrder.status === 'pending' && (
                    <div className="mt-4 border-t border-neutral-100 pt-4 text-right">
                      <button
                        type="button"
                        onClick={() => void cancelPendingOrder(activeOrder.id)}
                        className="rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-[#DC2626] hover:bg-red-50"
                      >
                        Cancel Pending Order
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================= CUSTOMER ACCOUNT PAGE ================= */}
        {activeTab === 'account' && (
          <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
            {!user ? (
              <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#F97316]">
                  <UserIcon className="h-7 w-7" />
                </div>
                <h1 className="mt-4 font-display text-2xl font-bold text-[#171717]">
                  Sign in to FoodVista
                </h1>
                <p className="mt-2 text-sm text-neutral-500">
                  Manage your delivery addresses, track orders in real time, book tables, and share
                  dish reviews.
                </p>
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="mt-6 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#171717] px-5 py-3 text-sm font-semibold text-white hover:bg-[#F97316]"
                >
                  <LogIn className="h-4 w-4" />
                  Continue with Google
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
                  <div>
                    <h1 className="font-display text-2xl font-bold text-[#171717]">
                      {user.displayName || 'FoodVista Guest'}
                    </h1>
                    <p className="text-sm text-neutral-500">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <PWAInstallButton />
                    {(isAdmin || staffRole) && (
                      <button
                        type="button"
                        onClick={onOpenAdmin}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#F97316] px-4 py-2 text-xs font-semibold text-white hover:bg-[#EA580C]"
                      >
                        <Shield className="h-4 w-4" />
                        Open Admin Dashboard
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={logout}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Profile Edit */}
                  <form
                    onSubmit={handleSaveProfile}
                    className="rounded-2xl border border-neutral-200 bg-white p-6"
                  >
                    <h2 className="font-display text-lg font-bold text-[#171717]">
                      Profile Details
                    </h2>
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-neutral-700">Full Name</label>
                        <input
                          type="text"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-neutral-700">Phone</label>
                        <input
                          type="tel"
                          value={profilePhone}
                          onChange={(e) => setProfilePhone(e.target.value)}
                          placeholder="+880 17XX-XXXXXX"
                          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-neutral-700">
                          Default Delivery Address
                        </label>
                        <input
                          type="text"
                          value={profileAddr}
                          onChange={(e) => setProfileAddr(e.target.value)}
                          placeholder="House, Road, Block, Dhaka"
                          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        className="rounded-xl bg-[#171717] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#F97316]"
                      >
                        Save Profile
                      </button>
                    </div>
                  </form>

                  {/* Saved Addresses */}
                  <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <h2 className="font-display text-lg font-bold text-[#171717]">
                      Saved Delivery Addresses
                    </h2>
                    <div className="mt-3 space-y-2">
                      {addresses.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-[#F8FAFC] px-3.5 py-2.5 text-xs"
                        >
                          <div>
                            <p className="font-bold text-[#171717]">
                              {a.label} · {a.area}
                            </p>
                            <p className="text-neutral-600">{a.streetAddress}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteCustomerAddress(user.uid, a.id)}
                            className="text-neutral-400 hover:text-[#DC2626]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={handleAddAddress} className="mt-4 grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newAddrLabel}
                        onChange={(e) => setNewAddrLabel(e.target.value)}
                        placeholder="Label (Home/Office)"
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-xs"
                      />
                      <input
                        type="text"
                        value={newAddrArea}
                        onChange={(e) => setNewAddrArea(e.target.value)}
                        placeholder="Area (Banani)"
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-xs"
                      />
                      <input
                        type="text"
                        value={newAddrStreet}
                        onChange={(e) => setNewAddrStreet(e.target.value)}
                        placeholder="Street & Flat"
                        className="col-span-2 rounded-xl border border-neutral-200 px-3 py-2 text-xs"
                      />
                      <input
                        type="tel"
                        value={newAddrPhone}
                        onChange={(e) => setNewAddrPhone(e.target.value)}
                        placeholder="Recipient Phone"
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-xs"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-[#F97316] px-3 py-2 text-xs font-semibold text-white hover:bg-[#EA580C]"
                      >
                        Add Address
                      </button>
                    </form>
                  </div>
                </div>

                {/* Order History & Write Review */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <h2 className="font-display text-lg font-bold text-[#171717]">
                      Order History ({orders.length})
                    </h2>
                    <div className="mt-4 space-y-3">
                      {orders.slice(0, 6).map((o) => (
                        <div
                          key={o.id}
                          className="flex items-center justify-between rounded-xl border border-neutral-200 p-3 text-xs"
                        >
                          <div>
                            <p className="font-mono font-bold text-[#171717]">{o.orderNumber}</p>
                            <p className="text-neutral-500 capitalize">
                              {o.orderType.replace(/_/g, ' ')} · {o.status.replace(/_/g, ' ')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-display font-bold tabular-nums">
                              {formatBDT(o.totalAmount)}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setTrackedOrderId(o.id);
                                setActiveTab('track');
                              }}
                              className="font-semibold text-[#F97316] hover:underline"
                            >
                              Track
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <form
                    onSubmit={handleSubmitReview}
                    className="rounded-2xl border border-neutral-200 bg-white p-6"
                  >
                    <h2 className="font-display text-lg font-bold text-[#171717]">
                      Leave a Review
                    </h2>
                    <div className="mt-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={reviewProductId}
                          onChange={(e) => setReviewProductId(e.target.value)}
                          className="rounded-xl border border-neutral-200 px-3 py-2 text-xs"
                        >
                          <option value="">General Restaurant Experience</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={reviewRating}
                          onChange={(e) => setReviewRating(Number(e.target.value))}
                          className="rounded-xl border border-neutral-200 px-3 py-2 text-xs"
                        >
                          {[5, 4, 3, 2, 1].map((r) => (
                            <option key={r} value={r}>
                              {r} Stars
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        rows={3}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Share how your meal or dine-in visit was..."
                        className="w-full rounded-xl border border-neutral-200 p-3 text-sm"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-[#F97316] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#EA580C]"
                      >
                        Submit Review
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-neutral-200 bg-[#171717] text-neutral-300">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
          <div>
            <p className="font-display text-lg font-bold text-white">
              {settings.restaurantName} ·{' '}
              <span className="text-[#F97316]">{settings.tagline}</span>
            </p>
            <p className="mt-1 text-xs text-neutral-400">{settings.footerText}</p>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs">
            <button
              type="button"
              onClick={() => setLegalModal('terms')}
              className="hover:text-white"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('privacy')}
              className="hover:text-white"
            >
              Privacy Policy
            </button>
            {(isAdmin || staffRole) && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="font-semibold text-[#F97316] hover:underline"
              >
                Staff & Admin Dashboard
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (Compact <= 15% sticky height) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 grid h-14 grid-cols-5 border-t border-neutral-200 bg-white/95 backdrop-blur-md md:hidden">
        {[
          { id: 'home' as const, label: 'Home', icon: Home },
          { id: 'menu' as const, label: 'Menu', icon: UtensilsCrossed },
          { id: 'reserve' as const, label: 'Reserve', icon: Calendar },
          { id: 'track' as const, label: 'Track', icon: Package },
          { id: 'account' as const, label: 'Account', icon: UserIcon },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center text-[10px] font-medium ${
                active ? 'text-[#F97316]' : 'text-neutral-500'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modals & Drawers */}
      <FoodDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      <CartDrawer
        onProceedToCheckout={({ orderType, coupon }) =>
          setCheckoutState({ open: true, orderType, coupon })
        }
      />
      <CheckoutModal
        open={checkoutState.open}
        initialOrderType={checkoutState.orderType}
        initialCoupon={checkoutState.coupon}
        onClose={() => setCheckoutState((prev) => ({ ...prev, open: false }))}
        onOrderCreated={(orderId) => {
          setTrackedOrderId(orderId);
          setActiveTab('track');
        }}
      />

      {legalModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setLegalModal(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#171717]">
                {legalModal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-neutral-600">
              {legalModal === 'terms' ? settings.termsText : settings.privacyText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
