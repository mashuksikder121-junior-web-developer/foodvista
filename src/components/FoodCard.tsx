import React from 'react';
import { AlertCircle, Plus } from 'lucide-react';
import { checkProductAvailability } from '../shared/availability.ts';
import { formatBDT } from '../shared/timezone.ts';
import type { Category, FoodAvailability, Product } from '../shared/types.ts';
import { FoodImage } from './FoodImage.tsx';

interface FoodCardProps {
  product: Product;
  category?: Category;
  availabilityList: FoodAvailability[];
  onSelect: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
}

export const FoodCard: React.FC<FoodCardProps> = ({
  product,
  category,
  availabilityList,
  onSelect,
  onQuickAdd,
}) => {
  const avail = checkProductAvailability(product, availabilityList);
  const hasDiscount =
    product.discountPrice != null &&
    product.discountPrice >= 0 &&
    product.discountPrice < product.price;
  const activePrice = hasDiscount ? (product.discountPrice as number) : product.price;

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-200 ${
        avail.available
          ? 'border-neutral-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md'
          : 'border-neutral-200 bg-neutral-50/70'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(product)}
        className="relative aspect-[4/3] w-full overflow-hidden bg-[#171717] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
      >
        <FoodImage
          src={product.images[0]}
          alt={product.name}
          className={`h-full w-full object-cover transition-transform duration-300 ${
            avail.available ? 'group-hover:scale-105' : 'grayscale opacity-65'
          }`}
        />
        {!avail.available && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/75 to-transparent p-3 pt-8">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-red-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#DC2626]" />
              Unavailable Today
            </p>
          </div>
        )}
        {avail.available && product.offerLabel && (
          <div className="absolute left-3 top-3 rounded-md bg-[#F97316] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            {product.offerLabel}
          </div>
        )}
      </button>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="truncate">{category?.name || 'Special'}</span>
          {product.prepTimeMins ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums whitespace-nowrap">{product.prepTimeMins} min</span>
            </>
          ) : null}
          {product.isBestSeller && avail.available ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-[#F97316] whitespace-nowrap">Best Seller</span>
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onSelect(product)}
          className="mt-1.5 text-left font-display text-base font-bold text-[#171717] hover:text-[#F97316] transition-colors line-clamp-1"
        >
          {product.name}
        </button>

        <p className="mt-1 text-sm leading-relaxed text-neutral-600 line-clamp-2">
          {product.description}
        </p>

        {!avail.available && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-[#DC2626]">
            {avail.message}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="font-display text-lg font-bold text-[#171717]">
              {formatBDT(activePrice)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-neutral-400 line-through">
                {formatBDT(product.price)}
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={!avail.available}
            onClick={() => (avail.available ? onQuickAdd(product) : undefined)}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              avail.available
                ? 'bg-[#171717] text-white hover:bg-[#F97316]'
                : 'cursor-not-allowed bg-neutral-200 text-neutral-500'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            {avail.available ? 'Add to Cart' : 'Unavailable'}
          </button>
        </div>
      </div>
    </article>
  );
};
