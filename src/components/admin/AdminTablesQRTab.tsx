import React, { useState } from 'react';
import { Download, Plus, Printer, QrCode, RefreshCw, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext.tsx';
import { apiRequest } from '../../services/apiClient.ts';
import { makeDocId, saveTable, updateTableStatus } from '../../services/firestoreService.ts';
import type { RestaurantTable, TableStatus } from '../../shared/types.ts';

export const AdminTablesQRTab: React.FC = () => {
  const { tables, orders, showToast } = useApp();

  const [tableNumber, setTableNumber] = useState('');
  const [tableName, setTableName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [zone, setZone] = useState('Main Hall');
  const [creating, setCreating] = useState(false);

  const [qrPreview, setQrPreview] = useState<{
    table: RestaurantTable;
    qrDataUrl: string;
    scanUrl: string;
    token: string;
  } | null>(null);

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber.trim()) return;
    setCreating(true);
    try {
      const id = makeDocId('table');
      const signed = await apiRequest<{
        token: string;
        signature: string;
        scanUrl: string;
        qrDataUrl: string;
      }>('/table-qr/sign', {
        method: 'POST',
        body: {
          tableId: id,
          tableNumber: tableNumber.trim(),
          version: 1,
          originUrl: window.location.origin,
        },
      });

      await saveTable(
        {
          tableNumber: tableNumber.trim(),
          name: tableName.trim() || `Table ${tableNumber.trim()}`,
          capacity,
          zone: zone.trim() || 'Main Hall',
          status: 'available',
          isActive: true,
          qrTokenVersion: 1,
          qrSignature: signed.signature,
          activeOrderId: null,
        },
        id,
      );

      setTableNumber('');
      setTableName('');
      showToast(`Created Table ${tableNumber} with signed QR code.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create table', 'error');
    } finally {
      setCreating(false);
    }
  };

  const openQrModal = async (table: RestaurantTable, regenerate = false) => {
    try {
      const nextVersion = regenerate ? table.qrTokenVersion + 1 : table.qrTokenVersion;
      const signed = await apiRequest<{
        token: string;
        signature: string;
        scanUrl: string;
        qrDataUrl: string;
      }>('/table-qr/sign', {
        method: 'POST',
        body: {
          tableId: table.id,
          tableNumber: table.tableNumber,
          version: nextVersion,
          originUrl: window.location.origin,
        },
      });

      if (regenerate || signed.signature !== table.qrSignature) {
        await saveTable(
          {
            tableNumber: table.tableNumber,
            name: table.name,
            capacity: table.capacity,
            zone: table.zone || 'Main Hall',
            status: table.status,
            isActive: table.isActive,
            qrTokenVersion: nextVersion,
            qrSignature: signed.signature,
            activeOrderId: table.activeOrderId || null,
          },
          table.id,
        );
      }

      setQrPreview({
        table: { ...table, qrTokenVersion: nextVersion, qrSignature: signed.signature },
        qrDataUrl: signed.qrDataUrl,
        scanUrl: signed.scanUrl,
        token: signed.token,
      });

      if (regenerate) {
        showToast(
          `Previous QR revoked. Generated v${nextVersion} for ${table.name}.`,
          'success',
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to generate QR', 'error');
    }
  };

  const toggleActive = async (table: RestaurantTable) => {
    await saveTable(
      {
        tableNumber: table.tableNumber,
        name: table.name,
        capacity: table.capacity,
        zone: table.zone || 'Main Hall',
        status: table.isActive ? 'inactive' : 'available',
        isActive: !table.isActive,
        qrTokenVersion: table.qrTokenVersion,
        qrSignature: table.qrSignature,
        activeOrderId: table.activeOrderId || null,
      },
      table.id,
    );
    showToast(`${table.name} ${table.isActive ? 'deactivated' : 'activated'}.`, 'info');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#171717]">
          Tables & QR Ordering
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cryptographically signed table QR codes with instant revocation and occupancy tracking
        </p>
      </div>

      {/* Add Table Form */}
      <form
        onSubmit={handleCreateTable}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-neutral-200 bg-white p-5 sm:grid-cols-5"
      >
        <input
          type="text"
          required
          value={tableNumber}
          onChange={(e) => setTableNumber(e.target.value)}
          placeholder="Table # (e.g. 07)"
          className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          placeholder="Label (e.g. Table 07)"
          className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={1}
          max={24}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value) || 4)}
          placeholder="Seats"
          className="rounded-xl border border-neutral-200 px-3 py-2 text-sm tabular-nums"
        />
        <input
          type="text"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          placeholder="Zone (Main Hall)"
          className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#F97316] px-4 py-2 text-xs font-semibold text-white hover:bg-[#EA580C]"
        >
          <Plus className="h-4 w-4" />
          Add Table + QR
        </button>
      </form>

      {/* Table Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((table) => {
          const activeOrders = orders.filter(
            (o) =>
              o.tableId === table.id &&
              o.status !== 'completed' &&
              o.status !== 'cancelled',
          );
          return (
            <div
              key={table.id}
              className="flex flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-5"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-neutral-500">
                      {table.zone || 'Main Hall'} · {table.capacity} Seats · QR v
                      {table.qrTokenVersion}
                    </p>
                    <h3 className="mt-0.5 font-display text-lg font-bold text-[#171717]">
                      {table.name}
                    </h3>
                  </div>
                  <select
                    value={table.status}
                    onChange={(e) =>
                      void updateTableStatus(table.id, e.target.value as TableStatus, null)
                    }
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${
                      table.status === 'available'
                        ? 'border-green-200 bg-green-50 text-[#16A34A]'
                        : table.status === 'occupied'
                          ? 'border-orange-200 bg-orange-50 text-[#F97316]'
                          : 'border-neutral-200 bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    <option value="available">Available</option>
                    <option value="occupied">Occupied</option>
                    <option value="reserved">Reserved</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                {activeOrders.length > 0 && (
                  <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-[#171717]">
                    Active Dine-in Orders:{' '}
                    <strong className="font-mono">
                      {activeOrders.map((o) => o.orderNumber).join(', ')}
                    </strong>
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
                <button
                  type="button"
                  onClick={() => void openQrModal(table, false)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#171717] px-3 py-2 text-xs font-semibold text-white hover:bg-[#F97316]"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  View / Print QR
                </button>
                <button
                  type="button"
                  onClick={() => void openQrModal(table, true)}
                  title="Revoke previous QR and generate new token"
                  className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Revoke
                </button>
                <button
                  type="button"
                  onClick={() => void toggleActive(table)}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                >
                  {table.isActive ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* QR Code Download & Print Modal */}
      {qrPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setQrPreview(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between no-print">
              <h3 className="font-display text-lg font-bold text-[#171717]">
                {qrPreview.table.name} · Table QR
              </h3>
              <button
                type="button"
                onClick={() => setQrPreview(null)}
                className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border-2 border-[#171717] p-6">
              <p className="font-display text-xl font-extrabold text-[#171717]">
                FoodVista <span className="text-[#F97316]">·</span> {qrPreview.table.name}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Scan to browse menu & order directly to your table
              </p>
              <img
                src={qrPreview.qrDataUrl}
                alt={`QR Code for ${qrPreview.table.name}`}
                className="mx-auto mt-4 h-56 w-56 rounded-xl border border-neutral-200"
              />
              <p className="mt-3 break-all font-mono text-[10px] text-neutral-500">
                Token v{qrPreview.table.qrTokenVersion}: {qrPreview.token}
              </p>
            </div>

            <div className="mt-5 flex gap-2 no-print">
              <a
                href={qrPreview.qrDataUrl}
                download={`foodvista-${qrPreview.table.tableNumber}-qr.png`}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#F97316] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#EA580C]"
              >
                <Download className="h-4 w-4" />
                Download PNG
              </a>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#171717] px-4 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                <Printer className="h-4 w-4" />
                Print QR Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
