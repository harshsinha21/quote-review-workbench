// Display formatting for dates, money and short names. Pure functions; no React, no store.

/** "May 14, 2026" from an ISO date or date-time (read in UTC so the day never shifts). */
export function formatDate(iso: string | undefined): string {
  if (!iso) return 'n/a';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "May 14" (no year), for dense chips. */
export function formatShortDate(iso: string | undefined): string {
  if (!iso) return 'n/a';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "May 14, 2026, 09:48 UTC" for email headers. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  })} UTC`;
}

/** "$1,168.82" (USD) or "105.60 EUR" for totals. */
export function formatMoney(amount: number, currency = 'USD'): string {
  const digits = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'USD' ? `$${digits}` : `${digits} ${currency}`;
}

/** First word of a vendor name, for the nav and matrix headers ("Heritage"). */
export function shortVendorName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/** First name of a contact ("Mike" from "Mike Henderson"). */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
