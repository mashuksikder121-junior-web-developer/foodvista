import React, { useMemo, useState } from 'react';
import { Check, ChefHat, Plus, Printer, Search, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext.tsx';
import {
  recordStockAdjustment,
  saveInventoryItem,
  saveRecipe,
  updateOrderWorkflow,
  updateReservationStatus,
} from '../../services/firestoreService.ts';
import { formatBDT } from '../../shared/timezone.ts';
import type {
  InventoryItem,
  KitchenStatus,
  Order,
  OrderStatus,
  Recipe,
  RecipeIngredient,
  StockMovement,
} from '../../shared/types.ts';

interface OpsProps {
  inventory: InventoryItem[];
  recipes: Recipe[];
  movements: StockMovement[];
}

export const AdminOrdersTab: React.FC<{ recipes: Recipe[] }> = ({ recipes }) => {
  const { orders, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'delivery' | 'pickup' | 'dine_in'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (typeFilter !== 'all' && o.orderType !== typeFilter) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !o.orderNumber.toLowerCase().includes(q) &&
          !o.customerName.toLowerCase().includes(q) &&
          !o.customerPhone.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [orders, typeFilter, statusFilter, search]);

  const handleStatusChange = async (order: Order, nextStatus: OrderStatus) => {
    const kitchenMap: Partial<Record<OrderStatus, KitchenStatus>> = {
      confirmed: 'queued',
      preparing: 'cooking',
      ready: 'ready',
      delivered: 'served',
      completed: 'served',
    };
    await updateOrderWorkflow({
      orderId: order.id,
      status: nextStatus,
      kitchenStatus: kitchenMap[nextStatus] || order.kitchenStatus,
      recipes,
    });
    showToast(`Order ${order.orderNumber} updated to ${nextStatus}.`, 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#171717]">Order Management</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Confirming an order triggers single-pass recipe inventory deduction
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order #, name, phone..."
              className="rounded-xl border border-neutral-200 bg-white py-2 pl-9 pr-3 text-xs"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs"
          >
            <option value="all">All Types</option>
            <option value="delivery">Delivery</option>
            <option value="pickup">Pickup</option>
            <option value="dine_in">Dine-in</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs"
          >
            <option value="all">All Statuses</option>
            {[
              'pending',
              'confirmed',
              'preparing',
              'ready',
              'out_for_delivery',
              'delivered',
              'completed',
              'cancelled',
            ].map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-[#F8FAFC] font-semibold text-neutral-600">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Type / Table</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-neutral-500">
                    No orders found matching filters.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-3 font-mono font-bold text-[#171717]">
                      {order.orderNumber}
                      <p className="font-sans text-[11px] font-normal text-neutral-500">
                        {order.items.length} item(s)
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#171717]">{order.customerName}</p>
                      <p className="text-neutral-500">{order.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {order.orderType.replace(/_/g, ' ')}
                      {order.tableNumber ? ` · Table ${order.tableNumber}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className="uppercase">{order.paymentMethod}</span> ·{' '}
                      <button
                        type="button"
                        onClick={() =>
                          void updateOrderWorkflow({
                            orderId: order.id,
                            paymentStatus: order.paymentStatus === 'paid' ? 'pending' : 'paid',
                          })
                        }
                        className={`font-semibold underline ${
                          order.paymentStatus === 'paid' ? 'text-[#16A34A]' : 'text-[#F97316]'
                        }`}
                      >
                        {order.paymentStatus}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-display font-bold tabular-nums">
                      {formatBDT(order.totalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={order.status}
                        onChange={(e) =>
                          void handleStatusChange(order, e.target.value as OrderStatus)
                        }
                        className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold capitalize"
                      >
                        {[
                          'pending',
                          'confirmed',
                          'preparing',
                          'ready',
                          'out_for_delivery',
                          'delivered',
                          'completed',
                          'cancelled',
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setReceiptOrder(order)}
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-[#171717] hover:bg-neutral-50"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Receipt
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Print Modal */}
      {receiptOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setReceiptOrder(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-dashed border-neutral-300 pb-3">
              <div>
                <h3 className="font-display text-lg font-extrabold">FoodVista Receipt</h3>
                <p className="font-mono text-xs text-neutral-500">{receiptOrder.orderNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="no-print rounded-lg p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-1 text-xs text-neutral-600">
              <p>
                <strong>Customer:</strong> {receiptOrder.customerName} ({receiptOrder.customerPhone})
              </p>
              <p>
                <strong>Type:</strong> {receiptOrder.orderType.replace(/_/g, ' ')}
                {receiptOrder.tableNumber ? ` · Table ${receiptOrder.tableNumber}` : ''}
              </p>
              {receiptOrder.deliveryAddress && (
                <p>
                  <strong>Address:</strong> {receiptOrder.deliveryAddress}
                </p>
              )}
            </div>

            <div className="my-4 divide-y divide-neutral-100 border-y border-dashed border-neutral-300 py-2 text-xs">
              {receiptOrder.items.map((item, i) => (
                <div key={i} className="flex justify-between py-1.5">
                  <span>
                    {item.quantity}× {item.productName}
                  </span>
                  <span className="tabular-nums font-medium">{formatBDT(item.lineTotal)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-xs tabular-nums">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatBDT(receiptOrder.subtotal)}</span>
              </div>
              {receiptOrder.discountAmount > 0 && (
                <div className="flex justify-between text-[#16A34A]">
                  <span>Discount</span>
                  <span>−{formatBDT(receiptOrder.discountAmount)}</span>
                </div>
              )}
              {receiptOrder.deliveryCharge > 0 && (
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span>{formatBDT(receiptOrder.deliveryCharge)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 font-display text-base font-bold text-[#171717]">
                <span>Total</span>
                <span>{formatBDT(receiptOrder.totalAmount)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="no-print mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#171717] py-2.5 text-xs font-semibold text-white hover:bg-[#F97316]"
            >
              <Printer className="h-4 w-4" />
              Print Thermal Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminKDSTab: React.FC<{ recipes: Recipe[] }> = ({ recipes }) => {
  const { orders, showToast } = useApp();

  const activeTickets = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== 'completed' &&
          o.status !== 'cancelled' &&
          o.status !== 'delivered',
      ),
    [orders],
  );

  const advanceKitchen = async (order: Order, kitchenStatus: KitchenStatus) => {
    const orderStatusMap: Record<KitchenStatus, OrderStatus> = {
      queued: 'confirmed',
      cooking: 'preparing',
      ready: 'ready',
      served: order.orderType === 'dine_in' ? 'completed' : 'ready',
    };
    await updateOrderWorkflow({
      orderId: order.id,
      kitchenStatus,
      status: orderStatusMap[kitchenStatus],
      recipes,
    });
    showToast(`${order.orderNumber} marked ${kitchenStatus}.`, 'success');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#171717]">
          Kitchen Display System (KDS)
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Live kitchen ticket queue synced in real time with customer and QR table orders
        </p>
      </div>

      {activeTickets.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
          <ChefHat className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 font-display text-lg font-bold text-[#171717]">
            Kitchen queue is clear
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeTickets.map((ticket) => (
            <div
              key={ticket.id}
              className="flex flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-5"
            >
              <div>
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <div>
                    <span className="font-mono text-sm font-bold text-[#171717]">
                      {ticket.orderNumber}
                    </span>
                    <p className="text-xs font-semibold text-[#F97316]">
                      {ticket.orderType === 'dine_in'
                        ? `Table ${ticket.tableNumber || '?'}`
                        : ticket.orderType.toUpperCase()}
                    </p>
                  </div>
                  <span className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-semibold uppercase text-[#171717]">
                    {ticket.kitchenStatus}
                  </span>
                </div>

                <ul className="mt-3 space-y-2 text-sm">
                  {ticket.items.map((item, i) => (
                    <li key={i} className="border-b border-neutral-50 pb-2">
                      <p className="font-bold text-[#171717]">
                        {item.quantity}× {item.productName}
                      </p>
                      {(item.sizeName || item.addons.length > 0) && (
                        <p className="text-xs text-neutral-500">
                          {[item.sizeName, ...item.addons.map((a) => a.name)]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      )}
                      {item.instructions && (
                        <p className="mt-0.5 text-xs font-medium text-[#DC2626]">
                          Note: {item.instructions}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                {ticket.instructions && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
                    Order Note: {ticket.instructions}
                  </p>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-1.5 pt-3">
                <button
                  type="button"
                  onClick={() => void advanceKitchen(ticket, 'cooking')}
                  className="rounded-xl bg-[#F97316] py-2 text-xs font-semibold text-white hover:bg-[#EA580C]"
                >
                  Cook
                </button>
                <button
                  type="button"
                  onClick={() => void advanceKitchen(ticket, 'ready')}
                  className="rounded-xl bg-[#16A34A] py-2 text-xs font-semibold text-white hover:bg-green-700"
                >
                  Ready
                </button>
                <button
                  type="button"
                  onClick={() => void advanceKitchen(ticket, 'served')}
                  className="rounded-xl bg-[#171717] py-2 text-xs font-semibold text-white hover:bg-neutral-800"
                >
                  Served
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AdminReservationsTab: React.FC = () => {
  const { reservations, showToast } = useApp();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#171717]">
          Reservation Management
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Confirm, reject, or complete customer table bookings
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-[#F8FAFC] font-semibold text-neutral-600">
              <tr>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Date & Slot</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Guests</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {reservations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-500">
                    No reservations found.
                  </td>
                </tr>
              ) : (
                reservations.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#171717]">{r.customerName}</p>
                      <p className="text-neutral-500">{r.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.date} · {r.timeSlot}
                    </td>
                    <td className="px-4 py-3 font-semibold">Table {r.tableNumber}</td>
                    <td className="px-4 py-3 tabular-nums">{r.guestCount}</td>
                    <td className="px-4 py-3 font-semibold capitalize">{r.status}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {r.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              await updateReservationStatus(r.id, 'confirmed');
                              showToast('Reservation confirmed.', 'success');
                            }}
                            className="rounded-lg bg-[#16A34A] px-2.5 py-1 text-white"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await updateReservationStatus(r.id, 'rejected');
                              showToast('Reservation rejected.', 'info');
                            }}
                            className="rounded-lg bg-[#DC2626] px-2.5 py-1 text-white"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {r.status === 'confirmed' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await updateReservationStatus(r.id, 'completed');
                            showToast('Marked seated/completed.', 'success');
                          }}
                          className="rounded-lg bg-[#171717] px-2.5 py-1 text-white"
                        >
                          Complete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const AdminInventoryAndRecipesTab: React.FC<OpsProps> = ({
  inventory,
  recipes,
  movements,
}) => {
  const { products, showToast } = useApp();

  const [name, setName] = useState('');
  const [unit, setUnit] = useState<'kg' | 'g' | 'L' | 'ml' | 'pcs'>('kg');
  const [stock, setStock] = useState(10);
  const [minAlert, setMinAlert] = useState(3);
  const [cost, setCost] = useState(100);
  const [supplier, setSupplier] = useState('');

  // Recipe Builder State
  const [recipeProductId, setRecipeProductId] = useState(products[0]?.id || '');
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);

  React.useEffect(() => {
    const existing = recipes.find((r) => r.productId === recipeProductId);
    setRecipeIngredients(existing ? existing.ingredients : []);
  }, [recipeProductId, recipes]);

  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await saveInventoryItem({
      name: name.trim(),
      unit,
      currentStock: stock,
      minStockAlert: minAlert,
      unitCost: cost,
      supplier: supplier.trim(),
    });
    setName('');
    setSupplier('');
    showToast('Ingredient added to inventory.', 'success');
  };

  const addRecipeRow = () => {
    const firstInv = inventory[0];
    if (!firstInv) return;
    setRecipeIngredients((prev) => [
      ...prev,
      {
        inventoryItemId: firstInv.id,
        ingredientName: firstInv.name,
        quantityRequired: 0.1,
        unit: firstInv.unit,
      },
    ]);
  };

  const handleSaveRecipe = async () => {
    const prod = products.find((p) => p.id === recipeProductId);
    if (!prod) return;
    await saveRecipe({
      productId: prod.id,
      productName: prod.name,
      ingredients: recipeIngredients,
    });
    showToast(`Saved recipe for ${prod.name}.`, 'success');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#171717]">
          Inventory & Recipe Management
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Track ingredient stock, low-stock alerts, purchases, and automatic order recipe deductions
        </p>
      </div>

      {/* Add Ingredient */}
      <form
        onSubmit={handleAddIngredient}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-200 bg-white p-5 sm:grid-cols-6"
      >
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ingredient name"
          className="rounded-xl border border-neutral-200 px-3 py-2 text-xs sm:col-span-2"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as typeof unit)}
          className="rounded-xl border border-neutral-200 px-3 py-2 text-xs"
        >
          {['kg', 'g', 'L', 'ml', 'pcs'].map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.1"
          value={stock}
          onChange={(e) => setStock(Number(e.target.value))}
          placeholder="Stock"
          className="rounded-xl border border-neutral-200 px-3 py-2 text-xs tabular-nums"
        />
        <input
          type="number"
          value={cost}
          onChange={(e) => setCost(Number(e.target.value))}
          placeholder="Unit Cost (৳)"
          className="rounded-xl border border-neutral-200 px-3 py-2 text-xs tabular-nums"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#F97316] px-4 py-2 text-xs font-semibold text-white hover:bg-[#EA580C]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Stock Item
        </button>
      </form>

      {/* Inventory Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-[#F8FAFC] font-semibold text-neutral-600">
              <tr>
                <th className="px-4 py-3">Ingredient</th>
                <th className="px-4 py-3">Current Stock</th>
                <th className="px-4 py-3">Min Alert</th>
                <th className="px-4 py-3">Unit Cost</th>
                <th className="px-4 py-3 text-right">Quick Purchase / Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {inventory.map((item) => {
                const low = item.currentStock <= item.minStockAlert;
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-semibold text-[#171717]">
                      {item.name}
                      {item.supplier && (
                        <p className="font-normal text-neutral-500">{item.supplier}</p>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 font-mono font-bold tabular-nums ${
                        low ? 'text-[#DC2626]' : 'text-[#16A34A]'
                      }`}
                    >
                      {item.currentStock} {item.unit} {low ? '(Low)' : ''}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {item.minStockAlert} {item.unit}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatBDT(item.unitCost)}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() =>
                          void recordStockAdjustment({
                            inventoryItemId: item.id,
                            ingredientName: item.name,
                            type: 'purchase',
                            quantityDelta: 5,
                            note: 'Quick restock purchase (+5)',
                          })
                        }
                        className="rounded-lg bg-[#16A34A] px-2.5 py-1 font-semibold text-white"
                      >
                        +5 Purchase
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void recordStockAdjustment({
                            inventoryItemId: item.id,
                            ingredientName: item.name,
                            type: 'waste',
                            quantityDelta: -1,
                            note: 'Kitchen adjustment (-1)',
                          })
                        }
                        className="rounded-lg border border-neutral-200 px-2.5 py-1 font-semibold text-neutral-700"
                      >
                        −1 Waste
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recipe Builder */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="font-display text-lg font-bold text-[#171717]">Recipe Definition</h2>
          <p className="text-xs text-neutral-500">
            Map ingredients to each food item for automatic order stock deduction
          </p>

          <div className="mt-4 flex gap-2">
            <select
              value={recipeProductId}
              onChange={(e) => setRecipeProductId(e.target.value)}
              className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addRecipeRow}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50"
            >
              + Ingredient
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {recipeIngredients.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={row.inventoryItemId}
                  onChange={(e) => {
                    const inv = inventory.find((i) => i.id === e.target.value);
                    if (!inv) return;
                    setRecipeIngredients((prev) =>
                      prev.map((r, i) =>
                        i === idx
                          ? {
                              ...r,
                              inventoryItemId: inv.id,
                              ingredientName: inv.name,
                              unit: inv.unit,
                            }
                          : r,
                      ),
                    );
                  }}
                  className="flex-1 rounded-xl border border-neutral-200 px-2.5 py-2 text-xs"
                >
                  {inventory.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.unit})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={row.quantityRequired}
                  onChange={(e) =>
                    setRecipeIngredients((prev) =>
                      prev.map((r, i) =>
                        i === idx
                          ? { ...r, quantityRequired: Number(e.target.value) || 0 }
                          : r,
                      ),
                    )
                  }
                  className="w-24 rounded-xl border border-neutral-200 px-2.5 py-2 text-xs tabular-nums"
                />
                <span className="text-xs text-neutral-500">{row.unit}</span>
                <button
                  type="button"
                  onClick={() =>
                    setRecipeIngredients((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="text-neutral-400 hover:text-[#DC2626]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSaveRecipe}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#171717] px-4 py-2 text-xs font-semibold text-white hover:bg-[#F97316]"
          >
            <Check className="h-3.5 w-3.5" />
            Save Recipe
          </button>
        </div>

        {/* Stock History */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="font-display text-lg font-bold text-[#171717]">
            Recent Stock Movements
          </h2>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {movements.length === 0 ? (
              <p className="text-xs text-neutral-500">No stock movements recorded yet.</p>
            ) : (
              movements.slice(0, 15).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-xl border border-neutral-100 bg-[#F8FAFC] px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-[#171717]">{m.ingredientName}</p>
                    <p className="text-[11px] text-neutral-500">{m.note || m.type}</p>
                  </div>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      m.quantityDelta >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                    }`}
                  >
                    {m.quantityDelta >= 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
