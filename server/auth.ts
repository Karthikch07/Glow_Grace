import jwt from "jsonwebtoken";
import type { Request, RequestHandler } from "express";
import { env } from "./env";

/**
 * Stateless JWT auth. The client stores the token from /api/auth/login,
 * /api/auth/register or /api/auth/firebase-sync and sends it as
 * `Authorization: Bearer <token>`.
 */

export interface AuthUser {
  id: string;
  email?: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

const TOKEN_TTL = "7d";

export function signUserToken(user: { id: string; email?: string | null }): string {
  return jwt.sign({ sub: user.id, email: user.email ?? undefined }, env.jwtSecret, {
    expiresIn: TOKEN_TTL,
    algorithm: "HS256",
  });
}

function readBearer(req: Request): string | undefined {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  return scheme === "Bearer" && token ? token : undefined;
}

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email) && env.adminEmails.includes(email!.toLowerCase());
}

/** Returns the authenticated user, `null` when there is no token, or throws on a bad token. */
function resolveAuth(req: Request): AuthUser | null {
  const token = readBearer(req);
  if (!token) return null;
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  if (!payload.sub) throw new Error("Token has no subject");
  const email = typeof payload.email === "string" ? payload.email : undefined;
  return { id: payload.sub, email, isAdmin: isAdminEmail(email) };
}

export const requireAuth: RequestHandler = (req, res, next) => {
  try {
    const user = resolveAuth(req);
    if (!user) return res.status(401).json({ message: "Please sign in to continue." });
    req.auth = user;
    next();
  } catch {
    res.status(401).json({ message: "Your session has expired. Please sign in again." });
  }
};

/** Attaches `req.auth` when a valid token is present; never rejects. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  try {
    req.auth = resolveAuth(req) ?? undefined;
  } catch {
    req.auth = undefined;
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  requireAuth(req, res, () => {
    if (!req.auth?.isAdmin) return res.status(403).json({ message: "Admin access required." });
    next();
  });
};
