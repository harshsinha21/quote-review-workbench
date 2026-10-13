// Shared class strings for tables, selection and type, so every screen draws them the same way.
// Data only (kept out of primitives.tsx so that file exports components only).

/** Type scale: four sizes, each with one job. Page title 20, section title 15, body 13, meta 12; column headers 11. */
export const TEXT = {
  pageTitle: 'text-[20px] font-semibold tracking-tight text-zinc-900',
  sectionTitle: 'text-[15px] font-semibold text-zinc-900',
  body: 'text-[13px] text-zinc-800',
  meta: 'text-[12px] text-zinc-500',
  label: 'text-[12px] font-medium text-zinc-600',
} as const;

/** One selection style everywhere: a blue-50 fill and an inset 2px blue-700 bar on the left edge. */
export const SELECTED_ROW = 'bg-blue-50 shadow-[inset_2px_0_0_var(--color-blue-700)]';

/** Table rhythm shared by every data table: hairline rows, sticky uppercase 11px headers, right-aligned numbers. */
export const TABLE = {
  table: 'w-full border-collapse text-[13px]',
  th: 'sticky top-0 z-10 bg-white px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500 shadow-[inset_0_-1px_0_var(--color-zinc-200)]',
  thNum: 'sticky top-0 z-10 bg-white px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-zinc-500 shadow-[inset_0_-1px_0_var(--color-zinc-200)]',
  td: 'px-3 py-2 align-middle text-zinc-800',
  tdNum: 'px-3 py-2 text-right align-middle tabular-nums text-zinc-800',
  row: 'border-b border-zinc-100',
  rowInteractive: 'cursor-pointer border-b border-zinc-100 hover:bg-zinc-50',
  groupRow: 'border-b border-zinc-200 bg-zinc-50/80 text-[12px] font-medium text-zinc-700',
} as const;

/** Surface for a top-level region: white, one hairline border, 8px radius. Never nest one inside another. */
export const SURFACE = 'rounded-lg border border-zinc-200 bg-white';

/** Page gutters and max width for Ops screens. */
export const PAGE = 'mx-auto w-full max-w-[1200px] px-8 py-7';
