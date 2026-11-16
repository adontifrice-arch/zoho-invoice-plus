import express from "express";
import path from "node:path";
import { createServer } from "vite";
import { apiError, router } from "./routes.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api", router);
app.use(apiError);

const vite = await createServer({
  root: process.cwd(),
  configFile: path.join(process.cwd(), "vite.config.ts"),
  server: { middlewareMode: true, hmr: { port: 24678 } },
  appType: "spa",
});
app.use(vite.middlewares);

const port = Number(process.env.PORT || 4173);
const server = app.listen(port, "0.0.0.0");
server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
server.on("listening", () => {
  console.log(`Facturation http://127.0.0.1:${port}`);
});
