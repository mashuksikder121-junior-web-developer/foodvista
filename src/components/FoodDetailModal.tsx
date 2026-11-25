import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, Image as ImageIcon, Minus, Plus, ShoppingBag, Video, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext.tsx';
import { checkProductAvailability } from '../shared/availability.ts';
import { calculateItemUnitPrice } from '../shared/pricing.ts';
import { formatBDT } from '../shared/timezone.ts';
import type { Product, ProductAddon } from '../shared/types.ts';
import { FoodImage } from './FoodImage.tsx';

interface FoodDetailModalProps {
  product: Product | null;
  onClose: () => void;
}

export const FoodDetailModal: React.FC<FoodDetailModalProps> = ({ product, onClose }) => {
  const { availability, categories, addToCart, t } = useApp();
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [mediaMode, setMediaMode] = useState<'photos' | 'video'>('photos');
  const [selectedSize, setSelectedSize] = useState<string | undefined>(
    product?.sizes?.[0]?.name,
  );
  const [selectedAddons, setSelectedAddons] = useState<ProductAddon[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState('');

  React.useEffect(() => {
    if (product) {
      setActiveImageIdx(0);
      setMediaMode('photos');
      setSelectedSize(product.sizes?.[0]?.name);
      setSelectedAddons([]);
      setQuantity(1);
      setInstructions('');
    }
  }, [product?.id]);

  const avail = useMemo(
    () => (product ? checkProductAvailability(product, availability) : null),
    [product, availability],
  );

  if (!product || !avail) return null;

  const category = categories.find((c) => c.id === product.categoryId);
  const unitPrice = calculateItemUnitPrice(product, selectedSize, selectedAddons);
  const lineTotal = unitPrice * quantity;
  const hasDiscount =
    product.discountPrice != null && product.discountPrice < product.price;

  const toggleAddon = (addon: ProductAddon) => {
    setSelectedAddons((prev) =>
      prev.some((a) => a.name === addon.name)
        ? prev.filter((a) => a.name !== addon.name)
        : [...prev, addon],
    );
  };

  const handleAdd = () => {
    if (!avail.available) return;
    const sizeObj = (product.sizes || []).find((s) => s.name === selectedSize);
    addToCart({
      product,
      sizeName: selectedSize,
      sizePriceDelta: sizeObj?.priceDelta || 0,
      addons: selectedAddons,
      quantity,
      instructions,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Gallery & Dish Video */}
          <div className="bg-[#171717] p-4 sm:p-5 flex flex-col">
            {product.videoUrl && (
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMediaMode('photos')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mediaMode === 'photos'
                      ? 'bg-[#F97316] text-white'
                      : 'bg-neutral-800 text-neutral-300 hover:text-white'
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t.viewPhotos}
                </button>
                <button
                  type="button"
                  onClick={() => setMediaMode('video')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mediaMode === 'video'
                      ? 'bg-[#F97316] text-white'
                      : 'bg-neutral-800 text-neutral-300 hover:text-white'
                  }`}
                >
                  <Video className="h-3.5 w-3.5" />
                  {t.watchVideo}
                </button>
              </div>
            )}

            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-900">
              {mediaMode === 'video' && product.videoUrl ? (
                <video
                  src={product.videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full rounded-xl object-cover bg-black"
                />
              ) : (
                <FoodImage
                  src={product.images[activeImageIdx] || product.images[0]}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close food details"
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black md:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {mediaMode === 'photos' && product.images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {product.images.map((img, idx) => (
                  <button
                    key={img + idx}
                    type="button"
                    onClick={() => setActiveImageIdx(idx)}
                    className={`h-14 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                      idx === activeImageIdx ? 'border-[#F97316]' : 'border-transparent opacity-60'
                    }`}
                  >
                    <FoodImage src={img} alt={product.name} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contiguous Purchase Module */}
          <div className="flex flex-col p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>{category?.name || 'Menu Item'}</span>
                  {product.prepTimeMins ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{product.prepTimeMins} mins prep</span>
                    </>
                  ) : null}
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold text-[#171717]">
                  {product.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close food details"
                className="hidden h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100 md:flex"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-baseline gap-2.5 tabular-nums">
              <span className="font-display text-2xl font-bold text-[#F97316]">
                {formatBDT(hasDiscount ? (product.discountPrice as number) : product.price)}
              </span>
              {hasDiscount && (
                <span className="text-sm text-neutral-400 line-through">
                  {formatBDT(product.price)}
                </span>
              )}
            </div>

            <p className="mt-3 text-sm leading-relaxed text-neutral-600">{product.description}</p>

            {!avail.available && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-[#DC2626]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{avail.message}</span>
              </div>
            )}

            {/* Sizes */}
            {product.sizes && product.sizes.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold text-[#171717]">{t.selectSize}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {product.sizes.map((size) => {
                    const active = selectedSize === size.name;
                    return (
                      <button
                        key={size.name}
                        type="button"
                        onClick={() => setSelectedSize(size.name)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                          active
                            ? 'border-[#F97316] bg-orange-50 text-[#171717]'
                            : 'border-neutral-200 text-neutral-700 hover:border-neutral-300'
                        }`}
                      >
                        <span className="truncate">{size.name}</span>
                        <span className="tabular-nums text-neutral-500">
                          {size.priceDelta > 0 ? `+${formatBDT(size.priceDelta)}` : 'Included'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Addons */}
            {product.addons && product.addons.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold text-[#171717]">{t.extraIngredients}</p>
                <div className="mt-2 space-y-1.5">
                  {product.addons.map((addon) => {
                    const checked = selectedAddons.some((a) => a.name === addon.name);
                    return (
                      <button
                        key={addon.name}
                        type="button"
                        onClick={() => toggleAddon(addon)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs transition-colors ${
                          checked
                            ? 'border-[#F97316] bg-orange-50 text-[#171717]'
                            : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              checked
                                ? 'border-[#F97316] bg-[#F97316] text-white'
                                : 'border-neutral-300'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          {addon.name}
                        </span>
                        <span className="tabular-nums font-medium text-neutral-600">
                          +{formatBDT(addon.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Kitchen Instructions */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-[#171717]">
                {t.kitchenInstructions}
              </label>
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={140}
                placeholder="e.g. Less spicy, extra mint sauce..."
                className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-[#171717] placeholder:text-neutral-400 focus:border-[#F97316] focus:outline-none"
              />
            </div>

            {/* Qty + Add CTA */}
            <div className="mt-6 flex items-center gap-3 pt-2">
              <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-50 p-1">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-700 hover:bg-white"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-sm font-bold tabular-nums">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(25, q + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-700 hover:bg-white"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                disabled={!avail.available}
                onClick={handleAdd}
                className={`flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors tabular-nums ${
                  avail.available
                    ? 'bg-[#F97316] text-white hover:bg-[#EA580C]'
                    : 'cursor-not-allowed bg-neutral-200 text-neutral-500'
                }`}
              >
                <ShoppingBag className="h-4 w-4" />
                {avail.available ? `${t.addToCart} · ${formatBDT(lineTotal)}` : t.unavailableToday}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
