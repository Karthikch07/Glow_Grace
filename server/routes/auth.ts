import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { isAdminEmail, requireAuth, signUserToken } from "../auth";
import { env } from "../env";
import { verifyFirebaseIdToken } from "../firebase-auth";
import { HttpError, parseBody, rateLimit, requireDb, route } from "../http";
import { User } from "../mongodb";

type UserDoc = InstanceType<typeof User>;

function publicUser(user: UserDoc, extra: Record<string, unknown> = {}) {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    id: user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: displayName || undefined,
    phoneNumber: user.phone,
    photoURL: user.photoURL,
    isAdmin: isAdminEmail(user.email),
    ...extra,
  };
}

function splitName(displayName?: string | null) {
  const parts = (displayName || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(8, "must be at least 8 characters").max(128),
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

const firebaseSyncSchema = z.object({
  idToken: z.string().min(20).optional(),
  uid: z.string().trim().min(1).max(128).optional(),
  email: z.string().trim().toLowerCase().email().max(150).optional().or(z.literal("")),
  displayName: z.string().trim().max(100).optional().nullable(),
  photoURL: z.string().url().max(1000).optional().nullable().or(z.literal("")),
  phoneNumber: z.string().trim().max(30).optional().nullable(),
  provider: z.enum(["google", "password", "phone"]).optional(),
});

export function authRouter(): Router {
  const r = Router();
  const authLimiter = rateLimit({ name: "auth", windowMs: 60_000, max: 20 });

  r.post(
    "/register",
    authLimiter,
    requireDb,
    route(async (req, res) => {
      const body = parseBody(registerSchema, req.body);
      if (await User.exists({ email: body.email })) {
        throw new HttpError(409, "An account with this email already exists. Try signing in.");
      }
      const user = await User.create({
        email: body.email,
        passwordHash: await bcrypt.hash(body.password, 12),
        firstName: body.firstName,
        lastName: body.lastName,
        authProvider: "password",
      });
      res.status(201).json({ token: signUserToken({ id: user._id.toString(), email: user.email }), user: publicUser(user) });
    }),
  );

  r.post(
    "/login",
    authLimiter,
    requireDb,
    route(async (req, res) => {
      const body = parseBody(loginSchema, req.body);
      const user = await User.findOne({ email: body.email });
      // Firebase-only accounts have no bcrypt hash; treat them as a failed login.
      const ok = Boolean(user?.passwordHash?.startsWith("$2")) && (await bcrypt.compare(body.password, user!.passwordHash!));
      if (!user || !ok) throw new HttpError(401, "Invalid email or password.");
      res.json({ token: signUserToken({ id: user._id.toString(), email: user.email }), user: publicUser(user) });
    }),
  );

  r.get(
    "/me",
    requireAuth,
    requireDb,
    route(async (req, res) => {
      const user = await User.findById(req.auth!.id);
      if (!user) throw new HttpError(404, "Account not found.");
      res.json(publicUser(user));
    }),
  );

  /**
   * Exchange a Firebase sign-in for an API token. Production requires a
   * verified Firebase ID token; development also accepts the client's demo
   * fallback logins (see `allowUnverifiedFirebaseSync`).
   */
  r.post(
    "/firebase-sync",
    authLimiter,
    requireDb,
    route(async (req, res) => {
      const body = parseBody(firebaseSyncSchema, req.body);

      let uid: string;
      let email: string | undefined;
      let emailVerified = false;
      let displayName = body.displayName ?? undefined;
      let photoURL = body.photoURL || undefined;
      let phone = body.phoneNumber ?? undefined;

      if (body.idToken) {
        let claims;
        try {
          claims = await verifyFirebaseIdToken(body.idToken);
        } catch (e: any) {
          throw new HttpError(401, "Could not verify your sign-in. Please sign in again.", { reason: e?.message });
        }
        uid = claims.sub;
        email = claims.email?.toLowerCase();
        emailVerified = claims.email_verified === true;
        displayName = claims.name ?? displayName;
        photoURL = claims.picture ?? photoURL;
        phone = claims.phone_number ?? phone;
      } else if (env.allowUnverifiedFirebaseSync && body.uid) {
        uid = body.uid;
        email = body.email || undefined;
        emailVerified = true;
      } else {
        throw new HttpError(401, "A Firebase ID token is required.");
      }

      let user = await User.findOne({ firebaseUid: uid });
      if (!user && email) {
        const byEmail = await User.findOne({ email });
        // Only link to an existing account when Firebase vouches for the email,
        // or that account was itself created through Firebase. Otherwise an
        // unverified email could be used to take over a password account.
        if (byEmail && (emailVerified || !byEmail.passwordHash)) user = byEmail;
        else if (byEmail) throw new HttpError(409, "Verify your email address to link it to your existing account.");
      }

      const { firstName, lastName } = splitName(displayName);
      if (!user) {
        user = await User.create({
          firebaseUid: uid,
          email,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phone,
          photoURL,
          authProvider: body.provider || "google",
        });
      } else {
        user.firebaseUid = uid;
        if (!user.firstName && firstName) user.firstName = firstName;
        if (!user.lastName && lastName) user.lastName = lastName;
        if (photoURL) user.photoURL = photoURL;
        if (phone) user.phone = phone;
        await user.save();
      }

      res.json({
        token: signUserToken({ id: user._id.toString(), email: user.email }),
        user: publicUser(user, { uid, displayName: displayName || publicUser(user).displayName }),
      });
    }),
  );

  return r;
}
