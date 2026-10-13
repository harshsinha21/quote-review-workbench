// Every tunable value, pattern and sender address the domain relies on, each with its reason.
// Constants, plus todayAsIsoDate (the only clock read, used to seed DEFAULT_SETTINGS) and createEmptyOverlay.

import type { Overlay, Severity } from './types';

/** The customer's RFQ desk. The email from this address is the RFQ in every vendor thread. */
export const RFQ_SENDER = 'rfq@argus-defense.example';

// ---------- RFQ patterns (section 5.2) ----------

/** The due date sentence "Need pricing by 5/20"; the year comes from the RFQ email's date. */
export const DUE_DATE_PATTERN = /pricing by (\d{1,2})\/(\d{1,2})/i;

// ---------- vendor source patterns (section 5.3) ----------

/** An item block header: "2. NAS1149F0832P-ALT (ALT for NAS1149F0832P)", "11) AN4-7A (extra stock)". */
export const ITEM_HEADER_PATTERN =
  /^[ \t]*(\d+)[.)][ \t]+(\S+)(?:[ \t]+\((?:ALT for[ \t]+([^)\s]+)|(extra stock))\))?[ \t]*$/gm;
/** Marker the vendors use for a no-bid item block. */
export const NO_QUOTE_MARKER = 'NO QUOTE';
/** The NSN inside an item block. */
export const NSN_PATTERN = /NSN (\d{4}-\d{2}-\d{3}-\d{4})/;
/** The description inside an item block. */
export const DESCRIPTION_PATTERN = /desc: (.*)/;
/** Manufacturer PN, manufacturer CAGE, country of origin and hazmat, written on one line. */
export const MANUFACTURER_PATTERN = /mfr PN ([^;]+); mfr CAGE (\w+); COO ([^;]+); hazmat (yes|no)/;
/** Packaging, shipping, certifications and NRE, written on one line. */
export const TERMS_PATTERN = /packaging (not )?included; shipping (not )?included; certs (.*?); NRE (.*)/;
/** A product note ("product note: ..." or "note: ..."). */
export const NOTE_PATTERN = /(?:product )?note: (.*)/;
/** One quantity break: "qty 100: USD 1.74 ea / 174.00 ext / 18d". */
export const SOURCE_LINE_PATTERN = /qty (\d+): ([A-Z]{3}) ([\d.]+) ea \/ ([\d.]+) ext \/ (\d+)d/g;
/** A note mentioning first-article test; it applies to the block's first quantity line. */
export const FAT_PATTERN = /\bFAT\b/;
/** COO text the vendors use when they did not give a country of origin. */
export const COO_NOT_STATED = 'not stated';
/** NRE text the vendors use when there is no NRE charge. */
export const NRE_NONE_STATED = 'none stated';
/** Subject marker of a forwarded chain ("Fwd: RE: ..."). */
export const FORWARDED_SUBJECT_PATTERN = /^\s*fwd?:/i;
/** Revision number in a subject ("rev 3 clean-ish"). */
export const REVISION_PATTERN = /\brev\s*(\d+)/i;

// ---------- tolerances (section 5.5) ----------

/** Unit costs are written with 2 decimals; 0.001 absorbs float noise without hiding a real cent. */
export const UNIT_COST_TOLERANCE = 0.001;
/** Extended prices may be rounded to the cent by the vendor. */
export const PRICE_TOLERANCE = 0.01;
/** A PN this many edits or fewer from a requested PN is a lookalike (one wrong digit, a transposition). */
export const LOOKALIKE_PN_DISTANCE = 2;
/** An NSN this many edits or fewer from a requested NSN is a lookalike (one wrong digit). */
export const LOOKALIKE_NSN_DISTANCE = 1;

// ---------- commercial and compliance patterns (section 5.5) ----------

/** Payment terms that require paying before shipment. */
export const PREPAY_PATTERN = /prepay/i;
/** A minimum order amount in the vendor's header notes ("Minimum order $250"). */
export const MIN_ORDER_PATTERN = /minimum order\s*\$?([\d,]+)/i;
/** Certifications text that means no certification at all. */
export const NO_CERT_PATTERN = /no cert/i;
/** Surplus stock, which needs traceability documents. */
export const SURPLUS_PATTERN = /surplus/i;
/** The only country of origin that needs no Buy American / DFARS review. */
export const DOMESTIC_COO = 'US';
/** The currency every comparison is normalized to. */
export const BASE_CURRENCY = 'USD';

// ---------- follow-up draft checks (section 5.7) ----------

/** The draft asks for payment terms. */
export const DRAFT_PAYMENT_TERMS_PATTERN = /payment terms/i;
/** The draft asks for quote validity. */
export const DRAFT_VALIDITY_PATTERN = /validity/i;
/** The draft asks for the COO of an item ("COO for item 4"). */
export const DRAFT_COO_PATTERN = /COO for item (\d+)/gi;
/** The draft asks whether shipping is included on an item. */
export const DRAFT_SHIPPING_PATTERN = /shipping is included on item (\d+)/gi;
/** A draft mentions currency (covers NON_USD_CURRENCY). */
export const DRAFT_CURRENCY_PATTERN = /usd|eur|currenc/i;
/** A draft mentions validity or expiry (covers QUOTE_EXPIRED and VALIDITY_AMBIGUOUS). */
export const DRAFT_EXPIRY_PATTERN = /validit|expir/i;

// ---------- ordering and review policy ----------

/** Display and sort order of severities, most severe first. */
export const SEVERITY_ORDER: readonly Severity[] = ['blocker', 'warning', 'info'];
/** An accepted risk needs a reason a reviewer can read later; 5 characters rules out "ok". */
export const MIN_ACCEPT_NOTE_LENGTH = 5;

// ---------- persistence ----------

/** localStorage key of the persisted overlay. Holds review decisions only. */
export const STORAGE_KEY = 'quote-review-workbench:overlay';
/** Schema version of the persisted overlay; bump it and extend migrate() when Overlay changes. */
export const STORAGE_VERSION = 1;

/** Today's local date as YYYY-MM-DD. Used only to seed DEFAULT_SETTINGS; rules read settings.asOf. */
export function todayAsIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** EUR to USD rate and as-of date the UI starts with. Read by the UI only, never inside rules. */
export const DEFAULT_SETTINGS: Overlay['settings'] = { eurUsd: 1.1, asOf: todayAsIsoDate() };

/** An overlay with no decisions, for a first visit, a reset, or a corrupt store. */
export function createEmptyOverlay(settings: Overlay['settings'] = DEFAULT_SETTINGS): Overlay {
  return {
    lineOverrides: {}, decisions: {}, followUpExcluded: {}, submittedAt: {}, poQuantity: {}, audit: [],
    settings: { ...settings },
  };
}
