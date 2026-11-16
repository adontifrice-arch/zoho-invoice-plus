const ALLOWED_GOOGLE_ACCOUNTS = new Set([
  "adontifrice@gmail.com",
  "tliliyassmine@gmail.com",
]);

export function isAllowedGoogleAccount(email: string): boolean {
  return ALLOWED_GOOGLE_ACCOUNTS.has(email.trim().toLowerCase());
}
