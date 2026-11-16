import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { isAllowedGoogleAccount } from "../shared/access.js";

const SESSION_COOKIE = "atrium_session";
const STATE_COOKIE = "atrium_oauth";
const SESSION_DAYS = 14;

type Session = { email: string; exp: number };

export const authRouter = Router();

authRouter.get("/me", (req, res) => {
  res.json({ email: readSession(req), configured: googleConfigured() });
});

authRouter.get("/google", (req, res) => {
  if (!googleConfigured()) {
    res.redirect("/?refuse=config");
    return;
  }
  const state = randomBytes(24).toString("base64url");
  setCookie(req, res, STATE_COOKIE, state, 10 * 60);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", callbackUrl(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});

authRouter.get("/google/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const expected = cookies(req)[STATE_COOKIE] || "";
  clearCookie(req, res, STATE_COOKIE);
  if (!googleConfigured() || !code || !state || !safeEqual(state, expected)) {
    res.redirect("/?refuse=google");
    return;
  }
  try {
    const email = await googleEmail(code, callbackUrl(req));
    if (!email || !isAllowedGoogleAccount(email)) {
      res.redirect("/?refuse=compte");
      return;
    }
    const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
    setCookie(req, res, SESSION_COOKIE, signSession({ email: email.toLowerCase(), exp }), SESSION_DAYS * 24 * 60 * 60);
    res.redirect("/");
  } catch (error) {
    console.error(error);
    res.redirect("/?refuse=google");
  }
});

authRouter.post("/logout", (req, res) => {
  clearCookie(req, res, SESSION_COOKIE);
  res.json({ ok: true });
});

export function requireAccount(req: Request, res: Response, next: NextFunction): void {
  if (req.path === "/health") {
    next();
    return;
  }
  const email = readSession(req);
  if (!email) {
    res.status(401).json({ error: "Connexion requise." });
    return;
  }
  res.locals.account = email;
  next();
}

export function signSession(session: Session, secret = sessionSecret()): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function openSession(token: string, secret = sessionSecret(), now = Math.floor(Date.now() / 1000)): string | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(mac, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Session>;
    if (typeof parsed.email !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp <= now || !isAllowedGoogleAccount(parsed.email)) return null;
    return parsed.email;
  } catch {
    return null;
  }
}

function readSession(req: Request): string | null {
  const token = cookies(req)[SESSION_COOKIE];
  return token ? openSession(token) : null;
}

function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function callbackUrl(req: Request): string {
  return `${requestOrigin(req)}/api/auth/google/callback`;
}

function requestOrigin(req: Request): string {
  const configured = process.env.APP_ORIGIN?.replace(/\/$/, "");
  if (configured) return configured;
  const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  return `${proto}://${host}`;
}

async function googleEmail(code: string, redirectUri: string): Promise<string | null> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) throw new Error("Jeton Google refusé.");
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return null;
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) throw new Error("Profil Google illisible.");
  const profile = (await profileResponse.json()) as { email?: string; email_verified?: boolean };
  if (!profile.email || profile.email_verified !== true) return null;
  return profile.email;
}

function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(process.cwd(), "data", "session.key");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const created = randomBytes(32).toString("base64url");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, created, { mode: 0o600 });
    return created;
  }
}

function cookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

function setCookie(req: Request, res: Response, name: string, value: string, maxAgeSeconds: number): void {
  res.append("Set-Cookie", cookieLine(req, name, encodeURIComponent(value), maxAgeSeconds));
}

function clearCookie(req: Request, res: Response, name: string): void {
  res.append("Set-Cookie", cookieLine(req, name, "", 0));
}

function cookieLine(req: Request, name: string, value: string, maxAgeSeconds: number): string {
  const secure = requestOrigin(req).startsWith("https://") ? "; Secure" : "";
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
