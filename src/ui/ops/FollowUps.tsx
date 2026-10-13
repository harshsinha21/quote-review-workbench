// Ops "Follow-ups": one vendor at a time. The checklist of asks is the editor; the email text and the comparison
// with the AI draft on file are one click away. Reads the store and the model; never recomputes rules.
// Vendor text (draft, asks, email) renders only as React text nodes, never as HTML.

import clsx from 'clsx';
import { Check, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { FollowUpAsk, VendorReview } from '../../domain/types';
import { useReview, useReviewModel } from '../../store/useReview';
import { shortVendorName, stripAskPrefix } from '../shared/format';
import { Button, Disclosure, EmptyState, ItemLabel, PageHeader, SeverityIcon, StatusText, Tabs } from '../shared/primitives';
import { openAsks } from '../shared/reviewLookups';
import { PAGE, SURFACE } from '../shared/styles';

/** A reviewer's edit of one vendor's email, remembered with the generated text it started from. */
interface EmailEdit { generated: string; body: string }

const SUBJECT_PREFIX = 'Subject: ';
// A plain address only, so vendor text can never add its own mailto parameters.
const PLAIN_ADDRESS = /^[^\s@?&#%]+@[^\s@?&#%]+$/;
/** "Item 3 · MS21042L3" → item number and part number. */
const ASK_SECTION_PATTERN = /^Item (\d+) · (.+)$/;

/** Generated follow-up emails, one vendor per tab. */
export function FollowUps() {
  const { vendors } = useReviewModel();
  const storeVendorId = useReview((state) => state.vendorId);
  const setView = useReview((state) => state.setView);
  const toggleFollowUp = useReview((state) => state.toggleFollowUp);
  const pushToast = useReview((state) => state.pushToast);
  const [edits, setEdits] = useState<Record<string, EmailEdit>>({});
  const active = vendors.find((review) => review.vendor.id === storeVendorId)
    ?? vendors.find((review) => openAsks(review).length > 0) ?? vendors[0];

  const copyEmail = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast('Copied follow-up email.', 'success');
    } catch {
      pushToast('Could not copy the email. Select the text and copy it by hand.', 'error');
    }
  };

  return (
    <div className={PAGE}>
      <PageHeader title="Follow-ups" description="One email per vendor asking for what is still missing." />
      {!active ? (
        <div className={SURFACE}><EmptyState>No vendor replies to follow up on yet.</EmptyState></div>
      ) : (
        <>
          <Tabs
            label="Vendor"
            className="mb-4"
            value={active.vendor.id}
            onChange={(id) => setView('follow-ups', id)}
            items={vendors.map((review) => ({
              id: review.vendor.id,
              label: shortVendorName(review.vendor.name),
              count: openAsks(review).length,
              accessory: openAsks(review).length === 0 ? <Check aria-label="Nothing to ask" className="size-3.5 text-emerald-600" /> : undefined,
            }))}
          />
          <VendorFollowUp
            key={active.vendor.id}
            review={active}
            edit={edits[active.vendor.id]}
            onEdit={(body) => setEdits((current) => ({ ...current, [active.vendor.id]: { generated: active.followUp.generated, body } }))}
            onToggleAsk={(flagIds) => toggleFollowUp(active.vendor.id, flagIds)}
            onCopy={(text) => void copyEmail(text)}
          />
        </>
      )}
    </div>
  );
}

/** One vendor: recipient and send actions, the checklist of asks, the email text, and the AI draft check. */
function VendorFollowUp({ review, edit, onEdit, onToggleAsk, onCopy }: {
  review: VendorReview; edit: EmailEdit | undefined; onEdit: (body: string) => void;
  onToggleAsk: (flagIds: string[]) => void; onCopy: (text: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const { vendor, followUp } = review;
  const asks = followUp.asks ?? [];
  // A local edit only counts while the generated text it started from is unchanged (ticking an ask regenerates).
  const body = edit && edit.generated === followUp.generated ? edit.body : followUp.generated;

  return (
    <section aria-label={`Follow-up to ${vendor.name}`} className={SURFACE}>
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-5 py-3">
        <p className="min-w-0 truncate text-[13px] text-zinc-600">
          To <span className="text-zinc-900">{vendor.contactName}</span> <span className="text-zinc-500">&lt;{vendor.contactEmail}&gt;</span>
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => onCopy(body)}>Copy email</Button>
          <a href={mailtoHref(vendor.contactEmail, body)} className="inline-flex h-7 items-center rounded-md bg-blue-700 px-2.5 text-[12px] font-medium text-white shadow-sm hover:bg-blue-800">
            Open in mail
          </a>
        </div>
      </header>

      {asks.length === 0 ? (
        <EmptyState icon={Check} tone="verified">Nothing to ask this vendor.</EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {asks.map((ask, index) => <AskRow key={ask.flagIds.join('|') || index} ask={ask} onToggle={() => onToggleAsk(ask.flagIds)} />)}
        </ul>
      )}

      <div className="space-y-3 border-t border-zinc-200 px-5 py-4">
        <Disclosure summary="Preview email">
          {isEditing ? (
            <textarea
              value={body}
              onChange={(event) => onEdit(event.target.value)}
              rows={14}
              spellCheck={false}
              aria-label={`Follow-up email to ${vendor.name}`}
              className="block w-full resize-y rounded-md border border-zinc-300 px-3 py-2 font-mono text-[12px] leading-5 text-zinc-800"
            />
          ) : (
            <pre className="whitespace-pre-wrap rounded-md bg-zinc-50 px-3 py-2 font-mono text-[12px] leading-5 text-zinc-700">{body}</pre>
          )}
          <div className="mt-2 flex items-center gap-3">
            <Button size="xs" variant="ghost" onClick={() => setIsEditing(!isEditing)}>{isEditing ? 'Done editing' : 'Edit text'}</Button>
            <span className="text-[12px] text-zinc-500">Ticking or unticking an ask regenerates the email.</span>
          </div>
        </Disclosure>
        <DraftCheck review={review} />
      </div>
    </section>
  );
}

/** One ask: a checkbox, its item, and the request without the repeated "Item n PN:" prefix. */
function AskRow({ ask, onToggle }: { ask: FollowUpAsk; onToggle: () => void }) {
  const sectionMatch = ASK_SECTION_PATTERN.exec(ask.section);
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-zinc-50">
        <input type="checkbox" checked={!ask.excluded} onChange={onToggle} className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-blue-700" />
        <span className="w-44 shrink-0 text-[12px] text-zinc-500">
          {sectionMatch ? <ItemLabel rfqNo={Number(sectionMatch[1])} partNumber={sectionMatch[2]} /> : ask.section}
        </span>
        <span className={clsx('min-w-0 text-[13px]', ask.excluded ? 'text-zinc-400 line-through' : 'text-zinc-800')}>{stripAskPrefix(ask.text)}</span>
      </label>
    </li>
  );
}

/** One line on how the AI draft on file compares, with the draft and both lists one click away. */
function DraftCheck({ review }: { review: VendorReview }) {
  const { followUp, vendor } = review;
  const flagsById = new Map(review.flags.map((flag) => [flag.id, flag]));
  const missed = followUp.missedFlagIds.flatMap((id) => flagsById.get(id) ?? []);
  const staleCount = followUp.staleAsks.length;
  const isClean = staleCount === 0 && missed.length === 0;
  return (
    <div className="space-y-2">
      {isClean ? (
        <StatusText tone="verified" icon={Check}>The AI draft on file covers every open ask</StatusText>
      ) : (
        <StatusText tone="warning" icon={TriangleAlert}>
          The AI draft on file re-asks {staleCount} {staleCount === 1 ? 'thing' : 'things'} already given and misses {missed.length} open {missed.length === 1 ? 'ask' : 'asks'}
        </StatusText>
      )}
      {vendor.followUpDraft.trim() && (
        <Disclosure summary="Compare with the AI draft">
          <div className="grid gap-5 md:grid-cols-2">
            <pre className="whitespace-pre-wrap rounded-md bg-zinc-50 px-3 py-2 font-mono text-[12px] leading-5 text-zinc-600">{vendor.followUpDraft}</pre>
            <div className="space-y-4 text-[13px]">
              <div>
                <h3 className="text-[12px] font-medium text-zinc-600">Already given</h3>
                {staleCount === 0 ? <p className="text-[12px] text-zinc-500">None</p> : (
                  <ul className="mt-1 space-y-1">{followUp.staleAsks.map((ask) => <li key={ask} className="text-zinc-800">{ask}</li>)}</ul>
                )}
              </div>
              <div>
                <h3 className="text-[12px] font-medium text-zinc-600">Not mentioned</h3>
                {missed.length === 0 ? <p className="text-[12px] text-zinc-500">None</p> : (
                  <ul className="mt-1 space-y-1">
                    {missed.map((flag) => <li key={flag.id} className="flex items-center gap-2 text-zinc-800"><SeverityIcon severity={flag.severity} />{flag.title}{flag.rfqNo !== undefined && <span className="text-[12px] text-zinc-400">#{flag.rfqNo}</span>}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </Disclosure>
      )}
    </div>
  );
}

/** Splits the email into its subject (the first "Subject: " line) and the rest as the body. */
function splitSubject(text: string): { subject: string; body: string } {
  const lines = text.split('\n');
  const subjectIndex = lines.findIndex((line) => line.startsWith(SUBJECT_PREFIX));
  if (subjectIndex < 0) return { subject: '', body: text };
  const subject = lines[subjectIndex].slice(SUBJECT_PREFIX.length).trim();
  return { subject, body: lines.filter((_line, index) => index !== subjectIndex).join('\n').replace(/^\s*\n/, '') };
}

/** A mailto link with the subject and body encoded; the address is dropped unless it is a plain one. */
function mailtoHref(contactEmail: string, text: string): string {
  const { subject, body } = splitSubject(text);
  const address = PLAIN_ADDRESS.test(contactEmail.trim()) ? contactEmail.trim() : '';
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
