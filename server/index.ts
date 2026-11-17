import "./env"; // must be first: loads .env before other modules read process.env
import express from "express";
import { env, isProduction } from "./env";
import { disconnectMongoDB } from "./mongodb";
import { registerRoutes } from "./routes";
import { log, serveStatic, setupVite } from "./vite";

const app = express();
app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

// Request log for API calls. Bodies are deliberately not logged: they carry
// auth tokens, addresses and phone numbers.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const start = Date.now();
  res.on("finish", () => log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`));
  next();
});

(async () => {
  const server = await registerRoutes(app);

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const listenOpts: { port: number; host?: string; reusePort?: boolean } = { port: env.port };
  const host = env.host || (process.platform === "win32" ? undefined : "0.0.0.0");
  if (host) listenOpts.host = host;
  if (process.platform !== "win32") listenOpts.reusePort = true;

  server.listen(listenOpts, () => log(`serving on port ${env.port}`));

  const shutdown = (signal: string) => {
    log(`${signal} received, shutting down`);
    server.close(() => {
      disconnectMongoDB().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
})().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
