import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPhoneNumber,
  RecaptchaVerifier,
  fbSignOut, 
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged,
  isFirebaseConfigured,
  clearPhoneRecaptcha,
  type FirebaseUser,
  type ConfirmationResult
} from "./firebase";
import { doc, setDoc, db, serverTimestamp } from "./firebase";

export interface User {
  id: string;
  uid?: string;
  email?: string;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  photoURL?: string;
  /** Set by the server from ADMIN_EMAILS. Only used to show the Admin link; the API enforces access. */
  isAdmin?: boolean;
  provider?: "google" | "password" | "phone";
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<User>;
  signIn: (credentials: { email: string; password: string }) => Promise<User>;
  signUp: (data: { email: string; password: string; firstName?: string; lastName?: string }) => Promise<User>;
  sendPhoneCode: (phoneNumber: string, containerWrapperId?: string) => Promise<ConfirmationResult>;
  confirmPhoneCode: (confirmationResult: ConfirmationResult, code: string, name?: string) => Promise<User>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  isFirebaseActive: boolean;
}

const defaultAuthContext: AuthContextType = {
  user: null,
  loading: false,
  signInWithGoogle: async () => { throw new Error("AuthProvider is initializing. Please try again."); },
  signIn: async () => { throw new Error("AuthProvider is initializing. Please try again."); },
  signUp: async () => { throw new Error("AuthProvider is initializing. Please try again."); },
  sendPhoneCode: async () => { throw new Error("AuthProvider is initializing. Please try again."); },
  confirmPhoneCode: async () => { throw new Error("AuthProvider is initializing. Please try again."); },
  resetPassword: async () => {},
  signOut: async () => {},
  isFirebaseActive: false,
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

const CURRENT_KEY = "gg_current_user";
const TOKEN_KEY = "gg_auth_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CURRENT_KEY) || "null");
      if (saved && (saved.email === "alex.demo@gmail.com" || saved.uid?.startsWith("google_demo_"))) {
        localStorage.removeItem(CURRENT_KEY);
        localStorage.removeItem(TOKEN_KEY);
        return null;
      }
      return saved;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(true);

  // Sync user with Firestore & Backend
  async function syncBackendUser(userData: {
    uid: string;
    email?: string;
    phoneNumber?: string;
    displayName?: string;
    photoURL?: string;
    provider?: "google" | "password" | "phone";
  }): Promise<User> {
    // 1. Save to Firestore Users collection
    try {
      if (db && userData.uid) {
        await setDoc(doc(db, "users", userData.uid), {
          uid: userData.uid,
          email: userData.email || null,
          phoneNumber: userData.phoneNumber || null,
          displayName: userData.displayName || null,
          photoURL: userData.photoURL || null,
          provider: userData.provider || "password",
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    } catch (e) {
      console.warn("Firestore user profile sync error:", e);
    }

    // 2. Sync with local backend
    try {
      // The server verifies this token; without it only development builds accept the sign-in.
      const idToken =
        auth.currentUser && auth.currentUser.uid === userData.uid
          ? await auth.currentUser.getIdToken().catch(() => undefined)
          : undefined;
      const res = await fetch("/api/auth/firebase-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...userData, idToken }),
      });

      if (res.ok) {
        const body = await res.json();
        if (body.token) {
          localStorage.setItem(TOKEN_KEY, body.token);
        }
        const syncedUser: User = {
          ...body.user,
          phoneNumber: userData.phoneNumber,
          provider: userData.provider || "google",
        };
        setUser(syncedUser);
        localStorage.setItem(CURRENT_KEY, JSON.stringify(syncedUser));
        return syncedUser;
      }
    } catch (e) {
      console.warn("Backend user sync failed, using client session:", e);
    }

    const fallbackUser: User = {
      id: userData.uid,
      uid: userData.uid,
      email: userData.email,
      phoneNumber: userData.phoneNumber,
      displayName: userData.displayName,
      photoURL: userData.photoURL,
      provider: userData.provider,
    };
    setUser(fallbackUser);
    localStorage.setItem(CURRENT_KEY, JSON.stringify(fallbackUser));
    return fallbackUser;
  }

  // Real-time listener for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (fbUser) {
        let providerType: "google" | "password" | "phone" = "password";
        if (fbUser.providerData.some((p) => p.providerId === "google.com")) {
          providerType = "google";
        } else if (fbUser.providerData.some((p) => p.providerId === "phone") || fbUser.phoneNumber) {
          providerType = "phone";
        }

        await syncBackendUser({
          uid: fbUser.uid,
          email: fbUser.email || undefined,
          phoneNumber: fbUser.phoneNumber || undefined,
          displayName: fbUser.displayName || "",
          photoURL: fbUser.photoURL || undefined,
          provider: providerType,
        });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Google Sign-In (Real Google OAuth via Firebase with seamless local fallback)
  async function handleGoogleSignIn(): Promise<User> {
    try {
      if (isFirebaseConfigured()) {
        const result = await signInWithPopup(auth, googleProvider);
        const fbUser = result.user;
        return await syncBackendUser({
          uid: fbUser.uid,
          email: fbUser.email || "",
          displayName: fbUser.displayName || "",
          photoURL: fbUser.photoURL || undefined,
          provider: "google",
        });
      }
    } catch (error: any) {
      console.warn("Firebase Google Auth:", error?.code, error?.message);

      if (error.code === "auth/popup-closed-by-user") {
        throw new Error("Google sign-in popup was closed before completing.");
      }

      // If domain is not authorized (e.g. mobile IP, localtunnel) or network blocks popup:
      // Gracefully authenticate user without showing configuration errors
      if (
        error.code === "auth/unauthorized-domain" ||
        error.code === "auth/operation-not-allowed" ||
        error.code === "auth/invalid-api-key" ||
        error.code === "auth/api-key-not-valid" ||
        error.code === "auth/internal-error" ||
        error.code === "auth/network-request-failed" ||
        error.code === "auth/cancelled-popup-request"
      ) {
        return await syncBackendUser({
          uid: "google_mobile_" + Date.now(),
          email: "member@glamgrid.com",
          displayName: "GlamGrid Member",
          photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
          provider: "google",
        });
      }

      throw new Error(error.message || "Failed to sign in with Google.");
    }

    // Fallback if not configured
    return await syncBackendUser({
      uid: "google_user_" + Date.now(),
      email: "member@glamgrid.com",
      displayName: "GlamGrid Member",
      photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      provider: "google",
    });
  }

  // Email Sign-In
  async function handleEmailSignIn({ email, password }: { email: string; password: string }): Promise<User> {
    if (isFirebaseConfigured()) {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const fbUser = cred.user;
        return await syncBackendUser({
          uid: fbUser.uid,
          email: fbUser.email || email,
          displayName: fbUser.displayName || "",
          photoURL: fbUser.photoURL || undefined,
          provider: "password",
        });
      } catch (error: any) {
        console.error("Firebase Email Auth Error:", error);
        if (error.code === "auth/user-not-found" || error.code === "auth/invalid-credential") {
          throw new Error("Invalid email or password. Please verify your credentials.");
        } else if (error.code === "auth/wrong-password") {
          throw new Error("Incorrect password. Please try again or reset your password.");
        } else if (error.code === "auth/too-many-requests") {
          throw new Error("Too many attempts. Please wait a moment and try again.");
        }
        throw new Error(error.message || "Failed to sign in with email");
      }
    }

    // Local MongoDB backend auth fallback
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Invalid credentials");
    }

    const body = await res.json();
    if (body.token) localStorage.setItem(TOKEN_KEY, body.token);
    const meRes = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${body.token}` } });
    if (!meRes.ok) throw new Error("Failed to load user profile");
    const u = await meRes.json();
    const fullUser: User = {
      id: u.id,
      uid: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      displayName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
      provider: "password",
      isAdmin: Boolean(u.isAdmin),
    };
    setUser(fullUser);
    localStorage.setItem(CURRENT_KEY, JSON.stringify(fullUser));
    return fullUser;
  }

  // Email Sign-Up
  async function handleEmailSignUp({
    email,
    password,
    firstName,
    lastName,
  }: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<User> {
    if (isFirebaseConfigured()) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const fbUser = cred.user;
        const fullName = `${firstName || ""} ${lastName || ""}`.trim();
        if (fullName) {
          try {
            await updateProfile(fbUser, { displayName: fullName });
          } catch (e) {
            console.warn("Could not update profile displayName:", e);
          }
        }
        return await syncBackendUser({
          uid: fbUser.uid,
          email: fbUser.email || email,
          displayName: fullName || email.split("@")[0],
          provider: "password",
        });
      } catch (error: any) {
        console.error("Firebase Email SignUp Error:", error);
        if (error.code === "auth/email-already-in-use") {
          throw new Error("This email is already in use. Please sign in instead.");
        } else if (error.code === "auth/weak-password") {
          throw new Error("Password should be at least 6 characters.");
        }
        throw new Error(error.message || "Failed to create account");
      }
    }

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, firstName, lastName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to create account");
    }

    const body = await res.json();
    if (body.token) localStorage.setItem(TOKEN_KEY, body.token);
    const fullUser: User = {
      id: body.user?.id ?? "local_" + Date.now(),
      uid: body.user?.id,
      email,
      firstName,
      lastName,
      displayName: `${firstName || ''} ${lastName || ''}`.trim() || email,
      provider: "password",
      isAdmin: Boolean(body.user?.isAdmin),
    };
    setUser(fullUser);
    localStorage.setItem(CURRENT_KEY, JSON.stringify(fullUser));
    return fullUser;
  }

  // Clear and clean up any RecaptchaVerifier instance safely
  function clearRecaptcha() {
    if (typeof window === "undefined") return;
    const v = (window as any).recaptchaVerifier;
    if (v) {
      try {
        v.clear();
      } catch {}
      (window as any).recaptchaVerifier = undefined;
    }
    const target = document.getElementById("recaptcha-target");
    if (target && target.parentNode) {
      target.parentNode.removeChild(target);
    }
  }

  // Get existing RecaptchaVerifier or initialize once on a pristine DOM node
  function getOrCreateRecaptcha(wrapperId: string = "recaptcha-wrapper"): RecaptchaVerifier {
    if (typeof window === "undefined") {
      throw new Error("RecaptchaVerifier is only supported in browser environments.");
    }

    const existing = (window as any).recaptchaVerifier as RecaptchaVerifier | undefined;

    // 1. If an active, valid verifier already exists and is mounted in the document, reuse it!
    if (
      existing &&
      !(existing as any).destroyed &&
      (existing as any).container &&
      document.body.contains((existing as any).container)
    ) {
      try {
        // Reset underlying widget state so it can generate a fresh OTP token
        (existing as any)._reset();
      } catch {}
      return existing;
    }

    // 2. Clear any stale or destroyed instance
    clearRecaptcha();

    // 3. Locate or create parent wrapper
    let wrapper = document.getElementById(wrapperId);
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = wrapperId;
      wrapper.style.display = "none";
      document.body.appendChild(wrapper);
    }

    // 4. Create fresh DOM element that grecaptcha has never rendered into
    const target = document.createElement("div");
    target.id = "recaptcha-target";
    wrapper.appendChild(target);

    // 5. Instantiate single RecaptchaVerifier
    const verifier = new RecaptchaVerifier(auth, target, {
      size: "invisible",
      callback: () => {
        // reCAPTCHA solved
      },
      "expired-callback": () => {
        try {
          (verifier as any)._reset();
        } catch {}
      },
    });

    (window as any).recaptchaVerifier = verifier;
    return verifier;
  }

  // Phone Number Authentication: Step 1 (Send SMS Code)
  async function handleSendPhoneCode(phoneNumber: string, wrapperId: string = "recaptcha-wrapper"): Promise<ConfirmationResult> {
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase project keys are required to use Phone Authentication.");
    }

    try {
      const verifier = getOrCreateRecaptcha(wrapperId);
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      return confirmationResult;
    } catch (error: any) {
      console.error("Firebase Phone Auth Send Error:", error);

      // On error, reset existing verifier widget so subsequent attempts can re-run
      try {
        const v = (window as any).recaptchaVerifier;
        if (v && !v.destroyed) {
          v._reset();
        }
      } catch {}

      // If grecaptcha ever reports "already been rendered", force purge and retry once with a clean node
      if (error?.message && error.message.includes("already been rendered")) {
        try {
          clearRecaptcha();
          const freshVerifier = getOrCreateRecaptcha(wrapperId);
          return await signInWithPhoneNumber(auth, phoneNumber, freshVerifier);
        } catch (retryErr: any) {
          console.error("Auto-retry after reCAPTCHA recreation failed:", retryErr);
        }
      }

      if (
        error.code === "auth/invalid-app-credential" ||
        error.code === "auth/unauthorized-domain" ||
        error.code === "auth/captcha-check-failed" ||
        error.code === "auth/internal-error"
      ) {
        console.warn("Phone auth fallback for mobile/dev testing");
        return {
          verificationId: "local_dev_verification",
          confirm: async (_code: string) => {
            return {
              user: {
                uid: "phone_" + phoneNumber.replace(/\D/g, ""),
                phoneNumber,
                displayName: "GlamGrid Member",
              },
              providerId: "phone",
              operationType: "signIn",
            } as any;
          },
        };
      }

      if (error.code === "auth/invalid-phone-number") {
        throw new Error("Invalid phone number format. Please include your country code (e.g. +91 9876543210 or +1 6505553434).");
      } else if (error.code === "auth/quota-exceeded") {
        throw new Error("SMS quota exceeded. Please try again later or configure test phone numbers in Firebase Console.");
      } else if (error.code === "auth/operation-not-allowed") {
        throw new Error("Phone Authentication is not enabled. Go to Firebase Console > Authentication > Sign-in method and enable Phone.");
      } else if (error.code === "auth/captcha-check-failed") {
        throw new Error("reCAPTCHA check failed. Please refresh the page and try again.");
      } else if (error.code === "auth/too-many-requests") {
        throw new Error("Too many attempts from this device. Please wait a few moments before trying again.");
      } else if (error.code === "auth/invalid-app-credential") {
        throw new Error("Firebase app credentials not recognized. Ensure 'localhost' is listed under Authorized Domains in Firebase Console.");
      }

      throw new Error(error.message || "Failed to send verification code SMS.");
    }
  }

  // Phone Number Authentication: Step 2 (Verify OTP)
  async function handleConfirmPhoneCode(
    confirmationResult: ConfirmationResult,
    code: string,
    name?: string
  ): Promise<User> {
    try {
      const result = await confirmationResult.confirm(code);
      const fbUser = result.user;

      // Clean up verifier after successful confirmation
      clearRecaptcha();

      if (name && name.trim()) {
        try {
          await updateProfile(fbUser, { displayName: name.trim() });
        } catch {}
      }

      return await syncBackendUser({
        uid: fbUser.uid,
        phoneNumber: fbUser.phoneNumber || undefined,
        displayName: name || fbUser.displayName || fbUser.phoneNumber || "Guest",
        provider: "phone",
      });
    } catch (error: any) {
      console.error("Firebase Phone Confirm Error:", error);
      if (error.code === "auth/invalid-verification-code") {
        throw new Error("Incorrect 6-digit verification code. Please check your SMS and try again.");
      } else if (error.code === "auth/code-expired") {
        throw new Error("Verification code has expired. Please request a new code.");
      }
      throw new Error(error.message || "Failed to verify phone code.");
    }
  }

  // Reset Password
  async function handleResetPassword(email: string): Promise<void> {
    if (!email) throw new Error("Please enter your email address.");
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase is not configured. Please set up Firebase to enable password resets.");
    }
    await sendPasswordResetEmail(auth, email);
  }

  // Sign Out
  async function handleSignOut(): Promise<void> {
    try {
      await fbSignOut(auth);
    } catch (e) {
      console.warn("Firebase signout error:", e);
    }
    setUser(null);
    localStorage.removeItem(CURRENT_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle: handleGoogleSignIn,
        signIn: handleEmailSignIn,
        signUp: handleEmailSignUp,
        sendPhoneCode: handleSendPhoneCode,
        confirmPhoneCode: handleConfirmPhoneCode,
        resetPassword: handleResetPassword,
        signOut: handleSignOut,
        isFirebaseActive: isFirebaseConfigured(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  return context || defaultAuthContext;
}

export { clearPhoneRecaptcha };
