export type Language = 'en' | 'bn';

export interface TranslationSet {
  // Sign-in Gate
  signInBadge: string;
  signInHeading: string;
  signInSubheading: string;
  signUpTab: string;
  signInTab: string;
  nameOptionalLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  signUpCta: string;
  signInPasswordCta: string;
  demoSignUpNote: string;
  orContinueGoogle: string;
  signInGoogleCta: string;
  signInSecurityNote: string;
  signInHighlight1: string;
  signInHighlight2: string;
  signInHighlight3: string;
  signInHighlight4: string;
  // Navigation & Top bar
  navHome: string;
  navMenu: string;
  navReserve: string;
  navTrack: string;
  navAccount: string;
  navSignIn: string;
  cartLabel: string;
  openDashboard: string;
  replayWelcome: string;
  // Hero & Home
  exploreMenu: string;
  reserveTable: string;
  searchPlaceholder: string;
  findFood: string;
  browseCategories: string;
  categoriesSubtitle: string;
  viewFullMenu: string;
  popularDishes: string;
  popularSubtitle: string;
  allItems: string;
  specialOffersTitle: string;
  guestReviewsTitle: string;
  visitKitchen: string;
  openingHoursLabel: string;
  addressLabel: string;
  phoneLabel: string;
  // Menu & Food Card/Modal
  allCategories: string;
  allPrices: string;
  availableOnly: string;
  addToCart: string;
  unavailable: string;
  unavailableToday: string;
  watchVideo: string;
  viewPhotos: string;
  selectSize: string;
  extraIngredients: string;
  kitchenInstructions: string;
  // Cart & Checkout
  yourOrder: string;
  emptyCartTitle: string;
  emptyCartDesc: string;
  delivery: string;
  pickup: string;
  dineIn: string;
  subtotal: string;
  discount: string;
  deliveryCharge: string;
  freeLabel: string;
  totalLabel: string;
  proceedCheckout: string;
  checkoutTitle: string;
  paymentChoiceLabel: string;
  payCashTitle: string;
  payCashDesc: string;
  payOnlineTitle: string;
  payOnlineDesc: string;
  placeOrder: string;
  // Track & Reservations & Account
  trackTitle: string;
  noOrdersYet: string;
  browseMenuBtn: string;
  reserveTitle: string;
  confirmReservation: string;
  signOut: string;
  // Admin
  adminConsole: string;
  backToStorefront: string;
}

export const TRANSLATIONS: Record<Language, TranslationSet> = {
  en: {
    signInBadge: 'Welcome to FoodVista Bangladesh',
    signInHeading: 'Freshly Crafted Flavors, Ready to Order',
    signInSubheading:
      'Create an instant demo account with any email and password (no email verification needed). Returning users sign in with the same password.',
    signUpTab: 'Demo Sign Up',
    signInTab: 'Sign In',
    nameOptionalLabel: 'Your Name (Optional)',
    namePlaceholder: 'e.g. Tariq Hasan',
    emailLabel: 'Email Address',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Create or enter your password',
    signUpCta: 'Sign Up & Enter FoodVista',
    signInPasswordCta: 'Sign In with Password',
    demoSignUpNote: 'Instant entry with any email & password · Returning login checks this password',
    orContinueGoogle: 'Or continue with Google',
    signInGoogleCta: 'Sign in with Google',
    signInSecurityNote: 'No email verification required · Instant audio welcome on entry',
    signInHighlight1: 'Home Delivery & Cash on Delivery',
    signInHighlight2: 'Instant Online bKash / Nagad / Card Pay',
    signInHighlight3: 'Live Dish Photos & Cooking Videos',
    signInHighlight4: 'QR Table Ordering & Reservations',
    navHome: 'Home',
    navMenu: 'Menu',
    navReserve: 'Reserve',
    navTrack: 'Track Order',
    navAccount: 'Account',
    navSignIn: 'Sign In',
    cartLabel: 'Cart',
    openDashboard: 'Open Staff Console',
    replayWelcome: 'Welcome Audio',
    exploreMenu: 'Explore Full Menu',
    reserveTable: 'Reserve a Table',
    searchPlaceholder: 'Search Kacchi biryani, burgers, pasta...',
    findFood: 'Find Food',
    browseCategories: 'Browse by Category',
    categoriesSubtitle: 'Freshly prepared to order across five signature kitchens',
    viewFullMenu: 'View Full Menu',
    popularDishes: 'Popular & Best Sellers',
    popularSubtitle: 'Live today from our Dhaka kitchen',
    allItems: 'All Items',
    specialOffersTitle: 'Special Offers & Combo Deals',
    guestReviewsTitle: 'Verified Guest Reviews',
    visitKitchen: 'Visit Our Dhaka Kitchen',
    openingHoursLabel: 'Opening Hours',
    addressLabel: 'Address',
    phoneLabel: 'Hotline',
    allCategories: 'All Categories',
    allPrices: 'All Prices',
    availableOnly: 'Available Today Only',
    addToCart: 'Add to Cart',
    unavailable: 'Unavailable',
    unavailableToday: 'Unavailable Today',
    watchVideo: 'Dish Video',
    viewPhotos: 'Photos',
    selectSize: 'Select Portion Size',
    extraIngredients: 'Extra Ingredients & Sides',
    kitchenInstructions: 'Special Kitchen Instructions',
    yourOrder: 'Your Order',
    emptyCartTitle: 'Your cart is empty',
    emptyCartDesc: 'Explore our freshly grilled burgers, Dhaka Kacchi biryani, and platters.',
    delivery: 'Home Delivery',
    pickup: 'Pickup',
    dineIn: 'Dine-in (QR)',
    subtotal: 'Subtotal',
    discount: 'Discount',
    deliveryCharge: 'Delivery Charge',
    freeLabel: 'Free',
    totalLabel: 'Total',
    proceedCheckout: 'Proceed to Checkout',
    checkoutTitle: 'Checkout',
    paymentChoiceLabel: 'Choose Payment Mode',
    payCashTitle: 'Cash on Delivery / Counter',
    payCashDesc: 'Pay cash in hand when your meal arrives or at pickup.',
    payOnlineTitle: 'Online Transaction (bKash / Nagad / Rocket / Card)',
    payOnlineDesc: 'Pay online right now with verified TrxID confirmation.',
    placeOrder: 'Place Order',
    trackTitle: 'Real-Time Order Tracking',
    noOrdersYet: 'No orders placed yet',
    browseMenuBtn: 'Browse Menu',
    reserveTitle: 'Reserve a Table',
    confirmReservation: 'Confirm Reservation',
    signOut: 'Sign Out',
    adminConsole: 'FoodVista Operations',
    backToStorefront: 'View Storefront',
  },
  bn: {
    signInBadge: 'ফুডভিস্টা বাংলাদেশে স্বাগতম',
    signInHeading: 'টাটকা ও সুস্বাদু খাবার, এখনই অর্ডার করুন',
    signInSubheading:
      'কোনো ইমেইল ভেরিফিকেশন ছাড়াই যেকোনো ইমেইল ও পাসওয়ার্ড দিয়ে তাৎক্ষণিক ডেমো সাইন আপ করুন। পরে আবার ঢুকতে চাইলে সেই পাসওয়ার্ড দিয়েই লগইন করতে হবে।',
    signUpTab: 'ডেমো সাইন আপ',
    signInTab: 'সাইন ইন',
    nameOptionalLabel: 'আপনার নাম (ঐচ্ছিক)',
    namePlaceholder: 'যেমন: তারিক হাসান',
    emailLabel: 'ইমেইল ঠিকানা',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'পাসওয়ার্ড',
    passwordPlaceholder: 'পাসওয়ার্ড লিখুন',
    signUpCta: 'সাইন আপ করে প্রবেশ করুন',
    signInPasswordCta: 'পাসওয়ার্ড দিয়ে সাইন ইন করুন',
    demoSignUpNote: 'যেকোনো ইমেইল ও পাসওয়ার্ডেই সাইন আপ হবে · পরে লগইনে এই পাসওয়ার্ড লাগবে',
    orContinueGoogle: 'অথবা গুগল দিয়ে প্রবেশ করুন',
    signInGoogleCta: 'গুগল দিয়ে সাইন ইন করুন',
    signInSecurityNote: 'ইমেইল ভেরিফিকেশন ছাড়াই প্রবেশ · লগইনে অডিও স্বাগতম',
    signInHighlight1: 'হোম ডেলিভারি ও ক্যাশ অন ডেলিভারি সুবিধা',
    signInHighlight2: 'বিকাশ / নগদ / রকেট / কার্ড অনলাইন পেমেন্ট',
    signInHighlight3: 'প্রতিটি খাবারের ছবি ও ভিডিও দেখার সুবিধা',
    signInHighlight4: 'QR টেবিল অর্ডার ও আগে থেকে টেবিল বুকিং',
    navHome: 'হোম',
    navMenu: 'মেনু',
    navReserve: 'টেবিল বুকিং',
    navTrack: 'অর্ডার ট্র্যাক',
    navAccount: 'অ্যাকাউন্ট',
    navSignIn: 'সাইন ইন',
    cartLabel: 'কার্ট',
    openDashboard: 'স্টাফ কনসোল খুলুন',
    replayWelcome: 'অডিও স্বাগতম',
    exploreMenu: 'সম্পূর্ণ মেনু দেখুন',
    reserveTable: 'টেবিল রিজার্ভ করুন',
    searchPlaceholder: 'কাচ্চি বিরিয়ানি, বার্গার, পাস্তা খুঁজুন...',
    findFood: 'খুঁজুন',
    browseCategories: 'ক্যাটাগরি অনুযায়ী দেখুন',
    categoriesSubtitle: 'আমাদের পাঁচটি স্পেশাল কিচেন থেকে টাটকা খাবার',
    viewFullMenu: 'সব খাবার দেখুন',
    popularDishes: 'জনপ্রিয় ও সেরা খাবার',
    popularSubtitle: 'ঢাকা কিচেন থেকে আজকের লাইভ মেনু',
    allItems: 'সকল আইটেম',
    specialOffersTitle: 'স্পেশাল অফার ও কম্বো ডিল',
    guestReviewsTitle: 'গ্রাহকদের রিভিউ',
    visitKitchen: 'আমাদের ঢাকা রেস্টুরেন্টে আসুন',
    openingHoursLabel: 'খোলার সময়',
    addressLabel: 'ঠিকানা',
    phoneLabel: 'হটলাইন',
    allCategories: 'সকল ক্যাটাগরি',
    allPrices: 'সকল দাম',
    availableOnly: 'শুধু আজ পাওয়া যাচ্ছে',
    addToCart: 'কার্টে যোগ করুন',
    unavailable: 'পাওয়া যাচ্ছে না',
    unavailableToday: 'আজ পাওয়া যাচ্ছে না',
    watchVideo: 'খাবারের ভিডিও',
    viewPhotos: 'ছবি দেখুন',
    selectSize: 'সাইজ নির্বাচন করুন',
    extraIngredients: 'অতিরিক্ত উপকরণ',
    kitchenInstructions: 'কিচেনের জন্য বিশেষ নির্দেশনা',
    yourOrder: 'আপনার অর্ডার',
    emptyCartTitle: 'আপনার কার্ট খালি',
    emptyCartDesc: 'আমাদের গ্রিলড বার্গার, কাচ্চি বিরিয়ানি ও প্ল্যাটার মেনু দেখুন।',
    delivery: 'হোম ডেলিভারি',
    pickup: 'পিকআপ',
    dineIn: 'ডাইন-ইন (QR)',
    subtotal: 'মোট মূল্য',
    discount: 'ডিসকাউন্ট',
    deliveryCharge: 'ডেলিভারি চার্জ',
    freeLabel: 'ফ্রি',
    totalLabel: 'সর্বমোট',
    proceedCheckout: 'চেকআউট করুন',
    checkoutTitle: 'অর্ডার সম্পন্ন করুন',
    paymentChoiceLabel: 'পেমেন্ট মাধ্যম বেছে নিন',
    payCashTitle: 'ক্যাশ অন ডেলিভারি / কাউন্টার',
    payCashDesc: 'খাবার হাতে পাওয়ার পর বা কাউন্টারে নগদ টাকা দিন।',
    payOnlineTitle: 'অনলাইন পেমেন্ট (বিকাশ / নগদ / রকেট / কার্ড)',
    payOnlineDesc: 'এখনই অনলাইনে পেমেন্ট করে TrxID দিয়ে অর্ডার কনফার্ম করুন।',
    placeOrder: 'অর্ডার কনফার্ম করুন',
    trackTitle: 'লাইভ অর্ডার ট্র্যাকিং',
    noOrdersYet: 'এখনো কোনো অর্ডার নেই',
    browseMenuBtn: 'মেনু দেখুন',
    reserveTitle: 'টেবিল বুকিং করুন',
    confirmReservation: 'বুকিং নিশ্চিত করুন',
    signOut: 'সাইন আউট',
    adminConsole: 'ফুডভিস্টা অপারেশনস',
    backToStorefront: 'ওয়েবসাইটে ফিরে যান',
  },
};
