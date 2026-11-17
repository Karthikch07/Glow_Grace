import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { findProduct } from "@shared/catalog";
import { GIFT_MESSAGE_MAX, MAX_QTY_PER_ITEM, computeQuote, type Quote } from "@shared/pricing";
import { api, getAuthToken } from "./api";
import { getShopProduct, type ShopProduct } from "./catalog";

/**
 * Cart store shared by every component through useSyncExternalStore.
 *
 * Only product ids and quantities are stored; names, images and prices are
 * always read from the catalogue, so a stale cart can never show stale
 * prices. Signed-in users' carts are mirrored to /api/cart.
 */

const STORAGE_KEY = "gg_cart_v2";
const LEGACY_KEY = "gg_cart";

export interface CartLine {
  productId: string;
  quantity: number;
  addedAt: number;
}

interface CartState {
  lines: CartLine[];
  savedForLater: string[];
  couponCode: string | null;
  giftWrap: boolean;
  giftMessage: string;
}

export interface CartItem extends ShopProduct {
  quantity: number;
  addedAt: number;
}

const EMPTY: CartState = { lines: [], savedForLater: [], couponCode: null, giftWrap: false, giftMessage: "" };

const clampQty = (q: number) => Math.max(1, Math.min(MAX_QTY_PER_ITEM, Math.floor(q) || 1));

function sanitize(raw: Partial<CartState> | null | undefined): CartState {
  const lines = new Map<string, CartLine>();
  for (const l of raw?.lines ?? []) {
    const p = findProduct(l?.productId);
    if (!p) continue;
    const prev = lines.get(p.id);
    lines.set(p.id, {
      productId: p.id,
      quantity: clampQty((prev?.quantity ?? 0) + (Number(l.quantity) || 1)),
      addedAt: prev?.addedAt ?? (Number(l.addedAt) || Date.now()),
    });
  }
  const saved = Array.from(
    new Set((raw?.savedForLater ?? []).map((id) => findProduct(id)?.id).filter((id): id is string => !!id && !lines.has(id))),
  );
  return {
    lines: Array.from(lines.values()),
    savedForLater: saved,
    couponCode: typeof raw?.couponCode === "string" && raw.couponCode ? raw.couponCode.toUpperCase() : null,
    giftWrap: Boolean(raw?.giftWrap),
    giftMessage: typeof raw?.giftMessage === "string" ? raw.giftMessage.slice(0, GIFT_MESSAGE_MAX) : "",
  };
}

function load(): CartState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitize(JSON.parse(raw));
    // Migrate the old format: an array of { id | name, quantity }.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const items = JSON.parse(legacy) as Array<{ id?: string; name?: string; quantity?: number }>;
      const migrated = sanitize({
        lines: items.map((it) => ({
          productId: findProduct(it.id)?.id ?? findProduct(it.name)?.id ?? "",
          quantity: it.quantity ?? 1,
          addedAt: Date.now(),
        })),
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_KEY);
      return migrated;
    }
  } catch (e) {
    console.warn("Could not read saved cart", e);
  }
  return EMPTY;
}

let state: CartState = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(update: (s: CartState) => CartState, { push = true } = {}) {
  state = sanitize(update(state));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode or quota: keep the in-memory cart */
  }
  emit();
  if (push) schedulePush();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  // Keep tabs in step with each other.
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      state = load();
      emit();
    }
  });
}

// ---------------------------------------------------------------- server sync

let syncUserId: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function schedulePush() {
  if (!syncUserId || !getAuthToken()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    api("/api/cart", {
      method: "PUT",
      body: {
        items: state.lines.map(({ productId, quantity }) => ({ productId, quantity })),
        savedForLater: state.savedForLater,
        couponCode: state.couponCode,
        giftWrap: state.giftWrap,
        giftMessage: state.giftMessage,
      },
    }).catch((e) => console.warn("Cart sync failed", e));
  }, 600);
}

interface ServerCart {
  items: { productId: string; quantity: number }[];
  savedForLater: string[];
  couponCode: string | null;
  giftWrap: boolean;
  giftMessage: string;
}

/** Call when a user signs in: merges the server cart into the local one, then keeps them in sync. */
export async function startCartSync(userId: string) {
  if (syncUserId === userId) return;
  syncUserId = userId;
  if (!getAuthToken()) return;
  try {
    const remote = await api<ServerCart>("/api/cart");
    if (syncUserId !== userId) return;
    setState((local) => {
      const lines = new Map(local.lines.map((l) => [l.productId, l]));
      for (const r of remote.items) {
        const mine = lines.get(r.productId);
        lines.set(r.productId, mine ? { ...mine, quantity: Math.max(mine.quantity, r.quantity) } : { ...r, addedAt: Date.now() });
      }
      return {
        lines: Array.from(lines.values()),
        savedForLater: Array.from(new Set(local.savedForLater.concat(remote.savedForLater))),
        couponCode: local.couponCode ?? remote.couponCode,
        giftWrap: local.giftWrap || remote.giftWrap,
        giftMessage: local.giftMessage || remote.giftMessage,
      };
    });
  } catch (e) {
    console.warn("Could not load your saved cart", e);
  }
}

export function stopCartSync() {
  syncUserId = null;
  clearTimeout(pushTimer);
}

// ---------------------------------------------------------------- actions

function resolveId(product: string | { id?: string | number; name?: string } | undefined): string | undefined {
  if (!product) return undefined;
  if (typeof product === "string") return findProduct(product)?.id;
  return findProduct(product.id != null ? String(product.id) : undefined)?.id ?? findProduct(product.name)?.id;
}

export const cartActions = {
  add(product: Parameters<typeof resolveId>[0], quantity = 1) {
    const id = resolveId(product);
    if (!id) {
      console.warn("Tried to add an unknown product to the cart", product);
      return;
    }
    setState((s) => {
      const existing = s.lines.find((l) => l.productId === id);
      return {
        ...s,
        savedForLater: s.savedForLater.filter((x) => x !== id),
        lines: existing
          ? s.lines.map((l) => (l.productId === id ? { ...l, quantity: clampQty(l.quantity + quantity) } : l))
          : [...s.lines, { productId: id, quantity: clampQty(quantity), addedAt: Date.now() }],
      };
    });
  },
  setQuantity(id: string, quantity: number) {
    const pid = resolveId(id);
    setState((s) => ({ ...s, lines: s.lines.map((l) => (l.productId === pid ? { ...l, quantity: clampQty(quantity) } : l)) }));
  },
  /** Adjust by `delta`, never below 1. */
  updateQuantity(id: string, delta: number) {
    const pid = resolveId(id);
    const line = state.lines.find((l) => l.productId === pid);
    if (line) cartActions.setQuantity(line.productId, line.quantity + delta);
  },
  remove(id: string) {
    const pid = resolveId(id);
    setState((s) => ({ ...s, lines: s.lines.filter((l) => l.productId !== pid) }));
  },
  /** Put a removed line back at its previous position (used by "Undo"). */
  restore(line: CartLine, index: number) {
    setState((s) => {
      const lines = s.lines.filter((l) => l.productId !== line.productId);
      lines.splice(Math.min(index, lines.length), 0, line);
      return { ...s, lines, savedForLater: s.savedForLater.filter((x) => x !== line.productId) };
    });
  },
  removeMany(ids: string[]) {
    const set = new Set(ids);
    setState((s) => ({ ...s, lines: s.lines.filter((l) => !set.has(l.productId)) }));
  },
  saveForLater(id: string) {
    const pid = resolveId(id);
    if (!pid) return;
    setState((s) => ({
      ...s,
      lines: s.lines.filter((l) => l.productId !== pid),
      savedForLater: [pid, ...s.savedForLater.filter((x) => x !== pid)],
    }));
  },
  moveToBag(id: string) {
    const pid = resolveId(id);
    if (!pid) return;
    setState((s) => ({
      ...s,
      savedForLater: s.savedForLater.filter((x) => x !== pid),
      lines: s.lines.some((l) => l.productId === pid) ? s.lines : [...s.lines, { productId: pid, quantity: 1, addedAt: Date.now() }],
    }));
  },
  removeSaved(id: string) {
    setState((s) => ({ ...s, savedForLater: s.savedForLater.filter((x) => x !== id) }));
  },
  setCoupon(code: string | null) {
    setState((s) => ({ ...s, couponCode: code ? code.trim().toUpperCase() : null }));
  },
  setGiftWrap(on: boolean) {
    setState((s) => ({ ...s, giftWrap: on, giftMessage: on ? s.giftMessage : "" }));
  },
  setGiftMessage(message: string) {
    setState((s) => ({ ...s, giftMessage: message.slice(0, GIFT_MESSAGE_MAX) }));
  },
  clear() {
    setState(() => EMPTY);
  },
  /** After an order: drop the ordered lines and reset per-order extras. */
  completeOrder(orderedIds: string[]) {
    const set = new Set(orderedIds);
    setState((s) => ({ ...s, lines: s.lines.filter((l) => !set.has(l.productId)), couponCode: null, giftWrap: false, giftMessage: "" }));
  },
};

// ---------------------------------------------------------------- hooks

let derivedFor: CartState | null = null;
let derived: { items: CartItem[]; saved: ShopProduct[] } = { items: [], saved: [] };

function derive(s: CartState) {
  if (s !== derivedFor) {
    derivedFor = s;
    derived = {
      items: s.lines
        .map((l) => {
          const p = getShopProduct(l.productId);
          return p ? { ...p, quantity: l.quantity, addedAt: l.addedAt } : null;
        })
        .filter((x): x is CartItem => x !== null),
      saved: s.savedForLater.map((id) => getShopProduct(id)).filter((x): x is ShopProduct => !!x),
    };
  }
  return derived;
}

export function useCart() {
  const s = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const { items, saved } = derive(s);
  return {
    items,
    savedItems: saved,
    lines: s.lines,
    couponCode: s.couponCode,
    giftWrap: s.giftWrap,
    giftMessage: s.giftMessage,
    itemCount: s.lines.reduce((n, l) => n + l.quantity, 0),
    addToCart: cartActions.add,
    removeFromCart: cartActions.remove,
    clearCart: cartActions.clear,
    ...cartActions,
  };
}

/**
 * Prices the cart locally right away, then confirms it with the server
 * (which knows live stock). Both run the same engine from shared/pricing.ts.
 */
export function useCartQuote(): { quote: Quote; verified: boolean; error: string | null } {
  const { lines, couponCode, giftWrap } = useCart();
  const input = useMemo(
    () => ({ items: lines.map(({ productId, quantity }) => ({ productId, quantity })), couponCode, giftWrap }),
    [lines, couponCode, giftWrap],
  );
  const local = useMemo(() => computeQuote(input), [input]);
  const [server, setServer] = useState<{ key: string; quote: Quote } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(input);
  const lastKey = useRef(key);
  lastKey.current = key;

  useEffect(() => {
    if (input.items.length === 0) {
      setServer(null);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<Quote>("/api/cart/quote", { body: input, signal: ctrl.signal })
        .then((quote) => {
          if (lastKey.current === key) {
            setServer({ key, quote });
            setError(null);
          }
        })
        .catch((e) => {
          if (e?.name !== "AbortError") setError(e?.message ?? "Couldn't refresh prices");
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fresh = server?.key === key ? server.quote : null;
  return { quote: fresh ?? local, verified: Boolean(fresh), error };
}
