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
  const portRaw = env("SMTP_PORT") || "465";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError("Le port SMTP est invalide.", 500);
  }
  return { host, port, user, pass, from };
}

export async function sendMail(message: OutboundMail): Promise<void> {
  const to = uniqueEmails(message.to);
  if (to.length === 0) throw new AppError("Indiquez au moins un destinataire.");
  const cc = uniqueEmails(message.cc ?? []).filter((email) => !to.includes(email));
  const config = requireConfig();
  const secure = config.port === 465;
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    auth: { user: config.user, pass: config.pass },
  });
  try {
    await transport.sendMail({
      from: config.from,
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : "envoi impossible";
    console.error("Envoi e-mail échoué:", detail);
    throw new AppError("L'e-mail n'a pas pu être envoyé. Vérifiez les secrets SMTP GoDaddy.", 502);
  } finally {
    transport.close();
  }
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
