// Builds a vendor's follow-up (section 5.7): the generated email and the asks behind it, the stale asks in the
// stored draft, and the open asks that draft forgot. Pure: never mutates its inputs, never asks for what was given.

import {
  DRAFT_COO_PATTERN, DRAFT_CURRENCY_PATTERN, DRAFT_EXPIRY_PATTERN, DRAFT_PAYMENT_TERMS_PATTERN,
  DRAFT_SHIPPING_PATTERN, DRAFT_VALIDITY_PATTERN,
} from './constants';
import type { RuleContext } from './context';
import { HEADER_FIELD_LABELS, missingBreaksSentence } from './rules';
import type { Flag, FollowUpAsk, RawProduct, RfqItem, VendorReview } from './types';

/** Section heading for asks tied to no RFQ item: vendor terms and parts that are not on the RFQ. */
export const GENERAL_SECTION = 'General';

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const hasAsk = (flag: Flag): boolean => typeof flag.followUp === 'string' && flag.followUp.trim() !== '';

/** The email heading of one RFQ item's asks ("Item 3 · MS21042L3"). */
export function itemSectionTitle(rfqItem: RfqItem): string {
  return `Item ${rfqItem.no} · ${rfqItem.partNumber}`;
}

/** Builds one vendor's follow-up from its open flags; unticked asks stay listed as excluded but leave the email. */
export function buildFollowUp(
  context: RuleContext, openFlags: Flag[], followUpExcluded: Record<string, boolean>,
): VendorReview['followUp'] {
  const isExcluded = (flag: Flag): boolean => followUpExcluded[flag.id] === true;
  const asks = buildAsks(context, openFlags.filter(hasAsk), isExcluded);
  return {
    generated: composeEmail(context, asks.filter((ask) => !ask.excluded)),
    staleAsks: findStaleAsks(context),
    missedFlagIds: openFlags.filter((flag) => hasAsk(flag) && !isExcluded(flag))
      .filter((flag) => !isMentionedInDraft(context, flag, textOf(context.vendor.followUpDraft)))
      .map((flag) => flag.id),
    asks,
  };
}

/** Every open ask in email order: RFQ items in order (missing breaks grouped per item), then General. */
function buildAsks(context: RuleContext, askFlags: Flag[], isExcluded: (flag: Flag) => boolean): FollowUpAsk[] {
  const rfqItems = [...context.rfq.items].sort((left, right) => left.no - right.no);
  const rfqNos = new Set(rfqItems.map((item) => item.no));
  const asks: FollowUpAsk[] = [];
  for (const rfqItem of rfqItems) {
    const section = itemSectionTitle(rfqItem);
    const itemFlags = askFlags.filter((flag) => flag.rfqNo === rfqItem.no);
    const breakFlags = itemFlags.filter((flag) => flag.rule === 'MISSING_QTY_BREAK');
    for (const flag of itemFlags) {
      if (flag.rule !== 'MISSING_QTY_BREAK') asks.push(singleAsk(section, rfqItem.no, flag, isExcluded(flag)));
      else if (flag === breakFlags[0]) asks.push(breaksAsk(rfqItem, section, breakFlags, isExcluded));
    }
  }
  for (const flag of askFlags) {
    if (flag.rfqNo === undefined || !rfqNos.has(flag.rfqNo)) {
      asks.push(singleAsk(GENERAL_SECTION, undefined, flag, isExcluded(flag)));
    }
  }
  return asks;
}

function singleAsk(section: string, rfqNo: number | undefined, flag: Flag, excluded: boolean): FollowUpAsk {
  return { section, rfqNo, text: textOf(flag.followUp), flagIds: [flag.id], excluded };
}

/** One bullet for all missing breaks of an item; it names only the ticked breaks while any is ticked. */
function breaksAsk(rfqItem: RfqItem, section: string, breakFlags: Flag[], isExcluded: (flag: Flag) => boolean): FollowUpAsk {
  const ticked = breakFlags.filter((flag) => !isExcluded(flag));
  const namedQtys = new Set((ticked.length > 0 ? ticked : breakFlags).map((flag) => flag.qty));
  return {
    section, rfqNo: rfqItem.no,
    text: missingBreaksSentence(rfqItem, rfqItem.qtys.filter((qty) => namedQtys.has(qty))),
    flagIds: breakFlags.map((flag) => flag.id),
    excluded: ticked.length === 0,
  };
}

function firstName(contactName: unknown): string {
  return textOf(contactName).trim().split(/\s+/)[0] || 'there';
}

/** The plain-text email: subject, greeting, one section per RFQ item with asks, then General. */
function composeEmail(context: RuleContext, asks: FollowUpAsk[]): string {
  const opening = [
    `Subject: Re: ${textOf(context.rfq.subject).trim()} - follow-up`, '',
    `Hi ${firstName(context.vendor.contactName)},`, '',
  ];
  const closing = ['', 'Thank you,', 'Purchasing'];
  if (asks.length === 0) {
    return [...opening, 'Thank you for your quote. We have no open questions at this point.', ...closing].join('\n');
  }
  const bulletsBySection = new Map<string, string[]>();
  for (const ask of asks) {
    bulletsBySection.set(ask.section, [...(bulletsBySection.get(ask.section) ?? []), `- ${ask.text}`]);
  }
  const sections = [...bulletsBySection].map(([section, bullets]) => [section, ...bullets].join('\n'));
  return [
    ...opening, 'Thank you for your quote. Before we can place an order, could you help with the points below?', '',
    sections.join('\n\n'), ...closing,
  ].join('\n');
}

/** The quoted part (exact or alternate, with lines) for an RFQ item number. */
function quotedProductForItem(context: RuleContext, rfqNo: number): RawProduct | undefined {
  return context.products.find((productReview) => (productReview.kind === 'exact' || productReview.kind === 'alternate')
    && productReview.rfqNo === rfqNo && productReview.lines.length > 0)?.product;
}

/** Asks in the stored draft that the vendor already answered. */
function findStaleAsks(context: RuleContext): string[] {
  const { vendor } = context;
  const draft = textOf(vendor.followUpDraft);
  const staleAsks: string[] = [];
  const paymentTerms = textOf(vendor.paymentTerms).trim();
  if (DRAFT_PAYMENT_TERMS_PATTERN.test(draft) && paymentTerms !== '') {
    staleAsks.push(`Payment terms - already given: ${paymentTerms}`);
  }
  if (DRAFT_VALIDITY_PATTERN.test(draft) && typeof vendor.daysQuoteValid === 'number') {
    staleAsks.push(`Quote validity - already given: ${vendor.daysQuoteValid} days`);
  }
  for (const match of draft.matchAll(DRAFT_COO_PATTERN)) {
    const coo = textOf(quotedProductForItem(context, Number(match[1]))?.coo).trim();
    if (coo !== '') staleAsks.push(`COO for item ${match[1]} - already given: ${coo}`);
  }
  for (const match of draft.matchAll(DRAFT_SHIPPING_PATTERN)) {
    const shippingIncluded = quotedProductForItem(context, Number(match[1]))?.shippingIncluded;
    if (typeof shippingIncluded === 'boolean') {
      staleAsks.push(`Shipping on item ${match[1]} - already given: ${shippingIncluded ? 'included' : 'not included'}`);
    }
  }
  return staleAsks;
}

/** Whether the stored draft already covers a flag's ask (section 5.7 missedFlagIds). */
function isMentionedInDraft(context: RuleContext, flag: Flag, draft: string): boolean {
  if (flag.productId === undefined && flag.rfqNo === undefined) {
    switch (flag.rule) {
      case 'NON_USD_CURRENCY': return DRAFT_CURRENCY_PATTERN.test(draft);
      case 'QUOTE_EXPIRED':
      case 'VALIDITY_AMBIGUOUS': return DRAFT_EXPIRY_PATTERN.test(draft);
      case 'MISSING_HEADER_FIELD': return (flag.fields ?? []).every((fieldName) =>
        draft.toLowerCase().includes((HEADER_FIELD_LABELS[fieldName] ?? fieldName).toLowerCase()));
      default: return false;
    }
  }
  const lowerDraft = draft.toLowerCase();
  const productPn = context.products.find((productReview) => productReview.product.id === flag.productId)?.product.partNumber;
  const rfqPn = context.rfq.items.find((item) => item.no === flag.rfqNo)?.partNumber;
  const mentionsPn = [productPn, rfqPn].some((partNumber) =>
    textOf(partNumber).trim() !== '' && lowerDraft.includes(textOf(partNumber).trim().toLowerCase()));
  const mentionsItem = flag.rfqNo !== undefined && new RegExp(`\\bitem\\s+${flag.rfqNo}\\b`, 'i').test(draft);
  return mentionsPn || mentionsItem;
}
