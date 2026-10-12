// The review store: the persisted overlay (decisions, overrides, settings) plus transient UI state
// (role, view, selection, toasts). It owns every action and writes the audit trail.
// It never computes review data itself; derived data comes only from buildReview via useReviewModel.

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { rawState } from '../data/rawState';
import {
  createEmptyOverlay, DEFAULT_SETTINGS, MIN_ACCEPT_NOTE_LENGTH, STORAGE_KEY, STORAGE_VERSION,
} from '../domain/constants';
import { buildReview } from '../domain/review';
import type { Flag, Overlay, RawLine, ReviewModel, Span } from '../domain/types';

/** Which stakeholder the app is showing ("View as"). */
export type Role = 'ops' | 'customer' | 'vendor';
/** Every screen. Ops: overview, vendor-review, follow-ups, compare. Customer: summary, correspondence. Vendor: portal. */
export type View = 'overview' | 'vendor-review' | 'follow-ups' | 'compare' | 'summary' | 'correspondence' | 'portal';
/** Visual tone of a toast. */
export type ToastTone = 'success' | 'info' | 'error';
/** A short-lived confirmation; `undo` reverts the action that raised it. */
export interface Toast { id: number; message: string; tone: ToastTone; undo?: () => void }
/** What Undo reverts: a decision on a flag (accept or exclude), or the fix values written on one line. */
export type UndoTarget =
  | { kind: 'decision'; flag: Flag }
  | { kind: 'override'; vendorId: string; lineId: string };
/** Why the persisted overlay could not be used; the shell shows a banner for each. */
export type StorageIssue = 'unreadable' | 'corrupt' | 'unwritable';
/** What is selected in the evidence views: a flag, a quote line and the source span to outline. */
export interface Selection { flagId?: string; lineId?: string; span?: Span }

/** The full store shape: persisted overlay, transient UI state and every action. */
export interface ReviewStore {
  overlay: Overlay;
  role: Role;
  view: View;
  vendorId?: string;
  selectedFlagId?: string;
  selectedLineId?: string;
  selectedSpan?: Span;
  toasts: Toast[];
  storageIssue?: StorageIssue;

  /** Switches stakeholder and lands on that role's first screen (vendor role picks the first vendor). */
  setRole: (role: Role) => void;
  /** Navigates; vendorId is kept unless a new one is given. Clears the selection. */
  setView: (view: View, vendorId?: string) => void;
  /** Opens one vendor's review screen, optionally with a flag selected and its evidence outlined. */
  openVendorReview: (vendorId: string, flag?: Flag) => void;
  /** Sets the selection (flag, line, span). Pass {} to clear it. */
  select: (selection: Selection) => void;

  /** Writes a flag's fix (values from the vendor's own text) into lineOverrides. Toast with Undo. */
  applyFix: (flag: Flag) => void;
  /** Accepts a flag with a reason. Returns false (and changes nothing) when the note is too short. */
  accept: (flag: Flag, note: string) => boolean;
  /** Excludes the flag's product from award: isQuoting=false on its lines, plus an 'excluded' decision. */
  exclude: (flag: Flag, note?: string) => void;
  /** Removes a decision (and an exclusion's isQuoting overrides) or a line's fix values. */
  undo: (target: UndoTarget) => void;
  /** Includes or excludes one line from comparison and award. */
  toggleInclude: (vendorId: string, lineId: string, included: boolean) => void;
  /** Ticks or unticks flags in the follow-up composer (several ids for a grouped bullet). */
  toggleFollowUp: (vendorId: string, flagIds: string[]) => void;
  /** Marks a vendor's review verified. Refuses (with an error toast) while blockers are open. */
  markVerified: (vendorId: string) => void;
  /** Chooses the PO quantity for one RFQ item. */
  setPoQuantity: (rfqNo: number, qty: number) => void;
  /** Updates the EUR to USD rate and/or the as-of date. */
  setSettings: (settings: Partial<Overlay['settings']>) => void;
  /** Clears every decision and override (keeps settings at their defaults). */
  resetAll: () => void;

  /** Shows a toast for a few seconds. */
  pushToast: (message: string, tone?: ToastTone, undo?: () => void) => void;
  /** Hides one toast. */
  dismissToast: (id: number) => void;
  /** Hides the storage banner. */
  dismissStorageIssue: () => void;
}

type LineOverride = Overlay['lineOverrides'][string];
type AuditEntry = Overlay['audit'][number];
type PersistedSlice = Pick<ReviewStore, 'overlay'>;

/** Fields a fix writes; Undo of a fix removes exactly these and keeps an include/exclude choice. */
const FIX_FIELDS: readonly (keyof RawLine)[] = ['unitCost', 'price', 'currency', 'leadTime', 'isFat'];
/** How long a toast stays on screen. */
const TOAST_DURATION_MS = 6000;
/** Audit vendorId for actions that are not about one vendor (settings, PO quantities, reset). */
const ALL_VENDORS = 'all';

let nextToastId = 1;
/** Remembered so a failing localStorage only reports once instead of on every write. */
let reportedStorageIssue: StorageIssue | undefined;

/** Line ids of one product, looked up in the raw data (exclusion needs every line of the product). */
function findProductLineIds(vendorId: string, productId: string | undefined): string[] {
  if (!productId) return [];
  const vendor = rawState.vendors.find((candidate) => candidate.id === vendorId);
  const product = vendor?.products.find((candidate) => candidate.id === productId);
  return product ? product.lines.map((line) => line.id) : [];
}

/** Display name of a vendor for toasts ("Heritage Aero Supply"). */
function vendorName(vendorId: string): string {
  return rawState.vendors.find((vendor) => vendor.id === vendorId)?.name ?? 'Vendor';
}

/** Returns a copy of `override` without `fields`, or undefined when nothing is left. */
function withoutFields(override: LineOverride | undefined, fields: readonly (keyof RawLine)[]): LineOverride | undefined {
  if (!override) return undefined;
  const remaining: LineOverride = { ...override };
  for (const field of fields) delete remaining[field as keyof LineOverride];
  return Object.keys(remaining).length > 0 ? remaining : undefined;
}

/** Returns lineOverrides with one entry replaced (or removed when `override` is undefined). */
function setLineOverride(
  lineOverrides: Overlay['lineOverrides'], lineId: string, override: LineOverride | undefined,
): Overlay['lineOverrides'] {
  const next = { ...lineOverrides };
  if (override) next[lineId] = override;
  else delete next[lineId];
  return next;
}

/** Builds one audit entry stamped with the current time (the store, unlike the domain, may read the clock). */
function auditEntry(vendorId: string, action: string, target: string, detail: string): AuditEntry {
  return { at: new Date().toISOString(), vendorId, action, target, detail };
}

/** Fills any missing overlay key with its empty default, so an older or partial stored value cannot crash a view. */
function normalizeOverlay(candidate: Partial<Overlay> | undefined): Overlay {
  const empty = createEmptyOverlay();
  if (!candidate || typeof candidate !== 'object') return empty;
  return {
    lineOverrides: candidate.lineOverrides ?? empty.lineOverrides,
    decisions: candidate.decisions ?? empty.decisions,
    followUpExcluded: candidate.followUpExcluded ?? empty.followUpExcluded,
    submittedAt: candidate.submittedAt ?? empty.submittedAt,
    poQuantity: candidate.poQuantity ?? empty.poQuantity,
    audit: Array.isArray(candidate.audit) ? candidate.audit : empty.audit,
    settings: { ...empty.settings, ...candidate.settings },
  };
}

/** True when a parsed localStorage value has the persisted shape ({ state: { overlay }, version }). */
function isStoredValue(value: unknown): value is StorageValue<PersistedSlice> {
  if (!value || typeof value !== 'object') return false;
  const { state } = value as { state?: unknown };
  return !!state && typeof state === 'object' && 'overlay' in state;
}

/** Records a storage problem once and surfaces it as a banner. Guarded so a failing write cannot loop. */
function reportStorageIssue(issue: StorageIssue): void {
  if (reportedStorageIssue) return;
  reportedStorageIssue = issue;
  queueMicrotask(() => useReview.setState({ storageIssue: issue }));
}

/** localStorage behind try/catch: unreadable or corrupt data yields an empty overlay plus a banner, never a crash. */
const safeStorage: PersistStorage<PersistedSlice> = {
  getItem: (name) => {
    try {
      const text = window.localStorage.getItem(name);
      if (text === null) return null;
      const parsed: unknown = JSON.parse(text);
      if (isStoredValue(parsed)) return parsed;
      reportStorageIssue('corrupt');
      return null;
    } catch {
      reportStorageIssue('unreadable');
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, JSON.stringify(value));
    } catch {
      reportStorageIssue('unwritable');
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      reportStorageIssue('unwritable');
    }
  },
};

/** The review store. Only `overlay` is persisted (version 1); everything else resets on reload. */
export const useReview = create<ReviewStore>()(
  persist(
    (set, get) => {
      /** Applies an overlay change and appends its audit entry in one update. */
      const updateOverlay = (change: (overlay: Overlay) => Partial<Overlay>, entry: AuditEntry) =>
        set((state) => ({
          overlay: { ...state.overlay, ...change(state.overlay), audit: [...state.overlay.audit, entry] },
        }));

      return {
        overlay: createEmptyOverlay(),
        role: 'ops',
        view: 'overview',
        toasts: [],

        setRole: (role) => {
          const firstView: Record<Role, View> = { ops: 'overview', customer: 'summary', vendor: 'portal' };
          const vendorId = role === 'vendor' ? (get().vendorId ?? rawState.vendors[0]?.id) : get().vendorId;
          set({ role, view: firstView[role], vendorId, selectedFlagId: undefined, selectedLineId: undefined, selectedSpan: undefined });
        },

        setView: (view, vendorId) =>
          set((state) => ({
            view, vendorId: vendorId ?? state.vendorId,
            selectedFlagId: undefined, selectedLineId: undefined, selectedSpan: undefined,
          })),

        openVendorReview: (vendorId, flag) =>
          set({
            role: 'ops', view: 'vendor-review', vendorId,
            selectedFlagId: flag?.id, selectedLineId: flag?.lineId, selectedSpan: flag?.evidence,
          }),

        select: ({ flagId, lineId, span }) =>
          set({ selectedFlagId: flagId, selectedLineId: lineId, selectedSpan: span }),

        applyFix: (flag) => {
          const { fix } = flag;
          if (!fix) return;
          const values: LineOverride = fix.kind === 'apply-source-line' ? { ...fix.values } : { isFat: fix.isFat };
          updateOverlay(
            (overlay) => ({
              lineOverrides: setLineOverride(overlay.lineOverrides, fix.lineId, { ...overlay.lineOverrides[fix.lineId], ...values }),
            }),
            auditEntry(flag.vendorId, 'apply-fix', fix.lineId, `${flag.rule}: ${JSON.stringify(values)}`),
          );
          get().pushToast('Applied the value from the vendor\'s email.', 'success', () =>
            get().undo({ kind: 'override', vendorId: flag.vendorId, lineId: fix.lineId }));
        },

        accept: (flag, note) => {
          const reason = note.trim();
          if (reason.length < MIN_ACCEPT_NOTE_LENGTH) return false;
          updateOverlay(
            (overlay) => ({
              decisions: { ...overlay.decisions, [flag.id]: { status: 'accepted', note: reason, at: new Date().toISOString() } },
            }),
            auditEntry(flag.vendorId, 'accept', flag.id, reason),
          );
          get().pushToast(`Accepted: ${flag.title}`, 'success', () => get().undo({ kind: 'decision', flag }));
          return true;
        },

        exclude: (flag, note) => {
          const reason = note?.trim() || 'Excluded from award';
          const lineIds = findProductLineIds(flag.vendorId, flag.productId);
          updateOverlay(
            (overlay) => {
              let lineOverrides = overlay.lineOverrides;
              for (const lineId of lineIds) {
                lineOverrides = setLineOverride(lineOverrides, lineId, { ...lineOverrides[lineId], isQuoting: false });
              }
              const decision = { status: 'excluded' as const, note: reason, at: new Date().toISOString() };
              return { lineOverrides, decisions: { ...overlay.decisions, [flag.id]: decision } };
            },
            auditEntry(flag.vendorId, 'exclude', flag.id, `${reason} (${lineIds.length} lines)`),
          );
          get().pushToast('Part excluded from award.', 'success', () => get().undo({ kind: 'decision', flag }));
        },

        undo: (target) => {
          if (target.kind === 'override') {
            updateOverlay(
              (overlay) => ({
                lineOverrides: setLineOverride(
                  overlay.lineOverrides, target.lineId, withoutFields(overlay.lineOverrides[target.lineId], FIX_FIELDS)),
              }),
              auditEntry(target.vendorId, 'undo-fix', target.lineId, 'Restored the extracted values'),
            );
            get().pushToast('Fix undone.', 'info');
            return;
          }
          const { flag } = target;
          const wasExcluded = get().overlay.decisions[flag.id]?.status === 'excluded';
          const lineIds = wasExcluded ? findProductLineIds(flag.vendorId, flag.productId) : [];
          updateOverlay(
            (overlay) => {
              const decisions = { ...overlay.decisions };
              delete decisions[flag.id];
              let lineOverrides = overlay.lineOverrides;
              for (const lineId of lineIds) {
                lineOverrides = setLineOverride(lineOverrides, lineId, withoutFields(lineOverrides[lineId], ['isQuoting']));
              }
              return { decisions, lineOverrides };
            },
            auditEntry(flag.vendorId, 'undo-decision', flag.id, wasExcluded ? 'Re-included the part' : 'Re-opened the flag'),
          );
          get().pushToast('Decision undone.', 'info');
        },

        toggleInclude: (vendorId, lineId, included) =>
          updateOverlay(
            (overlay) => ({
              lineOverrides: setLineOverride(overlay.lineOverrides, lineId, { ...overlay.lineOverrides[lineId], isQuoting: included }),
            }),
            auditEntry(vendorId, included ? 'include-line' : 'exclude-line', lineId, ''),
          ),

        toggleFollowUp: (vendorId, flagIds) =>
          updateOverlay(
            (overlay) => {
              const isExcludedNow = flagIds.every((flagId) => overlay.followUpExcluded[flagId]);
              const followUpExcluded = { ...overlay.followUpExcluded };
              for (const flagId of flagIds) {
                if (isExcludedNow) delete followUpExcluded[flagId];
                else followUpExcluded[flagId] = true;
              }
              return { followUpExcluded };
            },
            auditEntry(vendorId, 'toggle-follow-up', flagIds.join(','), ''),
          ),

        markVerified: (vendorId) => {
          const vendorReview = memoizedBuildReview(get().overlay).vendors.find((review) => review.vendor.id === vendorId);
          if (!vendorReview?.canSubmit) {
            const blockers = vendorReview?.counts.blocker ?? 0;
            get().pushToast(`Cannot mark verified: ${blockers} open blocker${blockers === 1 ? '' : 's'}.`, 'error');
            return;
          }
          updateOverlay(
            (overlay) => ({ submittedAt: { ...overlay.submittedAt, [vendorId]: new Date().toISOString() } }),
            auditEntry(vendorId, 'mark-verified', vendorId, ''),
          );
          get().pushToast(`${vendorName(vendorId)} marked verified.`, 'success');
        },

        setPoQuantity: (rfqNo, qty) =>
          updateOverlay(
            (overlay) => ({ poQuantity: { ...overlay.poQuantity, [rfqNo]: qty } }),
            auditEntry(ALL_VENDORS, 'po-quantity', `item ${rfqNo}`, String(qty)),
          ),

        setSettings: (settings) =>
          updateOverlay(
            (overlay) => ({ settings: { ...overlay.settings, ...settings } }),
            auditEntry(ALL_VENDORS, 'settings', 'settings', JSON.stringify(settings)),
          ),

        resetAll: () => {
          set({ overlay: createEmptyOverlay(DEFAULT_SETTINGS), selectedFlagId: undefined, selectedLineId: undefined, selectedSpan: undefined });
          get().pushToast('Local review data reset.', 'info');
        },

        pushToast: (message, tone = 'success', undo) => {
          const id = nextToastId++;
          set((state) => ({ toasts: [...state.toasts, { id, message, tone, undo }] }));
          window.setTimeout(() => get().dismissToast(id), TOAST_DURATION_MS);
        },

        dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

        dismissStorageIssue: () => set({ storageIssue: undefined }),
      };
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: safeStorage,
      partialize: (state) => ({ overlay: state.overlay }),
      /** Version 0 (or unknown) data is not trusted: start from an empty overlay. */
      migrate: (persisted, version) =>
        version === STORAGE_VERSION && isStoredValue({ state: persisted })
          ? { overlay: normalizeOverlay((persisted as PersistedSlice).overlay) }
          : { overlay: createEmptyOverlay() },
      merge: (persisted, current) => {
        const slice = persisted as Partial<PersistedSlice> | undefined;
        return { ...current, overlay: normalizeOverlay(slice?.overlay) };
      },
    },
  ),
);

/** Another tab saved decisions: reload them so this tab never overwrites them with stale state. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) void useReview.persist.rehydrate();
  });
}

/** One cached model per overlay object, so every component shares a single buildReview run. */
const modelCache = new WeakMap<Overlay, ReviewModel>();

/** buildReview memoized by overlay identity (the overlay is replaced, never mutated, on every action). */
export function memoizedBuildReview(overlay: Overlay): ReviewModel {
  const cached = modelCache.get(overlay);
  if (cached) return cached;
  const model = buildReview(rawState, overlay);
  modelCache.set(overlay, model);
  return model;
}

/** The derived review for the current overlay. The only way components get review data. */
export function useReviewModel(): ReviewModel {
  const overlay = useReview((state) => state.overlay);
  return useMemo(() => memoizedBuildReview(overlay), [overlay]);
}

/** Validation message for an Accept note, or undefined when the note is long enough. */
export function validateAcceptNote(note: string): string | undefined {
  return note.trim().length >= MIN_ACCEPT_NOTE_LENGTH
    ? undefined
    : `Add a reason of at least ${MIN_ACCEPT_NOTE_LENGTH} characters.`;
}
