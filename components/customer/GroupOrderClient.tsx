"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Copy from "lucide-react/dist/esm/icons/copy";
import Lock from "lucide-react/dist/esm/icons/lock";
import Minus from "lucide-react/dist/esm/icons/minus";
import Plus from "lucide-react/dist/esm/icons/plus";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Share2 from "lucide-react/dist/esm/icons/share-2";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import UsersRound from "lucide-react/dist/esm/icons/users-round";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useCart } from "@/lib/cart-store";
import { useToast } from "@/components/ui/Toast";

type GroupItem = {
  id: string;
  participant_id: string;
  product_id: string;
  config_key: string;
  configuration: Record<string, unknown>;
  product_name: string;
  unit_price: number;
  quantity: number;
};
type Participant = {
  id: string;
  user_id: string;
  display_name: string;
  is_host: boolean;
};
type State = {
  group: {
    id: string;
    restaurant_id: string;
    host_user_id: string;
    status: string;
    expires_at: string;
    restaurants?:
      | { id: string; name: string; address?: string }
      | Array<{ id: string; name: string; address?: string }>;
  };
  participant: Participant;
  participants: Participant[];
  items: GroupItem[];
  completed_order?: {
    id: string;
    order_number: string;
    status: string;
    fulfillment_type: string;
    created_at: string;
  } | null;
};

export function GroupOrderClient({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { locale } = useI18n();
  const toast = useToast();
  const cart = useCart();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const c =
    locale === "ar"
      ? {
          title: "الطلب الجماعي",
          open: "مفتوح للإضافة",
          locked: "مقفل وجاهز للدفع",
          invite: "ادعُ أصدقاءك",
          copy: "نسخ الرابط",
          copied: "تم نسخ رابط الدعوة.",
          members: "المشاركون",
          host: "المضيف",
          empty: "لم يضف أحد أي منتج بعد.",
          menu: "فتح قائمة المطعم",
          lock: "إيقاف الإضافات والمتابعة",
          checkout: "نقل الطلب للسلة والدفع",
          own: "يمكنك تعديل عناصرك فقط.",
          failed: "تعذر تحميل الطلب الجماعي.",
        }
      : locale === "en"
        ? {
            title: "Group order",
            open: "Open for additions",
            locked: "Locked and ready to pay",
            invite: "Invite friends",
            copy: "Copy link",
            copied: "Invite link copied.",
            members: "Participants",
            host: "Host",
            empty: "Nobody has added an item yet.",
            menu: "Open restaurant menu",
            lock: "Stop additions and continue",
            checkout: "Move group order to cart and pay",
            own: "You can only change your own items.",
            failed: "Could not load the group order.",
          }
        : {
            title: "Gruppenbestellung",
            open: "Offen für weitere Artikel",
            locked: "Gesperrt und zahlungsbereit",
            invite: "Freunde einladen",
            copy: "Link kopieren",
            copied: "Einladungslink kopiert.",
            members: "Teilnehmende",
            host: "Gastgeber",
            empty: "Noch niemand hat einen Artikel hinzugefügt.",
            menu: "Restaurantmenü öffnen",
            lock: "Hinzufügen beenden und fortfahren",
            checkout: "Gruppenbestellung in den Warenkorb legen und bezahlen",
            own: "Du kannst nur deine eigenen Artikel ändern.",
            failed: "Gruppenbestellung konnte nicht geladen werden.",
          };

  const load = useCallback(async () => {
    const response = await fetch(`/api/group-orders/${groupId}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.data?.group) {
      setError(c.failed);
      return;
    }
    setState(payload.data);
    setError("");
  }, [groupId, c.failed]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(load, 5000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [load]);
  const restaurant = state
    ? Array.isArray(state.group.restaurants)
      ? state.group.restaurants[0]
      : state.group.restaurants
    : null;
  const total = useMemo(
    () =>
      (state?.items ?? []).reduce(
        (sum, item) => sum + Number(item.unit_price) * item.quantity,
        0,
      ),
    [state?.items],
  );
  const inviteToken =
    typeof window !== "undefined"
      ? sessionStorage.getItem(`blinkgo-group-invite:${groupId}`)
      : null;
  const inviteUrl =
    inviteToken && typeof window !== "undefined"
      ? `${window.location.origin}/group-order/join/${inviteToken}`
      : "";

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success(c.copied);
  }
  async function mutate(
    method: "PATCH" | "DELETE",
    item: GroupItem,
    quantity?: number,
  ) {
    setBusy(item.id);
    const response = await fetch(`/api/group-orders/${groupId}/items`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: item.id, quantity }),
    });
    setBusy("");
    if (!response.ok) {
      toast.error(c.own);
      return;
    }
    await load();
  }
  async function lock() {
    setBusy("lock");
    const response = await fetch(`/api/group-orders/${groupId}/lock`, {
      method: "POST",
    });
    setBusy("");
    if (!response.ok) {
      toast.error(c.failed);
      return;
    }
    await load();
  }
  function checkout() {
    if (
      !state ||
      !restaurant ||
      !state.participant.is_host ||
      state.group.status !== "locked"
    )
      return;
    cart.clear();
    for (const item of state.items)
      cart.add(
        {
          product_id: item.product_id,
          product_name: item.product_name,
          product_price: Number(item.unit_price),
          image_url: null,
          restaurant_id: state.group.restaurant_id,
          restaurant_name: restaurant.name,
          configuration: item.configuration,
          config_key: item.config_key,
          group_order_id: state.group.id,
        },
        item.quantity,
      );
    router.push("/cart");
  }

  if (error)
    return (
      <main className="grid min-h-[60vh] place-items-center bg-[#080808] p-4 text-white">
        <div className="text-center">
          <p role="alert">{error}</p>
          <button
            onClick={load}
            className="mt-4 min-h-11 rounded-xl bg-red-600 px-4 font-bold"
          >
            <RefreshCw className="me-2 inline size-4" />
            Retry
          </button>
        </div>
      </main>
    );
  if (!state || !restaurant)
    return (
      <main className="grid min-h-[60vh] place-items-center bg-[#080808] text-white">
        <RefreshCw className="size-7 animate-spin text-red-500" />
      </main>
    );
  const grouped = state.participants.map((p) => ({
    participant: p,
    items: state.items.filter((item) => item.participant_id === p.id),
  }));
  const isOpen = state.group.status === "open";
  const isCompleted = state.group.status === "completed";
  const completedBanner = state.completed_order ? (
    <section
      data-testid="group-completed-order"
      className="rounded-[2rem] border border-emerald-400/20 bg-emerald-400/[.08] p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-emerald-300">
            {locale === "ar"
              ? "تم إرسال الطلب"
              : locale === "en"
                ? "Order submitted"
                : "Bestellung aufgegeben"}
          </p>
          <strong className="mt-1 block text-lg">
            {state.completed_order.order_number}
          </strong>
          <p className="text-sm text-zinc-400">
            {state.completed_order.status}
          </p>
        </div>
        {state.participant.is_host && (
          <Link
            href={`/orders/${state.completed_order.id}/track`}
            className="inline-flex min-h-11 items-center rounded-xl bg-emerald-400 px-4 font-black text-black"
          >
            {locale === "ar"
              ? "متابعة الطلب"
              : locale === "en"
                ? "Track order"
                : "Bestellung verfolgen"}
          </Link>
        )}
      </div>
    </section>
  ) : null;
  return (
    <main
      data-testid="group-order-page"
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="min-h-screen bg-[#080808] px-4 py-5 text-white"
    >
      <div className="mx-auto max-w-4xl space-y-4">
        {completedBanner}
        <header className="rounded-[2rem] border border-red-500/20 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.25),transparent_42%),#121214] p-5">
          <div className="flex items-center gap-3">
            <Link
              href={`/restaurants/${state.group.restaurant_id}`}
              aria-label={c.menu}
              className="grid size-11 place-items-center rounded-xl border border-white/10"
            >
              <ArrowLeft
                className={`size-5 ${locale === "ar" ? "rotate-180" : ""}`}
              />
            </Link>
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">
                BlinkGo Together
              </p>
              <h1 className="text-2xl font-black">{c.title}</h1>
              <p className="text-sm text-zinc-400">{restaurant.name}</p>
            </div>
            <span
              className={`ms-auto rounded-full px-3 py-2 text-xs font-black ${isOpen ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-300/10 text-amber-200"}`}
            >
              {isOpen
                ? c.open
                : isCompleted
                  ? locale === "ar"
                    ? "تم إرسال الطلب"
                    : locale === "en"
                      ? "Order submitted"
                      : "Bestellung aufgegeben"
                  : c.locked}
            </span>
          </div>
          {inviteUrl && isOpen && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-sm font-black">{c.invite}</p>
              <div className="mt-2 flex gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  aria-label={c.invite}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-zinc-400"
                  dir="ltr"
                />
                <button
                  data-testid="group-copy-invite"
                  onClick={copyInvite}
                  className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-amber-300 text-black"
                  aria-label={c.copy}
                >
                  <Copy className="size-4" />
                </button>
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <button
                    onClick={() =>
                      navigator.share({ title: c.title, url: inviteUrl })
                    }
                    className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10"
                    aria-label={c.invite}
                  >
                    <Share2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </header>
        <section className="rounded-[2rem] border border-white/10 bg-[#121214] p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <UsersRound className="size-5 text-red-400" />
              {c.members}
            </h2>
            <strong>{state.participants.length}</strong>
          </div>
          <div className="mt-4 space-y-3">
            {grouped.map(({ participant, items }) => (
              <article
                key={participant.id}
                className="rounded-2xl border border-white/[.08] bg-black/20 p-3"
              >
                <div className="flex items-center gap-2">
                  <strong>{participant.display_name}</strong>
                  {participant.is_host && (
                    <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[10px] font-black text-amber-200">
                      {c.host}
                    </span>
                  )}
                  <span className="ms-auto text-xs text-zinc-500">
                    {items.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                </div>
                {items.length ? (
                  <div className="mt-3 space-y-2">
                    {items.map((item) => {
                      const own = item.participant_id === state.participant.id;
                      return (
                        <div
                          key={item.id}
                          data-testid="group-order-item"
                          className="flex items-center gap-3 rounded-xl bg-white/[.035] p-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">
                              {item.product_name}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {new Intl.NumberFormat(
                                locale === "ar" ? "ar-DE" : `${locale}-DE`,
                                { style: "currency", currency: "EUR" },
                              ).format(Number(item.unit_price) * item.quantity)}
                            </p>
                          </div>
                          {own && isOpen ? (
                            <div className="flex items-center gap-1">
                              <button
                                disabled={
                                  busy === item.id || item.quantity <= 1
                                }
                                onClick={() =>
                                  mutate("PATCH", item, item.quantity - 1)
                                }
                                aria-label="Decrease"
                                className="grid size-11 place-items-center rounded-xl border border-white/10 disabled:opacity-30"
                              >
                                <Minus className="size-4" />
                              </button>
                              <span className="w-7 text-center font-black">
                                {item.quantity}
                              </span>
                              <button
                                disabled={busy === item.id}
                                onClick={() =>
                                  mutate("PATCH", item, item.quantity + 1)
                                }
                                aria-label="Increase"
                                className="grid size-11 place-items-center rounded-xl border border-white/10"
                              >
                                <Plus className="size-4" />
                              </button>
                              <button
                                disabled={busy === item.id}
                                onClick={() => mutate("DELETE", item)}
                                aria-label="Remove"
                                className="grid size-11 place-items-center rounded-xl text-red-300"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <strong className="text-sm">
                              ×{item.quantity}
                            </strong>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-zinc-600">{c.empty}</p>
                )}
              </article>
            ))}
          </div>
        </section>
        <div className="sticky bottom-20 rounded-[2rem] border border-white/10 bg-[#111]/95 p-3 shadow-2xl backdrop-blur-xl md:bottom-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">
              {state.items.reduce((sum, item) => sum + item.quantity, 0)} items
            </span>
            <strong className="text-xl text-amber-300">
              {new Intl.NumberFormat(
                locale === "ar" ? "ar-DE" : `${locale}-DE`,
                { style: "currency", currency: "EUR" },
              ).format(total)}
            </strong>
          </div>
          {!isCompleted && <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link
              data-testid="group-open-menu"
              href={`/restaurants/${state.group.restaurant_id}?group=${state.group.id}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 font-black"
            >
              <Plus className="size-4" />
              {c.menu}
            </Link>
            {state.participant.is_host && isOpen ? (
              <button
                data-testid="group-lock"
                disabled={!state.items.length || busy === "lock"}
                onClick={lock}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 font-black disabled:opacity-40"
              >
                <Lock className="size-4" />
                {c.lock}
              </button>
            ) : state.participant.is_host && state.group.status === "locked" ? (
              <button
                data-testid="group-checkout"
                onClick={checkout}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 font-black text-black"
              >
                <ShoppingCart className="size-4" />
                {c.checkout}
              </button>
            ) : null}
          </div>}
        </div>
      </div>
    </main>
  );
}
