import express from "express";
import path from "node:path";
import { authRouter, requireAccount } from "./auth.js";
import { apiError, router } from "./routes.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", authRouter);
app.use("/api", requireAccount, router);
app.use(apiError);

const port = Number(process.env.PORT || 4173);
const production = process.env.NODE_ENV === "production" || process.argv.includes("--production");

if (production) {
  const dist = path.join(process.cwd(), "dist");
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(dist, "index.html"), (error) => {
      if (error) next(error);
    });
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: process.cwd(),
    configFile: path.join(process.cwd(), "vite.config.ts"),
    server: { middlewareMode: true, hmr: { port: 24678 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

const server = app.listen(port, "0.0.0.0");
server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
server.on("listening", () => {
  console.log(`Facturation http://127.0.0.1:${port}`);
});
