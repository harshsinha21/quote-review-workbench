// Shows a vendor's source documents (email bodies and PDF pages) with issue evidence marked.
// Vendor text is untrusted: it is cut into slices and rendered only as React text nodes, never innerHTML.
// Props in, markup out: no store access and no rule logic here.

import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import type { DocRole, Severity, SourceDoc, Span } from '../../domain/types';
import { formatDateTime, formatFullDateTime } from './format';
import { DOC_ROLE_LABELS, HISTORY_LABEL, SEVERITY_LABELS } from './labels';
import { EmptyState } from './primitives';
import { FOCUS_RING } from './styles';

/** Props contract (section 7.0), plus optional role wording for the customer view. */
export interface SourcePaneProps { docs: SourceDoc[];
  highlights: { span: Span; tone: Severity | 'verified' }[];
  selectedSpan?: Span;                 // outlined and scrolled into view (block: 'center')
  collapseRoles?: DocRole[];           // default: everything except the current quote
  roleLabels?: Record<DocRole, string> } // default: Ops wording (DOC_ROLE_LABELS)

type Highlight = SourcePaneProps['highlights'][number];
/** Only issues someone must act on are tinted; info and verified spans stay plain so the problems stand out. */
type DrawnTone = Extract<Highlight['tone'], 'blocker' | 'warning'>;
/** A highlight this pane draws. */
type DrawnHighlight = Highlight & { tone: DrawnTone };

const DEFAULT_COLLAPSE_ROLES: DocRole[] = ['rfq', 'no-quote', 'superseded'];
const NO_HIGHLIGHTS: DrawnHighlight[] = [];

/** Overlapping evidence shows the stronger tone. */
const TONE_STRENGTH: Record<DrawnTone, number> = { blocker: 2, warning: 1 };

/** A light tint plus an underline style per tone, so the mark is not color alone. */
const TINT_CLASSES: Record<DrawnTone, string> = {
  blocker: 'bg-red-50 underline decoration-red-400 decoration-2 underline-offset-2',
  warning: 'bg-amber-50 underline decoration-amber-400 decoration-wavy underline-offset-2',
};

const BODY_TEXT_CLASSES = 'whitespace-pre-wrap wrap-break-word font-mono text-[12px] leading-5';

/** True for a highlight this pane draws. */
function isDrawn(highlight: Highlight): highlight is DrawnHighlight {
  return highlight.tone === 'blocker' || highlight.tone === 'warning';
}

/** One run of text between two consecutive cut points. */
interface TextSlice { start: number; end: number; tone: DrawnTone | undefined; selected: boolean }

/** Cuts text[from, to) at every highlight and selection boundary; each slice takes the strongest covering tone. */
function cutIntoSlices(from: number, to: number, highlights: DrawnHighlight[], selected: Span | undefined): TextSlice[] {
  const cuts = new Set<number>([from, to]);
  for (const span of [...highlights.map((highlight) => highlight.span), ...(selected ? [selected] : [])]) {
    if (span.start > from && span.start < to) cuts.add(span.start);
    if (span.end > from && span.end < to) cuts.add(span.end);
  }
  const slices: TextSlice[] = [];
  let start = from;
  for (const end of [...cuts].sort((left, right) => left - right)) {
    if (end <= start) continue;
    let tone: DrawnTone | undefined;
    for (const highlight of highlights) {
      const covers = highlight.span.start <= start && highlight.span.end >= end;
      if (covers && (tone === undefined || TONE_STRENGTH[highlight.tone] > TONE_STRENGTH[tone])) tone = highlight.tone;
    }
    slices.push({ start, end, tone, selected: selected !== undefined && selected.start <= start && selected.end >= end });
    start = end;
  }
  return slices;
}

/** Renders text[from, to) as slices; the selected slices sit together inside one outlined mark. */
function HighlightedRange({ text, from, to, highlights, selected, markRef }: {
  text: string; from: number; to: number; highlights: DrawnHighlight[]; selected: Span | undefined;
  markRef: RefObject<HTMLElement | null> | undefined;
}) {
  const slices = cutIntoSlices(from, to, highlights, selected);
  const renderSlice = (slice: TextSlice, showTint: boolean) => {
    const tone = showTint ? slice.tone : undefined;
    return (
      <span key={slice.start} title={tone ? `${SEVERITY_LABELS[tone]} evidence` : undefined} className={tone ? TINT_CLASSES[tone] : undefined}>
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
      <mark ref={markRef} className="rounded-sm bg-blue-100 text-zinc-900 outline-2 outline-offset-1 outline-blue-600 box-decoration-clone">
        {insideSelection.map((slice) => renderSlice(slice, false))}
      </mark>
      {slices.slice(firstSelected + insideSelection.length).map((slice) => renderSlice(slice, true))}
    </>
  );
}

/** One source document: a header that toggles the body, then the text; quoted history folds away. */
function DocSection({ doc, highlights, selected, isOpen, onToggle, markRef, roleLabel }: {
  doc: SourceDoc; highlights: DrawnHighlight[]; selected: Span | undefined; isOpen: boolean;
  onToggle: () => void; markRef: RefObject<HTMLElement | null>; roleLabel: string;
}) {
  const bodyId = useId();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { text, attachment } = doc;
  const historyStart = doc.historyStart !== undefined && doc.historyStart >= 0 && doc.historyStart < text.length ? doc.historyStart : undefined;
  const mainEnd = historyStart === undefined ? text.length : text.slice(0, historyStart).trimEnd().length;
  const isSelectionInHistory = selected !== undefined && historyStart !== undefined && selected.start >= historyStart;
  const showHistory = isHistoryOpen || isSelectionInHistory;
  const sender = doc.fromName || doc.from;
  const title = attachment ? `PDF · ${attachment.filename} · page ${attachment.page}` : sender;

  return (
    <article data-doc-key={doc.key} className="border-b border-zinc-200 last:border-b-0">
      <h3 className="sticky top-0 z-[5] bg-white">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          title={doc.subject}
          className={clsx('flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-zinc-50', FOCUS_RING)}
        >
          <ChevronRight aria-hidden className={clsx('size-3.5 shrink-0 text-zinc-400 transition-transform', isOpen && 'rotate-90')} />
          <span className="min-w-0 truncate text-[13px] font-medium text-zinc-900">{title}</span>
          {roleLabel && <span className="shrink-0 text-[12px] text-zinc-500">{roleLabel}</span>}
          <time dateTime={doc.date} title={formatFullDateTime(doc.date)} className="ml-auto shrink-0 text-[12px] tabular-nums text-zinc-500">
            {formatDateTime(doc.date)}
          </time>
        </button>
      </h3>
      <div id={bodyId} hidden={!isOpen} className="px-4 pb-4 pl-[38px]">
        {isOpen && text.trim() === '' && <p className="text-[12px] italic text-zinc-400">No text in this document.</p>}
        {isOpen && mainEnd > 0 && (
          <div className={clsx(BODY_TEXT_CLASSES, 'text-zinc-800')}>
            <HighlightedRange
              text={text} from={0} to={mainEnd} highlights={highlights} selected={selected}
              markRef={isSelectionInHistory ? undefined : markRef}
            />
          </div>
        )}
        {isOpen && historyStart !== undefined && (
          <div className="mt-3">
            <button
              type="button"
              aria-expanded={showHistory}
              onClick={() => setIsHistoryOpen(!showHistory)}
              className="text-[12px] text-zinc-500 hover:text-zinc-800"
            >
              {HISTORY_LABEL} · {showHistory ? 'Hide' : 'Show'}
            </button>
            {showHistory && (
              <div className={clsx(BODY_TEXT_CLASSES, 'mt-2 text-zinc-400')}>
                <HighlightedRange
                  text={text} from={historyStart} to={text.length} highlights={highlights} selected={selected}
                  markRef={isSelectionInHistory ? markRef : undefined}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** The vendor's emails and PDF pages, in date order, with open-issue evidence marked and the selection outlined. */
export function SourcePane({ docs, highlights, selectedSpan, collapseRoles = DEFAULT_COLLAPSE_ROLES, roleLabels = DOC_ROLE_LABELS }: SourcePaneProps) {
  const markRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLElement>(null);
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
    const grouped = new Map<string, DrawnHighlight[]>();
    for (const highlight of highlights.filter(isDrawn)) {
      grouped.set(highlight.span.docKey, [...(grouped.get(highlight.span.docKey) ?? []), highlight]);
    }
    return grouped;
  }, [highlights]);

  useEffect(() => {
    if (selectedDocKey === undefined) return;
    const target = markRef.current ?? rootRef.current?.querySelector<HTMLElement>(`[data-doc-key="${CSS.escape(selectedDocKey)}"]`);
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [selectionKey, selectedDocKey]);

  if (docs.length === 0) return <EmptyState>No source documents for this vendor.</EmptyState>;

  return (
    <section ref={rootRef} aria-label="Source documents">
      {docs.map((doc) => {
        const isOpen = openByKey[doc.key] ?? !collapseRoles.includes(doc.role);
        return (
          <DocSection
            key={doc.key}
            doc={doc}
            highlights={highlightsByDoc.get(doc.key) ?? NO_HIGHLIGHTS}
            selected={selectedSpan?.docKey === doc.key ? selectedSpan : undefined}
            isOpen={isOpen}
            markRef={markRef}
            roleLabel={roleLabels[doc.role]}
            onToggle={() => setOpenByKey((current) => ({ ...current, [doc.key]: !isOpen }))}
          />
        );
      })}
    </section>
  );
}
