import jwt from "jsonwebtoken";
import { env } from "./env";

/**
 * Verifies Firebase Authentication ID tokens without the Admin SDK, following
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function fetchCerts(force = false): Promise<Record<string, string>> {
  if (!force && certCache && certCache.expiresAt > Date.now()) return certCache.certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Firebase signing certificates (${res.status})`);
  const certs = (await res.json()) as Record<string, string>;
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1];
  certCache = { certs, expiresAt: Date.now() + (maxAge ? parseInt(maxAge, 10) * 1000 : 3600_000) };
  return certs;
}

export interface FirebaseClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  phone_number?: string;
  firebase?: { sign_in_provider?: string };
}

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseClaims> {
  const projectId = env.firebaseProjectId;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID) is not configured");

  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded && typeof decoded === "object" ? decoded.header.kid : undefined;
  if (!kid) throw new Error("Malformed ID token");

  let certs = await fetchCerts();
  if (!certs[kid]) certs = await fetchCerts(true); // keys rotate; retry once
  const cert = certs[kid];
  if (!cert) throw new Error("ID token signed with an unknown key");

  const payload = jwt.verify(idToken, cert, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  }) as FirebaseClaims;

  if (!payload.sub) throw new Error("ID token has no subject");
  return payload;
}
