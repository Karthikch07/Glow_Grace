import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z, ZodTypeAny } from "zod";
import { isDbReady } from "./mongodb";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function route(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.join(".");
    throw new HttpError(400, field ? `${field}: ${first.message}` : first?.message || "Invalid request", {
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return result.data;
}

export const requireDb: RequestHandler = (_req, res, next) => {
  if (!isDbReady()) {
    return res.status(503).json({ message: "Our store is temporarily unavailable. Please try again in a minute." });
  }
  next();
};

/**
 * Small fixed-window rate limiter keyed by client IP. In-memory, so it is per
 * process; put a shared limiter (e.g. at the proxy) in front of multi-instance deploys.
 */
export function rateLimit({ windowMs, max, name }: { windowMs: number; max: number; name: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    hits.forEach((v, k) => {
      if (v.resetAt <= now) hits.delete(k);
    });
  }, windowMs).unref();

  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ message: "Too many requests. Please wait a moment and try again." });
    }
    next();
  };
}

/** Escape user input before using it inside a MongoDB `$regex`. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
