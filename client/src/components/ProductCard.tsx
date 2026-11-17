import { Card } from "@/components/ui/card";
import { Minus, Plus, ShoppingBag, Star } from "lucide-react";
import { formatCurrency } from "../lib/format";
import { useCart } from "@/lib/cart";
import { ProductImage } from "@/components/ProductImage";

interface ProductCardProps {
  id?: string;
  image: string;
  brand: string;
  name: string;
  rating: number;
  reviews: number;
  price: number;
  originalPrice?: number;
  size?: string;
  onAddToCart?: () => void;
}

export function ProductCard({ id, image, brand, name, rating, reviews, price, originalPrice, size, onAddToCart }: ProductCardProps) {
  const discount = originalPrice ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
  const { items, addToCart, setQuantity, removeFromCart } = useCart();
  const productId = id ?? name;
  const existing = items.find((p) => p.id === productId || p.name === name);
  const qty = existing?.quantity ?? 0;
  const slug = name.toLowerCase().replace(/\s+/g, "-");

  return (
    <Card className="group flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" data-testid={`card-product-${slug}`}>
      <div className="relative">
        <ProductImage src={image} alt={name} className="aspect-square" imgClassName="p-3 group-hover:scale-105" />
        {discount > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm" data-testid="badge-discount">
            {discount}% off
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{brand}</p>
        <h3 className="mt-1 line-clamp-1 font-medium">{name}</h3>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
            <Star className="h-3.5 w-3.5 fill-secondary text-secondary" /> {rating.toFixed(1)}
          </span>
          <span>({reviews})</span>
          {size && <span>· {size}</span>}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="leading-tight">
            <span className="text-lg font-semibold tabular-nums">{formatCurrency(price)}</span>
            {originalPrice && <span className="ml-1.5 text-sm text-muted-foreground line-through tabular-nums">{formatCurrency(originalPrice)}</span>}
          </div>

          {qty > 0 ? (
            <div className="inline-flex h-9 items-center overflow-hidden rounded-lg border bg-background" role="group" aria-label={`Quantity of ${name}`}>
              <button
                type="button"
                aria-label={`Decrease ${name}`}
                className="flex h-full w-8 items-center justify-center hover:bg-muted"
                onClick={() => (qty <= 1 ? removeFromCart(existing!.id) : setQuantity(existing!.id, qty - 1))}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-7 text-center text-sm font-semibold tabular-nums">{qty}</span>
              <button type="button" aria-label={`Increase ${name}`} className="flex h-full w-8 items-center justify-center hover:bg-muted" onClick={() => setQuantity(existing!.id, qty + 1)}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              onClick={() => {
                addToCart({ id: productId, name }, 1);
                onAddToCart?.();
              }}
              data-testid={`button-add-to-cart-inline-${slug}`}
            >
              <ShoppingBag className="h-4 w-4" /> Add
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
