// Ops issues list for one vendor: blockers open, warnings and info folded; only the selected issue expands to
// show what differs from the email and its actions. Props in, callbacks out: no store access, no rule logic.

import clsx from 'clsx';
import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Decision, Fix, Flag, LineReview, Severity, VendorReview } from '../../domain/types';
import { validateAcceptNote, type UndoTarget } from '../../store/useReview';
import { formatLeadTime, formatMoney, formatShortDate } from '../shared/format';
import { RULE_LABELS, SEVERITY_LABELS } from '../shared/labels';
import { Button, EmptyState, ItemLabel, SeverityIcon, StatusText } from '../shared/primitives';
import { SELECTED_ROW } from '../shared/styles';
import { orderIssues } from './issueOrder';

/** Props: the vendor's review and decisions, the selected issue, the actions, and where to go next. */
export interface IssuesPanelProps {
  review: VendorReview;
  decisions: Record<string, Decision>;
  selectedFlagId?: string;
  onSelectFlag: (flag: Flag) => void;
  onApplyFix: (flag: Flag) => void;
  onAccept: (flag: Flag, note: string) => boolean;
  onExclude: (flag: Flag) => void;
  onUndo: (target: UndoTarget) => void;
  /** Another vendor that still has blockers, offered once this one has none. */
  nextVendor?: { name: string; blockerCount: number; onOpen: () => void };
}

const SEVERITIES: readonly Severity[] = ['blocker', 'warning', 'info'];
const SECTION_TITLES: Record<Severity, string> = { blocker: 'Blockers', warning: 'Warnings', info: 'Info' };
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600';

/** Where an issue applies, as a short token: "#3", "Not in RFQ" or "Whole quote". */
function scopeToken(flag: Flag): string {
  if (flag.rfqNo !== undefined) return `#${flag.rfqNo}`;
  return flag.productId ? 'Not in RFQ' : 'Whole quote';
}

/** True when a key press belongs to a text field, so single-letter shortcuts must not fire. */
function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** The issues list beside the quote. */
export function IssuesPanel({
  review, decisions, selectedFlagId, onSelectFlag, onApplyFix, onAccept, onExclude, onUndo, nextVendor,
}: IssuesPanelProps) {
  const [acceptingFlagId, setAcceptingFlagId] = useState<string>();
  const [sectionOverrides, setSectionOverrides] = useState<Partial<Record<Severity, boolean>>>({});
  const [showResolved, setShowResolved] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const ordered = useMemo(() => orderIssues(review.open), [review.open]);
  const resolved = review.flags.filter((flag) => decisions[flag.id]);
  const blockerCount = review.counts.blocker;
  const selected = ordered.find((flag) => flag.id === selectedFlagId);

  // A section is open when the operator opened it, or by default (blockers; warnings once blockers are gone),
  // or because it holds the selected issue.
  const isSectionOpen = (severity: Severity) => sectionOverrides[severity]
    ?? (severity === 'blocker' || (severity === 'warning' && blockerCount === 0) || selected?.severity === severity);

  // j and k move the selection, e applies the email value, a opens the accept note. Only while the panel is visible.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (!panelRef.current || panelRef.current.getClientRects().length === 0 || ordered.length === 0) return;
      const index = ordered.findIndex((flag) => flag.id === selectedFlagId);
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const step = event.key === 'j' ? 1 : -1;
        onSelectFlag(ordered[index < 0 ? 0 : Math.min(Math.max(index + step, 0), ordered.length - 1)]);
      } else if (event.key === 'e' && selected?.fix) {
        event.preventDefault();
        onApplyFix(selected);
      } else if (event.key === 'a' && selected) {
        event.preventDefault();
        setAcceptingFlagId(selected.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ordered, selected, selectedFlagId, onSelectFlag, onApplyFix]);

  // Keep the selected issue in view when the selection moves (keys, or a click elsewhere on the screen).
  useEffect(() => {
    if (!selectedFlagId) return;
    panelRef.current?.querySelector<HTMLElement>(`[data-flag-id="${CSS.escape(selectedFlagId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedFlagId]);

  return (
    <div ref={panelRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <h2 className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-zinc-900">Issues</h2>

      {blockerCount === 0 && ordered.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-100 px-4 py-3">
          <StatusText tone="verified" icon={Check}>All blockers cleared</StatusText>
          {nextVendor && (
            <button type="button" onClick={nextVendor.onOpen} className="text-[12px] text-blue-700 hover:underline">
              Next: {nextVendor.name} has {nextVendor.blockerCount} blocker{nextVendor.blockerCount === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      {ordered.length === 0 && (
        <EmptyState icon={Check} tone="verified">
          {review.status === 'submitted' ? 'No open issues. Marked verified.' : 'No open issues. Ready to mark verified.'}
        </EmptyState>
      )}

      {SEVERITIES.map((severity) => {
        const flags = ordered.filter((flag) => flag.severity === severity);
        if (flags.length === 0) return null;
        const isOpen = isSectionOpen(severity);
        return (
          <section key={severity} aria-label={`${SEVERITY_LABELS[severity]} issues`} className="border-b border-zinc-100">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setSectionOverrides((current) => ({ ...current, [severity]: !isOpen }))}
              className={clsx('flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] font-medium text-zinc-700 hover:bg-zinc-50', FOCUS_RING)}
            >
              <ChevronRight aria-hidden className={clsx('size-3.5 text-zinc-400 transition-transform', isOpen && 'rotate-90')} />
              <SeverityIcon severity={severity} />
              {SECTION_TITLES[severity]}
              <span className="tabular-nums text-zinc-400">{flags.length}</span>
            </button>
            {isOpen && (
              <ul>
                {flags.map((flag) => (
                  <IssueRow
                    key={flag.id}
                    flag={flag}
                    review={review}
                    isSelected={flag.id === selectedFlagId}
                    isAccepting={flag.id === acceptingFlagId}
                    onSelect={() => onSelectFlag(flag)}
                    onApplyFix={() => onApplyFix(flag)}
                    onStartAccept={() => setAcceptingFlagId(flag.id)}
                    onCancelAccept={() => setAcceptingFlagId(undefined)}
                    onConfirmAccept={(note) => {
                      const isAccepted = onAccept(flag, note);
                      if (isAccepted) setAcceptingFlagId(undefined);
                      return isAccepted;
                    }}
                    onExclude={() => onExclude(flag)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {resolved.length > 0 && (
        <div className="px-4 py-3">
          <Button size="xs" variant="ghost" onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
          </Button>
          {showResolved && (
            <ul className="mt-2 divide-y divide-zinc-100">
              {resolved.map((flag) => <ResolvedRow key={flag.id} flag={flag} decision={decisions[flag.id]} onUndo={onUndo} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** One open issue: a single line when unselected; the selected one expands in place with what differs and its actions. */
function IssueRow({ flag, review, isSelected, isAccepting, onSelect, onApplyFix, onStartAccept, onCancelAccept, onConfirmAccept, onExclude }: {
  flag: Flag; review: VendorReview; isSelected: boolean; isAccepting: boolean;
  onSelect: () => void; onApplyFix: () => void; onStartAccept: () => void; onCancelAccept: () => void;
  onConfirmAccept: (note: string) => boolean; onExclude: () => void;
}) {
  const partNumber = flag.productId ? review.products.find((productReview) => productReview.product.id === flag.productId)?.product.partNumber : undefined;
  const itemPartNumber = partNumber ?? review.rfq.items.find((item) => item.no === flag.rfqNo)?.partNumber;
  return (
    <li data-flag-id={flag.id} className={clsx(isSelected && SELECTED_ROW)}>
      <button
        type="button"
        aria-expanded={isSelected}
        onClick={onSelect}
        className={clsx('flex w-full items-baseline gap-3 px-4 py-2 pl-[38px] text-left', !isSelected && 'hover:bg-zinc-50', FOCUS_RING)}
      >
        <span className={clsx('min-w-0 flex-1 text-[13px]', isSelected ? 'font-medium text-zinc-900' : 'truncate text-zinc-800')} title={flag.title}>
          {flag.title}
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-zinc-500">{scopeToken(flag)}</span>
      </button>
      {isSelected && (
        <div className="space-y-3 px-4 pb-4 pl-[38px]">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-zinc-500">
            {RULE_LABELS[flag.rule]}
            {itemPartNumber && <ItemLabel rfqNo={flag.rfqNo} partNumber={itemPartNumber} />}
          </p>
          {flag.fix ? <FixDiff fix={flag.fix} line={findLine(review, flag.fix.lineId)} /> : (
            <p className="text-[12px] leading-[18px] text-zinc-600">{flag.detail}</p>
          )}
          {isAccepting ? <AcceptForm onConfirm={onConfirmAccept} onCancel={onCancelAccept} /> : (
            <div className="flex flex-wrap items-center gap-1.5">
              {flag.fix && <Button size="xs" variant="primary" kbd="E" onClick={onApplyFix}>Apply email value</Button>}
              <Button size="xs" kbd="A" onClick={onStartAccept}>Accept</Button>
              {flag.productId && <Button size="xs" variant="ghost" onClick={onExclude}>Exclude part</Button>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** The extracted line a fix applies to, if it exists. */
function findLine(review: VendorReview, lineId: string): LineReview | undefined {
  for (const productReview of review.products) {
    const lineReview = productReview.lines.find((candidate) => candidate.line.id === lineId);
    if (lineReview) return lineReview;
  }
  return undefined;
}

/** "Field | Extracted | Email" for the fields a fix would change, so the operator sees exactly what Apply does. */
function FixDiff({ fix, line }: { fix: Fix; line: LineReview | undefined }) {
  const extracted = line?.line;
  const yesNo = (value: boolean | null | undefined) => (typeof value === 'boolean' ? (value ? 'Yes' : 'No') : null);
  const rows = fix.kind === 'set-fat'
    ? [{ label: 'FAT', was: yesNo(extracted?.isFat ?? false), now: yesNo(fix.isFat) }]
    : [
        { label: 'Unit', was: extracted?.unitCost == null ? null : formatMoney(extracted.unitCost, extracted.currency || fix.values.currency), now: formatMoney(fix.values.unitCost, fix.values.currency) },
        { label: 'Ext', was: extracted?.price == null ? null : formatMoney(extracted.price, extracted.currency || fix.values.currency), now: formatMoney(fix.values.price, fix.values.currency) },
        { label: 'Lead', was: extracted?.leadTime == null ? null : formatLeadTime(extracted.leadTime), now: formatLeadTime(fix.values.leadTime) },
        { label: 'Currency', was: extracted?.currency || null, now: fix.values.currency },
        { label: 'FAT', was: yesNo(extracted?.isFat ?? false), now: yesNo(fix.values.isFat) },
      ];
  const differing = rows.filter((row) => row.was !== row.now);
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[11px] text-zinc-500">
          <th scope="col" className="pb-1 font-normal">Field</th>
          <th scope="col" className="pb-1 font-normal">Extracted</th>
          <th scope="col" className="pb-1 font-normal">Email</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {differing.map((row) => (
          <tr key={row.label}>
            <td className="py-0.5 text-zinc-500">{row.label}</td>
            <td className="py-0.5">{row.was === null ? <span className="font-medium text-red-600">Missing</span> : <span className="text-zinc-400 line-through">{row.was}</span>}</td>
            <td className="py-0.5 font-medium text-zinc-900">{row.now}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** An accepted or excluded issue, with its note and Undo. */
function ResolvedRow({ flag, decision, onUndo }: { flag: Flag; decision: Decision; onUndo: (target: UndoTarget) => void }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-zinc-500">{flag.title}</p>
        <p className="text-[12px] text-zinc-500">
          {decision.status === 'accepted' ? 'Accepted' : 'Excluded'} {formatShortDate(decision.at)}{decision.note ? `: ${decision.note}` : ''}
        </p>
      </div>
      <button type="button" onClick={() => onUndo({ kind: 'decision', flag })} className="shrink-0 text-[12px] text-blue-700 hover:underline">Undo</button>
    </li>
  );
}

/** Inline reason for Accept, checked with validateAcceptNote. Cmd or Ctrl+Enter confirms, Escape cancels. */
function AcceptForm({ onConfirm, onCancel }: { onConfirm: (note: string) => boolean; onCancel: () => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const fieldId = useId();
  const confirm = () => {
    const problem = validateAcceptNote(note);
    if (problem) setError(problem);
    else if (!onConfirm(note)) setError('The note was not accepted. Add a longer reason.');
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-[12px] font-medium text-zinc-600">Reason for accepting</label>
      <textarea
        id={fieldId}
        autoFocus
        rows={2}
        value={note}
        placeholder="e.g. Customer approved non-US origin for this part"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        onChange={(event) => { setNote(event.target.value); setError(undefined); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
          else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); confirm(); }
        }}
        className={clsx(
          'block w-full resize-y rounded-md border bg-white px-2 py-1.5 text-[12px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1',
          error ? 'border-red-600 focus:ring-red-600' : 'border-zinc-300 focus:border-blue-600 focus:ring-blue-600',
        )}
      />
      {error && <p id={`${fieldId}-error`} className="text-[12px] text-red-600">{error}</p>}
      <div className="flex items-center gap-1.5">
        <Button size="xs" variant="primary" onClick={confirm}>Accept issue</Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
