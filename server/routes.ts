import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { HttpError } from "./http";
import { connectMongoDB, isDbReady } from "./mongodb";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { bookingsRouter, startUnpaidBookingSweeper } from "./routes/bookings";
import { cartRouter } from "./routes/cart";
import { catalogRouter } from "./routes/catalog";
import { ordersRouter, startUnpaidOrderSweeper } from "./routes/orders";

export async function registerRoutes(app: Express): Promise<Server> {
  await connectMongoDB();
  startUnpaidOrderSweeper();
  startUnpaidBookingSweeper();

  const api = express.Router();
  // Parse bodies inside the API router so malformed JSON reaches the JSON error handler below.
  api.use(express.json({ limit: "100kb" }));
  api.use(express.urlencoded({ extended: false, limit: "100kb" }));

  api.get("/health", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(isDbReady() ? 200 : 503).json({ ok: isDbReady(), db: isDbReady() ? "up" : "down", time: new Date().toISOString() });
  });

  api.use("/auth", authRouter());
  api.use(adminRouter());
  api.use(cartRouter());
  api.use(ordersRouter());
  api.use(bookingsRouter());
  api.use(catalogRouter());

  api.use((_req, _res, next) => next(new HttpError(404, "Not found")));

  // JSON errors for every /api route. Never leaks stack traces to clients.
  api.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === "entity.parse.failed") err = new HttpError(400, "Malformed JSON body.");
    if (err?.type === "entity.too.large") err = new HttpError(413, "Request body is too large.");
    if (err?.name === "ValidationError") err = new HttpError(400, err.message);
    if (err?.code === 11000) err = new HttpError(409, "That record already exists.");

    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error(`[api] ${req.method} ${req.originalUrl} failed:`, err);
    res.status(status).json({
      message: status >= 500 ? "Something went wrong on our side. Please try again." : err.message,
      ...(err instanceof HttpError && err.details ? { details: err.details } : {}),
    });
  });

  app.use("/api", api);
  return createServer(app);
}
