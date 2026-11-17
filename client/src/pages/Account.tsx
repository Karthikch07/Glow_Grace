import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth, clearPhoneRecaptcha } from "@/lib/auth";
import { APP_NAME, saveFirebaseConfig, TARGET_PROJECT_ID, type FirebaseConfig } from "@/lib/firebase";
import { seedFirestoreCatalog } from "@/lib/firestore";
import { 
  Sparkles, 
  Mail, 
  Lock, 
  User as UserIcon, 
  UserPlus,
  Eye, 
  EyeOff, 
  LogOut, 
  Calendar, 
  ShoppingBag, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  KeyRound,
  Settings,
  Phone,
  ArrowRight,
  Database,
  Smartphone,
  ExternalLink
} from "lucide-react";
import { useLocation } from "wouter";
import type { ConfirmationResult } from "@/lib/firebase";
import { LoginBackdrop } from "@/components/LoginBackdrop";

// Official Google SVG Logo
function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function Account() {
  const { 
    user, 
    signIn, 
    signUp, 
    signInWithGoogle, 
    sendPhoneCode, 
    confirmPhoneCode, 
    resetPassword, 
    signOut, 
    isFirebaseActive 
  } = useAuth();
  const [, navigate] = useLocation();

  // Mode: "signin" (Email) | "signup" | "phone"
  const [mode, setMode] = useState<"signin" | "signup" | "phone">("signin");
  
  // Email states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Phone Auth states
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneUserName, setPhoneUserName] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult | null>(null);
  const [phoneStep, setPhoneStep] = useState<"enter-number" | "enter-code">("enter-number");

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Loading states
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [seedingLoading, setSeedingLoading] = useState(false);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  // Firebase Config Modal State (targeted to GlowGrace)
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [pastedConfig, setPastedConfig] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customAuthDomain, setCustomAuthDomain] = useState(`${TARGET_PROJECT_ID}.firebaseapp.com`);
  const [customProjectId, setCustomProjectId] = useState(TARGET_PROJECT_ID);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Clean up any recaptcha verifiers on unmount
  useEffect(() => {
    return () => {
      clearPhoneRecaptcha();
    };
  }, []);

  // Parse pasted snippet or save config
  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setConfigSaving(true);
    setConfigError(null);

    let apiKey = customApiKey.trim();
    let authDomain = customAuthDomain.trim();
    let projectId = customProjectId.trim() || TARGET_PROJECT_ID;
    let storageBucket = `${projectId}.firebasestorage.app`;
    let messagingSenderId = "";
    let appId = "";

    // If user pasted snippet, extract values
    if (pastedConfig) {
      const extract = (key: string) => {
        const regex = new RegExp(`${key}['"\\s]*:['"\\s]*([^'"\\s,;]+)`, "i");
        const match = pastedConfig.match(regex);
        return match ? match[1] : "";
      };
      apiKey = extract("apiKey") || apiKey;
      authDomain = extract("authDomain") || authDomain;
      projectId = extract("projectId") || projectId;
      storageBucket = extract("storageBucket") || storageBucket;
      messagingSenderId = extract("messagingSenderId");
      appId = extract("appId");
    }

    if (!apiKey || !authDomain) {
      setConfigError("API Key and Auth Domain are required.");
      setConfigSaving(false);
      return;
    }

    const newConfig: FirebaseConfig = {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId: messagingSenderId || "1234567890",
      appId: appId || "1:1234567890:web:abcdef",
    };

    try {
      // 1. Save to server .env
      await fetch("/api/config/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });

      // 2. Save locally and reload SDK
      saveFirebaseConfig(newConfig);
    } catch (err: any) {
      setConfigError(err?.message || "Failed to save configuration.");
      setConfigSaving(false);
    }
  }

  // Handle Google Sign-in
  async function handleGoogleSignIn() {
    setError(null);
    setSuccessMessage(null);

    setGoogleLoading(true);
    try {
      // A Google popup that never reports back (common on mobile browsers) must not
      // leave the page stuck: give up waiting after 45s. If the popup does finish
      // later, the auth state listener still signs the user in.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Google sign-in is taking too long. Please try again, or use email or phone instead.")),
          45000
        );
      });
      try {
        await Promise.race([signInWithGoogle(), timedOut]);
      } finally {
        clearTimeout(timer);
      }
      setSuccessMessage("Welcome! Signed in with Google.");
    } catch (err: any) {
      setError(err?.message || "Failed to sign in with Google.");
    } finally {
      setGoogleLoading(false);
    }
  }

  // Handle Email Sign-in
  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in both email and password.");
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setEmailLoading(true);
    try {
      await signIn({ email, password });
      setSuccessMessage("Welcome back to GlowGrace!");
    } catch (err: any) {
      setError(err?.message || "Invalid email or password.");
    } finally {
      setEmailLoading(false);
    }
  }

  // Handle Email Sign-up
  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in email and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setEmailLoading(true);
    try {
      await signUp({ email, password, firstName, lastName });
      setSuccessMessage("Account created successfully! Welcome to GlowGrace.");
    } catch (err: any) {
      setError(err?.message || "Failed to create account.");
    } finally {
      setEmailLoading(false);
    }
  }

  // Handle Phone Auth Step 1: Send SMS Code
  async function handleSendPhoneCode(e: React.FormEvent) {
    e.preventDefault();
    // India (+91) is the default: a bare 10-digit number gets +91 added.
    // A number typed with a leading "+" is kept as an explicit other country.
    const raw = phoneNumber.trim();
    let fullNumber: string;
    if (raw.startsWith("+")) {
      fullNumber = "+" + raw.replace(/D/g, "");
    } else {
      let digits = raw.replace(/D/g, "");
      if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
      if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
      if (!/^[6-9]d{9}$/.test(digits)) {
        setError("Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).");
        return;
      }
      fullNumber = "+91" + digits;
    }
    setError(null);
    setPhoneLoading(true);
    try {
      const confirmation = await sendPhoneCode(fullNumber);
      setPhoneNumber(fullNumber);
      setPhoneConfirmation(confirmation);
      setPhoneStep("enter-code");
      setSuccessMessage(`SMS code sent to ${fullNumber}. Enter the 6-digit code below.`);
    } catch (err: any) {
      setError(err?.message || "Failed to send SMS code.");
    } finally {
      setPhoneLoading(false);
    }
  }

  // Handle Phone Auth Step 2: Verify Code
  async function handleVerifyPhoneCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneConfirmation) {
      setError("No active SMS code confirmation. Please request a new code.");
      return;
    }
    if (!verificationCode || verificationCode.trim().length < 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }
    setError(null);
    setPhoneLoading(true);
    try {
      await confirmPhoneCode(phoneConfirmation, verificationCode.trim(), phoneUserName.trim());
      setSuccessMessage("Phone verified successfully! Welcome to GlowGrace.");
    } catch (err: any) {
      setError(err?.message || "Invalid verification code.");
    } finally {
      setPhoneLoading(false);
    }
  }

  // Handle Password Reset
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail) {
      setError("Please provide an email address.");
      return;
    }
    setResetLoading(true);
    setError(null);
    try {
      await resetPassword(resetEmail);
      setSuccessMessage(`Password reset link sent to ${resetEmail}`);
      setShowResetModal(false);
    } catch (err: any) {
      setError(err?.message || "Failed to send reset email.");
    } finally {
      setResetLoading(false);
    }
  }

  // Seed Firestore
  async function handleSeedFirestore() {
    setSeedingLoading(true);
    try {
      const res = await seedFirestoreCatalog();
      setSuccessMessage(`Seeded Firestore: ${res.servicesCount} services & ${res.productsCount} products!`);
    } catch (err: any) {
      setError("Firestore seed error: " + (err?.message || "Check permissions"));
    } finally {
      setSeedingLoading(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 lg:p-8 overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background">
      {/* Invisible container wrapper for Firebase Phone Auth Recaptcha */}
      <div id="recaptcha-wrapper" className="hidden"></div>

      {/* Decorative ambient background orbs */}
      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.15, 0.25, 0.15],
          x: [0, 20, 0],
          y: [0, -20, 0],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-12 left-10 w-72 h-72 rounded-full bg-primary/20 blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.12, 0.22, 0.12],
          x: [0, -30, 0],
          y: [0, 30, 0],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-12 right-10 w-96 h-96 rounded-full bg-secondary/30 blur-3xl pointer-events-none"
      />

      {/* Illustrated landscape behind the sign-in card (desktop only) */}
      {!user && <LoginBackdrop />}

      <div className="w-full max-w-[460px] relative z-10 mx-auto">
        <AnimatePresence mode="wait">
          {!user ? (
            /* ================= SIGN IN / SIGN UP CARD ================= */
            <motion.div
              key="auth-form"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Card className="p-6 sm:p-8 backdrop-blur-xl bg-card/95 border border-border/70 shadow-2xl rounded-2xl relative overflow-hidden transition-all">
                {/* Top decorative accent glow line */}
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary/40 via-chart-2/60 to-primary/40" />

                {/* Header branding */}
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="inline-flex p-3 rounded-full bg-primary/10 text-primary mb-3 shadow-inner ring-1 ring-primary/20"
                  >
                    <Sparkles className="w-6 h-6 animate-pulse" />
                  </motion.div>
                  <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-chart-2 to-primary bg-clip-text text-transparent">
                    GlowGrace Beauty
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Powered by Firebase Authentication &amp; Firestore
                  </p>
                  <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-muted/60 border border-border/50 text-[11px] text-muted-foreground">
                    <Database className="w-3 h-3 text-primary" />
                    <span>Secure sign-in for <strong className="text-foreground font-semibold">{APP_NAME}</strong></span>
                  </div>
                </div>

                {/* Animated 3-Tab Switcher (Email | Phone | Sign Up) */}
                <div className="grid grid-cols-3 gap-1 p-1 mb-6 bg-muted/60 rounded-xl relative border border-border/40">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                    }}
                    className={`h-9.5 text-xs font-semibold rounded-lg transition-colors relative z-10 select-none flex items-center justify-center gap-1.5 ${
                      mode === "signin" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode === "signin" && (
                      <motion.div
                        layoutId="activeAuthTab"
                        className="absolute inset-0 bg-primary rounded-lg shadow-md z-[-1]"
                        transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      />
                    )}
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span>Email</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode("phone");
                      setError(null);
                      setPhoneStep("enter-number");
                    }}
                    className={`h-9.5 text-xs font-semibold rounded-lg transition-colors relative z-10 select-none flex items-center justify-center gap-1.5 ${
                      mode === "phone" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode === "phone" && (
                      <motion.div
                        layoutId="activeAuthTab"
                        className="absolute inset-0 bg-primary rounded-lg shadow-md z-[-1]"
                        transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      />
                    )}
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>Phone</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                    }}
                    className={`h-9.5 text-xs font-semibold rounded-lg transition-colors relative z-10 select-none flex items-center justify-center gap-1.5 ${
                      mode === "signup" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode === "signup" && (
                      <motion.div
                        layoutId="activeAuthTab"
                        className="absolute inset-0 bg-primary rounded-lg shadow-md z-[-1]"
                        transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      />
                    )}
                    <UserPlus className="w-3.5 h-3.5 shrink-0" />
                    <span>Sign Up</span>
                  </button>
                </div>

                {/* Error Banner with shake animation */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ 
                        opacity: 1, 
                        y: 0, 
                        scale: 1,
                        x: [-8, 8, -6, 6, -3, 3, 0] 
                      }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35 }}
                      className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs sm:text-sm flex items-start gap-2.5"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span>{error}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Success Banner */}
                <AnimatePresence>
                  {successMessage && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{successMessage}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 1. GOOGLE SIGN-IN BUTTON */}
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading || emailLoading || phoneLoading}
                    className="w-full h-11 rounded-xl border-border/80 hover:bg-muted/50 hover:border-primary/40 font-semibold text-sm flex items-center justify-center gap-3 shadow-xs transition-all relative overflow-hidden select-none"
                  >
                    {googleLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-muted-foreground">Opening Google Sign-In...</span>
                      </>
                    ) : (
                      <>
                        <GoogleIcon className="w-4.5 h-4.5 shrink-0" />
                        <span>Continue with Google</span>
                      </>
                    )}
                  </Button>
                </motion.div>

                {/* Separator */}
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-3 text-muted-foreground font-medium text-[11px] tracking-wider">
                      {mode === "phone" ? "Or sign in with phone" : mode === "signup" ? "Or sign up with email" : "Or sign in with email"}
                    </span>
                  </div>
                </div>

                {/* 2. PHONE AUTHENTICATION FORM */}
                {mode === "phone" ? (
                  <div className="space-y-4">
                    {phoneStep === "enter-number" ? (
                      <form onSubmit={handleSendPhoneCode} className="space-y-3.5">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-foreground/90">Full Name (Optional)</Label>
                          <div className="relative">
                            <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <Input
                              placeholder="Ananya Sharma"
                              value={phoneUserName}
                              onChange={(e) => setPhoneUserName(e.target.value)}
                              className="pl-10 h-11 text-sm rounded-xl border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-foreground/90">Mobile Phone Number</Label>
                          <div className="relative">
                            {!phoneNumber.trim().startsWith("+") && (
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono font-semibold text-foreground/80 pointer-events-none">
                                +91
                              </span>
                            )}
                            <Input
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel-national"
                              required
                              placeholder="9876543210"
                              value={phoneNumber}
                              onChange={(e) => setPhoneNumber(e.target.value)}
                              className="pl-12 h-11 text-sm font-mono tracking-wide rounded-xl border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary"
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Enter your 10-digit mobile number. India (+91) is added automatically.
                          </p>
                        </div>

                        <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50 text-[11px] text-muted-foreground flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>
                            Tip: For instant testing without SMS rates, use test numbers (e.g. <strong className="font-mono text-foreground font-medium">+91 9999999999</strong> with code <strong className="font-mono text-foreground font-medium">123456</strong>).
                          </span>
                        </div>

                        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} className="pt-1">
                          <Button
                            type="submit"
                            disabled={phoneLoading}
                            className="w-full h-11 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm shadow-md flex items-center justify-center gap-2 select-none"
                          >
                            {phoneLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Sending SMS Code...</span>
                              </>
                            ) : (
                              <>
                                <span>Send Verification Code</span>
                                <ArrowRight className="w-4 h-4" />
                              </>
                            )}
                          </Button>
                        </motion.div>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyPhoneCode} className="space-y-3.5">
                        <div className="p-3 bg-muted/40 border border-border/50 rounded-xl text-xs flex justify-between items-center">
                          <div>
                            <span className="text-[11px] text-muted-foreground block">Code sent to:</span>
                            <span className="font-mono font-semibold text-sm text-foreground">{phoneNumber}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPhoneStep("enter-number");
                              setVerificationCode("");
                            }}
                            className="text-xs text-primary hover:underline font-semibold"
                          >
                            Change
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-foreground/90">6-Digit Verification Code</Label>
                          <Input
                            type="text"
                            required
                            maxLength={6}
                            placeholder="123456"
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            className="h-12 text-center font-mono text-xl tracking-[0.35em] font-semibold rounded-xl border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary"
                          />
                        </div>

                        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} className="pt-1">
                          <Button
                            type="submit"
                            disabled={phoneLoading}
                            className="w-full h-11 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm shadow-md flex items-center justify-center gap-2 select-none"
                          >
                            {phoneLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Verifying Code...</span>
                              </>
                            ) : (
                              <>
                                <Smartphone className="w-4 h-4" />
                                <span>Confirm &amp; Sign In</span>
                              </>
                            )}
                          </Button>
                        </motion.div>
                      </form>
                    )}
                  </div>
                ) : (
                  /* 3. EMAIL SIGN IN / SIGN UP FORM */
                  <form onSubmit={mode === "signin" ? handleEmailSignIn : handleEmailSignUp} className="space-y-4">
                    {mode === "signup" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid grid-cols-2 gap-3"
                      >
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-foreground/90">First Name</Label>
                          <div className="relative">
                            <UserIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <Input
                              placeholder="Ananya"
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              className="pl-10 h-11 text-sm rounded-xl border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-foreground/90">Last Name</Label>
                          <div className="relative">
                            <UserPlus className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <Input
                              placeholder="Sharma"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              className="pl-10 h-11 text-sm rounded-xl border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary"
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-foreground/90">Email Address</Label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                          type="email"
                          required
                          placeholder="you@glowgrace.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-10 h-11 text-sm rounded-xl border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-foreground/90">Password</Label>
                        {mode === "signin" && (
                          <button
                            type="button"
                            onClick={() => {
                              setResetEmail(email);
                              setShowResetModal(true);
                            }}
                            className="text-xs text-primary hover:underline transition-colors font-medium"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10 pr-11 h-11 text-sm rounded-xl border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} className="pt-1">
                      <Button
                        type="submit"
                        disabled={emailLoading || phoneLoading}
                        className="w-full h-11 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm shadow-md relative overflow-hidden transition-all select-none"
                      >
                        {emailLoading ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>{mode === "signin" ? "Signing In..." : "Creating Account..."}</span>
                          </span>
                        ) : (
                          <span>{mode === "signin" ? "Sign In to GlowGrace" : "Create Account"}</span>
                        )}
                      </Button>
                    </motion.div>
                  </form>
                )}

                {/* Footer security note & settings button */}
                <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <span>Firebase Auth &amp; Firestore</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(true)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors py-1 px-2.5 rounded-lg hover:bg-muted/50"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Config</span>
                  </button>
                </div>
              </Card>
            </motion.div>
          ) : (
            /* ================= SIGNED-IN PROFILE DASHBOARD ================= */
            <motion.div
              key="auth-profile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <Card className="p-6 sm:p-8 backdrop-blur-xl bg-card/95 border border-border/70 shadow-2xl rounded-2xl relative overflow-hidden transition-all">
                {/* Top decorative accent glow line */}
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary/40 via-chart-2/60 to-primary/40" />

                {/* Profile Avatar & Welcome */}
                <div className="flex flex-col items-center text-center pb-6 border-b border-border/60">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="relative mb-3"
                  >
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || "User avatar"}
                        className="w-20 h-20 rounded-full object-cover border-2 border-primary/40 shadow-lg"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-chart-2 text-primary-foreground font-serif text-2xl font-bold flex items-center justify-center shadow-lg border-2 border-primary/20">
                        {user.displayName
                          ? user.displayName.charAt(0).toUpperCase()
                          : (user.email ? user.email.charAt(0).toUpperCase() : (user.phoneNumber ? user.phoneNumber.slice(-2) : "G"))}
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-card" />
                  </motion.div>

                  <h2 className="text-xl sm:text-2xl font-bold font-serif">
                    {user.displayName || user.phoneNumber || user.email || "Valued Guest"}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    {user.email || user.phoneNumber}
                  </p>

                  <div className="flex items-center gap-2 mt-3.5">
                    <Badge variant="secondary" className="gap-1.5 text-xs py-1 px-3 rounded-full font-medium">
                      {user.provider === "google" ? (
                        <>
                          <GoogleIcon className="w-3.5 h-3.5" />
                          <span>Google Sign-In</span>
                        </>
                      ) : user.provider === "phone" ? (
                        <>
                          <Phone className="w-3.5 h-3.5 text-primary" />
                          <span>Phone Verified</span>
                        </>
                      ) : (
                        <>
                          <Mail className="w-3.5 h-3.5 text-primary" />
                          <span>Email Verified</span>
                        </>
                      )}
                    </Badge>

                    <Badge className="bg-primary/10 text-primary border-primary/20 text-xs py-1 px-3 rounded-full font-medium">
                      GlowGrace VIP
                    </Badge>
                  </div>
                </div>

                {/* Quick actions grid */}
                <div className="grid grid-cols-2 gap-3 my-5">
                  <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      variant="outline"
                      onClick={() => navigate("/booking")}
                      className="w-full h-20 rounded-xl py-3 px-3 flex flex-col items-center justify-center gap-1.5 text-center border-border/70 hover:border-primary/40 hover:bg-primary/5 transition-all shadow-xs"
                    >
                      <Calendar className="w-5 h-5 text-primary" />
                      <span className="text-xs font-semibold">Book Appointment</span>
                    </Button>
                  </motion.div>

                  <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      variant="outline"
                      onClick={() => navigate("/products")}
                      className="w-full h-20 rounded-xl py-3 px-3 flex flex-col items-center justify-center gap-1.5 text-center border-border/70 hover:border-primary/40 hover:bg-primary/5 transition-all shadow-xs"
                    >
                      <ShoppingBag className="w-5 h-5 text-secondary" />
                      <span className="text-xs font-semibold">Shop Products</span>
                    </Button>
                  </motion.div>
                </div>

                {/* Firestore Quick Sync Button */}
                <div className="mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSeedFirestore}
                    disabled={seedingLoading}
                    className="w-full text-xs font-semibold h-10 rounded-xl gap-2 border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Database className="w-4 h-4" />
                    <span>{seedingLoading ? "Syncing Catalog..." : "Sync Beauty Catalog to Firestore"}</span>
                  </Button>
                </div>

                {/* Account Details Box */}
                <div className="p-4 rounded-xl bg-muted/40 border border-border/50 text-xs space-y-2.5 mb-5">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>User UID</span>
                    <span className="font-mono text-[11px] text-foreground font-medium">
                      {user.uid ? user.uid.substring(0, 16) + "..." : user.id}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Account</span>
                    <span className="text-[11px] text-foreground font-semibold">
                      {APP_NAME}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Database</span>
                    <span className="text-foreground font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Cloud Firestore
                    </span>
                  </div>
                </div>

                {/* Sign Out Button */}
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    variant="outline"
                    onClick={() => signOut()}
                    className="w-full h-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </Button>
                </motion.div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FIREBASE CONFIGURATION MODAL */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg bg-card p-6 sm:p-7 rounded-2xl shadow-2xl border border-border overflow-hidden"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-full bg-primary/10 text-primary">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Firebase Web App Setup</h3>
                  <p className="text-xs text-muted-foreground">
                    Connect {APP_NAME} to Firebase (Auth &amp; Firestore)
                  </p>
                </div>
              </div>

              {configError && (
                <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                  {configError}
                </div>
              )}

              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center justify-between">
                    <span>Option A: Paste Firebase Config snippet (Recommended)</span>
                    <span className="text-[11px] text-muted-foreground font-normal">From Firebase Console</span>
                  </Label>
                  <textarea
                    rows={4}
                    placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "${TARGET_PROJECT_ID}.firebaseapp.com",\n  projectId: "${TARGET_PROJECT_ID}"\n};`}
                    value={pastedConfig}
                    onChange={(e) => setPastedConfig(e.target.value)}
                    className="w-full text-xs font-mono p-3 rounded-xl bg-muted/50 border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-[11px] uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or fill API Key</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">API Key</Label>
                    <Input
                      placeholder="AIzaSy..."
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      className="h-10 text-xs font-mono rounded-xl border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Auth Domain</Label>
                    <Input
                      placeholder={`${TARGET_PROJECT_ID}.firebaseapp.com`}
                      value={customAuthDomain}
                      onChange={(e) => setCustomAuthDomain(e.target.value)}
                      className="h-10 text-xs font-mono rounded-xl border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary"
                    />
                  </div>
                </div>

                <div className="p-3 bg-muted/40 rounded-xl text-[11px] text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">💡 How to register Web App in {TARGET_PROJECT_ID}:</p>
                  <p>1. Open <a href={`https://console.firebase.google.com/project/${TARGET_PROJECT_ID}/settings/general`} target="_blank" rel="noreferrer" className="text-primary underline">Firebase Console: {TARGET_PROJECT_ID}</a></p>
                  <p>2. Under <strong>Your apps</strong>, click the <strong>&lt;/&gt; Web</strong> icon (or Add App &gt; Web) and enter a name (e.g. <code>GlowGrace</code>).</p>
                  <p>3. Copy the <code className="bg-muted px-1 rounded">firebaseConfig</code> snippet and paste it above.</p>
                  <p>4. In <strong>Authentication &gt; Sign-in method</strong>, enable <strong>Google</strong>, <strong>Email/Password</strong>, and <strong>Phone</strong>.</p>
                  <p>5. In <strong>Authentication &gt; Settings &gt; Authorized domains</strong>, ensure <code className="bg-muted px-1 rounded">localhost</code> is listed.</p>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-border/50">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowConfigModal(false)}
                    className="h-10 px-4 text-xs font-medium rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={configSaving}
                    className="h-10 px-4 text-xs bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-xl shadow-xs"
                  >
                    {configSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save & Enable Firebase"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PASSWORD RESET MODAL */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-sm bg-card p-6 rounded-2xl shadow-2xl border border-border"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-full bg-primary/10 text-primary">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Reset Password</h3>
                  <p className="text-xs text-muted-foreground">Enter your email for reset link</p>
                </div>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-foreground/90">Email Address</Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      type="email"
                      required
                      placeholder="you@glowgrace.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="pl-10 h-11 text-sm rounded-xl border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowResetModal(false)}
                    className="h-10 px-4 text-xs font-medium rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit" 
                    disabled={resetLoading} 
                    className="h-10 px-4 text-xs bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-xl shadow-xs"
                  >
                    {resetLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Send Link"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
