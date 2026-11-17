import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  Check,
  Gift,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { COUPONS, GIFT_MESSAGE_MAX, GIFT_WRAP_FEE, MAX_QTY_PER_ITEM, findCoupon, type Quote } from "@shared/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { CheckoutSteps } from "@/components/cart/CheckoutSteps";
import { DeliveryCheck } from "@/components/cart/DeliveryCheck";
import { PriceSummary } from "@/components/cart/PriceSummary";
import { useCart, useCartQuote, type CartItem } from "@/lib/cart";
import { allProducts, type ShopProduct } from "@/lib/catalog";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/components/ProductImage";

const card = "rounded-xl border bg-card";
const productName = (id: string) => allProducts.find((p) => p.id === id)?.name;

// ---------------------------------------------------------------- small pieces

function QuantityStepper({ item }: { item: CartItem }) {
  const { setQuantity } = useCart();
  const max = Math.min(item.stock, MAX_QTY_PER_ITEM);
  const btn =
    "flex h-full w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="inline-flex h-9 items-center overflow-hidden rounded-lg border bg-background" role="group" aria-label={`Quantity of ${item.name}`}>
      <button type="button" className={btn} onClick={() => setQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} aria-label="Decrease quantity">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {item.quantity}
      </span>
      <button type="button" className={btn} onClick={() => setQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= max} aria-label="Increase quantity">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function PriceTag({ price, mrp, size = "md" }: { price: number; mrp: number; size?: "sm" | "md" }) {
  const off = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={cn("font-semibold tabular-nums", size === "md" ? "text-base" : "text-sm")}>{formatCurrency(price)}</span>
      {off > 0 && (
        <>
          <span className="text-xs text-muted-foreground line-through tabular-nums">{formatCurrency(mrp)}</span>
          <span className="text-xs font-semibold text-green-700 dark:text-green-400">{off}% off</span>
        </>
      )}
    </div>
  );
}

function FreeShippingBar({ quote }: { quote: Quote }) {
  const unlocked = quote.freeShippingRemaining === 0;
  const threshold = quote.subtotal + quote.freeShippingRemaining;
  const pct = unlocked ? 100 : Math.max(4, Math.round((quote.subtotal / threshold) * 100));
  return (
    <div className={cn(card, "flex h-full items-center gap-4 p-4 sm:p-5")}>
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          unlocked ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400" : "bg-secondary/15 text-secondary-foreground dark:text-secondary",
        )}
      >
        {unlocked ? <Check className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {unlocked ? (
            <span className="font-medium">You've unlocked free delivery</span>
          ) : (
            <>
              Add <span className="font-semibold">{formatCurrency(quote.freeShippingRemaining)}</span> more for{" "}
              <span className="font-semibold">free delivery</span>
            </>
          )}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn("h-full rounded-full transition-[width] duration-500", unlocked ? "bg-green-500" : "bg-secondary")} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function IssuesBanner({ quote }: { quote: Quote }) {
  const { setQuantity, removeFromCart } = useCart();
  if (quote.issues.length === 0) return null;
  const fix = () => {
    for (const issue of quote.issues) {
      if (issue.type === "quantity_reduced") setQuantity(issue.productId, issue.available);
      else removeFromCart(issue.productId);
    }
  };
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-start dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"
      role="alert"
    >
      <AlertTriangle className="hidden h-4 w-4 shrink-0 sm:mt-0.5 sm:block" />
      <div className="flex-1">
        <p className="font-medium">Some items need your attention</p>
        <ul className="mt-1 space-y-0.5 text-amber-800 dark:text-amber-300">
          {quote.issues.map((i) => (
            <li key={i.productId + i.type}>
              {i.type === "quantity_reduced"
                ? `Only ${i.available} of ${productName(i.productId) ?? "an item"} left in stock.`
                : `${productName(i.productId) ?? "An item"} is no longer available.`}
            </li>
          ))}
        </ul>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 border-amber-400 bg-transparent hover:bg-amber-100 dark:hover:bg-amber-900/40" onClick={fix}>
        Update bag
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- bag items

function BagItem({ item, index }: { item: CartItem; index: number }) {
  const { removeFromCart, saveForLater, restore, moveToBag } = useCart();
  const { toast } = useToast();
  const lowStock = item.stock > 0 && item.stock <= 5;
  const off = item.mrp > item.price ? Math.round(((item.mrp - item.price) / item.mrp) * 100) : 0;

  const removeWithUndo = () => {
    const line = { productId: item.id, quantity: item.quantity, addedAt: item.addedAt };
    removeFromCart(item.id);
    toast({
      title: "Removed from bag",
      description: item.name,
      action: (
        <ToastAction altText="Undo remove" onClick={() => restore(line, index)}>
          Undo
        </ToastAction>
      ),
    });
  };

  const save = () => {
    saveForLater(item.id);
    toast({
      title: "Saved for later",
      description: item.name,
      action: (
        <ToastAction altText="Move back to bag" onClick={() => moveToBag(item.id)}>
          Undo
        </ToastAction>
      ),
    });
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      className="flex gap-4 overflow-hidden p-4 sm:gap-5 sm:p-5"
    >
      <Link href="/products" className="shrink-0" aria-label={`View ${item.name}`}>
        <ProductImage src={item.image} alt="" className="h-24 w-24 rounded-lg border sm:h-28 sm:w-28" imgClassName="p-1.5" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{item.brand}</p>
            <h3 className="mt-0.5 font-medium leading-snug">{item.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.size}
              {lowStock && <span className="font-medium text-amber-700 dark:text-amber-400"> · Only {item.stock} left</span>}
            </p>
          </div>
          {/* Line total, desktop */}
          <div className="hidden shrink-0 text-right sm:block">
            <p className="font-semibold tabular-nums">{formatCurrency(item.price * item.quantity)}</p>
            {off > 0 && (
              <p className="text-xs">
                <span className="text-muted-foreground line-through tabular-nums">{formatCurrency(item.mrp * item.quantity)}</span>{" "}
                <span className="font-semibold text-green-700 dark:text-green-400">{off}% off</span>
              </p>
            )}
            {item.quantity > 1 && <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(item.price)} each</p>}
          </div>
        </div>

        {/* Unit price, mobile */}
        <div className="mt-1.5 sm:hidden">
          <PriceTag price={item.price} mrp={item.mrp} />
        </div>

        <div className="mt-auto flex items-center gap-1 pt-3">
          <QuantityStepper item={item} />
          <div className="ml-auto flex items-center">
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground" onClick={save} aria-label={`Save ${item.name} for later`}>
              <Bookmark className="h-4 w-4" />
              <span className="hidden sm:inline">Save for later</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 px-2.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={removeWithUndo}
              aria-label={`Remove ${item.name}`}
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Remove</span>
            </Button>
          </div>
        </div>
      </div>
    </motion.li>
  );
}

function SavedForLater({ items }: { items: ShopProduct[] }) {
  const { moveToBag, removeSaved } = useCart();
  if (items.length === 0) return null;
  return (
    <section className={card} aria-labelledby="saved-heading">
      <h2 id="saved-heading" className="flex items-center gap-2 border-b px-4 py-3.5 text-sm font-semibold sm:px-5">
        <Bookmark className="h-4 w-4 text-primary" /> Saved for later
        <span className="font-normal text-muted-foreground">({items.length})</span>
      </h2>
      <ul className="divide-y">
        {items.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <ProductImage src={p.image} alt="" className="h-14 w-14 shrink-0 rounded-md border" imgClassName="p-1" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <PriceTag price={p.price} mrp={p.mrp} size="sm" />
            </div>
            <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => moveToBag(p.id)}>
              Move to bag
            </Button>
            <button
              type="button"
              onClick={() => removeSaved(p.id)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Remove ${p.name} from saved items`}
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Recommendations({ title, exclude }: { title: string; exclude: Set<string> }) {
  const { addToCart } = useCart();
  const picks = useMemo(
    () => allProducts.filter((p) => !exclude.has(p.id)).sort((a, b) => b.rating * b.reviews - a.rating * a.reviews).slice(0, 4),
    [exclude],
  );
  if (picks.length === 0) return null;
  return (
    <section aria-labelledby="recs-heading">
      <h2 id="recs-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-secondary" /> {title}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {picks.map((p) => (
          <li key={p.id} className={cn(card, "flex flex-col overflow-hidden")}>
            <ProductImage src={p.image} alt="" className="aspect-square w-full" imgClassName="p-2" />
            <div className="flex flex-1 flex-col p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{p.brand}</p>
              <p className="truncate text-sm font-medium">{p.name}</p>
              <div className="mb-3 mt-1">
                <PriceTag price={p.price} mrp={p.mrp} size="sm" />
              </div>
              <Button size="sm" variant="outline" className="mt-auto h-8 w-full gap-1" onClick={() => addToCart(p.id)} aria-label={`Add ${p.name} to bag`}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- sidebar

function CouponCard({ quote }: { quote: Quote }) {
  const { setCoupon } = useCart();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const apply = (code: string) => {
    const found = findCoupon(code);
    if (!found) return setError(`"${code.trim().toUpperCase()}" isn't a valid coupon.`);
    if (quote.subtotal < found.minSubtotal) {
      return setError(`Add ${formatCurrency(found.minSubtotal - quote.subtotal)} more to use ${found.code}.`);
    }
    setError(null);
    setDraft("");
    setCoupon(found.code);
  };

  const applied = quote.coupon.status === "applied" ? quote.coupon : null;
  const lapsed = quote.coupon.status === "below_minimum" ? quote.coupon : null;

  return (
    <section className={cn(card, "p-4 sm:p-5")} aria-labelledby="coupon-heading">
      <h2 id="coupon-heading" className="flex items-center gap-2 text-sm font-semibold">
        <Tag className="h-4 w-4 text-primary" /> Coupons
      </h2>

      {applied ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-green-300 bg-green-50 px-3 py-2.5 dark:border-green-800 dark:bg-green-950/30">
          <Check className="h-4 w-4 shrink-0 text-green-700 dark:text-green-400" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-mono font-semibold">{applied.code}</p>
            <p className="text-xs text-green-800 dark:text-green-300">You save {formatCurrency(applied.discount)}</p>
          </div>
          <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setCoupon(null)}>
            Remove
          </Button>
        </div>
      ) : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) apply(draft);
          }}
        >
          <Input
            placeholder="Enter coupon code"
            aria-label="Coupon code"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.toUpperCase());
              setError(null);
            }}
            className="h-10 font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            maxLength={30}
          />
          <Button type="submit" variant="outline" className="h-10 shrink-0 px-4" disabled={!draft.trim()}>
            Apply
          </Button>
        </form>
      )}

      {(error || lapsed) && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error ?? lapsed?.reason}
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {COUPONS.filter((c) => c.code !== applied?.code).map((c) => {
          const short = c.minSubtotal - quote.subtotal;
          return (
            <li key={c.code} className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className="font-mono text-xs font-semibold text-primary">{c.code}</span>
                  <span className="font-medium">{c.title}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{short > 0 ? `Add ${formatCurrency(short)} more to unlock` : c.description}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 shrink-0 text-primary hover:text-primary" disabled={short > 0} onClick={() => apply(c.code)}>
                Apply
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GiftCard() {
  const { giftWrap, giftMessage, setGiftWrap, setGiftMessage } = useCart();
  return (
    <section className={cn(card, "p-4 sm:p-5")}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Gift className="h-4 w-4" />
        </span>
        <label htmlFor="gift-wrap" className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-semibold">Gift wrap this order</span>
          <span className="block text-xs text-muted-foreground">Signature box + handwritten note · {formatCurrency(GIFT_WRAP_FEE)}</span>
        </label>
        <Switch id="gift-wrap" checked={giftWrap} onCheckedChange={setGiftWrap} className="mt-1.5" />
      </div>
      {giftWrap && (
        <div className="mt-3">
          <Textarea
            value={giftMessage}
            onChange={(e) => setGiftMessage(e.target.value)}
            placeholder="Write a message for the card (optional)"
            aria-label="Gift message"
            maxLength={GIFT_MESSAGE_MAX}
            rows={3}
            className="resize-none text-sm"
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">
            {giftMessage.length}/{GIFT_MESSAGE_MAX}
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- page

export default function CartPage() {
  const { items, savedItems, itemCount } = useCart();
  const { quote, verified } = useCartQuote();
  const [, navigate] = useLocation();
  const summaryRef = useRef<HTMLElement>(null);

  const exclude = useMemo(() => new Set([...items.map((i) => i.id), ...savedItems.map((s) => s.id)]), [items, savedItems]);
  const blocked = quote.lines.length === 0 || (verified && quote.issues.length > 0);
  const goToCheckout = () => navigate("/checkout");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30 pb-28 lg:pb-16">
      {/* Page header */}
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-6">
          <div>
            <Link href="/products" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Continue shopping
            </Link>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Your bag
              {itemCount > 0 && (
                <span className="ml-3 align-middle font-sans text-base font-normal tracking-normal text-muted-foreground">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              )}
            </h1>
          </div>
          <CheckoutSteps current={0} />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
          <div className={cn(card, "flex flex-col items-center px-6 py-14 text-center")}>
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShoppingBag className="h-7 w-7" />
            </span>
            <h2 className="mt-5 font-serif text-2xl font-semibold">Your bag is empty</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">Explore our skincare and makeup, hand-picked by the GlowGrace studio team.</p>
            <Button asChild className="mt-6 h-11 px-8">
              <Link href="/products">Explore products</Link>
            </Button>
          </div>
          <SavedForLater items={savedItems} />
          <Recommendations title="Bestsellers" exclude={exclude} />
        </div>
      ) : (
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:py-8 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-8">
          {/* Left column */}
          <div className="min-w-0 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FreeShippingBar quote={quote} />
              <DeliveryCheck />
            </div>
            {verified && <IssuesBanner quote={quote} />}

            <section className={card} aria-label="Items in your bag">
              <ul className="divide-y">
                <AnimatePresence initial={false}>
                  {items.map((item, i) => (
                    <BagItem key={item.id} item={item} index={i} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>

            <SavedForLater items={savedItems} />
            <Recommendations title="Complete your routine" exclude={exclude} />
          </div>

          {/* Right column */}
          <aside className="space-y-4 lg:sticky lg:top-20">
            <CouponCard quote={quote} />
            <GiftCard />

            <section ref={summaryRef} className={cn(card, "scroll-mt-20 p-4 sm:p-5")} aria-labelledby="summary-heading">
              <h2 id="summary-heading" className="mb-4 text-sm font-semibold">
                Price details
              </h2>
              <PriceSummary quote={quote}>
                <Button className="h-12 w-full text-base" onClick={goToCheckout} disabled={blocked}>
                  Checkout
                </Button>
                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" /> Secure checkout · UPI or cash on delivery
                </p>
              </PriceSummary>
            </section>
          </aside>
        </div>
      )}

      {/* Mobile checkout bar */}
      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold leading-tight tabular-nums">{formatCurrency(quote.total)}</p>
              <button
                type="button"
                onClick={() => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="text-xs font-medium text-primary"
              >
                View price details
              </button>
            </div>
            <Button className="h-11 px-8" onClick={goToCheckout} disabled={blocked}>
              Checkout
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
