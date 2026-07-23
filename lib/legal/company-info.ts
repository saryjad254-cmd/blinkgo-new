/**
 * BlinkGo Company Information — Centralized, Typed Source of Truth
 * ─────────────────────────────────────────────────────────────────
 *
 * This module is the ONLY place where legal company information is
 * configured. All legal pages (Impressum, Datenschutz, AGB, footer)
 * read from here. This guarantees consistency and a single point
 * of update.
 *
 * ── HARD RULES ─────────────────────────────────────────────────
 *
 *  1. NO FABRICATED VALUES. Never invent a real-looking name,
 *     street, HRB, USt-IdNr, or Geschäftsführer. That is fraud
 *     (§ 263 StGB) and exposes BlinkGo to immediate Abmahnung.
 *
 *  2. PLACEHOLDERS ARE EXPLICIT. Every field has two states:
 *       - `null`  → field is not yet provided
 *       - string  → the real value, supplied by the operator
 *     Placeholders must NOT look like real values. They use
 *     `[NICHT_KONFIGURIERT — <hint>]` so they are visually obvious.
 *
 *  3. PRODUCTION MUST FAIL-CLOSED. The `validateForProduction()`
 *     function returns a list of missing fields. A startup check
 *     in `lib/legal/launch-gate.ts` will refuse to start the
 *     customer-facing app in production mode if required fields
 *     are missing.
 *
 *  4. GERMAN IS AUTHORITATIVE. German language is the source of
 *     truth for legal pages; AR/EN are translations that must
 *     match the German text.
 *
 *  5. REVIEW STATUS IS BANNER-EXPOSED IN ADMIN/INTERNAL DOCS,
 *     NOT ON CUSTOMER-FACING PAGES. The legal pages DO display
 *     a "Dieser Text ist ein Entwurf und bedarf der Prüfung
 *     durch einen Rechtsanwalt" banner until the operator marks
 *     the field `LEGAL_REVIEW_APPROVED=true` in environment.
 *
 *  6. OPERATOR MUST SUPPLY. The values for the real legal entity
 *     must be provided by the human operator after consultation
 *     with a German Rechtsanwalt specialized in IT/E-commerce
 *     law and a Steuerberater for retention/tax numbers.
 *
 * ── HOW TO USE ─────────────────────────────────────────────────
 *
 *  import { COMPANY, isCompanyConfigured, validateForProduction } from '@/lib/legal/company-info';
 *  if (!isCompanyConfigured()) { /* show draft banner *\/ }
 *
 * ── FIELD LIST ─────────────────────────────────────────────────
 *
 *  The required fields below are derived from:
 *   - § 5 TMG (Telemediengesetz) for Impressum
 *   - Art. 13 DSGVO for Datenschutz
 *   - § 14 UStG for VAT identification
 *   - § 22 EStG / § 147 AO for retention
 *   - German commercial law for register entries
 *
 *  NOT every field applies to every business form. The validator
 *  will tell you which fields are required for the chosen
 *  `legalForm` (e.g. Einzelunternehmen, GmbH, UG, GbR).
 */

export type LegalForm = 'einzelunternehmen' | 'gmbh' | 'ug' | 'gbr' | 'gmbh_co_kg' | 'other';

export interface CompanyInfo {
  // Identity
  legalName: string | null;          // Vollständiger Firmenname
  legalForm: LegalForm | null;       // Rechtsform
  tradeName: string | null;          // Handelsname / Markenname (z.B. "BlinkGo")
  proprietorOrDirector: string | null; // Inhaber oder Geschäftsführer (Vor- und Nachname)
  additionalDirectors: string[] | null; // Bei GmbH: alle Geschäftsführer

  // Address (§ 5 TMG)
  streetAddress: string | null;      // Straße + Hausnummer
  postalCode: string | null;         // Postleitzahl
  city: string | null;               // Ort
  country: string | null;            // Land (default: Deutschland)

  // Contact
  supportEmail: string | null;       // Kunden-Support
  legalEmail: string | null;         // Rechtliche Anfragen / Abmahnungen
  phone: string | null;              // Telefonnummer (gesetzlich Pflicht bei bestimmten Geschäftsmodellen)
  websiteUrl: string | null;         // Vollständige URL

  // Tax / Register (only if applicable)
  vatId: string | null;              // USt-IdNr. nach § 27a UStG
  taxNumber: string | null;          // Steuernummer (nur falls keine USt-IdNr.)
  commercialRegister: string | null; // Handelsregister (z.B. "Amtsgericht Bonn HRB 12345")
  registerCourt: string | null;      // Registergericht
  registrationNumber: string | null; // Registernummer

  // Authority / Editorial (§ 5 TMG / § 18 MStV)
  supervisoryAuthority: string | null; // Zuständige Aufsichtsbehörde (falls genehmigungspflichtig)
  editorialResponsible: string | null; // Verantwortlich i.S.d. § 18 Abs. 2 MStV

  // Data protection
  dataControllerName: string | null; // Verantwortlicher (kann identisch mit Firma sein)
  dataProtectionContact: string | null; // Datenschutzbeauftragter (DSB) — Name + Email

  // Operations
  businessHours: string | null;      // Geschäftszeiten (z.B. "Mo–So 09:00–22:00")
  supportHours: string | null;       // Support-Erreichbarkeit
  serviceArea: string | null;        // Liefergebiet (z.B. "Wesseling und Umgebung")
  serviceType: string | null;        // Art der Dienstleistung (z.B. "Vermittlung von Lieferdiensten")

  // Dispute resolution
  euDisputeResolution: string | null; // OS-Plattform-Link + Hinweis
  consumerArbitration: string | null; // Bereitschaft zu Verbraucherschlichtung

  // Internal
  legalReviewStatus: 'DRAFT' | 'PENDING_LAWYER' | 'APPROVED';
  legalReviewNotes: string | null;
  lastUpdatedISO: string | null;
}

const PLACEHOLDER = (hint: string) => `[NICHT_KONFIGURIERT — ${hint}]`;

/**
 * Read from environment variables. Operator sets these in .env
 * after consulting a German lawyer.
 *
 * Env var convention: COMPANY_<FIELD_UPPER>
 *
 * Example:
 *   COMPANY_LEGAL_NAME="BlinkGo GmbH"
 *   COMPANY_LEGAL_FORM="gmbh"
 *   etc.
 */
function readEnv(): CompanyInfo {
  const env = process.env;
  return {
    legalName: env.COMPANY_LEGAL_NAME || null,
    legalForm: (env.COMPANY_LEGAL_FORM as LegalForm) || null,
    tradeName: env.COMPANY_TRADE_NAME || 'BlinkGo',
    proprietorOrDirector: env.COMPANY_PROPRIETOR || null,
    additionalDirectors: env.COMPANY_ADDITIONAL_DIRECTORS
      ? env.COMPANY_ADDITIONAL_DIRECTORS.split('|').map((s) => s.trim()).filter(Boolean)
      : null,

    streetAddress: env.COMPANY_STREET || null,
    postalCode: env.COMPANY_POSTAL_CODE || null,
    city: env.COMPANY_CITY || null,
    country: env.COMPANY_COUNTRY || 'Deutschland',

    supportEmail: env.COMPANY_SUPPORT_EMAIL || null,
    legalEmail: env.COMPANY_LEGAL_EMAIL || null,
    phone: env.COMPANY_PHONE || null,
    websiteUrl: env.COMPANY_WEBSITE_URL || null,

    vatId: env.COMPANY_VAT_ID || null,
    taxNumber: env.COMPANY_TAX_NUMBER || null,
    commercialRegister: env.COMPANY_COMMERCIAL_REGISTER || null,
    registerCourt: env.COMPANY_REGISTER_COURT || null,
    registrationNumber: env.COMPANY_REGISTRATION_NUMBER || null,

    supervisoryAuthority: env.COMPANY_SUPERVISORY_AUTHORITY || null,
    editorialResponsible: env.COMPANY_EDITORIAL_RESPONSIBLE || null,

    dataControllerName: env.COMPANY_DATA_CONTROLLER || env.COMPANY_LEGAL_NAME || null,
    dataProtectionContact: env.COMPANY_DPO || null,

    businessHours: env.COMPANY_BUSINESS_HOURS || null,
    supportHours: env.COMPANY_SUPPORT_HOURS || null,
    serviceArea: env.COMPANY_SERVICE_AREA || 'Wesseling, Deutschland',
    serviceType: env.COMPANY_SERVICE_TYPE || 'Vermittlung und Durchführung lokaler Lieferdienste',

    euDisputeResolution: env.COMPANY_EU_DISPUTE || null,
    consumerArbitration: env.COMPANY_ARBITRATION || null,

    legalReviewStatus: (env.LEGAL_REVIEW_STATUS as CompanyInfo['legalReviewStatus']) || 'DRAFT',
    legalReviewNotes: env.LEGAL_REVIEW_NOTES || null,
    lastUpdatedISO: env.LEGAL_LAST_UPDATED || null,
  };
}

/**
 * Returns the configured company info. Missing fields are `null`.
 * Use `getDisplayCompanyInfo()` for the user-facing version with
 * placeholders, and `isCompanyConfigured()` to check readiness.
 */
export const COMPANY: CompanyInfo = readEnv();

/**
 * Returns a "display-friendly" version of company info, where
 * missing fields are replaced with explicit placeholders that
 * make the missing state obvious in legal pages.
 */
export function getDisplayCompanyInfo(): CompanyInfo & {
  _placeholders: string[];
} {
  const placeholders: string[] = [];
  const display: CompanyInfo = { ...COMPANY };

  const fill = (key: keyof CompanyInfo, hint: string) => {
    if (!display[key]) {
      (display as any)[key] = PLACEHOLDER(hint);
      placeholders.push(key as string);
    }
  };

  // Required for Impressum (§ 5 TMG)
  fill('legalName', 'Vollständiger Firmenname — bitte eintragen');
  fill('legalForm', 'Rechtsform — bitte eintragen');
  fill('proprietorOrDirector', 'Inhaber oder Geschäftsführer — bitte eintragen');
  fill('streetAddress', 'Straße und Hausnummer — bitte eintragen');
  fill('postalCode', 'Postleitzahl — bitte eintragen');
  fill('city', 'Ort — bitte eintragen');
  fill('supportEmail', 'Support-E-Mail — bitte eintragen');

  // Required depending on business form
  if (COMPANY.legalForm && ['gmbh', 'ug', 'gmbh_co_kg'].includes(COMPANY.legalForm)) {
    fill('commercialRegister', 'z.B. Amtsgericht Bonn HRB 12345 — bitte eintragen');
    fill('registerCourt', 'Registergericht — bitte eintragen');
    fill('registrationNumber', 'Registernummer — bitte eintragen');
    fill('vatId', 'USt-IdNr. nach § 27a UStG — bitte eintragen oder steuerberater konsultieren');
  }
  if (COMPANY.legalForm === 'einzelunternehmen') {
    fill('taxNumber', 'Steuernummer — bitte vom Finanzamt eintragen');
  }

  // Always required
  fill('dataControllerName', 'Verantwortlicher i.S.d. DSGVO');
  fill('legalReviewStatus' as any, 'REVIEW_STATUS');
  (display as any).legalReviewStatus = COMPANY.legalReviewStatus;

  return { ...display, _placeholders: placeholders };
}

/**
 * Check whether the company is "sufficiently" configured for
 * a non-production / demo launch. Returns true if the bare
 * minimum for Impressum (§ 5 TMG) is set.
 */
export function isCompanyConfigured(): boolean {
  const c = COMPANY;
  return !!(
    c.legalName &&
    c.legalForm &&
    c.proprietorOrDirector &&
    c.streetAddress &&
    c.postalCode &&
    c.city &&
    c.supportEmail
  );
}

/**
 * Production-launch validation. Returns a list of missing fields
 * that must be supplied before the customer-facing app can be
 * served in production. Production should refuse to start if
 * this list is non-empty (see lib/legal/launch-gate.ts).
 */
export function validateForProduction(): { ok: boolean; missing: string[] } {
  const c = COMPANY;
  const missing: string[] = [];

  // Impressum (§ 5 TMG)
  if (!c.legalName) missing.push('COMPANY_LEGAL_NAME');
  if (!c.legalForm) missing.push('COMPANY_LEGAL_FORM');
  if (!c.proprietorOrDirector) missing.push('COMPANY_PROPRIETOR');
  if (!c.streetAddress) missing.push('COMPANY_STREET');
  if (!c.postalCode) missing.push('COMPANY_POSTAL_CODE');
  if (!c.city) missing.push('COMPANY_CITY');
  if (!c.supportEmail) missing.push('COMPANY_SUPPORT_EMAIL');
  if (!c.legalEmail) missing.push('COMPANY_LEGAL_EMAIL (recommended for Abmahnungen)');

  // Form-specific
  if (c.legalForm && ['gmbh', 'ug', 'gmbh_co_kg'].includes(c.legalForm)) {
    if (!c.commercialRegister) missing.push('COMPANY_COMMERCIAL_REGISTER');
    if (!c.registerCourt) missing.push('COMPANY_REGISTER_COURT');
    if (!c.registrationNumber) missing.push('COMPANY_REGISTRATION_NUMBER');
    if (!c.vatId && !c.taxNumber) missing.push('COMPANY_VAT_ID or COMPANY_TAX_NUMBER');
  }
  if (c.legalForm === 'einzelunternehmen') {
    if (!c.taxNumber) missing.push('COMPANY_TAX_NUMBER (or VAT ID)');
  }

  // Editorial (§ 18 MStV)
  if (!c.editorialResponsible) missing.push('COMPANY_EDITORIAL_RESPONSIBLE');

  // GDPR
  if (!c.dataControllerName) missing.push('COMPANY_DATA_CONTROLLER');
  if (!c.dataProtectionContact && process.env.REQUIRE_DPO === 'true') {
    missing.push('COMPANY_DPO (Datenschutzbeauftragter — required if core activity is large-scale monitoring)');
  }

  // Review status
  if (c.legalReviewStatus !== 'APPROVED') {
    missing.push(`LEGAL_REVIEW_STATUS must be APPROVED (currently: ${c.legalReviewStatus})`);
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Human-readable label of a missing env var.
 */
export function labelForField(field: string): string {
  const labels: Record<string, string> = {
    COMPANY_LEGAL_NAME: 'Vollständiger Firmenname',
    COMPANY_LEGAL_FORM: 'Rechtsform (einzelunternehmen, gmbh, ug, gbr, gmbh_co_kg)',
    COMPANY_PROPRIETOR: 'Inhaber / Geschäftsführer (Vor- und Nachname)',
    COMPANY_STREET: 'Straße und Hausnummer',
    COMPANY_POSTAL_CODE: 'Postleitzahl',
    COMPANY_CITY: 'Ort',
    COMPANY_SUPPORT_EMAIL: 'Support-E-Mail',
    COMPANY_LEGAL_EMAIL: 'E-Mail für rechtliche Anfragen / Abmahnungen',
    COMPANY_VAT_ID: 'USt-IdNr. (§ 27a UStG)',
    COMPANY_TAX_NUMBER: 'Steuernummer',
    COMPANY_COMMERCIAL_REGISTER: 'Handelsregistereintrag',
    COMPANY_REGISTER_COURT: 'Registergericht',
    COMPANY_REGISTRATION_NUMBER: 'Registernummer',
    COMPANY_EDITORIAL_RESPONSIBLE: 'Verantwortlich i.S.d. § 18 Abs. 2 MStV',
    COMPANY_DATA_CONTROLLER: 'Verantwortlicher (DSGVO Art. 4 Nr. 7)',
    COMPANY_DPO: 'Datenschutzbeauftragter',
  };
  return labels[field] || field;
}
