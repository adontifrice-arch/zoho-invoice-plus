import type { MailContact, Settings } from "./types.js";

export const OTG_PROFILE = {
  companyName: "Off The Grid",
  legalForm: "",
  tagline: "Intelligence artificielle souveraine",
  address: "",
  postalCode: "",
  city: "",
  country: "France",
  email: "facturation@otg.services",
  phone: "",
  website: "otg.services",
  siret: "",
  vatNumber: "",
  rcs: "",
  capital: "",
  iban: "",
  bic: "",
} as const;

export const OTG_CONTACTS: MailContact[] = [
  { id: "mail_facturation", name: "Facturation OTG", email: "facturation@otg.services" },
];

const DEMO_NAME = "Atelier Lumen";
const DEMO_EMAIL = "bonjour@atelierlumen.fr";
const DEMO_SIRET = "849 302 117 00024";

function isLegacyBrandEmail(email: string): boolean {
  const value = email.trim().toLowerCase();
  return !value || value === DEMO_EMAIL || value.includes("goldshard.") || value.includes("@gs.");
}

function isLegacyWebsite(website: string): boolean {
  const value = website.trim().toLowerCase();
  return !value || value === "atelierlumen.fr" || value.includes("goldshard.");
}

export function withOtgCompany(settings: Settings): Settings {
  const demo = settings.companyName === DEMO_NAME || settings.email === DEMO_EMAIL || settings.siret === DEMO_SIRET;
  const contacts = (settings.mailContacts ?? []).filter((entry) => !isLegacyBrandEmail(entry.email));
  const missing = OTG_CONTACTS.filter((entry) => !contacts.some((current) => current.email.toLowerCase() === entry.email));
  return {
    ...settings,
    companyName: OTG_PROFILE.companyName,
    tagline: OTG_PROFILE.tagline,
    website: isLegacyWebsite(settings.website) ? OTG_PROFILE.website : settings.website,
    email: isLegacyBrandEmail(settings.email) ? OTG_PROFILE.email : settings.email,
    legalForm: demo ? OTG_PROFILE.legalForm : settings.legalForm,
    address: demo ? OTG_PROFILE.address : settings.address,
    postalCode: demo ? OTG_PROFILE.postalCode : settings.postalCode,
    city: demo ? OTG_PROFILE.city : settings.city,
    country: demo ? OTG_PROFILE.country : settings.country || OTG_PROFILE.country,
    phone: demo ? OTG_PROFILE.phone : settings.phone,
    siret: demo ? OTG_PROFILE.siret : settings.siret,
    vatNumber: demo ? OTG_PROFILE.vatNumber : settings.vatNumber,
    rcs: demo ? OTG_PROFILE.rcs : settings.rcs,
    capital: demo ? OTG_PROFILE.capital : settings.capital,
    iban: demo ? OTG_PROFILE.iban : settings.iban,
    bic: demo ? OTG_PROFILE.bic : settings.bic,
    mailContacts: [...missing, ...contacts],
  };
}
