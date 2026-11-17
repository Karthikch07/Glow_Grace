import "./env";
import mongoose from "mongoose";
import { PRODUCTS } from "@shared/catalog";
import { env } from "./env";
import { Product, Service } from "./mongodb";

const servicesData = [
  {
    name: "Relaxation Massage",
    category: "Spa",
    description: "Full body massage with aromatherapy",
    duration: "60 min",
    price: 1150,
    image: "/assets/stock_images/spa_massage_therapy__0dc874f5.jpg"
  },
  {
    name: "Hot Stone Therapy",
    category: "Spa",
    description: "Deep tissue massage with heated stones",
    duration: "90 min",
    price: 1450,
    image: "/assets/stock_images/hot_stone_massage_6c34b301.jpg"
  },
  {
    name: "Classic Haircut",
    category: "Barbershop",
    description: "Traditional cut with hot towel finish",
    duration: "30 min",
    price: 149,
    image: "/assets/stock_images/modern_barbershop_in_ed205b41.jpg"
  },
  {
    name: "Beard Grooming",
    category: "Barbershop",
    description: "Trim, shape and conditioning",
    duration: "20 min",
    price: 99,
    image: "/assets/stock_images/breadgrooming.jpg"
  },
  {
    name: "Personal Training",
    category: "Fitness",
    description: "One-on-one fitness coaching",
    duration: "60 min",
    price: 99,
    image: "/assets/stock_images/Personal Training.jpeg"
  },
  {
    name: "Yoga Class",
    category: "Fitness",
    description: "Group yoga session for all levels",
    duration: "45 min",
    price: 125,
    image: "/assets/stock_images/yoga_fitness_class_51fa1f1f.jpg"
  },
  {
    name: "Botox Treatment",
    category: "MedSpa",
    description: "Professional wrinkle reduction",
    duration: "30 min",
    price: 1350,
    image: "/assets/stock_images/Botox Treatment.jpeg"
  },
  {
    name: "Hair Styling",
    category: "Salon",
    description: "Professional styling for any occasion",
    duration: "45 min",
    price: 285,
    image: "/assets/stock_images/hair_salon_styling_c_a9b33900.jpg"
  }
];

const productsData = PRODUCTS.map((p) => ({
  sku: p.id,
  name: p.name,
  brand: p.brand,
  description: p.description,
  category: p.category,
  size: p.size,
  rating: p.rating,
  reviews: p.reviews,
  price: p.price,
  originalPrice: p.mrp > p.price ? p.mrp : undefined,
  stock: p.stock,
  image: p.imagePath,
}));

async function seedDatabase() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });

    console.log("Replacing services...");
    await Service.deleteMany({});
    const services = await Service.insertMany(servicesData);

    // Upsert products by SKU so live stock levels survive a re-seed.
    // Pass --reset-stock to restore the catalogue's stock levels.
    const resetStock = process.argv.includes("--reset-stock");
    console.log("Upserting products...");
    await Product.deleteMany({ sku: { $exists: false } });
    for (const { stock, ...product } of productsData) {
      await Product.updateOne(
        { sku: product.sku },
        resetStock ? { $set: { ...product, stock } } : { $set: product, $setOnInsert: { stock } },
        { upsert: true },
      );
    }
    await Product.syncIndexes();

    console.log(`Seeded ${services.length} services and ${productsData.length} products.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase();
