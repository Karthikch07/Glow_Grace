import { Router } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../auth";
import { isProduction } from "../env";
import { HttpError, escapeRegex, parseBody, requireDb, route } from "../http";
import { Product, Review, Service, User } from "../mongodb";

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(2000),
  duration: z.string().trim().min(1).max(50),
  price: z.number().min(0).max(1_000_000),
  image: z.string().trim().min(1).max(1000),
});

const productSchema = z.object({
  sku: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(150),
  brand: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(3000),
  size: z.string().trim().max(50).optional(),
  price: z.number().min(0).max(1_000_000),
  originalPrice: z.number().min(0).max(1_000_000).optional(),
  image: z.string().trim().min(1).max(1000),
  stock: z.number().int().min(0).max(100_000).default(0),
});

const reviewSchema = z
  .object({
    serviceId: z.string().trim().min(1).max(100).optional(),
    productId: z.string().trim().min(1).max(100).optional(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(1).max(2000),
  })
  .refine((v) => v.serviceId || v.productId, "serviceId or productId is required");

function listQuery(query: Record<string, unknown>, searchFields: string[]) {
  const filter: Record<string, unknown> = {};
  const category = typeof query.category === "string" ? query.category : undefined;
  const search = typeof query.search === "string" ? query.search.trim().slice(0, 100) : "";
  if (category && category !== "All") filter.category = category;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = searchFields.map((f) => ({ [f]: rx }));
  }
  return filter;
}

export function catalogRouter(): Router {
  const r = Router();

  r.get(
    "/services",
    requireDb,
    route(async (req, res) => {
      res.json(await Service.find(listQuery(req.query, ["name", "description"])).lean());
    }),
  );

  r.post(
    "/services",
    requireAdmin,
    requireDb,
    route(async (req, res) => {
      res.status(201).json(await Service.create(parseBody(serviceSchema, req.body)));
    }),
  );

  r.get(
    "/products",
    requireDb,
    route(async (req, res) => {
      res.json(await Product.find(listQuery(req.query, ["name", "brand"])).lean());
    }),
  );

  r.post(
    "/products",
    requireAdmin,
    requireDb,
    route(async (req, res) => {
      res.status(201).json(await Product.create(parseBody(productSchema, req.body)));
    }),
  );

  r.get(
    "/reviews/:type/:id",
    requireDb,
    route(async (req, res) => {
      const { type, id } = req.params;
      if (type !== "service" && type !== "product") throw new HttpError(400, "type must be service or product");
      const filter = type === "service" ? { serviceId: id } : { productId: id };
      res.json(await Review.find(filter).sort({ createdAt: -1 }).limit(100).lean());
    }),
  );

  r.post(
    "/reviews",
    requireAuth,
    requireDb,
    route(async (req, res) => {
      const body = parseBody(reviewSchema, req.body);
      const user = await User.findById(req.auth!.id).lean();
      const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "GlowGrace customer";
      res.status(201).json(await Review.create({ ...body, userId: req.auth!.id, userName }));
    }),
  );

  /**
   * Local setup helper used by the Account page to write Firebase web config
   * into .env. Disabled in production and only reachable from this machine,
   * because it writes to disk.
   */
  r.post(
    "/config/firebase",
    route(async (req, res) => {
      const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "");
      if (isProduction || !loopback) throw new HttpError(404, "Not found");

      const field = z.string().trim().max(200).regex(/^[^\r\n]*$/, "must be a single line");
      const body = parseBody(
        z.object({
          apiKey: field.min(1),
          authDomain: field.min(1),
          projectId: field.optional(),
          storageBucket: field.optional(),
          messagingSenderId: field.optional(),
          appId: field.optional(),
        }),
        req.body,
      );

      const envPath = path.resolve(process.cwd(), ".env");
      let content = "";
      try {
        content = await fs.promises.readFile(envPath, "utf-8");
      } catch {
        /* new file */
      }
      const updates: Record<string, string> = {
        VITE_FIREBASE_API_KEY: body.apiKey,
        VITE_FIREBASE_AUTH_DOMAIN: body.authDomain,
        VITE_FIREBASE_PROJECT_ID: body.projectId || "",
        VITE_FIREBASE_STORAGE_BUCKET: body.storageBucket || "",
        VITE_FIREBASE_MESSAGING_SENDER_ID: body.messagingSenderId || "",
        VITE_FIREBASE_APP_ID: body.appId || "",
      };
      for (const [key, val] of Object.entries(updates)) {
        const rx = new RegExp(`^${key}=.*$`, "m");
        content = rx.test(content) ? content.replace(rx, `${key}=${val}`) : `${content}\n${key}=${val}`;
      }
      await fs.promises.writeFile(envPath, content.trim() + "\n", "utf-8");
      res.json({ success: true, message: "Firebase configuration saved to .env" });
    }),
  );

  return r;
}
