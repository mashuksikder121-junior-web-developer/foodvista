import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  Menu,
  PackageCheck,
  QrCode,
  Settings,
  ShoppingBag,
  Tag,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../../contexts/AppContext.tsx';
import { subscribeAdminCollections } from '../../services/firestoreService.ts';
import { formatBDT } from '../../shared/timezone.ts';
import type {
  AuditLog,
  Coupon,
  Expense,
  InventoryItem,
  Recipe,
  Review,
  StaffMember,
  StockMovement,
} from '../../shared/types.ts';
import { AdminAvailabilityTab } from './AdminAvailabilityTab.tsx';
import {
  AdminCouponsAndReviewsTab,
  AdminCustomersAndStaffTab,
  AdminFoodAndCategoriesTab,
  AdminReportsAndExpensesTab,
  AdminWebsiteSettingsTab,
} from './AdminCatalogAndCMSTabs.tsx';
import {
  AdminInventoryAndRecipesTab,
  AdminKDSTab,
  AdminOrdersTab,
  AdminReservationsTab,
} from './AdminOperationsTabs.tsx';
import { AdminTablesQRTab } from './AdminTablesQRTab.tsx';

type AdminTab =
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

const NAV_ITEMS: { id: AdminTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'availability', label: 'Daily Availability', icon: PackageCheck },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'kds', label: 'Kitchen Display', icon: ChefHat },
  { id: 'tables', label: 'Tables & QR Codes', icon: QrCode },
  { id: 'catalog', label: 'Foods & Categories', icon: Utensils },
  { id: 'reservations', label: 'Reservations', icon: CalendarClock },
  { id: 'inventory', label: 'Inventory & Recipes', icon: ClipboardList },
  { id: 'coupons', label: 'Coupons & Reviews', icon: Tag },
  { id: 'customers', label: 'Customers & Staff', icon: Users },
  { id: 'reports', label: 'Reports & P&L', icon: BarChart3 },
  { id: 'settings', label: 'Website CMS', icon: Settings },
];

export const AdminDashboard: React.FC<{ onBackToPublic: () => void }> = ({
  onBackToPublic,
}) => {
  const { user, isAdmin, orders, reservations, tables, products } = useApp();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [allReviews, setAllReviews] = useState<Review[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const unsubs = subscribeAdminCollections({
      onInventory: setInventory,
      onRecipes: setRecipes,
      onMovements: setMovements,
      onExpenses: setExpenses,
      onCoupons: setCoupons,
      onAllReviews: setAllReviews,
      onStaff: setStaff,
      onAuditLogs: setAuditLogs,
    });
    return () => unsubs.forEach((u) => u());
  }, [user, isAdmin]);

  const metrics = useMemo(() => {
    const valid = orders.filter((o) => o.status !== 'cancelled');
    const revenue = valid.reduce((s, o) => s + o.totalAmount, 0);
    const pendingOrders = orders.filter((o) => o.status === 'pending').length;
    const activeReservations = reservations.filter(
      (r) => r.status === 'pending' || r.status === 'confirmed',
    ).length;
    const availableTables = tables.filter((t) => t.isActive && t.status === 'available').length;
    const occupiedTables = tables.filter((t) => t.isActive && t.status === 'occupied').length;
    const uniqueCustomers = new Set(orders.map((o) => o.userId)).size;

    const itemTally: Record<string, { name: string; qty: number }> = {};
    for (const o of valid) {
      for (const it of o.items) {
        if (!itemTally[it.productId]) {
          itemTally[it.productId] = { name: it.productName, qty: 0 };
        }
        itemTally[it.productId].qty += it.quantity;
      }
    }
    const bestSelling = Object.values(itemTally)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      totalOrders: orders.length,
      revenue,
      pendingOrders,
      activeReservations,
      availableTables,
      occupiedTables,
      uniqueCustomers,
      bestSelling,
    };
  }, [orders, reservations, tables]);

  const dailySalesSeries = useMemo(() => {
    const base = [
      { day: 'Sat', sales: 14200 },
      { day: 'Sun', sales: 18500 },
      { day: 'Mon', sales: 16100 },
      { day: 'Tue', sales: 19800 },
      { day: 'Wed', sales: 22400 },
      { day: 'Thu', sales: 27900 },
      { day: 'Today', sales: Math.max(metrics.revenue, 12500) },
    ];
    return base;
  }, [metrics.revenue]);

  const monthlySalesSeries = useMemo(
    () => [
      { month: 'Jul', revenue: 390000 },
      { month: 'Aug', revenue: 435000 },
      { month: 'Sep', revenue: 468000 },
      { month: 'Oct', revenue: 512000 },
      { month: 'Nov', revenue: 540000 + metrics.revenue },
    ],
    [metrics.revenue],
  );

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-[#171717] text-neutral-300">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
        <span className="font-display text-lg font-extrabold text-white">
          Food<span className="text-[#F97316]">Vista</span> Admin
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-lg p-1 text-neutral-400 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-colors ${
                active
                  ? 'bg-[#F97316] text-white'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-neutral-800 p-4">
        <button
          type="button"
          onClick={onBackToPublic}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-700 px-3 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Public Website
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#171717]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">{renderSidebarContent()}</aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div className="w-64" onClick={(e) => e.stopPropagation()}>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4 sm:px-6 no-print">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-neutral-700 hover:bg-neutral-100 lg:hidden"
              aria-label="Open admin menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-xs font-medium text-neutral-500">
              Admin Console /{' '}
              <strong className="text-[#171717]">
                {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onBackToPublic}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3.5 py-1.5 text-xs font-semibold text-[#171717] hover:bg-neutral-50 whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            View Storefront
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#171717]">
                  Restaurant Overview
                </h1>
                <p className="mt-1 text-sm text-neutral-500">
                  Live operational snapshot across orders, tables, reservations, and sales
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 tabular-nums">
                {[
                  { label: "Total Orders", value: String(metrics.totalOrders), sub: `${metrics.pendingOrders} pending` },
                  { label: 'Gross Revenue', value: formatBDT(metrics.revenue), sub: `${products.length} menu items` },
                  { label: 'Active Reservations', value: String(metrics.activeReservations), sub: `${metrics.uniqueCustomers} customers` },
                  { label: 'Tables Available', value: `${metrics.availableTables} / ${tables.length}`, sub: `${metrics.occupiedTables} occupied` },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-2xl border border-neutral-200 bg-white p-5"
                  >
                    <p className="text-xs text-neutral-500">{kpi.label}</p>
                    <p className="mt-1 font-display text-2xl font-bold text-[#171717]">
                      {kpi.value}
                    </p>
                    <p className="mt-1 text-xs font-medium text-[#F97316]">{kpi.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <h2 className="font-display text-base font-bold text-[#171717]">
                    Daily Sales (৳ BDT)
                  </h2>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailySalesSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="sales"
                          stroke="#F97316"
                          fill="#F97316"
                          fillOpacity={0.18}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <h2 className="font-display text-base font-bold text-[#171717]">
                    Monthly Revenue Trend
                  </h2>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlySalesSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="revenue" fill="#171717" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {metrics.bestSelling.length > 0 && (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <h2 className="font-display text-base font-bold text-[#171717]">
                    Best-Selling Dishes
                  </h2>
                  <div className="mt-3 divide-y divide-neutral-100 text-sm">
                    {metrics.bestSelling.map((b) => (
                      <div key={b.name} className="flex justify-between py-2.5">
                        <span className="font-medium text-[#171717]">{b.name}</span>
                        <span className="font-mono font-bold tabular-nums text-[#F97316]">
                          {b.qty} sold
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'availability' && <AdminAvailabilityTab />}
          {activeTab === 'orders' && <AdminOrdersTab recipes={recipes} />}
          {activeTab === 'kds' && <AdminKDSTab recipes={recipes} />}
          {activeTab === 'tables' && <AdminTablesQRTab />}
          {activeTab === 'catalog' && <AdminFoodAndCategoriesTab />}
          {activeTab === 'reservations' && <AdminReservationsTab />}
          {activeTab === 'inventory' && (
            <AdminInventoryAndRecipesTab
              inventory={inventory}
              recipes={recipes}
              movements={movements}
            />
          )}
          {activeTab === 'coupons' && (
            <AdminCouponsAndReviewsTab coupons={coupons} reviews={allReviews} />
          )}
          {activeTab === 'customers' && <AdminCustomersAndStaffTab staff={staff} />}
          {activeTab === 'reports' && (
            <AdminReportsAndExpensesTab expenses={expenses} inventory={inventory} />
          )}
          {activeTab === 'settings' && <AdminWebsiteSettingsTab auditLogs={auditLogs} />}
        </main>
      </div>
    </div>
  );
};
