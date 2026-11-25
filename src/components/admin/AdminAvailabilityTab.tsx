import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Search, XCircle } from 'lucide-react';
import { useApp } from '../../contexts/AppContext.tsx';
import { upsertBulkAvailability } from '../../services/firestoreService.ts';
import { checkProductAvailability } from '../../shared/availability.ts';
import { getDhakaDateString } from '../../shared/timezone.ts';
import { FoodImage } from '../FoodImage.tsx';

export const AdminAvailabilityTab: React.FC = () => {
  const { products, categories, availability, showToast } = useApp();

  const [selectedDate, setSelectedDate] = useState(getDhakaDateString());
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'available' | 'unavailable'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customMessage, setCustomMessage] = useState('আজ এই খাবারটি পাওয়া যাচ্ছে না।');
  const [openTime, setOpenTime] = useState('11:00');
  const [closeTime, setCloseTime] = useState('23:30');
  const [saving, setSaving] = useState(false);

  const itemsWithStatus = useMemo(() => {
    return products
      .filter((p) => !p.isDeleted)
      .map((product) => {
        const record = availability.find(
          (a) => a.productId === product.id && a.date === selectedDate,
        );
        const evalRes = checkProductAvailability(product, availability, selectedDate, '14:00');
        return {
          product,
          record,
          isAvailable: record ? record.isAvailable : evalRes.available,
          message: record?.unavailableMessage || '',
          openTime: record?.openTime || '11:00',
          closeTime: record?.closeTime || '23:30',
        };
      });
  }, [products, availability, selectedDate]);

  const filtered = useMemo(() => {
    return itemsWithStatus.filter((row) => {
      if (filterMode === 'available' && !row.isAvailable) return false;
      if (filterMode === 'unavailable' && row.isAvailable) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!row.product.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [itemsWithStatus, filterMode, search]);

  const availableCount = itemsWithStatus.filter((r) => r.isAvailable).length;
  const unavailableCount = itemsWithStatus.length - availableCount;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((r) => r.product.id));
    }
  };

  const applyBulk = async (isAvailable: boolean, targetIds?: string[], msgOverride?: string) => {
    const ids = targetIds || selectedIds;
    if (ids.length === 0) {
      showToast('Select at least one food item first.', 'info');
      return;
    }
    setSaving(true);
    try {
      await upsertBulkAvailability({
        productIds: ids,
        date: selectedDate,
        isAvailable,
        unavailableMessage: isAvailable ? '' : msgOverride ?? customMessage,
        openTime,
        closeTime,
      });
      if (!targetIds) setSelectedIds([]);
      showToast(
        `Updated ${ids.length} item(s) as ${isAvailable ? 'Available' : 'Unavailable'} for ${selectedDate}.`,
        'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update availability', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#171717]">
            Daily Food Availability
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage daily availability in Asia/Dhaka timezone without deleting menu items
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 tabular-nums">
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs">
            <span className="text-neutral-500">Available: </span>
            <strong className="text-[#16A34A]">{availableCount}</strong>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs">
            <span className="text-neutral-500">Unavailable: </span>
            <strong className="text-[#DC2626]">{unavailableCount}</strong>
          </div>
        </div>
      </div>

      {/* Controls & Bulk Action Panel */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#171717]">
              <Calendar className="h-3.5 w-3.5 text-[#F97316]" />
              Availability Date (Dhaka)
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm tabular-nums focus:border-[#F97316] focus:outline-none"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#171717]">
              <Clock className="h-3.5 w-3.5 text-[#F97316]" />
              Daily Open / Close Window
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="time"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-2.5 py-2 text-xs tabular-nums"
              />
              <span className="text-xs text-neutral-400">to</span>
              <input
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-2.5 py-2 text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-[#171717]">
              Custom Unavailable Message (Bangla / English)
            </label>
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="e.g. আজ Beef Burger পাওয়া যাচ্ছে না।"
              className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3.5 py-2 text-sm focus:border-[#F97316] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search food..."
                className="rounded-xl border border-neutral-200 py-2 pl-9 pr-3 text-xs focus:border-[#F97316] focus:outline-none"
              />
            </div>
            {(['all', 'available', 'unavailable'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setFilterMode(m)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold capitalize ${
                  filterMode === m
                    ? 'bg-[#171717] text-white'
                    : 'border border-neutral-200 bg-white text-neutral-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving || selectedIds.length === 0}
              onClick={() => void applyBulk(true)}
              className="rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
            >
              Mark Selected Available ({selectedIds.length})
            </button>
            <button
              type="button"
              disabled={saving || selectedIds.length === 0}
              onClick={() => void applyBulk(false)}
              className="rounded-xl bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              Mark Selected Unavailable ({selectedIds.length})
            </button>
          </div>
        </div>
      </div>

      {/* Availability Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-[#F8FAFC] text-xs font-semibold text-neutral-600">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all items"
                  />
                </th>
                <th className="px-4 py-3">Food Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status ({selectedDate})</th>
                <th className="px-4 py-3">Unavailable Message</th>
                <th className="px-4 py-3 text-right">Quick Toggle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map(({ product, isAvailable, message, openTime: ot, closeTime: ct }) => {
                const cat = categories.find((c) => c.id === product.categoryId);
                return (
                  <tr key={product.id} className="hover:bg-neutral-50/70">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => toggleSelect(product.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FoodImage
                          src={product.images[0]}
                          alt={product.name}
                          className="h-10 w-12 shrink-0 rounded-lg object-cover"
                        />
                        <div>
                          <p className="font-semibold text-[#171717]">{product.name}</p>
                          <p className="text-xs text-neutral-500 tabular-nums">
                            {ot} – {ct}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">{cat?.name || 'Menu'}</td>
                    <td className="px-4 py-3">
                      {isAvailable ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16A34A]">
                          <CheckCircle2 className="h-4 w-4" />
                          Available
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC2626]">
                          <XCircle className="h-4 w-4" />
                          Unavailable
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-neutral-600">
                      {isAvailable ? '—' : message || 'Unavailable today'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void applyBulk(
                            !isAvailable,
                            [product.id],
                            isAvailable
                              ? customMessage || `আজ ${product.name} পাওয়া যাচ্ছে না।`
                              : '',
                          )
                        }
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isAvailable
                            ? 'border border-red-200 text-[#DC2626] hover:bg-red-50'
                            : 'border border-green-200 text-[#16A34A] hover:bg-green-50'
                        }`}
                      >
                        {isAvailable ? 'Set Unavailable' : 'Set Available'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
