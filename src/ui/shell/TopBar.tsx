// Top bar (48px): wordmark, the RFQ in one quiet line, the "View as" switch, and one menu for the occasional
// actions (review settings, export, reset). Reads the store; owns only the menu's open state.

import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { rawState } from '../../data/rawState';
import { buildExportDocument } from '../../domain/export';
import type { Overlay } from '../../domain/types';
import { type Role, useReview, useReviewModel } from '../../store/useReview';
import { formatShortDate, pluralize } from '../shared/format';
import { Button } from '../shared/primitives';

/** "View as" options, in display order. */
const ROLE_OPTIONS: { role: Role; label: string }[] = [
  { role: 'ops', label: 'Ops' },
  { role: 'customer', label: 'Customer' },
  { role: 'vendor', label: 'Vendor' },
];

/** What the menu shows: the list of actions, the settings form, or the reset confirmation. */
type MenuMode = 'actions' | 'settings' | 'confirm-reset';

/** Downloads the review as JSON through a Blob, then revokes the object URL. */
function downloadExport(overlay: Overlay): void {
  const blob = new Blob([JSON.stringify(buildExportDocument(rawState, overlay), null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `quote-review-${overlay.settings.asOf}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

/** The app's top bar. */
export function TopBar() {
  const { rfq } = useReviewModel();
  const role = useReview((state) => state.role);
  const setRole = useReview((state) => state.setRole);
  const breakCount = rfq.items.reduce((total, item) => total + item.qtys.length, 0);

  return (
    <header className="flex h-12 shrink-0 items-center gap-6 border-b border-zinc-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-6 place-items-center rounded-md bg-blue-700 text-[11px] font-bold text-white">SP</span>
        <span className="text-[13px] font-semibold text-zinc-900">SalesPatriot <span className="font-normal text-zinc-500">Quote Review</span></span>
      </div>
      <p className="hidden text-[12px] text-zinc-500 lg:block">
        RFQ · {rfq.items.length} parts · {breakCount} breaks{rfq.dueDate && ` · due ${formatShortDate(rfq.dueDate)}`}
      </p>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-[12px] text-zinc-500">View as</span>
        <div role="radiogroup" aria-label="View as" className="flex rounded-md bg-zinc-100 p-0.5">
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.role}
              type="button"
              role="radio"
              aria-checked={role === option.role}
              onClick={() => setRole(option.role)}
              className={clsx(
                'h-6 rounded px-3 text-[12px] font-medium transition-colors',
                role === option.role ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <ReviewMenu />
      </div>
    </header>
  );
}

/** One "Review options" menu: settings, export, and a reset that asks first. Closes on Escape and outside click. */
function ReviewMenu() {
  const [mode, setMode] = useState<MenuMode | undefined>();
  const overlay = useReview((state) => state.overlay);
  const setSettings = useReview((state) => state.setSettings);
  const resetAll = useReview((state) => state.resetAll);
  const pushToast = useReview((state) => state.pushToast);
  const [rateText, setRateText] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const rateId = useId();
  const dateId = useId();
  const close = () => setMode(undefined);

  useEffect(() => {
    if (!mode) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMode(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMode(undefined); };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [mode]);

  const exportJson = () => {
    try {
      downloadExport(overlay);
      pushToast('Exported review JSON.', 'success');
    } catch {
      pushToast('Export failed. Your review data is unchanged.', 'error');
    }
    close();
  };
  const rate = Number(rateText);
  const rateError = Number.isFinite(rate) && rate > 0 ? undefined : 'Enter a rate above 0.';
  const lostWork = [
    pluralize(Object.keys(overlay.lineOverrides).length, 'line change'),
    pluralize(Object.keys(overlay.decisions).length, 'decision'),
    pluralize(Object.keys(overlay.submittedAt).length, 'verification'),
  ].join(', ');
  const menuItem = 'block w-full rounded px-2.5 py-1.5 text-left text-[13px] text-zinc-800 hover:bg-zinc-100';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Review options"
        aria-haspopup="menu"
        aria-expanded={mode !== undefined}
        onClick={() => { setRateText(String(overlay.settings.eurUsd)); setMode(mode ? undefined : 'actions'); }}
        className="grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </button>
      {mode && (
        <div className="absolute right-0 top-10 z-30 w-72 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg">
          {mode === 'actions' && (
            <div role="menu">
              <button type="button" role="menuitem" className={menuItem} onClick={() => setMode('settings')}>Review settings</button>
              <button type="button" role="menuitem" className={menuItem} onClick={exportJson}>Export review JSON</button>
              <div className="my-1 h-px bg-zinc-100" />
              <button type="button" role="menuitem" className={clsx(menuItem, 'text-red-700 hover:bg-red-50')} onClick={() => setMode('confirm-reset')}>
                Reset review data…
              </button>
            </div>
          )}
          {mode === 'settings' && (
            <div className="space-y-3 p-2">
              <div>
                <label htmlFor={rateId} className="block text-[12px] font-medium text-zinc-600">EUR to USD rate</label>
                <input
                  id={rateId}
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateText}
                  aria-invalid={Boolean(rateError)}
                  onChange={(event) => {
                    setRateText(event.target.value);
                    const next = Number(event.target.value);
                    if (Number.isFinite(next) && next > 0) setSettings({ eurUsd: next });
                  }}
                  className="mt-1 h-8 w-full rounded-md border border-zinc-300 px-2 text-[13px] tabular-nums"
                />
                {rateError && <p className="mt-1 text-[12px] text-red-600">{rateError}</p>}
              </div>
              <div>
                <label htmlFor={dateId} className="block text-[12px] font-medium text-zinc-600">As-of date (for quote expiry)</label>
                <input
                  id={dateId}
                  type="date"
                  value={overlay.settings.asOf}
                  onChange={(event) => { if (event.target.value) setSettings({ asOf: event.target.value }); }}
                  className="mt-1 h-8 w-full rounded-md border border-zinc-300 px-2 text-[13px]"
                />
              </div>
              <Button size="sm" onClick={close}>Done</Button>
            </div>
          )}
          {mode === 'confirm-reset' && (
            <div className="space-y-3 p-2">
              <p className="text-[13px] text-zinc-800">Clear all review work in this browser?</p>
              <p className="text-[12px] text-zinc-500">This removes {lostWork}.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={() => { resetAll(); close(); }}>Reset</Button>
                <Button size="sm" variant="ghost" onClick={close}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
