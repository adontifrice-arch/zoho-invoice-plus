import type { MailContact, Settings } from "./types.js";

export const OTG_PROFILE = {
  companyName: "Off The Grid",
  legalForm: "",
  tagline: "Intelligence artificielle souveraine",
  address: "",
  postalCode: "",
  city: "",
  country: "France",
  email: "hichem.boudaya@goldshard.fr",
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
  { id: "mail_yassmine", name: "Yassmine Tlili", email: "yassmine.tlili@goldshard.fr" },
  { id: "mail_hichem", name: "Hichem Boudaya", email: "hichem.boudaya@goldshard.fr" },
];

const DEMO_NAME = "Atelier Lumen";
const DEMO_EMAIL = "bonjour@atelierlumen.fr";
const DEMO_SIRET = "849 302 117 00024";

export function withOtgCompany(settings: Settings): Settings {
  const demo = settings.companyName === DEMO_NAME || settings.email === DEMO_EMAIL || settings.siret === DEMO_SIRET;
  const contacts = settings.mailContacts ?? [];
  const missing = OTG_CONTACTS.filter((entry) => !contacts.some((current) => current.email.toLowerCase() === entry.email));
  return {
    ...settings,
    companyName: OTG_PROFILE.companyName,
    tagline: OTG_PROFILE.tagline,
    website: settings.website && settings.website !== "atelierlumen.fr" ? settings.website : OTG_PROFILE.website,
    email: settings.email && settings.email !== DEMO_EMAIL ? settings.email : OTG_PROFILE.email,
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
