// The vendor's quote laid out against the RFQ: a header per requested item, its line rows, dashed ghost
// rows for requested breaks nobody quoted, then the products the RFQ never asked for.
// Must not recompute rules (flags come from the review as given) or render vendor text as HTML.

import clsx from 'clsx';
import { Ban, Check, ChevronDown, ChevronRight, PenLine, X } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Flag, LineReview, ProductReview, RfqItem, Severity, Span, VendorReview } from '../../domain/types';
import { useReview } from '../../store/useReview';
import { MATCH_KIND_LABELS, RULE_LABELS, TRUST_LABELS, VARIANCE_TOOLTIP } from './labels';
import { Badge, CheckChip, Mono, Money, SeverityBadge } from './primitives';

/** Props contract (section 7.0). */
export interface QuoteTableProps { review: VendorReview;
  audience: 'ops' | 'vendor';          // vendor: hide internal flags, variance, decisions, other vendors
  selectedLineId?: string;
  onSelectLine?: (lineId: string, evidence?: Span) => void }

const SEVERITY_RANK: Record<Severity, number> = { blocker: 0, warning: 1, info: 2 };
const CELL = 'border-t border-zinc-100 px-2 py-1.5';
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600';
const SELECTED_ACCENT = 'shadow-[inset_2px_0_0_#1d4ed8]';

// One requested quantity and whether some exact or alternate line of the item quotes it.
interface BreakState { qty: number; quoted: boolean }

// Everything the row components need from the table, handed down as one prop.
interface TableState {
  isOps: boolean;
  columnCount: number;
  selectedLineId: string | undefined;
  expandedIds: ReadonlySet<string>;
  openFlagsByLine: Map<string, Flag[]>;
  allFlagsByLine: Map<string, Flag[]>;
  openFlagsByProduct: Map<string, Flag[]>;
  selectLine: ((lineReview: LineReview) => void) | undefined;
  setIncluded: ((lineId: string, included: boolean) => void) | undefined;
  toggleExpanded: (productReview: ProductReview) => void;
  selectEvidence: (span: Span | undefined) => void;
}

// The most severe flag of a list (the first one wins a tie), or undefined for an empty list.
function worstFlag(flags: readonly Flag[]): Flag | undefined {
  let worst: Flag | undefined;
  for (const flag of flags) {
    if (!worst || SEVERITY_RANK[flag.severity] < SEVERITY_RANK[worst.severity]) worst = flag;
  }
  return worst;
}

// Buckets values by a key; values whose key is undefined are left out.
function groupBy<T>(values: readonly T[], keyOf: (value: T) => string | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    if (key === undefined) continue;
    const group = groups.get(key);
    if (group) group.push(value);
    else groups.set(key, [value]);
  }
  return groups;
}

// A product the vendor declined: no lines at all, or the vendor's own text says no bid.
function isNoBid(productReview: ProductReview): boolean {
  return productReview.lines.length === 0 || productReview.source?.noBid === true;
}

// "Yes", "No", or blank when the extraction has no value.
function yesNo(value: boolean | null): string {
  if (typeof value !== 'boolean') return '';
  return value ? 'Yes' : 'No';
}

// "Included", "Not included", or blank when the extraction has no value.
function includedText(value: boolean | null): string {
  if (typeof value !== 'boolean') return '';
  return value ? 'Included' : 'Not included';
}

// A keydown handler that runs the action on Enter or Space pressed on the row itself, not on a control in it.
function onActivateKey(action: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
}

/** The extracted quote laid out against the RFQ, with ghost rows for missing breaks. */
export function QuoteTable({ review, audience, selectedLineId, onSelectLine }: QuoteTableProps) {
  const toggleInclude = useReview((state) => state.toggleInclude);
  const selectInStore = useReview((state) => state.select);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  const isOps = audience === 'ops';
  const vendorId = review.vendor?.id;
  const items = review.rfq?.items ?? [];
  const products = review.products ?? [];
  // The vendor audience never sees internal flags, so it gets none.
  const openFlags = isOps ? (review.open ?? []) : [];
  const allFlags = isOps ? (review.flags ?? []) : [];

  const itemNos = new Set(items.map((item) => item.no));
  const isOnRfq = (productReview: ProductReview) => productReview.kind !== 'unrequested'
    && productReview.rfqNo !== undefined && itemNos.has(productReview.rfqNo);
  const productsByItem = groupBy(products.filter(isOnRfq), (productReview) => String(productReview.rfqNo));
  const notInRfq = products.filter((productReview) => !isOnRfq(productReview));

  const selectEvidence = (span: Span | undefined) => {
    if (isOps && span) selectInStore({ span });
  };

  const table: TableState = {
    isOps,
    columnCount: isOps ? 9 : 7,
    selectedLineId,
    expandedIds,
    openFlagsByLine: groupBy(openFlags, (flag) => flag.lineId),
    allFlagsByLine: groupBy(allFlags, (flag) => flag.lineId),
    openFlagsByProduct: groupBy(openFlags, (flag) => flag.productId),
    selectLine: onSelectLine
      ? (lineReview: LineReview) => onSelectLine(lineReview.line.id, lineReview.source?.span)
      : undefined,
    setIncluded: isOps && vendorId
      ? (lineId: string, included: boolean) => toggleInclude(vendorId, lineId, included)
      : undefined,
    toggleExpanded: (productReview) => {
      const productId = productReview.product.id;
      const willExpand = !expandedIds.has(productId);
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(productId)) next.delete(productId);
        else next.add(productId);
        return next;
      });
      if (willExpand) selectEvidence(productReview.source?.headerSpan ?? productReview.source?.span);
    },
    selectEvidence,
  };

  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-[12px] text-zinc-800">
      <thead>
        <tr>
          <HeaderCell align="right" className="w-14">Qty</HeaderCell>
          <HeaderCell align="right" className="w-24">Unit</HeaderCell>
          <HeaderCell align="right" className="w-24">Ext</HeaderCell>
          <HeaderCell className="w-[76px]">Currency</HeaderCell>
          <HeaderCell align="right" className="w-[72px]">Lead (d)</HeaderCell>
          <HeaderCell className="w-12">FAT</HeaderCell>
          {isOps && <HeaderCell align="right" className="w-[84px]" title={VARIANCE_TOOLTIP}>Variance†</HeaderCell>}
          {isOps && <HeaderCell align="center" className="w-[68px]">Include</HeaderCell>}
          <HeaderCell>Status</HeaderCell>
        </tr>
      </thead>
      {items.length === 0 && products.length === 0 && (
        <tbody>
          <tr>
            <td colSpan={table.columnCount} className="px-3 py-10 text-center text-[13px] text-zinc-500">
              No quote lines to show yet.
            </td>
          </tr>
        </tbody>
      )}
      {items.map((item) => (
        <ItemGroup key={item.no} item={item} products={productsByItem.get(String(item.no)) ?? []}
          openFlags={openFlags} table={table} />
      ))}
      {notInRfq.length > 0 && (
        <tbody>
          <tr>
            <td colSpan={table.columnCount}
              className="border-t border-zinc-200 px-3 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {isOps ? MATCH_KIND_LABELS.unrequested : 'Not requested, not included'}
              <span className="ml-1.5 tabular-nums text-zinc-400">{notInRfq.length}</span>
            </td>
          </tr>
          {notInRfq.map((productReview) => (
            <ProductBlock key={productReview.product.id} productReview={productReview} table={table} />
          ))}
        </tbody>
      )}
    </table>
  );
}

// A sticky column header; the inset shadow stands in for a bottom border, which sticky cells lose.
function HeaderCell({ children, align = 'left', title, className }: {
  children?: ReactNode; align?: 'left' | 'right' | 'center'; title?: string; className?: string;
}) {
  return (
    <th
      scope="col"
      title={title}
      className={clsx(
        'sticky top-0 z-10 whitespace-nowrap bg-white px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500',
        'shadow-[inset_0_-1px_0_#e4e4e7]',
        align === 'left' && 'text-left', align === 'right' && 'text-right', align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

// One RFQ item: each matched product with its lines (the first carries the item header), then ghost rows.
function ItemGroup({ item, products, openFlags, table }: {
  item: RfqItem; products: ProductReview[]; openFlags: Flag[]; table: TableState;
}) {
  const quotedQtys = new Set<number>();
  for (const productReview of products) {
    if (isNoBid(productReview)) continue;
    for (const lineReview of productReview.lines) quotedQtys.add(lineReview.line.quantity);
  }
  const breaks: BreakState[] = (item.qtys ?? []).map((qty) => ({ qty, quoted: quotedQtys.has(qty) }));
  const isWholeItemNoBid = products.length > 0 && products.every(isNoBid);
  const productIds = new Set(products.map((productReview) => productReview.product.id));
  // The open flag for one missing break, matched by item number or by one of the item's products.
  const breakFlag = (qty: number) => worstFlag(openFlags.filter((flag) => flag.lineId === undefined
    && flag.qty === qty
    && (flag.rfqNo === item.no || (flag.productId !== undefined && productIds.has(flag.productId)))));

  return (
    <tbody>
      {products.length === 0 && (
        <HeaderRow table={table} itemNo={item.no} partNumber={item.partNumber} nsn={item.nsn} breaks={breaks} noBid />
      )}
      {products.map((productReview, index) => (
        <ProductBlock
          key={productReview.product.id}
          productReview={productReview}
          table={table}
          itemNo={index === 0 ? item.no : undefined}
          breaks={index === 0 ? breaks : undefined}
          altFor={productReview.kind === 'alternate' ? item.partNumber : undefined}
          requestedNsn={item.nsn}
        />
      ))}
      {!isWholeItemNoBid && breaks.filter((requested) => !requested.quoted).map(({ qty }, index) => (
        <GhostRow key={`${qty}-${index}`} qty={qty} flag={breakFlag(qty)} table={table} />
      ))}
    </tbody>
  );
}

// One extracted product: its header, the detail row when expanded, then its lines or a single no-bid row.
function ProductBlock({ productReview, table, itemNo, breaks, altFor, requestedNsn = '' }: {
  productReview: ProductReview; table: TableState; itemNo?: number; breaks?: BreakState[];
  altFor?: string; requestedNsn?: string;
}) {
  const { product, source } = productReview;
  const noBid = isNoBid(productReview);
  const isExpanded = !noBid && table.expandedIds.has(product.id);
  // A no-bid hides extracted fields, which may be invented; the vendor's own text and the RFQ stay.
  const description = noBid ? (source?.description ?? '') : (product.description || source?.description || '');
  const nsn = noBid ? requestedNsn : (product.nsn || requestedNsn);

  return (
    <>
      <HeaderRow
        table={table}
        itemNo={itemNo}
        partNumber={product.partNumber}
        nsn={nsn}
        description={description}
        altFor={altFor}
        noBid={noBid}
        breaks={breaks}
        expanded={isExpanded}
        onToggle={noBid ? undefined : () => table.toggleExpanded(productReview)}
      />
      {isExpanded && <DetailRow productReview={productReview} columnCount={table.columnCount} />}
      {noBid
        ? <NoBidRow productReview={productReview} table={table} />
        : productReview.lines.map((lineReview) => <LineRow key={lineReview.line.id} lineReview={lineReview} table={table} />)}
    </>
  );
}

// The header of an item or product: number, PN, ALT and NO BID badges, NSN, description, break chips.
function HeaderRow({ table, itemNo, partNumber, nsn, description = '', altFor, noBid, breaks, expanded = false, onToggle }: {
  table: TableState; itemNo?: number; partNumber: string; nsn: string; description?: string; altFor?: string;
  noBid: boolean; breaks?: BreakState[]; expanded?: boolean; onToggle?: () => void;
}) {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const content = (
    <>
      <span className="flex w-4 shrink-0 justify-center text-zinc-400">
        {onToggle && <ChevronIcon aria-hidden className="size-3.5" />}
      </span>
      <span className="w-7 shrink-0 tabular-nums text-zinc-500">{itemNo === undefined ? '' : `#${itemNo}`}</span>
      <Mono className="shrink-0 font-semibold text-zinc-900">{partNumber}</Mono>
      {altFor && <Badge className="shrink-0">ALT for <span className="font-mono">{altFor}</span></Badge>}
      {noBid && <Badge icon={Ban} className="shrink-0">NO BID</Badge>}
      {nsn && <Mono className="shrink-0 text-zinc-500">{nsn}</Mono>}
      <span className="min-w-0 flex-1 truncate text-zinc-600">{description}</span>
      {breaks && breaks.length > 0 && <BreakChips breaks={breaks} />}
    </>
  );
  const layout = 'flex w-full min-w-0 items-center gap-2 overflow-hidden px-2 py-2 text-left';

  return (
    <tr className={clsx('bg-zinc-50', onToggle && 'hover:bg-zinc-100')}>
      <td colSpan={table.columnCount} className="border-t border-zinc-200 p-0">
        {onToggle ? (
          <button type="button" aria-expanded={expanded} onClick={onToggle} className={clsx(layout, 'cursor-pointer', FOCUS_RING)}>
            {content}
          </button>
        ) : (
          <div className={layout}>{content}</div>
        )}
      </td>
    </tr>
  );
}

// Requested quantities as chips: a green check when some exact or alternate line quotes it, a red x when not.
function BreakChips({ breaks }: { breaks: BreakState[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="mr-0.5 text-[11px] text-zinc-400">Requested</span>
      {breaks.map(({ qty, quoted }, index) => {
        const StateIcon = quoted ? Check : X;
        return (
          <span
            key={`${qty}-${index}`}
            title={`${qty} ${quoted ? 'quoted' : 'not quoted'}`}
            className={clsx(
              'inline-flex items-center gap-0.5 rounded-md border px-1 text-[11px] font-medium leading-4 tabular-nums',
              quoted ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700',
            )}
          >
            <StateIcon aria-hidden strokeWidth={2.5} className={clsx('size-3', quoted ? 'text-emerald-600' : 'text-red-600')} />
            {qty.toLocaleString('en-US')}
            <span className="sr-only">{quoted ? ' quoted' : ' not quoted'}</span>
          </span>
        );
      })}
    </span>
  );
}

// Product-level terms from the extraction, shown when a product header is expanded.
function DetailRow({ productReview, columnCount }: { productReview: ProductReview; columnCount: number }) {
  const { product } = productReview;
  const currency = productReview.lines[0]?.line.currency;
  const fields: { label: string; value: ReactNode }[] = [
    { label: 'Packaging', value: includedText(product.packagingIncluded) },
    { label: 'Shipping', value: includedText(product.shippingIncluded) },
    { label: 'Certs', value: product.certifications },
    { label: 'NRE', value: product.nreCost === null ? '' : <Money amount={product.nreCost} currency={currency} /> },
    { label: 'COO', value: product.coo },
    { label: 'Hazmat', value: yesNo(product.hazmatItem) },
    { label: 'Mfr CAGE', value: product.mfrCage ? <Mono>{product.mfrCage}</Mono> : '' },
    { label: 'Mfr PN', value: product.mfrPartNumber ? <Mono>{product.mfrPartNumber}</Mono> : '' },
  ];

  return (
    <tr>
      <td colSpan={columnCount} className="border-t border-zinc-100 bg-white px-2 py-2.5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 pl-[60px] sm:grid-cols-4">
          {fields.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
              <dd className="mt-0.5 truncate text-zinc-800">
                {value === '' || value === null || value === undefined
                  ? <span className="text-zinc-400">Not stated</span>
                  : value}
              </dd>
            </div>
          ))}
        </dl>
      </td>
    </tr>
  );
}

// One quantity break: values as extracted (overrides applied), the include toggle and its review status.
function LineRow({ lineReview, table }: { lineReview: LineReview; table: TableState }) {
  const { line } = lineReview;
  const isSelected = table.selectedLineId === line.id;
  const { selectLine, setIncluded } = table;
  const select = selectLine ? () => selectLine(lineReview) : undefined;

  return (
    <tr
      tabIndex={select ? 0 : undefined}
      aria-current={isSelected ? 'true' : undefined}
      onClick={select}
      onKeyDown={select && onActivateKey(select)}
      className={clsx(
        isSelected ? 'bg-blue-50' : 'hover:bg-zinc-50',
        select && clsx('cursor-pointer', FOCUS_RING),
        !lineReview.included && 'text-zinc-400',
      )}
    >
      <td className={clsx(CELL, 'text-right font-medium tabular-nums', isSelected && SELECTED_ACCENT)}>
        {line.quantity.toLocaleString('en-US')}
      </td>
      <td className={clsx(CELL, 'text-right')}><Money amount={line.unitCost} /></td>
      <td className={clsx(CELL, 'text-right')}><Money amount={line.price} /></td>
      <td className={clsx(CELL, 'text-zinc-500')}>{line.currency}</td>
      <td className={clsx(CELL, 'text-right tabular-nums')}>
        {line.leadTime ?? <span className="text-zinc-400">n/a</span>}
      </td>
      <td className={CELL}>{yesNo(line.isFat)}</td>
      {table.isOps && (
        <td className={clsx(CELL, 'text-right tabular-nums')}>
          {line.variance && (
            <span title={VARIANCE_TOOLTIP}>
              {line.variance}
              <span aria-hidden className="ml-px text-zinc-400">†</span>
            </span>
          )}
        </td>
      )}
      {table.isOps && (
        <td className={clsx(CELL, 'text-center')}>
          <input
            type="checkbox"
            checked={lineReview.included}
            disabled={!setIncluded}
            aria-label={`Include qty ${line.quantity} in award`}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setIncluded?.(line.id, event.target.checked)}
            className={clsx('size-3.5 cursor-pointer accent-blue-700 disabled:cursor-not-allowed', FOCUS_RING)}
          />
        </td>
      )}
      <td className={CELL}>
        {table.isOps ? (
          <OpsLineStatus lineReview={lineReview} table={table} />
        ) : (
          <span className="inline-flex items-center gap-1 text-zinc-700">
            <Check aria-hidden className="size-3.5 text-emerald-600" />
            Quoted
          </span>
        )}
      </td>
    </tr>
  );
}

// Ops status: the worst open flag on the line, "Matches email" when verified, "from email" after a fix.
function OpsLineStatus({ lineReview, table }: { lineReview: LineReview; table: TableState }) {
  const lineId = lineReview.line.id;
  const openFlags = table.openFlagsByLine.get(lineId) ?? [];
  const decidedCount = (table.allFlagsByLine.get(lineId)?.length ?? 0) - openFlags.length;
  const worst = worstFlag(openFlags);
  const isVerified = lineReview.status === 'verified';
  const hasStatus = worst !== undefined || isVerified || lineReview.overridden;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {worst && <FlagLabel flag={worst} extraCount={openFlags.length - 1} />}
      {isVerified && <CheckChip>Matches email</CheckChip>}
      {lineReview.overridden && (
        <Badge tone="accent" icon={PenLine} title="Value applied from the vendor email">from email</Badge>
      )}
      {!hasStatus && decidedCount > 0 && (
        <Badge title={`${decidedCount} issue(s) accepted or excluded`}>Reviewed</Badge>
      )}
      {!hasStatus && decidedCount <= 0 && <span className="text-zinc-400">{TRUST_LABELS.unverified}</span>}
    </div>
  );
}

// A flag as severity badge plus its short rule label, with "+n" when the row has more open flags.
function FlagLabel({ flag, extraCount }: { flag: Flag; extraCount: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1" title={flag.detail}>
      <SeverityBadge severity={flag.severity} />
      <span className="truncate text-zinc-700">{RULE_LABELS[flag.rule] ?? flag.title}</span>
      {extraCount > 0 && <span className="tabular-nums text-zinc-400">+{extraCount}</span>}
    </span>
  );
}

// The single row of a no-bid product: the vendor's note in italics, never the extracted values.
function NoBidRow({ productReview, table }: { productReview: ProductReview; table: TableState }) {
  const { product, source } = productReview;
  // The vendor audience sees only the vendor's own words; Ops may also see the extraction's note.
  const note = table.isOps ? (source?.note || product.additionalNotes) : source?.note;
  const evidence = source?.noteSpan ?? source?.span;
  const worst = table.isOps ? worstFlag(table.openFlagsByProduct.get(product.id) ?? []) : undefined;
  const select = table.isOps && evidence ? () => table.selectEvidence(evidence) : undefined;

  return (
    <tr
      tabIndex={select ? 0 : undefined}
      onClick={select}
      onKeyDown={select && onActivateKey(select)}
      className={clsx(select && clsx('cursor-pointer hover:bg-zinc-50', FOCUS_RING))}
    >
      <td colSpan={table.columnCount} className={CELL}>
        <div className="flex items-center gap-3 pl-[60px]">
          <p className="min-w-0 flex-1 italic text-zinc-600">{note ? `“${note}”` : 'No bid. No reason given.'}</p>
          {worst && <FlagLabel flag={worst} extraCount={0} />}
        </div>
      </td>
    </tr>
  );
}

// A requested break the vendor did not quote, drawn as a dashed placeholder ("250 · not quoted").
function GhostRow({ qty, flag, table }: { qty: number; flag: Flag | undefined; table: TableState }) {
  return (
    <tr>
      <td colSpan={table.columnCount} className="border-t border-zinc-100 px-1 py-1">
        <div
          className={clsx(
            'flex items-center gap-2 rounded-md border border-dashed px-1.5 py-1',
            table.isOps ? 'border-zinc-300 text-zinc-400' : 'border-red-200 bg-red-50/50 text-red-700',
          )}
        >
          <span className="w-[37px] shrink-0 text-right font-medium tabular-nums">{qty.toLocaleString('en-US')}</span>
          <span>· not quoted</span>
          {flag && <span className="ml-auto min-w-0"><FlagLabel flag={flag} extraCount={0} /></span>}
        </div>
      </td>
    </tr>
  );
}
