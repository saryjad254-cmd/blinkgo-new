'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, Plus, Trash2, Image as ImageIcon, X,
  Upload, Star, Flame, Sparkles, Tag, Award
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useT, useI18n } from '@/lib/i18n/I18nProvider';

interface Extra {
  id?: string;
  name: string;
  price: number;
}

interface Size {
  id?: string;
  name: string;
  price_modifier: number;
}

interface Option {
  id?: string;
  name: string;
  values: { label: string; price_modifier?: number }[];
}

const BADGE_OPTIONS_BY_LOCALE: Record<string, Array<{ value: string; label: string; icon: any; color: string }>> = {
  de: [
    { value: 'new', label: 'Neu', icon: Sparkles, color: 'bg-info/20 text-info border-info/30' },
    { value: 'bestseller', label: 'Bestseller', icon: Award, color: 'bg-accent/20 text-accent border-accent/30' },
    { value: 'sale', label: 'Im Angebot', icon: Tag, color: 'bg-danger/20 text-danger border-danger/30' },
    { value: 'hot', label: 'Heiß', icon: Flame, color: 'bg-warning/20 text-warning border-warning/30' },
    { value: 'recommended', label: 'Empfohlen', icon: Star, color: 'bg-brand-red-500/20 text-brand-red-500 border-brand-red-500/30' },
  ],
  ar: [
    { value: 'new', label: 'جديد', icon: Sparkles, color: 'bg-info/20 text-info border-info/30' },
    { value: 'bestseller', label: 'الأكثر مبيعاً', icon: Award, color: 'bg-accent/20 text-accent border-accent/30' },
    { value: 'sale', label: 'بعرض', icon: Tag, color: 'bg-danger/20 text-danger border-danger/30' },
    { value: 'hot', label: 'حار', icon: Flame, color: 'bg-warning/20 text-warning border-warning/30' },
    { value: 'recommended', label: 'مقترح', icon: Star, color: 'bg-brand-red-500/20 text-brand-red-500 border-brand-red-500/30' },
  ],
  en: [
    { value: 'new', label: 'New', icon: Sparkles, color: 'bg-info/20 text-info border-info/30' },
    { value: 'bestseller', label: 'Bestseller', icon: Award, color: 'bg-accent/20 text-accent border-accent/30' },
    { value: 'sale', label: 'On sale', icon: Tag, color: 'bg-danger/20 text-danger border-danger/30' },
    { value: 'hot', label: 'Hot', icon: Flame, color: 'bg-warning/20 text-warning border-warning/30' },
    { value: 'recommended', label: 'Recommended', icon: Star, color: 'bg-brand-red-500/20 text-brand-red-500 border-brand-red-500/30' },
  ],
};

const COMMON_INGREDIENTS = [
  'Rindfleisch', 'Hähnchen', 'Käse', 'Salat', 'Tomate', 'Zwiebel',
  'Gurke', 'Bacon', 'Ei', 'Pilze', 'Avocado', 'Jalapeños'
];

export default function NewProductPage() {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { locale } = useI18n();

  const [loading, setLoading] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    discount_price: '',
    category: '',
    preparation_time: '15',
    stock: '0',
    track_stock: false,
    is_available: true,
    is_featured: false,
    display_order: '0',
    badges: [] as string[],
    ingredients: [] as string[],
    extras: [] as Extra[],
    sizes: [] as Size[],
    options: [] as Option[],
    requires_prescription: false,
    market_section: '',
    pharmacy_category: '',
  });

  function toggleBadge(b: string) {
    setForm((f) => ({
      ...f,
      badges: f.badges.includes(b) ? f.badges.filter((x) => x !== b) : [...f.badges, b],
    }));
  }

  function toggleIngredient(i: string) {
    setForm((f) => ({
      ...f,
      ingredients: f.ingredients.includes(i) ? f.ingredients.filter((x) => x !== i) : [...f.ingredients, i],
    }));
  }

  function addExtra() {
    setForm((f) => ({
      ...f,
      extras: [...f.extras, { name: '', price: 0 }],
    }));
  }

  function updateExtra(idx: number, field: keyof Extra, value: any) {
    setForm((f) => ({
      ...f,
      extras: f.extras.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
    }));
  }

  function removeExtra(idx: number) {
    setForm((f) => ({
      ...f,
      extras: f.extras.filter((_, i) => i !== idx),
    }));
  }

  function addSize() {
    setForm((f) => ({
      ...f,
      sizes: [...f.sizes, { name: '', price_modifier: 0 }],
    }));
  }

  function updateSize(idx: number, field: keyof Size, value: any) {
    setForm((f) => ({
      ...f,
      sizes: f.sizes.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    }));
  }

  function removeSize(idx: number) {
    setForm((f) => ({
      ...f,
      sizes: f.sizes.filter((_, i) => i !== idx),
    }));
  }

  function addImage() {
    if (newImageUrl.trim() && imageUrls.length < 5) {
      setImageUrls([...imageUrls, newImageUrl.trim()]);
      setNewImageUrl('');
    }
  }

  function removeImage(idx: number) {
    setImageUrls(imageUrls.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        image_urls: imageUrls,
        price: parseFloat(form.price),
        discount_price: form.discount_price ? parseFloat(form.discount_price) : null,
        preparation_time: parseInt(form.preparation_time, 10),
        stock: parseInt(form.stock, 10),
        display_order: parseInt(form.display_order, 10),
      };

      const res = await fetch('/api/products/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.ok) {
        toast.success(locale === 'ar' ? 'تم إنشاء المنتج!' : locale === 'en' ? 'Product created!' : 'Produkt erstellt!');
        router.push('/restaurant/menu');
      } else {
        toast.error(locale === 'ar' ? 'خطأ' : locale === 'en' ? 'Error' : 'Fehler', data.error);
      }
    } catch (e: any) {
      toast.error(locale === 'ar' ? 'خطأ' : locale === 'en' ? 'Error' : 'Fehler', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/restaurant/menu" className="p-2 -m-2 text-text-secondary hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-white">{t.restaurant.addProduct}</h1>
            <p className="text-sm text-text-muted mt-1">{locale === 'ar' ? 'أنشئ منتجاً جديداً لقائمتك' : locale === 'en' ? 'Create a new product for your menu' : 'Erstellen Sie ein neues Produkt für Ihre Speisekarte'}</p>
          </div>
        </div>

        {/* Images */}
        <div className="card glass-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-info" />
            <h2 className="font-bold text-white">{t.restaurant.image}</h2>
            <span className="text-xs text-text-muted ms-auto">Max. 5 Bilder</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {imageUrls.map((url, idx) => (
              <div key={idx} className="relative aspect-square rounded-md overflow-hidden bg-surface-elevated border border-edge-light">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 end-1 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                {idx === 0 && (
                  <span className="absolute bottom-1 start-1 text-[9px] bg-brand-red-500 text-white px-1.5 py-0.5 rounded-pill font-bold">
                    Hauptbild
                  </span>
                )}
              </div>
            ))}
            {imageUrls.length < 5 && (
              <div className="aspect-square rounded-md border-2 border-dashed border-edge-light flex flex-col items-center justify-center gap-1 text-text-muted">
                <Upload className="w-5 h-5" />
                <span className="text-[10px]">Hinzufügen</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="url"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              placeholder={locale === "ar" ? "رابط الصورة (https://...)" : locale === "en" ? "Image URL (https://...)" : "Bild-URL (https://...)"}
              className="input flex-1"
            />
            <button type="button" onClick={addImage} className="btn-secondary text-sm px-3">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Basic info */}
        <div className="card glass-card p-5 space-y-4">
          <h2 className="font-bold text-white">{locale === 'ar' ? 'المعلومات الأساسية' : locale === 'en' ? 'Basic information' : 'Grundinformationen'}</h2>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t.restaurant.productName} *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="input w-full"
              placeholder={locale === "ar" ? "مثال: برغر كلاسيك" : locale === "en" ? "e.g. Classic Burger" : "z.B. Klassischer Burger"}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t.restaurant.productDescription}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="input w-full resize-none"
              placeholder={locale === "ar" ? "180g لحم، سلطة، طماطم، صلصة بيتية…" : locale === "en" ? "180g beef, lettuce, tomato, homemade sauce…" : "180g Rind, Salat, Tomate, hausgemachte Sauce…"}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t.restaurant.price} *</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                  className="input w-full pe-10"
                  placeholder="8.90"
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-text-muted">€</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t.restaurant.discountPrice}</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.discount_price}
                  onChange={(e) => setForm({ ...form, discount_price: e.target.value })}
                  className="input w-full pe-10"
                  placeholder="6.90"
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-text-muted">€</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t.restaurant.category}</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="input w-full"
                placeholder={locale === "ar" ? "برغر" : locale === "en" ? "Burger" : "Burger"}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t.restaurant.prepTime} ({t.restaurant.minutes})</label>
              <input
                type="number"
                min="1"
                value={form.preparation_time}
                onChange={(e) => setForm({ ...form, preparation_time: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t.restaurant.displayOrder}</label>
              <input
                type="number"
                min="0"
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: e.target.value })}
                className="input w-full"
              />
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="card glass-card p-5 space-y-3">
          <h2 className="font-bold text-white">{t.restaurant.badge}</h2>
          <div className="flex flex-wrap gap-2">
            {(BADGE_OPTIONS_BY_LOCALE[locale] || BADGE_OPTIONS_BY_LOCALE.de).map((b) => {
              const Icon = b.icon;
              const active = form.badges.includes(b.value);
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => toggleBadge(b.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-semibold border transition-all ${
                    active ? `${b.color} border-current` : 'bg-surface-elevated text-text-muted border-edge-light'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ingredients */}
        <div className="card glass-card p-5 space-y-3">
          <h2 className="font-bold text-white">{t.restaurant.ingredients}</h2>
          <div className="flex flex-wrap gap-2">
            {COMMON_INGREDIENTS.map((i) => {
              const active = form.ingredients.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleIngredient(i)}
                  className={`px-3 py-1.5 rounded-pill text-xs font-semibold border transition-all ${
                    active
                      ? 'bg-success/20 text-success border-success/30'
                      : 'bg-surface-elevated text-text-muted border-edge-light'
                  }`}
                >
                  {i}
                </button>
              );
            })}
          </div>
        </div>

        {/* Extras */}
        <div className="card glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">{t.restaurant.extras}</h2>
            <button type="button" onClick={addExtra} className="btn-secondary text-xs px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" />
              Extra
            </button>
          </div>
          {form.extras.length === 0 ? (
            <p className="text-sm text-text-muted">{locale === 'ar' ? 'لا توجد إضافات' : locale === 'en' ? 'No extras' : 'Keine Extras'}</p>
          ) : (
            <div className="space-y-2">
              {form.extras.map((e, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={e.name}
                    onChange={(ev) => updateExtra(idx, 'name', ev.target.value)}
                    placeholder={locale === "ar" ? "مثال: جبنة إضافية" : locale === "en" ? "e.g. Extra cheese" : "z.B. Extra Käse"}
                    className="input flex-1"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={e.price}
                    onChange={(ev) => updateExtra(idx, 'price', parseFloat(ev.target.value) || 0)}
                    placeholder="1.50"
                    className="input w-24"
                  />
                  <span className="text-text-muted text-sm">€</span>
                  <button
                    type="button"
                    onClick={() => removeExtra(idx)}
                    className="p-2 text-danger hover:bg-danger/10 rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sizes */}
        <div className="card glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">{t.restaurant.sizes}</h2>
            <button type="button" onClick={addSize} className="btn-secondary text-xs px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" />
              Größe
            </button>
          </div>
          {form.sizes.length === 0 ? (
            <p className="text-sm text-text-muted">{locale === 'ar' ? 'لا توجد أحجام' : locale === 'en' ? 'No sizes' : 'Keine Größen'}</p>
          ) : (
            <div className="space-y-2">
              {form.sizes.map((s, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={s.name}
                    onChange={(ev) => updateSize(idx, 'name', ev.target.value)}
                    placeholder={locale === "ar" ? "مثال: كبير" : locale === "en" ? "e.g. Large" : "z.B. Groß"}
                    className="input flex-1"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={s.price_modifier}
                    onChange={(ev) => updateSize(idx, 'price_modifier', parseFloat(ev.target.value) || 0)}
                    placeholder="0.00"
                    className="input w-24"
                  />
                  <span className="text-text-muted text-sm">€</span>
                  <button
                    type="button"
                    onClick={() => removeSize(idx)}
                    className="p-2 text-danger hover:bg-danger/10 rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock + availability */}
        <div className="card glass-card p-5 space-y-3">
          <h2 className="font-bold text-white">{t.restaurant.availability}</h2>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.track_stock}
              onChange={(e) => setForm({ ...form, track_stock: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">{t.restaurant.stock} verfolgen</p>
              <p className="text-xs text-text-muted">{locale === 'ar' ? 'عند التفعيل سيتم التحقق من الطلبات' : locale === 'en' ? 'When activated, orders will be verified' : 'Bei Aktivierung werden Bestellungen überprüft'}</p>
            </div>
          </label>

          {form.track_stock && (
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">{t.restaurant.stock}</label>
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className="input w-full"
              />
            </div>
          )}

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_available}
              onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">Verfügbar</p>
              <p className="text-xs text-text-muted">Produkt wird im Menü angezeigt</p>
            </div>
          </label>
        </div>

        {/* Pharmacy-specific */}
        <div className="card glass-card p-5 space-y-3">
          <h2 className="font-bold text-white">Pharmacy options</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requires_prescription}
              onChange={(e) => setForm({ ...form, requires_prescription: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">{locale === 'ar' ? 'بوصفة طبية' : locale === 'en' ? 'Prescription required' : 'Rezeptpflichtig'}</p>
              <p className="text-xs text-text-muted">Kunden müssen ein Foto des Rezepts hochladen</p>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-bg/95 backdrop-blur-xl border-t border-edge-light p-4 -mx-4 sm:-mx-6 lg:-mx-8">
          <div className="max-w-3xl mx-auto flex gap-3">
            <Link href="/restaurant/menu" className="btn-secondary flex-1 sm:flex-none">
              {t.common.cancel}
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Speichert…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {t.common.save}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}