# Quote Review Workbench

A frontend-only prototype that turns one RFQ, three vendor replies and an AI extraction (`src/data/state.json`) into a review
workbench. Every extracted number is checked against the vendor's own email or PDF text, and every discrepancy is flagged automatically.

> **Reviewing this?** Run the two commands under [Run](#run) and open http://localhost:5173. No backend, no API keys, no database —
> everything runs in the browser. The sample data is synthetic (all addresses are `*.example`). The full system design (back end,
> database, scale, rollout) is in [`docs/quote-review-design.pdf`](docs/quote-review-design.pdf).

## Three stakeholder views (one app, "View as" switch)

| View | Who | Why it exists |
|---|---|---|
| **SalesPatriot Ops** | The rep running the RFQ | The workhorse: verify each reply against its source, apply fixes from the vendor's quote, accept or exclude flags, chase vendors, compare and draft POs. |
| **Customer** | The Argus buyer | Needs to trust the numbers: per part and break, the recommended vendor and price, its verification status, and one click to the exact line of the vendor's quote. |
| **Vendor** | Each vendor (portal preview) | Sees only their own request vs. reply and what is still missing, never internal flags or other vendors. |

## Run

```bash
npm i
npm run dev        # http://localhost:5173
npx vitest run     # golden test: every cell of the expected flag table
npm run lint       # oxlint (the current Vite template's linter)
npm run build      # tsc -b + vite build
```

Review work (fixes, accepts, excludes) is saved in the browser, so a refresh keeps it. To start over, open the **⋯** menu
at the top right and choose **Reset review data**. Single actions can be undone under **Show resolved** in the issues list.

## Architecture

```
state.json ─► parsers (parseRfq, parseSource) ─► matcher (match) ─► overlay applied ─► rules (RULES array)
           ─► follow-up, compare, PO plan ─► ReviewModel ─► views (Ops / Customer / Vendor)
```

- `src/domain/` is framework-free, deterministic TypeScript: no React, no clock (time comes from `settings.asOf`), never mutates
  its input. It drops into a Svelte app or a Node worker unchanged. `buildReview(state, overlay)` is the single producer of derived data.
- `src/store/useReview.ts` (zustand) holds the **overlay**: overrides, decisions, follow-up ticks, PO quantities, settings and an
  audit trail. Persisted (version 1, with `migrate`), safe against unreadable or corrupt storage, and re-hydrated on the `storage`
  event so two tabs never overwrite each other.
- `src/ui/` renders the model. Screens read the store; everything below takes props. Vendor text is rendered only as React text nodes.

## Rules

| Rule | Sev | Fires when |
|---|---|---|
| EXTRACTION_DROPPED_VALUE | B | Source line exists but the extraction has a null unit cost, price or lead time, or no currency. Fix: apply the values from the vendor's text. |
| EXTRACTION_VALUE_MISMATCH | B | Values present but differ from the source (unit ±0.001, price ±0.01, currency, lead). Same fix. |
| EXTRACTION_FAT_MISMATCH | B | Extracted FAT flag differs from the source (a null counts as false). Fix: set FAT. |
| EXTRACTION_NOBID_INVENTED_FIELDS | W | The source block is NO QUOTE but the extraction filled product fields. |
| EXTRACTION_FIELD_MISMATCH | W | NSN, mfr PN, mfr CAGE, COO, hazmat, packaging, shipping, certs or NRE differ from the source. |
| EXTRACTION_STRUCTURE | B | An extracted product or line has no source counterpart, or the reverse. |
| NO_BID | W | No exact or alternate product with lines for an RFQ item. |
| MISSING_QTY_BREAK | W | A requested quantity was not quoted. |
| EXTRA_QTY_BREAK | I | A quoted quantity was not requested. |
| ALTERNATE_OFFERED | W | An alternate PN was quoted instead of the requested PN. |
| UNREQUESTED_PART | I | A part not on the RFQ (excluded from award by default). |
| LOOKALIKE_PART | W | An unrequested PN within 2 edits of a requested PN, or an NSN within 1 edit. |
| NSN_MISMATCH | B | An exact PN quoted with a different NSN. |
| MISSING_PRICE | B | An included line has no price and the source has none to apply. |
| EXT_PRICE_MISMATCH | B | qty × unit differs from the extended price by more than 0.01. |
| NON_USD_CURRENCY | W | Any included line is in a currency other than USD. |
| NRE_CHARGE | I | A one-time NRE charge. |
| PREPAY_TERMS | W | Payment terms require prepayment. |
| MIN_ORDER | I | The vendor states a minimum order. |
| QUOTE_EXPIRED | W | Reply date + validity days is before the as-of date. |
| VALIDITY_AMBIGUOUS | I | Validity written as a month ("end of June") instead of days. |
| MISSING_HEADER_FIELD | B | Payment terms, validity or vendor contact missing. |
| MISSING_COO | B | No country of origin. |
| NON_US_COO | W | Country of origin is not US (Buy American / DFARS review). |
| NO_CERT | B | No certification, or "No cert". |
| HAZMAT | I | Hazmat item. |
| SURPLUS_SOURCE | W | Surplus stock (traceability documents needed). |
| MISSING_REQUIRED_FIELD | W | A quoted product lacks packaging, shipping, hazmat, mfr CAGE, mfr PN or NSN. |

B blocks "Mark verified" and award eligibility until fixed or accepted with a note; W and I inform.

## Design decisions and trade-offs

- **Extraction is a claim; the vendor's text is the evidence.** Every line is re-parsed from the email body or PDF page and compared.
  Trade-off: the parser is tuned to these three formats; a new vendor format degrades to "unverified" with a banner, never a crash.
- **Deterministic rules first, an LLM later only for free text.** Rules are reproducible, testable (golden test) and auditable;
  an LLM would add recall on messy prose but cannot be the gate.
- **An RFQ-shaped table with rows for gaps.** The quote is laid out by requested item and break, so a missing break is a
  "not quoted" row, not an absence you have to notice.
- **Quiet by default.** Healthy values show nothing; color and words mark only what needs action, and detail (warnings,
  product fields, the full source thread, the AI-draft comparison) is one click away.
- **Blockers gate "Mark verified".** Warnings inform; a blocker must be fixed from the vendor's quote or accepted with a written reason.
- **Decisions live in an overlay with an audit trail.** `state.json` is never mutated; undo is removing an overlay entry.
- **Frontend only.** Server, database, auth, ingestion and sending live in the design document, not here.

## Assumptions

- Built in this `quote-review-workbench/` subfolder because the project folder already held the design documents.
- The current Vite template ships oxlint instead of ESLint, so `npm run lint` runs oxlint. Stack versions are the ones current at
  scaffold time (Vite 8, TypeScript 6, Tailwind 4.3, vitest 5).
- NON_USD_CURRENCY ignores lines with an empty currency: a dropped value is an extraction problem, not a currency one.
- A LOOKALIKE flag belongs to the unrequested product only (no RFQ item); NSN closeness is edit distance on the NSN string.
- VALIDITY_AMBIGUOUS quotes the vendor's quoted phrase ("end of June"), not just the month.
- Vendor-level flag ids use `vendor` where the id template would otherwise read `itemundefined`.
- The as-of date defaults to today, so all three quotes (validity ended in June 2026) show as expired; change it under ⋯ > Review settings.
- Undoing a fix removes the fix values from the line's override and keeps any include/exclude choice.
- Added optional contract fields: `VendorReview.hasParsedSource` and `followUp.asks` (bullets with the flags they cover).

## Open questions

- What does `variance` mean? It appears in no vendor message; it is shown with a dagger and never used in rules.
- What does `isQuoting` mean: "vendor is quoting this line" or "we include it in the award"? Treated as the latter, editable.
- FX policy: which rate and date convert EUR quotes for award and PO?
- COO policy: which programs require US origin (Buy American, DFARS specialty metals, TAA), and is a non-US COO a blocker?
- What does "Mark verified" trigger downstream (customer notification, PO creation, ERP push)?

## 5-minute demo script

1. **Ops · Overview**: one status sentence, one "Review next blocker" button, the three vendors with coverage, and every
   open blocker grouped by vendor.
2. **Review next blocker** opens Heritage with its first blocker selected: issues on the left, the extracted values in the
   middle, the vendor's email on the right with `qty 100: USD 1.74 ea / 174.00 ext / 18d` outlined. The issue shows what
   was expected, what was answered and the discrepancy. Click **Apply quote value** (or press E): both blockers on that
   line clear, the row shows "From quote", and the next blocker is selected. Undo is in the toast and under "Show resolved".
3. **Northstar**: the ignored rev 2 history is folded under the current quote; the EUR, no-cert and missing-COO issues
   show. The header says how many blockers are left; "Mark verified" appears once there are none.
4. **Follow-ups**: one tab per vendor; the checklist of asks is the email, and a one-line check says what the stored AI
   draft gets wrong.
5. **Compare & award**: the 27-row matrix in USD with the best eligible offer per row; PO drafts on their own tab.
6. **Customer** (View as): "24 of 27" price breaks verified; click a Heritage price and the drawer opens on the exact email
   line behind it.
7. **Vendor**: Apex sees its requested vs. quoted breaks and what is still needed, nothing internal.
