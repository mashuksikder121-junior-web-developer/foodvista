import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  Image as ImageIcon,
  MapPin,
  Phone,
  Plus,
  Save,
  Shield,
  Trash2,
  Upload,
  UserX,
  Video,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../../contexts/AppContext.tsx';
import { FOOD_IMAGES } from '../../data/seedDefaults.ts';
import { uploadMediaFile } from '../../services/apiClient.ts';
import {
  createExpense,
  DEFAULT_ROLE_PERMISSIONS,
  deleteCategory,
  deleteCoupon,
  deleteStaffMember,
  fetchRegisteredUsersForAdmin,
  moderateReview,
  saveCategory,
  saveCoupon,
  saveProduct,
  saveStaffMember,
  saveWebsiteSettings,
  softDeleteProduct,
  terminateStaffMember,
} from '../../services/firestoreService.ts';
import { formatBDT, getDhakaDateString } from '../../shared/timezone.ts';
import type {
  AdminTabId,
  AuditLog,
  Category,
  Coupon,
  Expense,
  InventoryItem,
  Product,
  ProductAddon,
  ProductSize,
  Review,
  StaffMember,
  StaffRole,
  WebsiteSetting,
} from '../../shared/types.ts';
import { FoodImage } from '../FoodImage.tsx';

const IMAGE_PRESETS = Object.entries(FOOD_IMAGES).map(([key, url]) => ({
  label: key,
  url,
}));

export const AdminFoodAndCategoriesTab: React.FC = () => {
  const { products, categories, showToast } = useApp();

  // Category Form
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catImg, setCatImg] = useState(FOOD_IMAGES.chickenBurger);
  const [catOrder, setCatOrder] = useState(1);

  // Product Form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodCatId, setProdCatId] = useState(categories[0]?.id || 'cat_burgers');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState(350);
  const [prodDiscount, setProdDiscount] = useState<string>('');
  const [prodImage, setProdImage] = useState(FOOD_IMAGES.chickenBurger);
  const [prodVideoUrl, setProdVideoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [prodOfferLabel, setProdOfferLabel] = useState('');
  const [prodPopular, setProdPopular] = useState(true);
  const [prodBestSeller, setProdBestSeller] = useState(false);
  const [prodSizesText, setProdSizesText] = useState('Regular:0, Large:120');
  const [prodAddonsText, setProdAddonsText] = useState('Extra Cheese:45, Dip:35');

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    const slug = catName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    await saveCategory({
      name: catName.trim(),
      slug: slug || 'category',
      description: catDesc.trim(),
      imageUrl: catImg.trim(),
      displayOrder: catOrder,
      isActive: true,
    });
    setCatName('');
    setCatDesc('');
    showToast('Category saved to live catalog.', 'success');
  };

  const parseSizes = (text: string): ProductSize[] =>
    text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, delta] = part.split(':').map((x) => x.trim());
        return { name: name || 'Regular', priceDelta: Number(delta) || 0 };
      });

  const parseAddons = (text: string): ProductAddon[] =>
    text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, price] = part.split(':').map((x) => x.trim());
        return { name: name || 'Extra', price: Number(price) || 0 };
      });

  const loadProductIntoForm = (p: Product) => {
    setEditingId(p.id);
    setProdName(p.name);
    setProdCatId(p.categoryId);
    setProdDesc(p.description);
    setProdPrice(p.price);
    setProdDiscount(p.discountPrice != null ? String(p.discountPrice) : '');
    setProdImage(p.images[0] || FOOD_IMAGES.chickenBurger);
    setProdVideoUrl(p.videoUrl || '');
    setProdOfferLabel(p.offerLabel || '');
    setProdPopular(Boolean(p.isPopular));
    setProdBestSeller(Boolean(p.isBestSeller));
    setProdSizesText(
      (p.sizes || []).map((s) => `${s.name}:${s.priceDelta}`).join(', ') || 'Regular:0',
    );
    setProdAddonsText(
      (p.addons || []).map((a) => `${a.name}:${a.price}`).join(', '),
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadMediaFile(file);
      setProdImage(uploaded.url);
      showToast('Food photo uploaded successfully.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Photo upload failed.', 'error');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideo(true);
    try {
      const uploaded = await uploadMediaFile(file);
      setProdVideoUrl(uploaded.url);
      showToast('Dish video uploaded and attached.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Video upload failed.', 'error');
    } finally {
      setUploadingVideo(false);
      e.target.value = '';
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) return;
    const slug = prodName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const discountNum = prodDiscount.trim() ? Number(prodDiscount) : null;

    await saveProduct(
      {
        categoryId: prodCatId || categories[0]?.id || 'cat_burgers',
        name: prodName.trim(),
        slug: slug || 'item',
        description: prodDesc.trim(),
        price: Number(prodPrice) || 0,
        discountPrice:
          discountNum !== null && !Number.isNaN(discountNum) && discountNum < prodPrice
            ? discountNum
            : null,
        images: [prodImage.trim() || FOOD_IMAGES.chickenBurger],
        videoUrl: prodVideoUrl.trim(),
        sizes: parseSizes(prodSizesText),
        addons: parseAddons(prodAddonsText),
        isPopular: prodPopular,
        isBestSeller: prodBestSeller,
        isFeatured: prodPopular,
        isOffer: Boolean(prodOfferLabel.trim() || discountNum),
        offerLabel: prodOfferLabel.trim(),
        prepTimeMins: 15,
        isActive: true,
        isDeleted: false,
      },
      editingId || undefined,
    );

    setEditingId(null);
    setProdName('');
    setProdDesc('');
    setProdDiscount('');
    setProdOfferLabel('');
    setProdVideoUrl('');
    showToast('Food item published to live website.', 'success');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#171717]">
          Food & Category Management
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Any change saved here updates the public FoodVista website immediately without code edits
        </p>
      </div>

      {/* Food Editor */}
      <form
        onSubmit={handleSaveProduct}
        className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-[#171717]">
            {editingId ? 'Edit Food Item' : 'Create New Food Item'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setProdName('');
                setProdDesc('');
              }}
              className="text-xs font-semibold text-neutral-500 hover:text-[#171717]"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold">Food Name</label>
            <input
              type="text"
              required
              value={prodName}
              onChange={(e) => setProdName(e.target.value)}
              placeholder="e.g. Smoked Beef Tehari"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Category</label>
            <select
              value={prodCatId}
              onChange={(e) => setProdCatId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold">Offer Badge (Optional)</label>
            <input
              type="text"
              value={prodOfferLabel}
              onChange={(e) => setProdOfferLabel(e.target.value)}
              placeholder="e.g. Chef Special"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="text-xs font-semibold">Regular Price (৳)</label>
            <input
              type="number"
              required
              min={0}
              value={prodPrice}
              onChange={(e) => setProdPrice(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Discount Price (৳)</label>
            <input
              type="number"
              min={0}
              value={prodDiscount}
              onChange={(e) => setProdDiscount(e.target.value)}
              placeholder="Optional"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold">
              <ImageIcon className="h-3.5 w-3.5 text-[#F97316]" />
              Food Photo (Upload from Device, URL, or Preset)
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                type="text"
                value={prodImage}
                onChange={(e) => setProdImage(e.target.value)}
                className="min-w-[160px] flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs"
              />
              <select
                value={prodImage}
                onChange={(e) => setProdImage(e.target.value)}
                className="rounded-xl border border-neutral-200 px-2.5 py-2 text-xs"
              >
                {IMAGE_PRESETS.map((p) => (
                  <option key={p.label} value={p.url}>
                    {p.label}
                  </option>
                ))}
              </select>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#171717] px-3 py-2 text-xs font-semibold text-white hover:bg-[#F97316]">
                <Upload className="h-3.5 w-3.5" />
                {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Dish Video Upload / URL (Visible to Customers inside Dish Details) */}
        <div className="rounded-xl border border-neutral-200 bg-[#F8FAFC] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#171717]">
              <Video className="h-4 w-4 text-[#F97316]" />
              Dish Video (Customers can watch inside Dish Details)
            </label>
            {prodVideoUrl && (
              <button
                type="button"
                onClick={() => setProdVideoUrl('')}
                className="text-xs font-semibold text-[#DC2626] hover:underline"
              >
                Remove Video
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={prodVideoUrl}
              onChange={(e) => setProdVideoUrl(e.target.value)}
              placeholder="Upload MP4/WebM video or paste video URL..."
              className="min-w-[200px] flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs"
            />
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#F97316] px-4 py-2 text-xs font-semibold text-white hover:bg-[#EA580C]">
              <Upload className="h-3.5 w-3.5" />
              {uploadingVideo ? 'Uploading Video...' : 'Upload Video'}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={handleVideoUpload}
                className="hidden"
              />
            </label>
          </div>
          {prodVideoUrl && (
            <video
              src={prodVideoUrl}
              controls
              playsInline
              preload="metadata"
              className="h-40 w-full max-w-sm rounded-xl bg-black object-cover"
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold">Sizes (Name:Delta, comma-separated)</label>
            <input
              type="text"
              value={prodSizesText}
              onChange={(e) => setProdSizesText(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Addons (Name:Price, comma-separated)</label>
            <input
              type="text"
              value={prodAddonsText}
              onChange={(e) => setProdAddonsText(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs font-mono"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold">Description</label>
          <textarea
            rows={2}
            value={prodDesc}
            onChange={(e) => setProdDesc(e.target.value)}
            placeholder="Describe ingredients, preparation, and flavor..."
            className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5 text-xs font-medium">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prodPopular}
                onChange={(e) => setProdPopular(e.target.checked)}
              />
              Popular / Featured
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prodBestSeller}
                onChange={(e) => setProdBestSeller(e.target.checked)}
              />
              Best Seller
            </label>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#F97316] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#EA580C]"
          >
            <Save className="h-4 w-4" />
            {editingId ? 'Update Food Item' : 'Publish Food Item'}
          </button>
        </div>
      </form>

      {/* Catalog List */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-[#F8FAFC] font-semibold text-neutral-600">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {products.map((p) => {
                const cat = categories.find((c) => c.id === p.categoryId);
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FoodImage
                          src={p.images[0]}
                          alt={p.name}
                          className="h-10 w-12 rounded-lg object-cover"
                        />
                        <div>
                          <span className="font-semibold text-[#171717]">{p.name}</span>
                          {p.videoUrl && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#F97316]">
                              <Video className="h-2.5 w-2.5" />
                              Video
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{cat?.name || 'Menu'}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{formatBDT(p.price)}</td>
                    <td className="px-4 py-3 tabular-nums text-[#16A34A]">
                      {p.discountPrice ? formatBDT(p.discountPrice) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => loadProductIntoForm(p)}
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-neutral-700 hover:bg-neutral-50"
                      >
                        <Edit3 className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await softDeleteProduct(p.id, p.name);
                          showToast(`${p.name} archived.`, 'info');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-[#DC2626] hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Management */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleSaveCategory}
          className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3"
        >
          <h2 className="font-display text-lg font-bold text-[#171717]">Add Food Category</h2>
          <input
            type="text"
            required
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="Category Name (e.g. Kebabs & Grills)"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={catDesc}
            onChange={(e) => setCatDesc(e.target.value)}
            placeholder="Short subtitle"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={catOrder}
              onChange={(e) => setCatOrder(Number(e.target.value))}
              className="w-24 rounded-xl border border-neutral-200 px-3 py-2 text-sm tabular-nums"
              placeholder="Order"
            />
            <input
              type="text"
              value={catImg}
              onChange={(e) => setCatImg(e.target.value)}
              className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs"
              placeholder="Image URL"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#171717] px-4 py-2 text-xs font-semibold text-white hover:bg-[#F97316]"
          >
            <Plus className="h-3.5 w-3.5" />
            Save Category
          </button>
        </form>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="font-display text-lg font-bold text-[#171717]">
            Categories ({categories.length})
          </h2>
          <div className="mt-3 space-y-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-neutral-100 bg-[#F8FAFC] px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-mono text-neutral-400 mr-2">#{c.displayOrder}</span>
                  <strong className="text-[#171717]">{c.name}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteCategory(c.id)}
                  className="text-neutral-400 hover:text-[#DC2626]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const AdminCouponsAndReviewsTab: React.FC<{
  coupons: Coupon[];
  reviews: Review[];
}> = ({ coupons, reviews }) => {
  const { showToast } = useApp();
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState(15);
  const [minOrderValue, setMinOrderValue] = useState(500);
  const [maxUses, setMaxUses] = useState(100);
  const [expiresAt, setExpiresAt] = useState('2027-12-31');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    await saveCoupon({
      code: code.trim().toUpperCase(),
      discountType,
      discountValue,
      minOrderValue,
      maxUses,
      usedCount: 0,
      expiresAt,
      isActive: true,
    });
    setCode('');
    showToast('Coupon created.', 'success');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#171717]">
          Coupons & Reviews Moderation
        </h1>
      </div>

      {/* Coupons */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-[#171717]">Discount Coupons</h2>
        <form onSubmit={handleCreateCoupon} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE (EID20)"
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-mono uppercase"
          />
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as typeof discountType)}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs"
          >
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed (৳)</option>
          </select>
          <input
            type="number"
            value={discountValue}
            onChange={(e) => setDiscountValue(Number(e.target.value))}
            placeholder="Value"
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs tabular-nums"
          />
          <input
            type="number"
            value={minOrderValue}
            onChange={(e) => setMinOrderValue(Number(e.target.value))}
            placeholder="Min Order"
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs tabular-nums"
          />
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs"
          />
          <button
            type="submit"
            className="rounded-xl bg-[#F97316] px-4 py-2 text-xs font-semibold text-white hover:bg-[#EA580C]"
          >
            Create Coupon
          </button>
        </form>

        <div className="divide-y divide-neutral-100">
          {coupons.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
              <div>
                <span className="font-mono font-bold text-[#171717]">{c.code}</span> ·{' '}
                <span>
                  {c.discountType === 'percentage'
                    ? `${c.discountValue}% off`
                    : `${formatBDT(c.discountValue)} off`}
                </span>{' '}
                · Min {formatBDT(c.minOrderValue)} · Used {c.usedCount}/{c.maxUses} · Exp {c.expiresAt}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveCoupon({ ...c, isActive: !c.isActive }, c.id)}
                  className={`rounded-lg px-2.5 py-1 font-semibold ${
                    c.isActive
                      ? 'bg-green-50 text-[#16A34A]'
                      : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {c.isActive ? 'Active' : 'Disabled'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteCoupon(c.id)}
                  className="text-neutral-400 hover:text-[#DC2626]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reviews */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-[#171717]">Customer Reviews</h2>
        <div className="space-y-3">
          {reviews.map((rev) => (
            <div
              key={rev.id}
              className="rounded-xl border border-neutral-200 bg-[#F8FAFC] p-4 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#171717]">
                  {rev.authorName} · {rev.rating}/5 ★{' '}
                  {rev.productName ? `(${rev.productName})` : ''}
                </span>
                <span className="font-semibold capitalize text-[#F97316]">{rev.status}</span>
              </div>
              <p className="mt-1.5 text-sm text-neutral-700">{rev.comment}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={replyDrafts[rev.id] ?? rev.adminReply ?? ''}
                  onChange={(e) =>
                    setReplyDrafts((prev) => ({ ...prev, [rev.id]: e.target.value }))
                  }
                  placeholder="Write official restaurant reply..."
                  className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await moderateReview(
                      rev.id,
                      'approved',
                      replyDrafts[rev.id] ?? rev.adminReply ?? '',
                    );
                    showToast('Review approved and published.', 'success');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-3 py-1.5 font-semibold text-white"
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await moderateReview(
                      rev.id,
                      'hidden',
                      replyDrafts[rev.id] ?? rev.adminReply ?? '',
                    );
                    showToast('Review hidden.', 'info');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#DC2626] px-3 py-1.5 font-semibold text-white"
                >
                  <X className="h-3.5 w-3.5" />
                  Hide
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CONTROL_OPTIONS: { id: AdminTabId; label: string }[] = [
  { id: 'overview', label: 'Overview & KPIs' },
  { id: 'availability', label: 'Daily Availability' },
  { id: 'orders', label: 'Orders Management' },
  { id: 'kds', label: 'Kitchen Display (KDS)' },
  { id: 'tables', label: 'Tables & QR Codes' },
  { id: 'catalog', label: 'Foods, Photos & Videos' },
  { id: 'reservations', label: 'Table Reservations' },
  { id: 'inventory', label: 'Inventory & Recipes' },
  { id: 'coupons', label: 'Coupons & Reviews' },
  { id: 'customers', label: 'Customers & Staff' },
  { id: 'reports', label: 'Reports & Expenses' },
  { id: 'settings', label: 'Website CMS' },
];

export const AdminCustomersAndStaffTab: React.FC<{ staff: StaffMember[] }> = ({ staff }) => {
  const { orders, showToast } = useApp();
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [uid, setUid] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [role, setRole] = useState<StaffRole>('chef');
  const [permissions, setPermissions] = useState<AdminTabId[]>(DEFAULT_ROLE_PERMISSIONS.chef);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState<
    Array<{ uid: string; displayName: string; email: string; photoURL: string }>
  >([]);

  useEffect(() => {
    void fetchRegisteredUsersForAdmin().then(setRegisteredUsers);
  }, []);

  const customers = useMemo(() => {
    const map = new Map<
      string,
      { userId: string; name: string; phone: string; orderCount: number; spent: number }
    >();
    for (const o of orders) {
      const existing = map.get(o.userId);
      if (existing) {
        existing.orderCount += 1;
        existing.spent += o.totalAmount;
      } else {
        map.set(o.userId, {
          userId: o.userId,
          name: o.customerName,
          phone: o.customerPhone,
          orderCount: 1,
          spent: o.totalAmount,
        });
      }
    }
    return Array.from(map.values());
  }, [orders]);

  const handleRoleChange = (nextRole: StaffRole) => {
    setRole(nextRole);
    setPermissions(DEFAULT_ROLE_PERMISSIONS[nextRole] || []);
  };

  const togglePermission = (tabId: AdminTabId) => {
    setPermissions((prev) =>
      prev.includes(tabId) ? prev.filter((p) => p !== tabId) : [...prev, tabId],
    );
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const res = await uploadMediaFile(file);
      setPhotoUrl(res.url);
      showToast('Staff photo uploaded.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Photo upload failed.', 'error');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const resetStaffForm = () => {
    setEditingStaffId(null);
    setUid('');
    setEmail('');
    setName('');
    setPhone('');
    setAddress('');
    setPhotoUrl('');
    setRole('chef');
    setPermissions(DEFAULT_ROLE_PERMISSIONS.chef);
  };

  const loadStaffForEdit = (m: StaffMember) => {
    setEditingStaffId(m.id || m.uid || null);
    setUid(m.uid || '');
    setEmail(m.email);
    setName(m.name);
    setPhone(m.phone || '');
    setAddress(m.address || '');
    setPhotoUrl(m.photoUrl || '');
    setRole(m.role);
    setPermissions(
      Array.isArray(m.permissions) && m.permissions.length > 0
        ? m.permissions
        : DEFAULT_ROLE_PERMISSIONS[m.role] || [],
    );
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !phone.trim() || !address.trim()) {
      showToast('Please fill Name, Phone, Email, and Address.', 'error');
      return;
    }
    if (permissions.length === 0) {
      showToast('Assign at least one web control permission to this staff member.', 'error');
      return;
    }
    await saveStaffMember({
      id: editingStaffId || undefined,
      uid: uid.trim(),
      email: email.trim().toLowerCase(),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      photoUrl: photoUrl.trim(),
      role,
      status: 'active',
      permissions,
      isActive: true,
    });
    resetStaffForm();
    showToast('Staff profile & controls saved.', 'success');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#171717]">
          Staff Registration, Access Controls & Customers
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Register staff with photo, contact details, designation, and exact module permissions — or
          dismiss terminated staff anytime
        </p>
      </div>

      {/* Staff Registration & Granular Permissions */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-[#171717]">
            {editingStaffId ? 'Edit Staff Member & Controls' : 'Register New Staff Member'}
          </h2>
          {editingStaffId && (
            <button
              type="button"
              onClick={resetStaffForm}
              className="text-xs font-semibold text-neutral-500 hover:text-[#171717]"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {registeredUsers.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-[#F8FAFC] p-3">
            <label className="text-[11px] font-semibold text-neutral-600">
              Quick Link Signed-In Google Account (Optional — auto-fills UID, Email & Name)
            </label>
            <select
              value=""
              onChange={(e) => {
                const picked = registeredUsers.find((u) => u.uid === e.target.value);
                if (picked) {
                  setUid(picked.uid);
                  if (picked.email) setEmail(picked.email);
                  if (picked.displayName) setName(picked.displayName);
                  if (picked.photoURL) setPhotoUrl(picked.photoURL);
                }
              }}
              className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs"
            >
              <option value="">— Select a signed-in user to auto-fill —</option>
              {registeredUsers.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName} ({u.email || u.uid})
                </option>
              ))}
            </select>
          </div>
        )}

        <form onSubmit={handleSaveStaff} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-[#171717]">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hasan Mahmud"
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#171717]">Phone Number *</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+880 17XX-XXXXXX"
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#171717]">Google Gmail *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff.member@gmail.com"
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#171717]">Full Address *</label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House 12, Road 4, Banani, Dhaka"
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#171717]">Designation / Role *</label>
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value as StaffRole)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold"
              >
                <option value="super_admin">Super Admin</option>
                <option value="manager">Manager</option>
                <option value="cashier">Cashier</option>
                <option value="chef">Chef / Kitchen</option>
                <option value="delivery">Delivery Rider</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#171717]">
                Staff Photo (Upload or URL)
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {photoUrl && (
                  <img
                    src={photoUrl}
                    alt="Staff preview"
                    className="h-9 w-9 rounded-full border border-neutral-200 object-cover"
                  />
                )}
                <input
                  type="text"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="Photo URL or upload image..."
                  className="min-w-[160px] flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs"
                />
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#171717] px-3 py-2 text-xs font-semibold text-white hover:bg-[#F97316]">
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingAvatar ? 'Uploading...' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#171717]">
                Firebase UID (Optional)
              </label>
              <input
                type="text"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                placeholder="Auto-matched on email if blank"
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          {/* Exact Web Controls Checkboxes */}
          <div className="rounded-xl border border-neutral-200 bg-[#F8FAFC] p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[#171717]">
              <Shield className="h-3.5 w-3.5 text-[#F97316]" />
              Assigned Website Controls ({permissions.length} selected)
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {CONTROL_OPTIONS.map((opt) => {
                const checked = permissions.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                      checked
                        ? 'border-[#F97316] bg-orange-50 text-[#171717]'
                        : 'border-neutral-200 bg-white text-neutral-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePermission(opt.id)}
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#F97316] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#EA580C]"
          >
            <Save className="h-4 w-4" />
            {editingStaffId ? 'Update Staff Profile & Controls' : 'Register Staff Member'}
          </button>
        </form>

        {/* Registered Staff Directory */}
        <div className="divide-y divide-neutral-100 border-t border-neutral-100 pt-2">
          {staff.length === 0 ? (
            <p className="py-4 text-xs text-neutral-500">
              No additional staff registered yet. Only the owner Gmail has access.
            </p>
          ) : (
            staff.map((m) => {
              const docId = m.id || m.uid || m.email;
              const status = m.status || (m.isActive ? 'active' : 'suspended');
              const isTerminated = status === 'terminated';
              const perms = m.permissions || [];
              return (
                <div
                  key={docId}
                  className="flex flex-col justify-between gap-3 py-3.5 text-xs sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-3">
                    {m.photoUrl ? (
                      <img
                        src={m.photoUrl}
                        alt={m.name}
                        className="h-11 w-11 shrink-0 rounded-full border border-neutral-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#171717] font-display text-sm font-bold text-white">
                        {m.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-[#171717]">{m.name}</strong>
                        <span className="font-semibold uppercase text-[#F97316]">
                          {m.role.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`font-semibold uppercase ${
                            status === 'active'
                              ? 'text-[#16A34A]'
                              : status === 'terminated'
                                ? 'text-[#DC2626]'
                                : 'text-amber-600'
                          }`}
                        >
                          · {status === 'terminated' ? 'Dismissed' : status}
                        </span>
                      </div>
                      <p className="text-neutral-600">
                        {m.email}
                        {m.phone ? (
                          <span className="ml-2 inline-flex items-center gap-1">
                            <Phone className="h-3 w-3 text-neutral-400" />
                            {m.phone}
                          </span>
                        ) : null}
                      </p>
                      {m.address && (
                        <p className="flex items-center gap-1 text-neutral-500">
                          <MapPin className="h-3 w-3 shrink-0 text-neutral-400" />
                          {m.address}
                        </p>
                      )}
                      {!isTerminated && perms.length > 0 && (
                        <p className="text-[11px] text-neutral-500">
                          Controls: {perms.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => loadStaffForEdit(m)}
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                      <Edit3 className="h-3 w-3" />
                      Edit
                    </button>
                    {!isTerminated && (
                      <button
                        type="button"
                        onClick={() =>
                          void saveStaffMember({
                            ...m,
                            id: docId,
                            status: m.isActive ? 'suspended' : 'active',
                            isActive: !m.isActive,
                          })
                        }
                        className={`rounded-lg px-2.5 py-1.5 font-semibold ${
                          m.isActive
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'bg-green-50 text-[#16A34A] hover:bg-green-100'
                        }`}
                      >
                        {m.isActive ? 'Suspend' : 'Reactivate'}
                      </button>
                    )}
                    {!isTerminated ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await terminateStaffMember(docId, m.name);
                          showToast(`${m.name} has been dismissed from service.`, 'info');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#DC2626] px-2.5 py-1.5 font-semibold text-white hover:bg-red-700"
                      >
                        <UserX className="h-3 w-3" />
                        Dismiss
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteStaffMember(docId, m.name);
                          showToast(`Removed ${m.name} from directory.`, 'info');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 font-semibold text-[#DC2626] hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete Record
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="font-display text-lg font-bold text-[#171717]">
          Customers ({customers.length})
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-[#F8FAFC]">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2 text-right">Total Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {customers.map((c) => (
                <tr key={c.userId}>
                  <td className="px-3 py-2.5 font-semibold">{c.name}</td>
                  <td className="px-3 py-2.5">{c.phone}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.orderCount}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                    {formatBDT(c.spent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const AdminReportsAndExpensesTab: React.FC<{
  expenses: Expense[];
  inventory: InventoryItem[];
}> = ({ expenses, inventory }) => {
  const { orders, products, categories, showToast } = useApp();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Expense['category']>('ingredients');
  const [amount, setAmount] = useState(1500);
  const [date, setDate] = useState(getDhakaDateString());

  const validOrders = orders.filter((o) => o.status !== 'cancelled');
  const totalRevenue = validOrders.reduce((s, o) => s + o.totalAmount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const inventoryValue = inventory.reduce((s, i) => s + i.currentStock * i.unitCost, 0);
  const netProfit = totalRevenue - totalExpenses;

  const paymentBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of validOrders) {
      map[o.paymentMethod] = (map[o.paymentMethod] || 0) + o.totalAmount;
    }
    return Object.entries(map).map(([method, total]) => ({
      method: method.toUpperCase(),
      total,
    }));
  }, [validOrders]);

  const categorySales = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of validOrders) {
      for (const item of o.items) {
        const prod = products.find((p) => p.id === item.productId);
        const cat = categories.find((c) => c.id === prod?.categoryId);
        const key = cat?.name || 'Other';
        map[key] = (map[key] || 0) + item.lineTotal;
      }
    }
    return Object.entries(map).map(([name, revenue]) => ({ name, revenue }));
  }, [validOrders, products, categories]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createExpense({
      title: title.trim(),
      category,
      amount,
      date,
      note: '',
    });
    setTitle('');
    showToast('Expense recorded.', 'success');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#171717]">
          Reports, Expenses & Profit/Loss
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 tabular-nums">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">Total Sales Revenue</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#171717]">
            {formatBDT(totalRevenue)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">Recorded Expenses</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#DC2626]">
            {formatBDT(totalExpenses)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">Net Profit / Loss</p>
          <p
            className={`mt-1 font-display text-2xl font-bold ${
              netProfit >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
            }`}
          >
            {formatBDT(netProfit)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">Stock Valuation</p>
          <p className="mt-1 font-display text-2xl font-bold text-[#F97316]">
            {formatBDT(inventoryValue)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="font-display text-base font-bold text-[#171717]">
            Category Sales Breakdown
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categorySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#F97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="font-display text-base font-bold text-[#171717]">
            Payment Gateway Report
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                <XAxis dataKey="method" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#171717" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Expense Entry */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-[#171717]">Log Operational Expense</h2>
        <form onSubmit={handleAddExpense} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Expense description"
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs sm:col-span-2"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Expense['category'])}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs"
          >
            {['ingredients', 'utilities', 'staff', 'marketing', 'maintenance', 'other'].map(
              (c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ),
            )}
          </select>
          <input
            type="number"
            required
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs tabular-nums"
          />
          <button
            type="submit"
            className="rounded-xl bg-[#171717] px-4 py-2 text-xs font-semibold text-white hover:bg-[#F97316]"
          >
            Record Expense
          </button>
        </form>

        <div className="divide-y divide-neutral-100 text-xs">
          {expenses.slice(0, 10).map((ex) => (
            <div key={ex.id} className="flex justify-between py-2.5">
              <span>
                <strong>{ex.title}</strong> · <span className="capitalize">{ex.category}</span> ·{' '}
                {ex.date}
              </span>
              <span className="font-mono font-bold tabular-nums text-[#DC2626]">
                −{formatBDT(ex.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const AdminWebsiteSettingsTab: React.FC<{ auditLogs: AuditLog[] }> = ({ auditLogs }) => {
  const { settings, showToast } = useApp();
  const [form, setForm] = useState<WebsiteSetting>(settings);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveWebsiteSettings(form);
      showToast('Website settings saved and synced live to the public site!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#171717]">
          Dynamic Website Settings CMS
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Updates persist in Firestore and appear immediately on the public customer website
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold">Restaurant Name</label>
            <input
              type="text"
              required
              value={form.restaurantName}
              onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Tagline</label>
            <input
              type="text"
              required
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Hero Headline</label>
            <input
              type="text"
              required
              value={form.heroTitle}
              onChange={(e) => setForm({ ...form, heroTitle: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Special Offer Top Banner</label>
            <input
              type="text"
              value={form.specialOfferBanner || ''}
              onChange={(e) => setForm({ ...form, specialOfferBanner: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold">Hero Subtitle</label>
            <input
              type="text"
              value={form.heroSubtitle || ''}
              onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Phone Number</label>
            <input
              type="text"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Opening Hours</label>
            <input
              type="text"
              required
              value={form.openingHours}
              onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold">Restaurant Address</label>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Delivery Charge Inside Dhaka (৳)</label>
            <input
              type="number"
              value={form.deliveryChargeInsideDhaka}
              onChange={(e) =>
                setForm({ ...form, deliveryChargeInsideDhaka: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Delivery Charge Outside Dhaka (৳)</label>
            <input
              type="number"
              value={form.deliveryChargeOutsideDhaka || 0}
              onChange={(e) =>
                setForm({ ...form, deliveryChargeOutsideDhaka: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Free Delivery Threshold (৳)</label>
            <input
              type="number"
              value={form.freeDeliveryThreshold || 0}
              onChange={(e) =>
                setForm({ ...form, freeDeliveryThreshold: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Hero Banner Image</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={form.heroBannerUrl || ''}
                onChange={(e) => setForm({ ...form, heroBannerUrl: e.target.value })}
                className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs"
              />
              <select
                value={form.heroBannerUrl || ''}
                onChange={(e) => setForm({ ...form, heroBannerUrl: e.target.value })}
                className="rounded-xl border border-neutral-200 px-2 py-2 text-xs"
              >
                {IMAGE_PRESETS.map((p) => (
                  <option key={p.label} value={p.url}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold">About Restaurant</label>
            <textarea
              rows={2}
              value={form.aboutText || ''}
              onChange={(e) => setForm({ ...form, aboutText: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 p-3 text-sm"
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-6 text-xs font-semibold text-[#171717]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.deliveryEnabled ?? true}
                onChange={(e) => setForm({ ...form, deliveryEnabled: e.target.checked })}
              />
              Home Delivery Enabled
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.pickupEnabled ?? true}
                onChange={(e) => setForm({ ...form, pickupEnabled: e.target.checked })}
              />
              Customer Pickup Enabled
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.dineInEnabled ?? true}
                onChange={(e) => setForm({ ...form, dineInEnabled: e.target.checked })}
              />
              QR Dine-in Enabled
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#F97316] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#EA580C]"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save & Publish Website Settings'}
        </button>
      </form>

      {/* Audit Logs */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="font-display text-lg font-bold text-[#171717]">
          Security & Operations Audit Logs
        </h2>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
          {auditLogs.length === 0 ? (
            <p className="text-neutral-500">No audit entries yet.</p>
          ) : (
            auditLogs.slice(0, 20).map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-100 bg-[#F8FAFC] px-3 py-2"
              >
                <span>
                  <strong className="font-mono text-[#F97316]">{log.action}</strong> · {log.summary}
                </span>
                <span className="text-neutral-500">{log.actorEmail}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
