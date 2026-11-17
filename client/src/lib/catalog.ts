import { PRODUCTS, findProduct, type CatalogProduct } from "@shared/catalog";
import { SERVICES, formatDuration } from "@shared/booking";

import spaImage1 from "@assets/stock_images/spa_massage_therapy__0dc874f5.jpg";
import spaImage2 from "@assets/stock_images/hot_stone_massage_6c34b301.jpg";
import barbershopImage1 from "@assets/stock_images/modern_barbershop_in_ed205b41.jpg";
import barbershopImage2 from "@assets/stock_images/breadgrooming.jpg";
import fitnessImage1 from "@assets/stock_images/Personal Training.jpeg";
import fitnessImage2 from "@assets/stock_images/yoga_fitness_class_51fa1f1f.jpg";
import medspaImage1 from "@assets/stock_images/Botox Treatment.jpeg";
import salonImage from "@assets/stock_images/hair_salon_styling_c_a9b33900.jpg";

import hydratingSerum from "@assets/stock_images/hydratingserum.jpg";
import nightCream from "@assets/stock_images/instaglownightcream.jpg";
import faceMaskSet from "@assets/stock_images/facemaskset.jpg";
import lipTreatment from "@assets/stock_images/velvettouchblush.jpeg";
import eyeCream from "@assets/stock_images/eyecream.jpeg";
import cleanser from "@assets/stock_images/Cleanser.jpeg";
import toner from "@assets/stock_images/makeup_beauty_produc_554f7469.jpg";
import vitaminCSerum from "@assets/stock_images/Vitamin C Serum.jpeg";

const SERVICE_IMAGES: Record<number, string> = {
  1: spaImage1,
  2: spaImage2,
  3: barbershopImage1,
  4: barbershopImage2,
  5: fitnessImage1,
  6: fitnessImage2,
  7: medspaImage1,
  8: salonImage,
};

/** Services for display; prices and durations come from shared/booking.ts. */
export const allServices = SERVICES.map((s) => ({
  id: s.id,
  image: SERVICE_IMAGES[s.id] ?? s.imagePath,
  category: s.category,
  name: s.name,
  description: s.description,
  duration: formatDuration(s.durationMin),
  durationMin: s.durationMin,
  price: String(s.price),
}));

export const serviceCategories = ["All", "Spa", "Barbershop", "Fitness", "MedSpa", "Salon"];

const PRODUCT_IMAGES: Record<string, string> = {
  "hydrating-serum": hydratingSerum,
  "night-cream": nightCream,
  "face-mask-set": faceMaskSet,
  "lip-treatment": lipTreatment,
  "eye-cream": eyeCream,
  cleanser,
  toner,
  "vitamin-c-serum": vitaminCSerum,
};

export interface ShopProduct extends CatalogProduct {
  image: string;
  /** MRP when the product is marked down; undefined otherwise. */
  originalPrice?: number;
}

function toShopProduct(p: CatalogProduct): ShopProduct {
  return {
    ...p,
    image: PRODUCT_IMAGES[p.id] ?? p.imagePath,
    originalPrice: p.mrp > p.price ? p.mrp : undefined,
  };
}

export const allProducts: ShopProduct[] = PRODUCTS.map(toShopProduct);

export function getShopProduct(idOrName: string | undefined | null): ShopProduct | undefined {
  const p = findProduct(idOrName);
  return p ? toShopProduct(p) : undefined;
}

export const productCategories = ["All", "Skincare", "Makeup"];
