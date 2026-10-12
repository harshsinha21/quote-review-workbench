// Ops "Follow-ups" screen: per vendor, the generated email (editable, one checkbox per ask) beside the
// AI draft on file and what that draft gets wrong. Reads the store and the model; never recomputes rules.
// Vendor text (draft, asks, email) renders only as React text nodes, never as HTML.

import clsx from 'clsx';
import { Copy, Mail, TriangleAlert } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { Flag, FollowUpAsk, VendorReview } from '../../domain/types';
import { useReview, useReviewModel } from '../../store/useReview';
import { SEVERITY_LABELS } from '../shared/labels';
import { Badge, Button, CheckChip, EmptyState } from '../shared/primitives';
import { SEVERITY_ICONS } from '../shared/tones';

/** A reviewer's edit of one vendor's email, remembered with the generated text it started from. */
interface EmailEdit { generated: string; body: string }

/** A flag id the AI draft does not mention, with its flag when the review still has it. */
interface MissedFlag { id: string; flag?: Flag }

const SUBJECT_PREFIX = 'Subject: ';
// A plain address only, so vendor text can never add its own mailto parameters.
const PLAIN_ADDRESS = /^[^\s@?&#%]+@[^\s@?&#%]+$/;

/** Generated follow-up emails per vendor, checked against the stored AI draft. */
export function FollowUps() {
  const model = useReviewModel();
  const toggleFollowUp = useReview((state) => state.toggleFollowUp);
  const pushToast = useReview((state) => state.pushToast);
  const [edits, setEdits] = useState<Record<string, EmailEdit>>({});
  const reviews = model.vendors ?? [];

  function clearEdit(vendorId: string) {
    setEdits((current) => {
      if (!(vendorId in current)) return current;
      const next = { ...current };
      delete next[vendorId];
      return next;
    });
  }

  async function copyEmail(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      pushToast('Copied follow-up email.', 'success');
    } catch {
      pushToast('Could not copy the email. Select the text and copy it by hand.', 'error');
    }
  }

  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-[15px] font-semibold text-zinc-900">Follow-ups</h1>
        <p className="mt-0.5 text-[13px] text-zinc-500">Generated from open flags; compared with the AI draft on file.</p>
      </header>

      {reviews.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white">
          <EmptyState>No vendor replies to follow up on yet.</EmptyState>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const vendorId = review.vendor.id;
            const generated = review.followUp.generated;
            const edit = edits[vendorId];
            // Local edits only count while the generated text they started from is unchanged.
            const body = edit && edit.generated === generated ? edit.body : generated;
            return (
              <VendorFollowUp
                key={vendorId}
                review={review}
                body={body}
                onBodyChange={(nextBody) =>
                  setEdits((current) => ({ ...current, [vendorId]: { generated, body: nextBody } }))}
                onToggleAsk={(flagIds) => {
                  clearEdit(vendorId);
                  toggleFollowUp(vendorId, flagIds);
                }}
                onCopy={() => void copyEmail(body)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One vendor's section: header, the generated email column and the AI draft column. */
function VendorFollowUp({ review, body, onBodyChange, onToggleAsk, onCopy }: {
  review: VendorReview; body: string; onBodyChange: (body: string) => void;
  onToggleAsk: (flagIds: string[]) => void; onCopy: () => void;
}) {
  const headingId = useId();
  const { vendor, followUp } = review;
  const asks = followUp.asks ?? [];
  const openAskCount = asks.filter((ask) => !ask.excluded).length;
  const flagsById = new Map((review.flags ?? []).map((flag) => [flag.id, flag]));
  const missed: MissedFlag[] = (followUp.missedFlagIds ?? []).map((id) => ({ id, flag: flagsById.get(id) }));

  return (
    <section aria-labelledby={headingId} className="rounded-md border border-zinc-200 bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 px-4 py-3">
        <h2 id={headingId} className="text-[13px] font-semibold text-zinc-900">{vendor.name}</h2>
        <Badge tone={openAskCount > 0 ? 'accent' : 'neutral'}>
          <span className="tabular-nums">{openAskCount}</span> open {openAskCount === 1 ? 'ask' : 'asks'}
        </Badge>
        {vendor.contactEmail && (
          <span className="ml-auto min-w-0 truncate text-[12px] text-zinc-500">
            {vendor.contactName ? `${vendor.contactName} · ` : ''}{vendor.contactEmail}
          </span>
        )}
      </header>
      <div className="grid divide-y divide-zinc-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <GeneratedEmail
          vendorName={vendor.name}
          contactEmail={vendor.contactEmail}
          asks={asks}
          body={body}
          onBodyChange={onBodyChange}
          onToggleAsk={onToggleAsk}
          onCopy={onCopy}
        />
        <DraftCheck draft={vendor.followUpDraft ?? ''} staleAsks={followUp.staleAsks ?? []} missed={missed} />
      </div>
    </section>
  );
}

/** Left column: a checkbox per ask, the editable email, and Copy / Open in mail. */
function GeneratedEmail({ vendorName, contactEmail, asks, body, onBodyChange, onToggleAsk, onCopy }: {
  vendorName: string; contactEmail: string; asks: FollowUpAsk[]; body: string;
  onBodyChange: (body: string) => void; onToggleAsk: (flagIds: string[]) => void; onCopy: () => void;
}) {
  return (
    <div className="min-w-0 p-4">
      <ColumnHeading>Generated email</ColumnHeading>
      {asks.length === 0 ? (
        <EmptyState>Nothing to ask this vendor.</EmptyState>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {asks.map((ask, index) => (
              <li key={ask.flagIds.join('|') || `${ask.section}-${index}`}>
                <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={!ask.excluded}
                    onChange={() => onToggleAsk(ask.flagIds)}
                    className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  />
                  <span className="min-w-0">
                    <AskSection section={ask.section} />
                    <span className={clsx('block text-[13px] leading-5',
                      ask.excluded ? 'text-zinc-400 line-through decoration-zinc-300' : 'text-zinc-800')}>
                      {ask.text}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <textarea
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            rows={14}
            spellCheck={false}
            aria-label={`Follow-up email to ${vendorName}`}
            className="mt-3 block w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-[12px] leading-5 text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-blue-600"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button icon={Copy} onClick={onCopy}>Copy</Button>
            <a
              href={mailtoHref(contactEmail, body)}
              className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-700 bg-blue-700 px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <Mail aria-hidden className="size-3.5 shrink-0" />
              Open in mail
            </a>
            <span className="ml-auto text-[11px] text-zinc-500">Ticking or unticking an ask regenerates the email.</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Right column: the stored AI draft, what it asks that was already given, and what it leaves out. */
function DraftCheck({ draft, staleAsks, missed }: { draft: string; staleAsks: string[]; missed: MissedFlag[] }) {
  return (
    <div className="min-w-0 p-4">
      <ColumnHeading>AI draft on file</ColumnHeading>
      {draft.trim() ? (
        <pre
          tabIndex={0}
          className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[12px] leading-5 text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {draft}
        </pre>
      ) : (
        <p className="mt-2 text-[13px] text-zinc-500">No AI draft on file.</p>
      )}

      <ChipList title="Asks for info already given" isEmpty={staleAsks.length === 0} emptyLabel="No stale asks">
        {staleAsks.map((ask, index) => (
          <Badge key={`${index}-${ask}`} tone="warning" icon={TriangleAlert}>
            <span className="sr-only">{SEVERITY_LABELS.warning}: </span>{ask}
          </Badge>
        ))}
      </ChipList>

      <ChipList title="Does not mention" isEmpty={missed.length === 0} emptyLabel="Covers every open ask">
        {missed.map(({ id, flag }) =>
          flag ? (
            <Badge key={id} tone={flag.severity} icon={SEVERITY_ICONS[flag.severity]} title={flag.detail}>
              <span className="sr-only">{SEVERITY_LABELS[flag.severity]}: </span>{flag.title}
            </Badge>
          ) : (
            <Badge key={id}><span className="font-mono">{id}</span></Badge>
          ))}
      </ChipList>
    </div>
  );
}

/** "Item 3 · MS21042L3" with the part number in monospace; "General" as is. */
function AskSection({ section }: { section: string }) {
  const separator = section.indexOf(' · ');
  return (
    <span className="block text-[11px] font-medium text-zinc-500">
      {separator < 0 ? section : (
        <>{section.slice(0, separator)} · <span className="font-mono">{section.slice(separator + 3)}</span></>
      )}
    </span>
  );
}

/** The small uppercase heading over each column. */
function ColumnHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{children}</h3>;
}

/** A titled row of chips, with a confirmation chip when there is nothing to list. */
function ChipList({ title, isEmpty, emptyLabel, children }: {
  title: string; isEmpty: boolean; emptyLabel: string; children: ReactNode;
}) {
  return (
    <div className="mt-4">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</h4>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{isEmpty ? <CheckChip>{emptyLabel}</CheckChip> : children}</div>
    </div>
  );
}

/** Splits the email into its subject (the first "Subject: " line) and the rest as the body. */
function splitSubject(text: string): { subject: string; body: string } {
  const lines = text.split('\n');
  const subjectIndex = lines.findIndex((line) => line.startsWith(SUBJECT_PREFIX));
  if (subjectIndex < 0) return { subject: '', body: text };
  const subject = (lines[subjectIndex] ?? '').slice(SUBJECT_PREFIX.length).trim();
  const body = lines.filter((_line, index) => index !== subjectIndex).join('\n').replace(/^\s*\n/, '');
  return { subject, body };
}

/** A mailto link with the subject and body encoded; the address is dropped unless it is a plain one. */
function mailtoHref(contactEmail: string, text: string): string {
  const { subject, body } = splitSubject(text);
  const address = PLAIN_ADDRESS.test(contactEmail.trim()) ? contactEmail.trim() : '';
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
