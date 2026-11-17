import nodemailer from "nodemailer";
import { AppError } from "./logic.js";

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type OutboundMail = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: MailAttachment[];
};

type SmtpEndpoint = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS?: boolean;
};

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function mailConfigured(): boolean {
  return Boolean(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS") && env("MAIL_FROM"));
}

export function mailStatus(): { configured: boolean; from: string } {
  return { configured: mailConfigured(), from: env("MAIL_FROM") };
}

function requireConfig(): { host: string; port: number; user: string; pass: string; from: string } {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  const from = env("MAIL_FROM");
  if (!host || !user || !pass || !from) {
    throw new AppError("La messagerie n'est pas configurée. Ajoutez les secrets SMTP sur GoDaddy.", 503);
  }
  const portRaw = env("SMTP_PORT") || "587";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError("Le port SMTP est invalide.", 500);
  }
  return { host, port, user, pass, from };
}

function endpointKey(endpoint: SmtpEndpoint): string {
  return `${endpoint.host}:${endpoint.port}:${endpoint.secure ? "ssl" : "starttls"}`;
}

function smtpEndpoints(host: string, port: number): SmtpEndpoint[] {
  const primary: SmtpEndpoint = {
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
  };
  const fallbacks: SmtpEndpoint[] = [
    { host, port: 587, secure: false, requireTLS: true },
    { host, port: 465, secure: true },
    { host, port: 80, secure: false, requireTLS: true },
    { host: "relay-hosting.secureserver.net", port: 25, secure: false },
    { host: "smtpout.secureserver.net", port: 587, secure: false, requireTLS: true },
    { host: "smtpout.secureserver.net", port: 465, secure: true },
  ];
  const seen = new Set<string>();
  const out: SmtpEndpoint[] = [];
  for (const endpoint of [primary, ...fallbacks]) {
    const key = endpointKey(endpoint);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(endpoint);
  }
  return out;
}

function isBlockedPort(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "EACCES" || code === "ECONNREFUSED" || /EACCES|ECONNREFUSED|blocked/i.test(message);
}

async function sendWithEndpoint(
  endpoint: SmtpEndpoint,
  auth: { user: string; pass: string; from: string },
  message: OutboundMail,
  to: string[],
  cc: string[],
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: endpoint.host,
    port: endpoint.port,
    secure: endpoint.secure,
    requireTLS: endpoint.requireTLS || false,
    auth: { user: auth.user, pass: auth.pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 40_000,
  });
  try {
    await transport.sendMail({
      from: auth.from,
      to: to.join(", "),
      cc: cc.length ? cc.join(", ") : undefined,
      replyTo: message.replyTo || undefined,
      subject: message.subject,
      text: message.text,
      attachments: message.attachments?.map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType || "application/pdf",
      })),
    });
  } finally {
    transport.close();
  }
}

export async function sendMail(message: OutboundMail): Promise<void> {
  const to = uniqueEmails(message.to);
  if (to.length === 0) throw new AppError("Indiquez au moins un destinataire.");
  const cc = uniqueEmails(message.cc ?? []).filter((email) => !to.includes(email));
  const config = requireConfig();
  const endpoints = smtpEndpoints(config.host, config.port);
  let lastDetail = "envoi impossible";

  for (const endpoint of endpoints) {
    try {
      await sendWithEndpoint(endpoint, config, message, to, cc);
      if (endpoint.port !== config.port || endpoint.host !== config.host) {
        console.log(`E-mail envoyé via ${endpoint.host}:${endpoint.port}`);
      }
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "envoi impossible";
      lastDetail = detail;
      console.error(`Envoi e-mail échoué (${endpoint.host}:${endpoint.port}):`, detail);
      if (!isBlockedPort(error)) break;
    }
  }

  console.error("Envoi e-mail échoué:", lastDetail);
  throw new AppError(
    "L'e-mail n'a pas pu être envoyé (SMTP bloqué ou identifiants invalides). Sur Atrium, essayez le port 587 ou relay-hosting.secureserver.net.",
    503,
  );
}

export function uniqueEmails(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const email = value.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}
