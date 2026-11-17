import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut as fbSignOut,
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User as FirebaseUser,
  type ConfirmationResult
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  type Firestore 
} from "firebase/firestore";

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/** Firebase project ID. Google never allows a project ID to be renamed, so customers should not see it. */
export const TARGET_PROJECT_ID = "mediblog-n0a10";
/** The name customers see. */
export const APP_NAME = "GlowGrace";

// Production/default configuration built directly into the codebase
export const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyCNU1iqQdJrFhdbbDqg0_tHKQUS1TZCg0I",
  authDomain: "mediblog-n0a10.firebaseapp.com",
  projectId: "mediblog-n0a10",
  storageBucket: "mediblog-n0a10.appspot.com",
  messagingSenderId: "551503664846",
  appId: "1:551503664846:web:mediblog",
};

export function getActiveFirebaseConfig(): FirebaseConfig {
  // 1. Check localStorage first (in case overridden via setup UI)
  try {
    const saved = localStorage.getItem("gg_firebase_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.authDomain && parsed.authDomain.includes("glowgrace.firebaseapp.com")) {
        localStorage.removeItem("gg_firebase_config");
      } else if (parsed.apiKey && parsed.apiKey.trim() !== "") {
        return parsed;
      }
    }
  } catch (e) {}

  // 2. Check Vite environment variables (.env) if present
  const envKey = import.meta.env.VITE_FIREBASE_API_KEY;
  if (envKey && envKey.trim() !== "" && envKey !== "AIzaSyDemoPlaceholderForStartup") {
    return {
      apiKey: envKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
    };
  }

  // 3. Fallback to built-in embedded configuration
  return DEFAULT_FIREBASE_CONFIG;
}

export function isFirebaseConfigured(): boolean {
  const config = getActiveFirebaseConfig();
  return Boolean(config && config.apiKey && config.apiKey.trim() !== "");
}

const activeConfig = getActiveFirebaseConfig();

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(activeConfig);
const auth = getAuth(app);
const db: Firestore = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function saveFirebaseConfig(config: FirebaseConfig) {
  try {
    localStorage.setItem("gg_firebase_config", JSON.stringify(config));
    window.location.reload();
  } catch (e) {
    console.error("Failed to save Firebase config:", e);
  }
}

export function clearPhoneRecaptcha() {
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

export { 
  app, 
  auth, 
  db,
  googleProvider, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  fbSignOut,
  updateProfile, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  // Firestore exports
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  type FirebaseUser,
  type ConfirmationResult
};
