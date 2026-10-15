// Vendor portal table: our request on the left, the vendor's quote on the right, one row per requested break.
// Shows only the RFQ and this vendor's own quote: never internal issues, decisions, variance or other vendors.
// Presentational: props in, no store access, no rule logic. Vendor text renders only as React text nodes.

import clsx from 'clsx';
import type { LineReview, ProductReview, RfqItem, VendorReview } from '../../domain/types';
import { formatLeadTime, formatMoney, formatQty } from '../shared/format';
import { Badge, Money, Mono } from '../shared/primitives';
import { isNoBid } from '../shared/reviewLookups';
import { TABLE } from '../shared/styles';

const REQUEST_COLUMNS = 3;
const QUOTE_COLUMNS = 4;
const CELL = 'px-3 py-2';
const HEADER = 'px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide';
/** The quote half is tinted blue and divided from the request half, so the two sides read apart at a glance. */
const QUOTE_SIDE = 'border-l border-blue-100 bg-blue-50/40';
const NOT_QUOTED = <span className="text-[12px] font-medium text-amber-700">Not quoted yet</span>;
const UNREAD = <span className="text-[12px] italic text-zinc-500">We could not read this line. Please confirm the price and lead time.</span>;

/** A quoted line the RFQ never asked for: an extra quantity of a requested part, or a part not on the RFQ. */
interface ExtraLine { product: ProductReview; line: LineReview }

/** One requested item against what the vendor quoted for it. */
function describeItem(item: RfqItem, products: ProductReview[]) {
  const quoting = products.filter((productReview) => !isNoBid(productReview));
  const lineByQty = new Map<number, LineReview>();
  for (const productReview of quoting) {
    for (const lineReview of productReview.lines) {
      if (!lineByQty.has(lineReview.line.quantity)) lineByQty.set(lineReview.line.quantity, lineReview);
    }
  }
  const first = products[0];
  const noBid = first !== undefined && quoting.length === 0;
  return {
    lineByQty,
    noBid,
    // Only the vendor's own words are shown for a no-bid, never the extraction's note, which may be invented.
    note: noBid ? first?.source?.note : undefined,
    alternate: quoting.find((productReview) => productReview.kind === 'alternate'),
    quotedCount: item.qtys.filter((qty) => lineByQty.has(qty)).length,
  };
}

/** The vendor's full quote against our request. */
export function RequestVsQuote({ review }: { review: VendorReview }) {
  const { items } = review.rfq;
  const itemByNo = new Map(items.map((item) => [item.no, item]));
  const isOnRfq = (productReview: ProductReview) => productReview.kind !== 'unrequested'
    && productReview.rfqNo !== undefined && itemByNo.has(productReview.rfqNo);
  const extras: ExtraLine[] = review.products.flatMap((productReview) => {
    if (isNoBid(productReview)) return [];
    const requestedQtys = isOnRfq(productReview) ? itemByNo.get(productReview.rfqNo ?? -1)?.qtys ?? [] : [];
    return productReview.lines
      .filter((lineReview) => !requestedQtys.includes(lineReview.line.quantity))
      .map((lineReview) => ({ product: productReview, line: lineReview }));
  });

  return (
    <table className={clsx(TABLE.table, 'table-fixed')}>
      {/* A fixed layout takes its widths from the first row, which spans columns, so the widths live here. */}
      <colgroup>
        <col className="w-10" /><col /><col className="w-20" />
        <col className="w-24" /><col className="w-28" /><col className="w-24" /><col className="w-14" />
      </colgroup>
      <thead>
        <tr>
          <th scope="colgroup" colSpan={REQUEST_COLUMNS} className={clsx(HEADER, 'bg-zinc-100 text-left text-zinc-700')}>Our request</th>
          <th scope="colgroup" colSpan={QUOTE_COLUMNS} className={clsx(HEADER, 'border-l border-blue-100 bg-blue-50 text-left text-blue-800')}>
            Your quote <span className="font-normal normal-case tracking-normal text-blue-700/70">as we read it</span>
          </th>
        </tr>
        <tr className="border-b border-zinc-200 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          <th scope="col" className={clsx(CELL, 'text-left')}>#</th>
          <th scope="col" className={clsx(CELL, 'text-left')}>Part</th>
          <th scope="col" className={clsx(CELL, 'text-right')}>Qty</th>
          <th scope="col" className={clsx(CELL, QUOTE_SIDE, 'text-right')}>Unit</th>
          <th scope="col" className={clsx(CELL, QUOTE_SIDE, 'text-right')}>Ext</th>
          <th scope="col" className={clsx(CELL, QUOTE_SIDE, 'text-right')}>Lead</th>
          <th scope="col" className={clsx(CELL, QUOTE_SIDE, 'text-left')}>FAT</th>
        </tr>
      </thead>
      {items.map((item) => (
        <ItemRows key={item.no} item={item} products={review.products.filter((productReview) => isOnRfq(productReview) && productReview.rfqNo === item.no)} />
      ))}
      {extras.length > 0 && (
        <tbody>
          <tr className={TABLE.groupRow}>
            <td colSpan={REQUEST_COLUMNS} className={CELL}>Not on our request</td>
            <td colSpan={QUOTE_COLUMNS} className={clsx(CELL, QUOTE_SIDE, 'font-normal text-zinc-500')}>Also in your quote</td>
          </tr>
          {extras.map(({ product, line }) => (
            <tr key={line.line.id} className={TABLE.row}>
              <td colSpan={REQUEST_COLUMNS} className={clsx(CELL, 'text-[12px] italic text-zinc-400')}>Not requested</td>
              <td colSpan={QUOTE_COLUMNS} className={clsx(CELL, QUOTE_SIDE, 'text-zinc-800')}>{describeExtra(product, line)}</td>
            </tr>
          ))}
        </tbody>
      )}
    </table>
  );
}

/** One requested item: a header with the part and the vendor's answer, then a row per requested break. */
function ItemRows({ item, products }: { item: RfqItem; products: ProductReview[] }) {
  const { lineByQty, noBid, note, alternate, quotedCount } = describeItem(item, products);
  const hasBreakRows = products.length > 0 && !noBid;
  const headerQtys = hasBreakRows ? '' : item.qtys.map(formatQty).join(' / ');
  return (
    <tbody>
      <tr className={TABLE.groupRow}>
        <td className={clsx(CELL, 'tabular-nums text-zinc-400')}>#{item.no}</td>
        <td className={clsx(CELL, 'whitespace-nowrap')}><Mono className="font-semibold text-zinc-900">{item.partNumber}</Mono></td>
        <td className={clsx(CELL, 'whitespace-nowrap text-right font-normal tabular-nums text-zinc-700')}>{headerQtys}</td>
        <td colSpan={QUOTE_COLUMNS} className={clsx(CELL, QUOTE_SIDE, 'font-normal')}>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {products.length === 0 && NOT_QUOTED}
            {noBid && <Badge>No bid</Badge>}
            {noBid && note && <span className="italic text-zinc-600">“{note}”</span>}
            {alternate && (
              <span className="inline-flex items-center gap-1.5 text-zinc-700">
                You offered <Mono className="font-medium text-zinc-900">{alternate.product.partNumber}</Mono>
                <Badge>Alternate</Badge>
              </span>
            )}
            {hasBreakRows && quotedCount < item.qtys.length && (
              <span className="text-zinc-500">{quotedCount} of {item.qtys.length} breaks quoted</span>
            )}
          </span>
        </td>
      </tr>
      {hasBreakRows && item.qtys.map((qty) => <BreakRow key={qty} qty={qty} lineReview={lineByQty.get(qty)} />)}
    </tbody>
  );
}

/** One requested quantity: the quantity on our side, the vendor's values (or "Not quoted yet") on theirs. */
function BreakRow({ qty, lineReview }: { qty: number; lineReview: LineReview | undefined }) {
  const line = lineReview?.line;
  const isUnread = line !== undefined && line.unitCost === null && line.price === null && line.leadTime === null;
  return (
    <tr className={TABLE.row}>
      <td className={CELL} />
      <td className={CELL} />
      <td className={clsx(CELL, 'text-right font-medium tabular-nums text-zinc-900')}>{formatQty(qty)}</td>
      {line && !isUnread ? (
        <>
          <td className={clsx(CELL, QUOTE_SIDE, 'text-right')}><Money amount={line.unitCost} currency={line.currency || undefined} /></td>
          <td className={clsx(CELL, QUOTE_SIDE, 'text-right')}><Money amount={line.price} currency={line.currency || undefined} /></td>
          <td className={clsx(CELL, QUOTE_SIDE, 'whitespace-nowrap text-right tabular-nums')}>
            {line.leadTime === null ? <span className="text-zinc-400">—</span> : formatLeadTime(line.leadTime, 'long')}
          </td>
          <td className={clsx(CELL, QUOTE_SIDE)}>{line.isFat ? 'Yes' : ''}</td>
        </>
      ) : (
        <td colSpan={QUOTE_COLUMNS} className={clsx(CELL, QUOTE_SIDE)}>{line ? UNREAD : NOT_QUOTED}</td>
      )}
    </tr>
  );
}

/** An extra line in one sentence: "MS27039-1-08 · 1,000 pcs · $1.50 ea · $1,500.00 ext · 27 days". */
function describeExtra(product: ProductReview, { line }: LineReview) {
  const currency = line.currency || undefined;
  const parts = [
    `${formatQty(line.quantity)} pcs`,
    line.unitCost === null ? undefined : `${formatMoney(line.unitCost, currency)} ea`,
    line.price === null ? undefined : `${formatMoney(line.price, currency)} ext`,
    line.leadTime === null ? undefined : formatLeadTime(line.leadTime, 'long'),
    line.isFat ? 'FAT' : undefined,
  ].filter((part) => part !== undefined);
  const isUnread = line.unitCost === null && line.price === null && line.leadTime === null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <Mono className="font-medium text-zinc-900">{product.product.partNumber}</Mono>
      <span className="tabular-nums">{parts.join(' · ')}</span>
      {isUnread && UNREAD}
    </span>
  );
}
