/**
 * Single source of truth for the product catalogue.
 *
 * Shared by the client (display) and the server (authoritative pricing and
 * stock checks). Images are attached on the client in `client/src/lib/catalog.ts`
 * because they are bundled by Vite; everything that affects money lives here.
 */

export type ProductCategory = "Skincare" | "Makeup";

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  description: string;
  size: string;
  /** Selling price in INR, inclusive of GST. */
  price: number;
  /** Maximum retail price in INR. Equal to `price` when there is no markdown. */
  mrp: number;
  rating: number;
  reviews: number;
  stock: number;
  /** Server-side path of the image, used when seeding MongoDB. */
  imagePath: string;
}

export const PRODUCTS: CatalogProduct[] = [
  {
    id: "hydrating-serum",
    name: "Hydrating Serum",
    brand: "Luxe Beauty",
    category: "Skincare",
    description: "Deep hydration serum with hyaluronic acid",
    size: "30 ml",
    price: 499,
    mrp: 799,
    rating: 4.8,
    reviews: 234,
    stock: 50,
    imagePath: "/assets/stock_images/hydratingserum.jpg",
  },
  {
    id: "night-cream",
    name: "Night Cream",
    brand: "Glow Essentials",
    category: "Skincare",
    description: "Nourishing night cream for radiant skin",
    size: "50 g",
    price: 399,
    mrp: 399,
    rating: 4.9,
    reviews: 189,
    stock: 45,
    imagePath: "/assets/stock_images/instaglownightcream.jpg",
  },
  {
    id: "face-mask-set",
    name: "Face Mask Set",
    brand: "Pure Radiance",
    category: "Skincare",
    description: "Set of 5 premium sheet masks",
    size: "5 × 25 ml",
    price: 349,
    mrp: 499,
    rating: 4.7,
    reviews: 312,
    stock: 60,
    imagePath: "/assets/stock_images/facemaskset.jpg",
  },
  {
    id: "lip-treatment",
    name: "Lip Treatment",
    brand: "Velvet Touch",
    category: "Makeup",
    description: "Luxurious tinted lip treatment",
    size: "4.5 g",
    price: 149,
    mrp: 149,
    rating: 4.6,
    reviews: 156,
    stock: 80,
    imagePath: "/assets/stock_images/velvettouchblush.jpeg",
  },
  {
    id: "eye-cream",
    name: "Eye Cream",
    brand: "Luxe Beauty",
    category: "Skincare",
    description: "Anti-ageing caffeine eye cream",
    size: "15 ml",
    price: 499,
    mrp: 499,
    rating: 4.8,
    reviews: 198,
    stock: 40,
    imagePath: "/assets/stock_images/eyecream.jpeg",
  },
  {
    id: "cleanser",
    name: "Cleanser",
    brand: "Glow Essentials",
    category: "Skincare",
    description: "Gentle pH-balanced daily cleanser",
    size: "100 ml",
    price: 299,
    mrp: 399,
    rating: 4.7,
    reviews: 276,
    stock: 70,
    imagePath: "/assets/stock_images/Cleanser.jpeg",
  },
  {
    id: "toner",
    name: "Toner",
    brand: "Velvet Touch",
    category: "Makeup",
    description: "Balancing alcohol-free facial toner",
    size: "150 ml",
    price: 329,
    mrp: 329,
    rating: 4.5,
    reviews: 167,
    stock: 55,
    imagePath: "/assets/stock_images/makeup_beauty_produc_554f7469.jpg",
  },
  {
    id: "vitamin-c-serum",
    name: "Vitamin C Serum",
    brand: "Radiant Glow",
    category: "Makeup",
    description: "Brightening 10% vitamin C serum",
    size: "30 ml",
    price: 349,
    mrp: 349,
    rating: 4.9,
    reviews: 398,
    stock: 65,
    imagePath: "/assets/stock_images/Vitamin C Serum.jpeg",
  },
];

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));
const byName = new Map(PRODUCTS.map((p) => [p.name.toLowerCase(), p]));

/**
 * Look a product up by id, falling back to its display name. Older carts keyed
 * items by name, so the fallback keeps them working.
 */
export function findProduct(idOrName: string | undefined | null): CatalogProduct | undefined {
  if (!idOrName) return undefined;
  return byId.get(idOrName) ?? byName.get(idOrName.trim().toLowerCase());
}
