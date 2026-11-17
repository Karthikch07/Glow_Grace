import { findProduct, type CatalogProduct } from "@shared/catalog";
import { computeQuote, type QuoteInput, type QuoteLine } from "@shared/pricing";
import { HttpError } from "./http";
import { isDbReady, Product } from "./mongodb";

/**
 * Prices always come from shared/catalog.ts. Stock comes from the `products`
 * collection when a document with a matching `sku` exists (run `npm run seed`),
 * and falls back to the catalogue's static stock otherwise.
 */
async function loadLiveStock(skus: string[]): Promise<Map<string, number>> {
  const stock = new Map<string, number>();
  if (!isDbReady() || skus.length === 0) return stock;
  const docs = await Product.find({ sku: { $in: skus } }, { sku: 1, stock: 1 }).lean();
  for (const d of docs) if (d.sku) stock.set(d.sku, d.stock ?? 0);
  return stock;
}

export async function quoteWithLiveStock(input: QuoteInput) {
  const skus = (input.items ?? [])
    .map((i) => findProduct(i.productId)?.id)
    .filter((id): id is string => Boolean(id));
  const live = await loadLiveStock(Array.from(new Set(skus)));
  const lookup = (id: string): CatalogProduct | undefined => {
    const p = findProduct(id);
    if (!p) return undefined;
    return live.has(p.id) ? { ...p, stock: live.get(p.id)! } : p;
  };
  return computeQuote(input, lookup);
}

type StockLine = Pick<QuoteLine, "productId" | "quantity" | "name">;

/**
 * Atomically decrement stock for every line, or none of them. Lines whose
 * product has no MongoDB document are not tracked and always succeed.
 */
export async function reserveStock(lines: StockLine[]): Promise<boolean> {
  const tracked = new Set(
    (await Product.find({ sku: { $in: lines.map((l) => l.productId) } }, { sku: 1 }).lean()).map((d) => d.sku),
  );
  const done: StockLine[] = [];
  for (const line of lines) {
    if (!tracked.has(line.productId)) continue;
    const updated = await Product.findOneAndUpdate(
      { sku: line.productId, stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity } },
    );
    if (!updated) {
      await releaseStock(done);
      throw new HttpError(409, `Sorry, ${line.name} just sold out in the quantity you picked.`);
    }
    done.push(line);
  }
  return done.length > 0;
}

export async function releaseStock(lines: StockLine[]): Promise<void> {
  await Promise.all(
    lines.map((l) => Product.updateOne({ sku: l.productId }, { $inc: { stock: l.quantity } })),
  );
}
