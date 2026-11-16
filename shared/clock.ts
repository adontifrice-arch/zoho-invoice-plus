import type { Clock } from "./types.js";

export function systemClock(now = new Date()): Clock {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return { today, now: now.toISOString() };
}
