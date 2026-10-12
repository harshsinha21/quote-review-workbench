// Ops issues list for one vendor: flags grouped by severity then rule, with apply, accept, exclude and undo.
// Props in, callbacks out: it never reads the store or re-runs rules, and renders vendor text only as text nodes.

import clsx from 'clsx';
import { Ban, Check, ChevronDown, ChevronRight, CircleCheck, Undo2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Decision, Flag, RuleId, Severity, VendorReview } from '../../domain/types';
import { validateAcceptNote, type UndoTarget } from '../../store/useReview';
import { formatShortDate } from '../shared/format';
import { RULE_LABELS, SEVERITY_LABELS } from '../shared/labels';
import { Badge, Button, EmptyState, SectionHeader, SeverityBadge } from '../shared/primitives';
import { SEVERITY_ICONS } from '../shared/tones';

/** Props for the issues panel: the vendor's review and decisions, the selected flag and the action callbacks. */
export interface IssuesPanelProps {
  review: VendorReview;
  decisions: Record<string, Decision>;
  selectedFlagId?: string;
  onSelectFlag: (flag: Flag) => void;
  onApplyFix: (flag: Flag) => void;
  onAccept: (flag: Flag, note: string) => boolean;
  onExclude: (flag: Flag) => void;
  onUndo: (target: UndoTarget) => void;
}

/** Which flags the list shows: only open ones, or every flag including decided ones. */
type IssueFilter = 'open' | 'all';
/** Flags of one rule inside one severity group. */
interface RuleGroup { key: string; rule: RuleId; flags: Flag[] }
/** Flags of one severity, split by rule. */
interface SeverityGroup { severity: Severity; count: number; rules: RuleGroup[] }

const SEVERITY_ORDER: readonly Severity[] = ['blocker', 'warning', 'info'];
const SEVERITY_TEXT: Record<Severity, string> = { blocker: 'text-red-600', warning: 'text-amber-600', info: 'text-sky-700' };
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

/** Key of the rule group a flag sits in (rules can appear under more than one severity). */
function groupKey(flag: Flag): string {
  return `${flag.severity}:${flag.rule}`;
}

/** Groups flags by severity (blockers first), then by rule in the order each rule first appears. */
function groupFlags(flags: Flag[]): SeverityGroup[] {
  const groups: SeverityGroup[] = [];
  for (const severity of SEVERITY_ORDER) {
    const flagsByRule = new Map<RuleId, Flag[]>();
    for (const flag of flags) {
      if (flag.severity !== severity) continue;
      const ruleFlags = flagsByRule.get(flag.rule);
      if (ruleFlags) ruleFlags.push(flag);
      else flagsByRule.set(flag.rule, [flag]);
    }
    if (flagsByRule.size === 0) continue;
    const rules = Array.from(flagsByRule, ([rule, ruleFlags]) => ({ key: `${severity}:${rule}`, rule, flags: ruleFlags }));
    const count = rules.reduce((total, ruleGroup) => total + ruleGroup.flags.length, 0);
    groups.push({ severity, count, rules });
  }
  return groups;
}

/** Where a flag applies: "Item 3 · Qty 250", "Not in RFQ", or "Vendor" for header-level flags. */
function scopeLabel(flag: Flag): string {
  const scope = flag.rfqNo !== undefined ? `Item ${flag.rfqNo}` : flag.productId ? 'Not in RFQ' : 'Vendor';
  return flag.qty !== undefined ? `${scope} · Qty ${flag.qty}` : scope;
}

/** True when a key press belongs to a text field, so single-letter shortcuts must not fire. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** The set without `key`, or the same set when it was not there (so React can skip the render). */
function withoutKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  if (!keys.has(key)) return keys;
  const next = new Set(keys);
  next.delete(key);
  return next;
}

/** The issues list beside the quote: open (or all) flags grouped by severity and rule, with their actions. */
export function IssuesPanel({
  review, decisions, selectedFlagId, onSelectFlag, onApplyFix, onAccept, onExclude, onUndo,
}: IssuesPanelProps) {
  const [filter, setFilter] = useState<IssueFilter>('open');
  const [acceptingFlagId, setAcceptingFlagId] = useState<string>();
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const openIds = useMemo(() => new Set(review.open.map((flag) => flag.id)), [review.open]);
  const overriddenLineIds = useMemo(
    () => new Set(review.products.flatMap((product) =>
      product.lines.filter((lineReview) => lineReview.overridden).map((lineReview) => lineReview.line.id))),
    [review.products],
  );
  const groups = useMemo(
    () => groupFlags(filter === 'open' ? review.open : review.flags),
    [filter, review.open, review.flags],
  );
  const orderedFlags = useMemo(
    () => groups.flatMap((group) => group.rules.flatMap((ruleGroup) => ruleGroup.flags)),
    [groups],
  );
  const decidedCount = Math.max(0, review.flags.length - review.open.length);

  // j and k move the selection, e applies the email value, a opens the accept note. Only while the panel is on screen.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const panel = panelRef.current;
      if (!panel || panel.getClientRects().length === 0 || orderedFlags.length === 0) return;
      const index = orderedFlags.findIndex((flag) => flag.id === selectedFlagId);
      const selected = index >= 0 ? orderedFlags[index] : undefined;
      if (event.key === 'j' || event.key === 'k') {
        const step = event.key === 'j' ? 1 : -1;
        const next = orderedFlags[index < 0 ? 0 : Math.min(Math.max(index + step, 0), orderedFlags.length - 1)];
        event.preventDefault();
        setCollapsedKeys((keys) => withoutKey(keys, groupKey(next)));
        onSelectFlag(next);
      } else if (event.key === 'e' && selected?.fix && openIds.has(selected.id)) {
        event.preventDefault();
        onApplyFix(selected);
      } else if (event.key === 'a' && selected && openIds.has(selected.id)) {
        event.preventDefault();
        setCollapsedKeys((keys) => withoutKey(keys, groupKey(selected)));
        setAcceptingFlagId(selected.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orderedFlags, selectedFlagId, openIds, onSelectFlag, onApplyFix]);

  // Keep the selected flag in view when the selection moves (keys, or a click elsewhere on the screen).
  useEffect(() => {
    const list = listRef.current;
    if (!selectedFlagId || !list) return;
    const card = Array.from(list.querySelectorAll<HTMLElement>('[data-flag-id]'))
      .find((element) => element.dataset.flagId === selectedFlagId);
    card?.scrollIntoView({ block: 'nearest' });
  }, [selectedFlagId]);

  const toggleGroup = (key: string) =>
    setCollapsedKeys((keys) => {
      const next = new Set(keys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  let emptyMessage = 'No issues found for this vendor.';
  if (filter === 'open') {
    emptyMessage = review.status === 'submitted' ? 'No open issues. Marked verified.' : 'No open issues. Ready to mark verified.';
  }

  return (
    <div ref={panelRef} className="flex min-h-0 flex-1 flex-col bg-white">
      <SectionHeader title="Issues" className="shrink-0 border-b border-zinc-200 px-3 py-2">
        <FilterSwitch filter={filter} openCount={review.open.length} allCount={review.flags.length} onChange={setFilter} />
      </SectionHeader>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center">
            <EmptyState>{emptyMessage}</EmptyState>
            {filter === 'open' && decidedCount > 0 && (
              <Button size="xs" variant="ghost" onClick={() => setFilter('all')}>Show {decidedCount} decided</Button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.severity} aria-label={`${SEVERITY_LABELS[group.severity]} issues`}>
                <SeverityBadge severity={group.severity} count={group.count} />
                <div className="mt-2 space-y-3">
                  {group.rules.map((ruleGroup) => {
                    const isCollapsed = collapsedKeys.has(ruleGroup.key);
                    const Chevron = isCollapsed ? ChevronRight : ChevronDown;
                    return (
                      <div key={ruleGroup.key}>
                        <button
                          type="button"
                          aria-expanded={!isCollapsed}
                          onClick={() => toggleGroup(ruleGroup.key)}
                          className={clsx(
                            'flex w-full items-center gap-1 rounded-sm text-left text-[12px] font-medium text-zinc-700 hover:text-zinc-950',
                            FOCUS_RING,
                          )}
                        >
                          <Chevron aria-hidden className="size-3.5 shrink-0 text-zinc-400" />
                          <span className="min-w-0 truncate">{RULE_LABELS[ruleGroup.rule] ?? ruleGroup.rule}</span>
                          <span className="shrink-0 tabular-nums text-zinc-500">({ruleGroup.flags.length})</span>
                        </button>
                        {!isCollapsed && (
                          <ul className="mt-1.5 space-y-1.5">
                            {ruleGroup.flags.map((flag) => (
                              <FlagCard
                                key={flag.id}
                                flag={flag}
                                isOpen={openIds.has(flag.id)}
                                isSelected={flag.id === selectedFlagId}
                                isAccepting={flag.id === acceptingFlagId}
                                decision={decisions[flag.id]}
                                canUndoFix={Boolean(flag.fix && overriddenLineIds.has(flag.fix.lineId))}
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
                                onUndo={onUndo}
                              />
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <p className="shrink-0 border-t border-zinc-200 px-3 py-1.5 text-[11px] text-zinc-500">
        <Kbd>j</Kbd> <Kbd>k</Kbd> move <span aria-hidden className="px-1 text-zinc-300">·</span>
        <Kbd>e</Kbd> apply <span aria-hidden className="px-1 text-zinc-300">·</span>
        <Kbd>a</Kbd> accept
      </p>
    </div>
  );
}

/** The Open / All segmented control. */
function FilterSwitch({ filter, openCount, allCount, onChange }: {
  filter: IssueFilter; openCount: number; allCount: number; onChange: (filter: IssueFilter) => void;
}) {
  const options: { value: IssueFilter; label: string; count: number }[] = [
    { value: 'open', label: 'Open', count: openCount },
    { value: 'all', label: 'All', count: allCount },
  ];
  return (
    <div role="group" aria-label="Show issues" className="inline-flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5">
      {options.map((option) => {
        const isActive = option.value === filter;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={clsx(
              'inline-flex h-6 items-center gap-1 rounded px-2 text-[12px] font-medium transition-colors',
              FOCUS_RING,
              isActive ? 'bg-white text-zinc-900 ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-800',
            )}
          >
            {option.label}
            <span className="tabular-nums text-zinc-400">{option.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Everything one flag card needs; callbacks are already bound to the flag. */
interface FlagCardProps {
  flag: Flag;
  isOpen: boolean;
  isSelected: boolean;
  isAccepting: boolean;
  decision?: Decision;
  canUndoFix: boolean;
  onSelect: () => void;
  onApplyFix: () => void;
  onStartAccept: () => void;
  onCancelAccept: () => void;
  onConfirmAccept: (note: string) => boolean;
  onExclude: () => void;
  onUndo: (target: UndoTarget) => void;
}

/** One flag: severity icon, title, scope and detail, then the actions or the decision that fits its state. */
function FlagCard({
  flag, isOpen, isSelected, isAccepting, decision, canUndoFix,
  onSelect, onApplyFix, onStartAccept, onCancelAccept, onConfirmAccept, onExclude, onUndo,
}: FlagCardProps) {
  const SeverityIcon = SEVERITY_ICONS[flag.severity];

  let footer: ReactNode;
  if (!isOpen) {
    footer = <ClosedFlagRow flag={flag} decision={decision} canUndoFix={canUndoFix} onUndo={onUndo} />;
  } else if (isAccepting) {
    footer = <AcceptForm onConfirm={onConfirmAccept} onCancel={onCancelAccept} />;
  } else {
    footer = (
      <div className="flex flex-wrap items-center gap-1.5">
        {flag.fix && <Button size="xs" variant="primary" icon={Check} onClick={onApplyFix}>Apply email value</Button>}
        <Button size="xs" onClick={onStartAccept}>Accept</Button>
        {flag.productId && <Button size="xs" variant="ghost" icon={Ban} onClick={onExclude}>Exclude part</Button>}
      </div>
    );
  }

  return (
    <li
      data-flag-id={flag.id}
      className={clsx(
        'rounded-md border transition-colors',
        isSelected ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-zinc-200 bg-white hover:bg-zinc-50',
      )}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={onSelect}
        className={clsx('flex w-full items-start gap-2 rounded-md px-3 pt-2.5 text-left', FOCUS_RING)}
      >
        <SeverityIcon
          aria-hidden
          className={clsx('mt-0.5 size-3.5 shrink-0', isOpen ? SEVERITY_TEXT[flag.severity] : 'text-zinc-400')}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className={clsx('text-[13px] font-medium leading-5', isOpen ? 'text-zinc-900' : 'text-zinc-600')}>
              {flag.title}
            </span>
            <span className="shrink-0 pt-0.5 text-[11px] leading-4 tabular-nums text-zinc-500">{scopeLabel(flag)}</span>
          </span>
          <span className="mt-0.5 block break-words text-[12px] leading-[18px] text-zinc-600">{flag.detail}</span>
        </span>
      </button>
      <div className="pb-2.5 pl-[34px] pr-3 pt-2">{footer}</div>
    </li>
  );
}

/** The outcome of a flag that is no longer open (accepted, excluded, or resolved by a fix), with Undo. */
function ClosedFlagRow({ flag, decision, canUndoFix, onUndo }: {
  flag: Flag; decision?: Decision; canUndoFix: boolean; onUndo: (target: UndoTarget) => void;
}) {
  if (decision) {
    const isAccepted = decision.status === 'accepted';
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Badge tone={isAccepted ? 'verified' : 'neutral'} icon={isAccepted ? Check : Ban}>
              {isAccepted ? 'Accepted' : 'Excluded'}
            </Badge>
            <span className="text-[11px] tabular-nums text-zinc-500">{formatShortDate(decision.at)}</span>
          </div>
          {decision.note && <p className="mt-1 break-words text-[12px] text-zinc-700">{decision.note}</p>}
        </div>
        <Button size="xs" variant="ghost" icon={Undo2} onClick={() => onUndo({ kind: 'decision', flag })}>Undo</Button>
      </div>
    );
  }
  const { fix } = flag;
  return (
    <div className="flex items-center justify-between gap-2">
      <Badge tone="verified" icon={CircleCheck}>Resolved</Badge>
      {canUndoFix && fix && (
        <Button
          size="xs"
          variant="ghost"
          icon={Undo2}
          onClick={() => onUndo({ kind: 'override', vendorId: flag.vendorId, lineId: fix.lineId })}
        >
          Undo fix
        </Button>
      )}
    </div>
  );
}

/** Inline reason for Accept, checked with validateAcceptNote. Cmd or Ctrl+Enter confirms, Escape cancels. */
function AcceptForm({ onConfirm, onCancel }: { onConfirm: (note: string) => boolean; onCancel: () => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  const confirm = () => {
    const problem = validateAcceptNote(note);
    if (problem) {
      setError(problem);
      return;
    }
    if (!onConfirm(note)) setError('The note was not accepted. Add a longer reason.');
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Reason for accepting
      </label>
      <textarea
        id={fieldId}
        autoFocus
        rows={2}
        value={note}
        placeholder="e.g. Customer approved non-US origin for this part"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setNote(event.target.value);
          setError(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            confirm();
          }
        }}
        className={clsx(
          'block w-full resize-y rounded-md border bg-white px-2 py-1.5 text-[12px] text-zinc-900 placeholder:text-zinc-400',
          'focus:outline-none focus:ring-1',
          error ? 'border-red-600 focus:ring-red-600' : 'border-zinc-300 focus:border-blue-600 focus:ring-blue-600',
        )}
      />
      {error && <p id={errorId} className="text-[11px] text-red-600">{error}</p>}
      <div className="flex items-center gap-1.5">
        <Button size="xs" variant="primary" icon={Check} onClick={confirm}>Confirm</Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/** A small key cap for the shortcut hint. */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 font-mono text-[10px] text-zinc-600">{children}</kbd>
  );
}
