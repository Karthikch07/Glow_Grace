import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp 
} from "./firebase";

// ================= TYPES =================
export interface ServiceItem {
  id: string;
  name: string;
  category: "Spa" | "Hair Salon" | "Barbershop" | "Fitness" | "MedSpa" | "Beauty Studio";
  description: string;
  duration: string;
  price: number;
  image: string;
  featured?: boolean;
  rating?: number;
}

export interface ProductItem {
  id: string;
  name: string;
  brand: string;
  category: "Skincare" | "Haircare" | "Body Care" | "Wellness" | "Cosmetics";
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
  reviews: number;
  stock: number;
}

export interface BookingRecord {
  id?: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  serviceId: string;
  serviceName: string;
  stylistId: string;
  stylistName: string;
  date: string;
  time: string;
  price: number;
  status: "confirmed" | "completed" | "cancelled" | "pending";
  createdAt?: any;
}

export interface OrderRecord {
  id?: string;
  userId: string;
  userEmail: string;
  userName: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
  }>;
  totalAmount: number;
  shippingAddress: string;
  paymentStatus: "paid" | "pending" | "cod";
  createdAt?: any;
}

// Initial Beauty and Wellness Seed Catalog
export const initialServices: Omit<ServiceItem, "id">[] = [
  {
    name: "Relaxation Aromatherapy Massage",
    category: "Spa",
    description: "Full body Swedish massage with essential oils for deep tension release",
    duration: "60 min",
    price: 1150,
    image: "/assets/stock_images/spa_massage_therapy__0dc874f5.jpg",
    featured: true,
    rating: 4.9
  },
  {
    name: "Hot Stone Thermal Therapy",
    category: "Spa",
    description: "Deep tissue basalt stone massage to ease muscular stress and boost circulation",
    duration: "90 min",
    price: 1450,
    image: "/assets/stock_images/hot_stone_massage_6c34b301.jpg",
    featured: true,
    rating: 4.8
  },
  {
    name: "Precision Haircut & Blowdry",
    category: "Hair Salon",
    description: "Custom styling consultation, shampoo, designer cut and professional blowdry",
    duration: "45 min",
    price: 499,
    image: "/assets/stock_images/hair_salon_styling_c_a9b33900.jpg",
    featured: true,
    rating: 4.9
  },
  {
    name: "Classic Gentleman's Grooming",
    category: "Barbershop",
    description: "Traditional scissor cut, hot towel straight razor shave, and beard oil finish",
    duration: "30 min",
    price: 149,
    image: "/assets/stock_images/modern_barbershop_in_ed205b41.jpg",
    featured: false,
    rating: 4.7
  },
  {
    name: "Beard Sculpting & Conditioning",
    category: "Barbershop",
    description: "Beard trim, shape definition with organic argan conditioning treatment",
    duration: "20 min",
    price: 99,
    image: "/assets/stock_images/breadgrooming.jpg",
    featured: false,
    rating: 4.6
  },
  {
    name: "Holistic Yoga & Mindfulness",
    category: "Fitness",
    description: "Personalized Hatha and Vinyasa yoga session with breathwork",
    duration: "45 min",
    price: 125,
    image: "/assets/stock_images/yoga_fitness_class_51fa1f1f.jpg",
    featured: false,
    rating: 4.8
  },
  {
    name: "Personal Wellness & Fitness Coaching",
    category: "Fitness",
    description: "1-on-1 certified trainer session focused on posture, core strength & endurance",
    duration: "60 min",
    price: 299,
    image: "/assets/stock_images/Personal Training.jpeg",
    featured: false,
    rating: 4.9
  },
  {
    name: "Glow Radiance Hydra-Facial",
    category: "MedSpa",
    description: "Exfoliating medical-grade facial with hyaluronic acid infusion for glassy skin",
    duration: "60 min",
    price: 1850,
    image: "/assets/stock_images/makeup_beauty_produc_554f7469.jpg",
    featured: true,
    rating: 5.0
  }
];

export const initialProducts: Omit<ProductItem, "id">[] = [
  {
    name: "Radiant Vitamin C Glow Serum",
    brand: "GlowGrace Botanicals",
    category: "Skincare",
    description: "Potent 15% antioxidant L-ascorbic acid serum for bright, even skin tone",
    price: 899,
    originalPrice: 1299,
    image: "/assets/stock_images/Vitamin C Serum.jpeg",
    rating: 4.9,
    reviews: 142,
    stock: 25
  },
  {
    name: "Intense Hydrating Peptide Serum",
    brand: "DermaGlow",
    category: "Skincare",
    description: "Multi-weight hyaluronic acid complex with tripeptides for barrier repair",
    price: 1150,
    originalPrice: 1550,
    image: "/assets/stock_images/hydratingserum.jpg",
    rating: 4.8,
    reviews: 98,
    stock: 18
  },
  {
    name: "Rejuvenating Night Youth Elixir",
    brand: "GlowGrace Luxury",
    category: "Skincare",
    description: "Overnight cellular renewal cream with encapsulated retinol & squalane",
    price: 1450,
    originalPrice: 1850,
    image: "/assets/stock_images/instaglownightcream.jpg",
    rating: 4.9,
    reviews: 86,
    stock: 12
  },
  {
    name: "Firming Botanical Eye Cream",
    brand: "PureAura",
    category: "Skincare",
    description: "Caffeine and green tea extract formula to de-puff and reduce dark circles",
    price: 650,
    originalPrice: 850,
    image: "/assets/stock_images/eyecream.jpeg",
    rating: 4.7,
    reviews: 64,
    stock: 30
  },
  {
    name: "Illuminating Sheet Mask Trio",
    brand: "GlowGrace Spa",
    category: "Skincare",
    description: "Set of 3 biodegradeable biocellulose masks soaked in niacinamide serum",
    price: 399,
    originalPrice: 599,
    image: "/assets/stock_images/facemaskset.jpg",
    rating: 4.6,
    reviews: 110,
    stock: 40
  }
];

// ================= FIRESTORE SERVICES =================

// Fetch Beauty & Wellness Services
export async function getFirestoreServices(): Promise<ServiceItem[]> {
  try {
    const servicesRef = collection(db, "services");
    const snap = await getDocs(servicesRef);
    if (!snap.empty) {
      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ServiceItem));
    }
  } catch (e) {
    console.warn("Firestore getServices fallback:", e);
  }

  // Fallback to initial services if collection is empty or not yet seeded
  return initialServices.map((s, idx) => ({ id: `srv_${idx + 1}`, ...s }));
}

// Fetch Beauty & Wellness Products
export async function getFirestoreProducts(): Promise<ProductItem[]> {
  try {
    const productsRef = collection(db, "products");
    const snap = await getDocs(productsRef);
    if (!snap.empty) {
      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProductItem));
    }
  } catch (e) {
    console.warn("Firestore getProducts fallback:", e);
  }

  // Fallback to initial products
  return initialProducts.map((p, idx) => ({ id: `prd_${idx + 1}`, ...p }));
}

// Create a Beauty & Wellness Appointment Booking in Firestore
export async function createFirestoreBooking(booking: Omit<BookingRecord, "id" | "createdAt">): Promise<string> {
  const bookingsRef = collection(db, "bookings");
  const docRef = await addDoc(bookingsRef, {
    ...booking,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// Fetch user's bookings from Firestore
export async function getUserFirestoreBookings(userId: string): Promise<BookingRecord[]> {
  try {
    const bookingsRef = collection(db, "bookings");
    const q = query(bookingsRef, where("userId", "==", userId));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as BookingRecord));
  } catch (e) {
    console.warn("Failed to get Firestore bookings:", e);
    return [];
  }
}

// Create an Ecommerce Order in Firestore
export async function createFirestoreOrder(order: Omit<OrderRecord, "id" | "createdAt">): Promise<string> {
  const ordersRef = collection(db, "orders");
  const docRef = await addDoc(ordersRef, {
    ...order,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// Seed Initial Catalog into Firestore
export async function seedFirestoreCatalog(): Promise<{ servicesCount: number; productsCount: number }> {
  try {
    // 1. Seed Services
    for (let i = 0; i < initialServices.length; i++) {
      const s = initialServices[i];
      const docId = `service_${i + 1}`;
      await setDoc(doc(db, "services", docId), s, { merge: true });
    }

    // 2. Seed Products
    for (let i = 0; i < initialProducts.length; i++) {
      const p = initialProducts[i];
      const docId = `product_${i + 1}`;
      await setDoc(doc(db, "products", docId), p, { merge: true });
    }

    return { servicesCount: initialServices.length, productsCount: initialProducts.length };
  } catch (err) {
    console.error("Firestore seeding error:", err);
    throw err;
  }
}

