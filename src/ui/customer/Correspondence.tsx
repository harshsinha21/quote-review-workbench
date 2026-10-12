// Customer Correspondence screen: every email in every vendor thread, grouped by vendor and read-only,
// with PDF attachments shown page by page. It never edits anything; vendor text renders only as React text.

import { FileText, Mail, Paperclip } from 'lucide-react';
import { useId } from 'react';
import type { DocRole, RawEmail, RawVendor, SourceDoc } from '../../domain/types';
import { useReviewModel } from '../../store/useReview';
import { formatDateTime } from '../shared/format';
import { DOC_ROLE_LABELS } from '../shared/labels';
import { Badge, EmptyState, Mono } from '../shared/primitives';

/** Shared classes for vendor-written text: monospace, wrapped, never interpreted as markup. */
const SOURCE_TEXT = 'whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-5 text-zinc-800';

/** Every email, read-only, grouped by vendor. */
export function Correspondence() {
  const model = useReviewModel();

  return (
    <div className="mx-auto max-w-[1100px] p-8">
      <header>
        <h1 className="text-[20px] font-semibold tracking-tight text-zinc-900">Correspondence</h1>
        <p className="mt-1 text-[13px] text-zinc-500">Every email exchanged with each vendor, exactly as sent and received. Read-only.</p>
      </header>

      {model.vendors.length === 0 ? (
        <EmptyState icon={Mail}>No vendor emails yet.</EmptyState>
      ) : (
        <div className="mt-6 flex flex-col gap-10">
          {model.vendors.map((review) => (
            <VendorThread key={review.vendor.id} vendor={review.vendor} docs={review.docs} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One vendor's heading and its emails, oldest first. */
function VendorThread({ vendor, docs }: { vendor: RawVendor; docs: SourceDoc[] }) {
  const headingId = useId();
  const emails = [...vendor.emails].sort((first, second) => first.date.localeCompare(second.date));

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={headingId} className="text-[15px] font-semibold text-zinc-900">{vendor.name}</h2>
          {vendor.contactName && <span className="text-[13px] text-zinc-600">{vendor.contactName}</span>}
          {vendor.contactEmail && <span className="text-[13px] text-zinc-500">{vendor.contactEmail}</span>}
          {vendor.cage && (
            <span className="text-[12px] text-zinc-500">CAGE <Mono className="text-zinc-700">{vendor.cage}</Mono></span>
          )}
        </div>
        <span className="text-[12px] tabular-nums text-zinc-500">
          {emails.length} {emails.length === 1 ? 'email' : 'emails'}
        </span>
      </div>

      {emails.length === 0 ? (
        <p className="mt-3 text-[13px] text-zinc-500">No emails in this thread.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {emails.map((email) => (
            <li key={email.id}>
              <EmailPanel email={email} role={findEmailRole(docs, email.id)} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** One email: subject, sender, date, the body as text, then each attachment page. */
function EmailPanel({ email, role }: { email: RawEmail; role?: DocRole }) {
  const pageCount = email.attachments.reduce((total, attachment) => total + attachment.pages.length, 0);

  return (
    <article className="rounded-md border border-zinc-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-zinc-200 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-zinc-900">{email.subject || '(no subject)'}</h3>
          <p className="mt-0.5 break-words text-[12px] text-zinc-500">
            From <span className="text-zinc-700">{email.fromName || email.from}</span>
            {email.fromName && email.from && ` <${email.from}>`}
            {email.to && <> to <span className="text-zinc-700">{email.to}</span></>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {email.attachments.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-zinc-500">
              <Paperclip aria-hidden className="size-3.5" />
              {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            </span>
          )}
          {role && <Badge>{DOC_ROLE_LABELS[role]}</Badge>}
          <time dateTime={email.date} className="text-[12px] tabular-nums text-zinc-500">{formatDateTime(email.date)}</time>
        </div>
      </header>

      {email.body
        ? <pre className={SOURCE_TEXT}>{email.body}</pre>
        : <p className="px-4 py-3 text-[13px] text-zinc-500">This email has no body text.</p>}

      {email.attachments.map((attachment) => (
        attachment.pages.length === 0 ? (
          <AttachmentPageHeader key={attachment.id} filename={attachment.filename} pageLabel="no readable pages" />
        ) : (
          attachment.pages.map((pageText, pageIndex) => (
            <section key={`${attachment.id}:${pageIndex}`} aria-label={`PDF ${attachment.filename}, page ${pageIndex + 1}`}>
              <AttachmentPageHeader filename={attachment.filename} pageLabel={`page ${pageIndex + 1}`} />
              <pre className={SOURCE_TEXT}>{pageText}</pre>
            </section>
          ))
        )
      ))}
    </article>
  );
}

/** The strip above an attachment page: "PDF · filename · page n". */
function AttachmentPageHeader({ filename, pageLabel }: { filename: string; pageLabel: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 border-t border-zinc-200 bg-zinc-50 px-4 py-1.5 text-[12px] text-zinc-600">
      <FileText aria-hidden className="size-3.5 shrink-0 text-zinc-500" />
      <span className="font-medium text-zinc-700">PDF</span>
      <span aria-hidden className="text-zinc-300">·</span>
      <Mono className="truncate">{filename}</Mono>
      <span aria-hidden className="text-zinc-300">·</span>
      <span className="shrink-0 tabular-nums">{pageLabel}</span>
    </div>
  );
}

/** What the review made of an email's body ("Quote source", "Superseded"), when it parsed one. */
function findEmailRole(docs: SourceDoc[], emailId: string): DocRole | undefined {
  const bodyDoc = docs.find((doc) => doc.emailId === emailId && doc.attachment === undefined);
  return (bodyDoc ?? docs.find((doc) => doc.emailId === emailId))?.role;
}
