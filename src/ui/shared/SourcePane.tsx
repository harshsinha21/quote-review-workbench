// Shows a vendor's source documents (email bodies and PDF pages) as cards, with flag evidence tinted.
// Vendor text is untrusted: it is cut into slices and rendered only as React text nodes, never innerHTML.
// Props in, markup out: no store access and no rule logic here.

import clsx from 'clsx';
import { ChevronDown, ChevronRight, FileText, History, Mail } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import type { DocRole, Severity, SourceDoc, Span } from '../../domain/types';
import { formatDateTime } from './format';
import { DOC_ROLE_LABELS, HISTORY_LABEL, SEVERITY_LABELS } from './labels';
import { Badge } from './primitives';
import type { Tone } from './tones';

/** Props contract (section 7.0). */
export interface SourcePaneProps { docs: SourceDoc[];
  highlights: { span: Span; tone: Severity | 'verified' }[];
  selectedSpan?: Span;                 // outlined and scrolled into view (block: 'center')
  collapseRoles?: DocRole[] }          // default ['rfq']

type Highlight = SourcePaneProps['highlights'][number];
type HighlightTone = Highlight['tone'];

const DEFAULT_COLLAPSE_ROLES: DocRole[] = ['rfq'];
const NO_HIGHLIGHTS: Highlight[] = [];

/** Badge color per document role. */
const ROLE_TONES: Record<DocRole, Tone> = { quote: 'accent', 'no-quote': 'neutral', superseded: 'warning', rfq: 'neutral' };

/** Overlapping highlights show the strongest tone: blocker > warning > info > verified. */
const TONE_STRENGTH: Record<HighlightTone, number> = { blocker: 3, warning: 2, info: 1, verified: 0 };

/** Light tint per tone, so the evidence stays readable. */
const TINT_CLASSES: Record<HighlightTone, string> = {
  blocker: 'bg-red-100/70', warning: 'bg-amber-100/80', info: 'bg-sky-100', verified: 'bg-emerald-100',
};

/** Tooltip word per tone, because a tint alone is color only. */
const TONE_WORDS: Record<HighlightTone, string> = { ...SEVERITY_LABELS, verified: 'Verified' };

const BODY_TEXT_CLASSES = 'whitespace-pre-wrap wrap-break-word font-mono text-[12px] leading-5 text-zinc-800';

/** One run of text between two consecutive cut points. */
interface TextSlice { start: number; end: number; tone: HighlightTone | undefined; selected: boolean }

/** Cuts text[from, to) at every highlight and selection boundary; each slice takes the strongest covering tone. */
function cutIntoSlices(from: number, to: number, highlights: Highlight[], selected: Span | undefined): TextSlice[] {
  const spans = highlights.map((highlight) => highlight.span);
  if (selected) spans.push(selected);
  const cuts = new Set<number>([from, to]);
  for (const span of spans) {
    if (span.start > from && span.start < to) cuts.add(span.start);
    if (span.end > from && span.end < to) cuts.add(span.end);
  }

  const slices: TextSlice[] = [];
  let start = from;
  for (const end of [...cuts].sort((left, right) => left - right)) {
    if (end <= start) continue;
    let tone: HighlightTone | undefined;
    for (const highlight of highlights) {
      const covers = highlight.span.start <= start && highlight.span.end >= end;
      if (covers && (tone === undefined || TONE_STRENGTH[highlight.tone] > TONE_STRENGTH[tone])) tone = highlight.tone;
    }
    const isSelected = selected !== undefined && selected.start <= start && selected.end >= end;
    slices.push({ start, end, tone, selected: isSelected });
    start = end;
  }
  return slices;
}

/** Renders text[from, to) as slices; the selected slices sit together inside one outlined mark. */
function HighlightedRange({ text, from, to, highlights, selected, markRef }: {
  text: string; from: number; to: number; highlights: Highlight[]; selected: Span | undefined;
  markRef: RefObject<HTMLElement | null> | undefined;
}) {
  const slices = cutIntoSlices(from, to, highlights, selected);
  const renderSlice = (slice: TextSlice, showTint: boolean) => {
    const tone = showTint ? slice.tone : undefined;
    return (
      <span
        key={slice.start}
        title={tone ? `${TONE_WORDS[tone]} evidence` : undefined}
        className={tone ? clsx('rounded-sm', TINT_CLASSES[tone]) : undefined}
      >
        {text.slice(slice.start, slice.end)}
      </span>
    );
  };

  const firstSelected = slices.findIndex((slice) => slice.selected);
  if (firstSelected === -1) return <>{slices.map((slice) => renderSlice(slice, true))}</>;
  const insideSelection = slices.filter((slice) => slice.selected);
  return (
    <>
      {slices.slice(0, firstSelected).map((slice) => renderSlice(slice, true))}
      <mark
        ref={markRef}
        className="rounded-sm bg-blue-100 text-zinc-900 outline-2 outline-offset-1 outline-blue-600 box-decoration-clone"
      >
        {insideSelection.map((slice) => renderSlice(slice, false))}
      </mark>
      {slices.slice(firstSelected + insideSelection.length).map((slice) => renderSlice(slice, true))}
    </>
  );
}

/** One source document: a header that toggles the body, then the monospace text with history dimmed. */
function DocCard({ doc, highlights, selected, isOpen, onToggle, markRef }: {
  doc: SourceDoc; highlights: Highlight[]; selected: Span | undefined; isOpen: boolean;
  onToggle: () => void; markRef: RefObject<HTMLElement | null>;
}) {
  const bodyId = useId();
  const { text, attachment } = doc;
  const hasHistory = doc.historyStart !== undefined && doc.historyStart >= 0 && doc.historyStart < text.length;
  const historyStart = hasHistory && doc.historyStart !== undefined ? doc.historyStart : text.length;
  const mainEnd = hasHistory ? text.slice(0, historyStart).trimEnd().length : text.length;
  const selectionStartsInMain = selected !== undefined && selected.start < mainEnd;

  const sender = doc.fromName || doc.from;
  const title = attachment ? `PDF · ${attachment.filename} · page ${attachment.page}` : sender;
  const subtitle = attachment ? [sender, doc.subject].filter(Boolean).join(' · ') : doc.subject;
  const tooltip = !attachment && doc.from && doc.from !== sender ? `${sender} <${doc.from}>` : title;
  const DocIcon = attachment ? FileText : Mail;
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <article data-doc-key={doc.key} className="rounded-md border border-zinc-200 bg-white">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
        >
          <Chevron aria-hidden className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
          <DocIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[13px] font-medium text-zinc-900" title={tooltip}>{title}</span>
              <Badge tone={ROLE_TONES[doc.role]} className="shrink-0">{DOC_ROLE_LABELS[doc.role]}</Badge>
              <time dateTime={doc.date} className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-500">
                {formatDateTime(doc.date)}
              </time>
            </span>
            {subtitle && <span className="mt-0.5 block truncate text-[12px] text-zinc-500">{subtitle}</span>}
          </span>
        </button>
      </h3>

      <div id={bodyId} hidden={!isOpen} className="border-t border-zinc-200 px-3 py-2.5">
        {isOpen && text.trim() === '' && <p className="text-[12px] italic text-zinc-400">No text in this document.</p>}
        {isOpen && mainEnd > 0 && (
          <div className={BODY_TEXT_CLASSES}>
            <HighlightedRange
              text={text} from={0} to={mainEnd} highlights={highlights} selected={selected}
              markRef={selectionStartsInMain ? markRef : undefined}
            />
          </div>
        )}
        {isOpen && hasHistory && (
          <>
            <div className={clsx('flex items-center gap-2 text-[11px] font-medium text-zinc-500', mainEnd > 0 && 'mt-3 mb-2')}>
              <History aria-hidden className="size-3.5 shrink-0" />
              <span>{HISTORY_LABEL}</span>
              <span aria-hidden className="h-px flex-1 bg-zinc-200" />
            </div>
            <div className={clsx(BODY_TEXT_CLASSES, 'opacity-50')}>
              <HighlightedRange
                text={text} from={historyStart} to={text.length} highlights={highlights} selected={selected}
                markRef={selectionStartsInMain ? undefined : markRef}
              />
            </div>
          </>
        )}
      </div>
    </article>
  );
}

/** The vendor's emails and PDF pages, in date order, with evidence highlighted. */
export function SourcePane({ docs, highlights, selectedSpan, collapseRoles = DEFAULT_COLLAPSE_ROLES }: SourcePaneProps) {
  const rootRef = useRef<HTMLElement>(null);
  const markRef = useRef<HTMLElement>(null);
  const [openByKey, setOpenByKey] = useState<Record<string, boolean>>({});
  const selectedDocKey = selectedSpan?.docKey;
  const selectionKey = selectedSpan ? [selectedSpan.docKey, selectedSpan.start, selectedSpan.end].join('|') : '';

  // A new selection inside a collapsed doc opens it during this render, so the scroll effect finds the mark.
  const [revealedKey, setRevealedKey] = useState('');
  if (selectionKey !== revealedKey) {
    setRevealedKey(selectionKey);
    if (selectedDocKey !== undefined) {
      setOpenByKey((current) => (current[selectedDocKey] ? current : { ...current, [selectedDocKey]: true }));
    }
  }

  const highlightsByDoc = useMemo(() => {
    const grouped = new Map<string, Highlight[]>();
    for (const highlight of highlights) {
      const forDoc = grouped.get(highlight.span.docKey);
      if (forDoc) forDoc.push(highlight);
      else grouped.set(highlight.span.docKey, [highlight]);
    }
    return grouped;
  }, [highlights]);

  useEffect(() => {
    if (selectedDocKey === undefined) return;
    const cards = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-doc-key]') ?? []);
    const target = markRef.current ?? cards.find((card) => card.dataset.docKey === selectedDocKey);
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [selectionKey, selectedDocKey]);

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-zinc-500">
        <Mail aria-hidden className="size-5 text-zinc-400" />
        <p>No source documents for this vendor.</p>
      </div>
    );
  }

  return (
    <section ref={rootRef} aria-label="Source documents" className="flex flex-col gap-2 p-3">
      {docs.map((doc) => {
        const isOpen = openByKey[doc.key] ?? !collapseRoles.includes(doc.role);
        return (
          <DocCard
            key={doc.key}
            doc={doc}
            highlights={highlightsByDoc.get(doc.key) ?? NO_HIGHLIGHTS}
            selected={selectedSpan?.docKey === doc.key ? selectedSpan : undefined}
            isOpen={isOpen}
            markRef={markRef}
            onToggle={() => setOpenByKey((current) => ({ ...current, [doc.key]: !isOpen }))}
          />
        );
      })}
    </section>
  );
}
