import { addDays, documentTotals, defaultInvoiceTerms, defaultQuoteTerms } from "../shared/money.js";
import type { Clock, CreditNote, Customer, Invoice, Item, Line, Payment, Quote, Settings, Store } from "../shared/types.js";

function stamp(date: string): string {
  return `${date}T08:00:00.000Z`;
}

function line(
  id: string,
  itemId: string,
  description: string,
  quantity: number,
  unit: string,
  unitPriceCents: number,
  vatBps: number,
): Line {
  return { id, itemId, description, quantity, unit, unitPriceCents, vatBps };
}

function numbered(prefix: string, date: string, sequence: number): string {
  return `${prefix}-${date.slice(0, 4)}-${String(sequence).padStart(3, "0")}`;
}

export function seedStore(clock: Clock): Store {
  const today = clock.today;
  const day = (offset: number) => addDays(today, offset);
  const monthStart = `${today.slice(0, 7)}-01`;
  const recent = (daysAgo: number) => {
    const value = day(-daysAgo);
    return value < monthStart ? today : value;
  };

  const settings: Settings = {
    companyName: "Atelier Lumen",
    legalForm: "SARL",
    tagline: "Architecture intérieure",
    address: "14 rue des Capucins",
    postalCode: "69001",
    city: "Lyon",
    country: "France",
    email: "bonjour@atelierlumen.fr",
    phone: "04 72 41 18 90",
    website: "atelierlumen.fr",
    siret: "849 302 117 00024",
    vatNumber: "FR 88 849302117",
    rcs: "RCS Lyon 849 302 117",
    capital: "10 000 €",
    iban: "FR75 3000 4008 3200 0123 4567 896",
    bic: "BNPAFRPPXXX",
    defaultVatBps: 2000,
    paymentTermDays: 30,
    quoteValidityDays: 30,
    invoicePrefix: "FAC",
    quotePrefix: "DEV",
    creditPrefix: "AV",
    paymentPrefix: "PAY",
    nextInvoice: 6,
    nextQuote: 10,
    nextCredit: 2,
    nextPayment: 4,
  };

  const invoiceTerms = defaultInvoiceTerms(settings.paymentTermDays);
  const quoteTerms = defaultQuoteTerms(settings.quoteValidityDays);

  const customers: Customer[] = [
    {
      id: "cus_soies",
      company: "Hôtel des Soies",
      name: "Camille Ferrand",
      email: "camille.ferrand@hotel-des-soies.fr",
      phone: "04 78 28 11 40",
      address: "8 quai Saint-Vincent",
      postalCode: "69001",
      city: "Lyon",
      country: "France",
      siret: "812 445 903 00017",
      vatNumber: "FR 44 812445903",
      notes: "Interventions de préférence le mardi, hors service du soir.",
      archived: false,
      createdAt: stamp(day(-200)),
      updatedAt: stamp(day(-2)),
    },
    {
      id: "cus_orbe",
      company: "Maison Orbe",
      name: "Julien Morel",
      email: "julien@maison-orbe.fr",
      phone: "01 42 58 19 33",
      address: "22 rue des Martyrs",
      postalCode: "75009",
      city: "Paris",
      country: "France",
      siret: "901 228 441 00028",
      vatNumber: "FR 19 901228441",
      notes: "Livraison du mobilier à prévoir avec leur ébéniste.",
      archived: false,
      createdAt: stamp(day(-160)),
      updatedAt: stamp(day(-30)),
    },
    {
      id: "cus_quai",
      company: "Librairie du Quai",
      name: "Inès Benali",
      email: "ines@librairieduquai.fr",
      phone: "04 72 00 64 18",
      address: "4 montée de la Grande Côte",
      postalCode: "69001",
      city: "Lyon",
      country: "France",
      siret: "530 118 662 00031",
      vatNumber: "",
      notes: "Petite structure. Relancer avec douceur, la gérante règle souvent en deux temps.",
      archived: false,
      createdAt: stamp(day(-140)),
      updatedAt: stamp(day(-3)),
    },
    {
      id: "cus_bellevue",
      company: "SCI Bellevue",
      name: "Marc Aubert",
      email: "marc.aubert@sci-bellevue.fr",
      phone: "04 78 90 22 15",
      address: "15 avenue Georges Pompidou",
      postalCode: "69100",
      city: "Villeurbanne",
      country: "France",
      siret: "448 902 331 00052",
      vatNumber: "FR 32 448902331",
      notes: "Appartement témoin au 3e, immeuble de 1974.",
      archived: false,
      createdAt: stamp(day(-80)),
      updatedAt: stamp(day(-10)),
    },
    {
      id: "cus_mistral",
      company: "Café Mistral",
      name: "Sofia Keller",
      email: "sofia@cafe-mistral.fr",
      phone: "04 76 18 40 22",
      address: "9 place Grenette",
      postalCode: "38000",
      city: "Grenoble",
      country: "France",
      siret: "879 220 145 00014",
      vatNumber: "FR 58 879220145",
      notes: "A refusé un premier devis mobilier, a retenu le conseil couleur.",
      archived: false,
      createdAt: stamp(day(-90)),
      updatedAt: stamp(recent(1)),
    },
    {
      id: "cus_musee",
      company: "Musée des Tissus",
      name: "Hélène Caron",
      email: "h.caron@musee-des-tissus.fr",
      phone: "04 78 38 42 00",
      address: "34 rue de la Charité",
      postalCode: "69002",
      city: "Lyon",
      country: "France",
      siret: "180 046 015 00035",
      vatNumber: "",
      notes: "Prospect. Devis en attente de validation du conseil d'administration.",
      archived: false,
      createdAt: stamp(day(-12)),
      updatedAt: stamp(day(-1)),
    },
  ];

  const items: Item[] = [
    item("item_conception", "Conception d'espace", "Relevés, plans et présentation.", "CONC", 12000, "heure", 2000, day(-220)),
    item("item_suivi", "Suivi de chantier", "Présence sur site et comptes rendus.", "SUIV", 9500, "heure", 2000, day(-220)),
    item("item_planche", "Planche matière", "Échantillons, tissus et éclairage.", "PLAN", 48000, "forfait", 2000, day(-220)),
    item("item_mobilier", "Mobilier sur mesure", "Pièce dessinée pour le projet.", "MOB", 240000, "unité", 2000, day(-220)),
    item("item_couleur", "Conseil couleur", "Palette, nuanciers et mise en situation.", "COUL", 32000, "forfait", 2000, day(-220)),
    item("item_plans", "Impression de plans A1", "Tirage papier pour le chantier.", "IMP", 4500, "unité", 2000, day(-220)),
    item("item_deplacement", "Déplacement", "Trajet aller-retour depuis l'atelier.", "DEP", 70, "km", 2000, day(-220)),
    item(
      "item_coord",
      "Coordination de travaux",
      "Pour un logement achevé depuis plus de deux ans.",
      "TRAV",
      8500,
      "heure",
      1000,
      day(-100),
    ),
  ];

  const soiesLines = [
    line("lin_soies_1", "item_conception", "Conception de la suite 12 et du salon d'étage.\nRelevés, plans et deux présentations.", 14, "heure", 12000, 2000),
    line("lin_soies_2", "item_planche", "Planche matière, tissus et éclairage de la suite 12.", 1, "forfait", 48000, 2000),
    line("lin_soies_3", "item_plans", "Impression des plans A1 pour le chantier.", 6, "unité", 4500, 2000),
  ];
  const orbeLines = [
    line("lin_orbe_1", "item_mobilier", "Bibliothèque sur mesure, chêne et laiton.", 1, "unité", 240000, 2000),
    line("lin_orbe_2", "item_conception", "Conception de l'angle bibliothèque.", 6, "heure", 12000, 2000),
  ];
  const quaiLines = [
    line("lin_quai_1", "item_couleur", "Conseil couleur pour la salle de lecture.", 1, "forfait", 32000, 2000),
    line("lin_quai_2", "item_conception", "Conception des tables de présentation.", 8, "heure", 12000, 2000),
  ];
  const bellevueLines = [
    line("lin_bel_1", "item_conception", "Conception de l'appartement témoin, séjour et chambre.", 16, "heure", 12000, 2000),
    line("lin_bel_2", "item_planche", "Planche matière de l'appartement témoin.", 1, "forfait", 48000, 2000),
    line(
      "lin_bel_3",
      "item_coord",
      "Coordination des travaux — appartement témoin, immeuble achevé depuis plus de deux ans.",
      8,
      "heure",
      8500,
      1000,
    ),
    line("lin_bel_4", "item_deplacement", "Déplacements Lyon — Villeurbanne.", 64, "km", 70, 2000),
  ];
  const mistralLines = [
    line("lin_mis_1", "item_couleur", "Conseil couleur de la salle et du comptoir.", 1, "forfait", 32000, 2000),
    line("lin_mis_2", "item_suivi", "Suivi de la mise en peinture.", 5, "heure", 9500, 2000),
    line("lin_mis_3", "item_plans", "Impression des plans A1.", 4, "unité", 4500, 2000),
  ];
  const mistralCreditLines = [
    line("lin_mis_av_1", "item_plans", "Deux tirages A1 non posés, retournés à l'atelier.", 2, "unité", 4500, 2000),
  ];

  const soiesIssue = day(-120);
  const orbeIssue = day(-70);
  const quaiIssue = day(-50);
  const refusedIssue = day(-45);
  const bellevueIssue = day(-10);
  const mistralIssue = recent(6);
  const signalIssue = day(-3);
  const museeIssue = day(-1);

  const quotes: Quote[] = [
    quote("quo_soies", 1, "cus_soies", "invoiced", soiesIssue, soiesLines, "inv_soies", "Suite 12, base du chantier de janvier.", quoteTerms, clock),
    quote("quo_orbe", 2, "cus_orbe", "invoiced", orbeIssue, orbeLines, "inv_orbe", "Pièce unique, chêne français.", quoteTerms, clock),
    quote("quo_quai", 3, "cus_quai", "invoiced", quaiIssue, quaiLines, "inv_quai", "", quoteTerms, clock),
    quote(
      "quo_mistral_refus",
      4,
      "cus_mistral",
      "refused",
      refusedIssue,
      [
        line("lin_ref_1", "item_mobilier", "Banquette, table et étagère sur mesure.", 3, "unité", 240000, 2000),
        line("lin_ref_2", "item_conception", "Conception complète de la salle.", 20, "heure", 12000, 2000),
      ],
      null,
      "Devis décliné : budget trop élevé pour la salle.",
      quoteTerms,
      clock,
    ),
    quote("quo_bellevue", 5, "cus_bellevue", "invoiced", bellevueIssue, bellevueLines, "inv_bellevue", "Immeuble de 1974, TVA réduite sur la coordination seule.", quoteTerms, clock),
    quote("quo_mistral", 6, "cus_mistral", "invoiced", mistralIssue, mistralLines, "inv_mistral", "Deuxième proposition, retenue.", quoteTerms, clock),
    quote(
      "quo_signal",
      7,
      "cus_quai",
      "accepted",
      signalIssue,
      [
        line("lin_sig_1", "item_couleur", "Conseil couleur de la vitrine et de la signalétique.", 1, "forfait", 32000, 2000),
        line("lin_sig_2", "item_plans", "Plans de la vitrine, format A1.", 4, "unité", 4500, 2000),
      ],
      null,
      "Accepté par téléphone. À facturer après le choix des lettrages.",
      quoteTerms,
      clock,
    ),
    quote(
      "quo_musee",
      8,
      "cus_musee",
      "sent",
      museeIssue,
      [
        line("lin_mus_1", "item_conception", "Conception des deux salles de réserve visitables.", 18, "heure", 12000, 2000),
        line("lin_mus_2", "item_planche", "Planche matière, textiles et vitrines.", 1, "forfait", 48000, 2000),
        line("lin_mus_3", "item_deplacement", "Déplacements dans Lyon.", 42, "km", 70, 2000),
      ],
      null,
      "En attente du conseil d'administration.",
      quoteTerms,
      clock,
    ),
    quote(
      "quo_soies_draft",
      9,
      "cus_soies",
      "draft",
      today,
      [line("lin_draft_q", "item_suivi", "Suivi de chantier de la suite 14.", 6, "heure", 9500, 2000)],
      null,
      "Brouillon, pas encore envoyé à Camille.",
      quoteTerms,
      clock,
    ),
  ];

  const soiesInvoice = invoiceDoc("inv_soies", 1, "cus_soies", "quo_soies", "issued", soiesIssue, day(-90), soiesLines, "Merci pour votre confiance. Présence sur site les mardis.", invoiceTerms, clock);
  const orbeInvoice = invoiceDoc("inv_orbe", 2, "cus_orbe", "quo_orbe", "issued", orbeIssue, day(-40), orbeLines, "Livraison du mobilier à caler avec l'ébéniste.", invoiceTerms, clock);
  const quaiInvoice = invoiceDoc("inv_quai", 3, "cus_quai", "quo_quai", "issued", quaiIssue, day(-20), quaiLines, "Échéance dépassée. À relancer.", invoiceTerms, clock);
  const bellevueInvoice = invoiceDoc("inv_bellevue", 4, "cus_bellevue", "quo_bellevue", "issued", bellevueIssue, day(20), bellevueLines, "Échéance à venir.", invoiceTerms, clock);
  const mistralInvoice = invoiceDoc("inv_mistral", 5, "cus_mistral", "quo_mistral", "issued", mistralIssue, addDays(mistralIssue, 30), mistralLines, "Avoir émis pour deux plans non posés.", invoiceTerms, clock);
  const draftInvoice: Invoice = {
    id: "inv_soies_draft",
    number: "",
    customerId: "cus_soies",
    quoteId: null,
    status: "draft",
    issueDate: today,
    dueDate: day(30),
    lines: [
      line("lin_draft_i1", "item_mobilier", "Tête de lit et commode pour la suite 14.", 2, "unité", 240000, 2000),
      line("lin_draft_i2", "item_conception", "Conception de la suite 14.", 8, "heure", 12000, 2000),
    ],
    notes: "Brouillon en cours, ne pas émettre avant validation des cotes.",
    terms: invoiceTerms,
    createdAt: stamp(today),
    updatedAt: stamp(today),
  };

  const invoices = [soiesInvoice, orbeInvoice, quaiInvoice, bellevueInvoice, mistralInvoice, draftInvoice];

  const creditNotes: CreditNote[] = [
    {
      id: "av_mistral",
      number: numbered("AV", recent(2), 1),
      customerId: "cus_mistral",
      invoiceId: "inv_mistral",
      issueDate: recent(2),
      lines: mistralCreditLines,
      reason: "Deux tirages A1 commandés en trop, non posés.",
      notes: "",
      createdAt: stamp(recent(2)),
    },
  ];

  const soiesPaid = documentTotals(soiesLines).ttc;
  const orbeTtc = documentTotals(orbeLines).ttc;
  const orbePaid = Math.min(Math.round(orbeTtc / 2 / 100) * 100, orbeTtc - 100);
  const mistralDue = documentTotals(mistralLines).ttc - documentTotals(mistralCreditLines).ttc;

  const payments: Payment[] = [
    {
      id: "pay_soies",
      number: numbered("PAY", day(-96), 1),
      invoiceId: "inv_soies",
      customerId: "cus_soies",
      amountCents: soiesPaid,
      date: day(-96),
      method: "transfer",
      reference: "VIR HOTEL SOIES SUITE 12",
      notes: "",
      createdAt: stamp(day(-96)),
    },
    {
      id: "pay_orbe",
      number: numbered("PAY", day(-36), 2),
      invoiceId: "inv_orbe",
      customerId: "cus_orbe",
      amountCents: orbePaid,
      date: day(-36),
      method: "transfer",
      reference: "ACOMPTE ORBE",
      notes: "Acompte reçu après l'échéance.",
      createdAt: stamp(day(-36)),
    },
    {
      id: "pay_mistral",
      number: numbered("PAY", recent(1), 3),
      invoiceId: "inv_mistral",
      customerId: "cus_mistral",
      amountCents: mistralDue,
      date: recent(1),
      method: "card",
      reference: "CB MISTRAL",
      notes: "",
      createdAt: stamp(recent(1)),
    },
  ];

  return {
    version: 1,
    settings,
    customers,
    items,
    quotes,
    invoices,
    creditNotes,
    payments,
  };
}

function item(
  id: string,
  name: string,
  description: string,
  sku: string,
  unitPriceCents: number,
  unit: string,
  vatBps: number,
  created: string,
): Item {
  return {
    id,
    name,
    description,
    sku,
    unitPriceCents,
    unit,
    vatBps,
    active: true,
    createdAt: stamp(created),
    updatedAt: stamp(created),
  };
}

function quote(
  id: string,
  sequence: number,
  customerId: string,
  status: Quote["status"],
  issueDate: string,
  lines: Line[],
  invoiceId: string | null,
  notes: string,
  terms: string,
  clock: Clock,
): Quote {
  return {
    id,
    number: numbered("DEV", issueDate, sequence),
    customerId,
    status,
    issueDate,
    validUntil: addDays(issueDate, 30),
    lines,
    notes,
    terms,
    invoiceId,
    createdAt: stamp(issueDate),
    updatedAt: clock.now,
  };
}

function invoiceDoc(
  id: string,
  sequence: number,
  customerId: string,
  quoteId: string | null,
  status: Invoice["status"],
  issueDate: string,
  dueDate: string,
  lines: Line[],
  notes: string,
  terms: string,
  clock: Clock,
): Invoice {
  return {
    id,
    number: status === "draft" ? "" : numbered("FAC", issueDate, sequence),
    customerId,
    quoteId,
    status,
    issueDate,
    dueDate,
    lines,
    notes,
    terms,
    createdAt: stamp(issueDate),
    updatedAt: clock.now,
  };
}
