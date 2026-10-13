// Display formatting for money, dates, lead times, quantities, identifiers and ask text.
// Pure functions; no React, no store. Every amount on screen goes through formatMoney, so a value
// never reads one way in one place and a cent different in another.

/** Shown when a date is absent. */
const NO_DATE = '—';

/** Parses an ISO date or date-time; a bare YYYY-MM-DD is read as UTC midnight so the day never shifts. */
function parseIso(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
}

/** One formatter per currency, created once (Intl formatters are expensive to build). */
const moneyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * "$1,060.00", "€2.16". Symbol first, grouping on, always two decimals. An unknown or empty
 * currency code falls back to "1,060.00 XYZ" instead of throwing.
 */
export function formatMoney(amount: number, currency = 'USD'): string {
  const code = currency || 'USD';
  try {
    let formatter = moneyFormatters.get(code);
    if (!formatter) {
      formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 });
      moneyFormatters.set(code, formatter);
    }
    return formatter.format(amount);
  } catch {
    return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`;
  }
}

/** "≈ $2.38": a converted value always carries the approximation sign. */
export function formatApproxUsd(amountUsd: number): string {
  return `≈ ${formatMoney(amountUsd, 'USD')}`;
}

/** "1,000" for quantities in tables. */
export function formatQty(quantity: number): string {
  return quantity.toLocaleString('en-US');
}

/** "May 14, 2026" from an ISO date or date-time. */
export function formatDate(iso: string | undefined): string {
  if (!iso) return NO_DATE;
  const date = parseIso(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "May 14" (no year), for dense rows and inline text. */
export function formatShortDate(iso: string | undefined): string {
  if (!iso) return NO_DATE;
  const date = parseIso(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "May 14, 09:48 UTC" for message headers (the year is the same everywhere in this RFQ). */
export function formatDateTime(iso: string): string {
  const date = parseIso(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  return `${day}, ${time} UTC`;
}

/** "May 14, 2026, 09:48 UTC": the full value, for a <time> title attribute. */
export function formatFullDateTime(iso: string): string {
  const date = parseIso(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  })} UTC`;
}

/** Lead time: "18d" in dense Ops cells, "18 days" in Customer and Vendor views, "Not stated" when unknown. */
export function formatLeadTime(days: number | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (days === null || days === undefined) return 'Not stated';
  if (style === 'short') return `${days}d`;
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Matches the "Item 3 MS21042L3: " or "Item 3: " prefix every ask sentence starts with. */
const ASK_PREFIX_PATTERN = /^Item\s+\d+(?:\s+[^\s:]+)?:\s*/i;

/**
 * An ask sentence without its leading "Item n PN:" reference, capitalized, for lists that already show
 * the item as a label. The generated email keeps the full sentence.
 */
export function stripAskPrefix(askText: string): string {
  const stripped = askText.replace(ASK_PREFIX_PATTERN, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** First word of a vendor name, for the nav, tabs and matrix headers ("Heritage"). */
export function shortVendorName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/** First name of a contact ("Mike" from "Mike Henderson"). */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** "3 blockers", "1 blocker": a count with its noun, singular or plural. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
