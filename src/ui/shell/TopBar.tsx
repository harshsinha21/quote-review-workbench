// Top bar (48px): wordmark, RFQ chip, the "View as" switch with a vendor picker, Settings and Export JSON.
// Reads the store; owns only the open/closed state of the settings popover.

import clsx from 'clsx';
import { Download, Settings } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { rawState } from '../../data/rawState';
import { buildExportDocument } from '../../domain/export';
import type { Overlay } from '../../domain/types';
import { type Role, useReview, useReviewModel } from '../../store/useReview';
import { formatShortDate, shortVendorName } from '../shared/format';
import { Button, Mono } from '../shared/primitives';

/** "View as" options, in display order. */
const ROLE_OPTIONS: { role: Role; label: string }[] = [
  { role: 'ops', label: 'SalesPatriot Ops' },
  { role: 'customer', label: 'Customer' },
  { role: 'vendor', label: 'Vendor' },
];

/** Downloads the review as JSON through a Blob, then revokes the object URL. */
function downloadExport(overlay: Overlay): void {
  const exportDocument = buildExportDocument(rawState, overlay);
  const blob = new Blob([JSON.stringify(exportDocument, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `quote-review-${overlay.settings.asOf}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

/** The app's top bar. */
export function TopBar() {
  const model = useReviewModel();
  const role = useReview((state) => state.role);
  const setRole = useReview((state) => state.setRole);
  const vendorId = useReview((state) => state.vendorId);
  const setView = useReview((state) => state.setView);
  const overlay = useReview((state) => state.overlay);
  const pushToast = useReview((state) => state.pushToast);
  const breakCount = model.rfq.items.reduce((total, item) => total + item.qtys.length, 0);

  const handleExport = () => {
    try {
      downloadExport(overlay);
      pushToast('Exported review JSON.', 'success');
    } catch {
      pushToast('Export failed. Your review data is unchanged.', 'error');
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-6 place-items-center rounded-md bg-blue-700 text-[11px] font-bold text-white">SP</span>
        <span className="text-[13px] font-semibold tracking-tight text-zinc-900">
          SalesPatriot <span className="font-normal text-zinc-400">·</span> <span className="font-medium text-zinc-600">Quote Review</span>
        </span>
      </div>

      <span className="hidden items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[12px] text-zinc-600 lg:inline-flex">
        <Mono className="font-semibold text-zinc-800">RFQ</Mono>
        <span>· {model.rfq.items.length} parts · {breakCount} breaks{model.rfq.dueDate && ` · due ${formatShortDate(model.rfq.dueDate)}`}</span>
      </span>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-zinc-500">View as</span>
          <div role="radiogroup" aria-label="View as" className="flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5">
            {ROLE_OPTIONS.map((option) => (
              <button
                key={option.role}
                type="button"
                role="radio"
                aria-checked={role === option.role}
                onClick={() => setRole(option.role)}
                className={clsx(
                  'h-6 rounded px-2.5 text-[12px] font-medium transition-colors',
                  role === option.role ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-600 hover:text-zinc-900',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {role === 'vendor' && (
            <select
              aria-label="Vendor"
              value={vendorId ?? ''}
              onChange={(event) => setView('portal', event.target.value)}
              className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-[12px] text-zinc-800"
            >
              {rawState.vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{shortVendorName(vendor.name)}</option>
              ))}
            </select>
          )}
        </div>
        <span aria-hidden className="h-5 w-px bg-zinc-200" />
        <SettingsPopover />
        <Button icon={Download} onClick={handleExport}>Export JSON</Button>
      </div>
    </header>
  );
}

/** EUR to USD rate and as-of date, in a small popover. Invalid input is shown inline and not saved. */
function SettingsPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const settings = useReview((state) => state.overlay.settings);
  const setSettings = useReview((state) => state.setSettings);
  const resetAll = useReview((state) => state.resetAll);
  const [rateText, setRateText] = useState(String(settings.eurUsd));
  const panelRef = useRef<HTMLDivElement>(null);
  const rateId = useId();
  const dateId = useId();
  const rate = Number(rateText);
  const rateError = Number.isFinite(rate) && rate > 0 ? undefined : 'Enter a rate above 0.';

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={panelRef} className="relative">
      <Button icon={Settings} aria-expanded={isOpen} onClick={() => { setRateText(String(settings.eurUsd)); setIsOpen(!isOpen); }}>
        Settings
      </Button>
      {isOpen && (
        <div className="absolute right-0 top-9 z-30 w-72 rounded-md border border-zinc-200 bg-white p-3 shadow-lg">
          <p className="text-[12px] font-semibold text-zinc-900">Review settings</p>
          <label htmlFor={rateId} className="mt-3 block text-[12px] text-zinc-600">EUR to USD rate</label>
          <input
            id={rateId}
            type="number"
            step="0.01"
            min="0"
            value={rateText}
            onChange={(event) => {
              setRateText(event.target.value);
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next > 0) setSettings({ eurUsd: next });
            }}
            aria-invalid={Boolean(rateError)}
            className="mt-1 h-7 w-full rounded-md border border-zinc-300 px-2 text-[12px] tabular-nums"
          />
          {rateError && <p className="mt-1 text-[11px] text-red-600">{rateError}</p>}
          <label htmlFor={dateId} className="mt-3 block text-[12px] text-zinc-600">As-of date (quote expiry check)</label>
          <input
            id={dateId}
            type="date"
            value={settings.asOf}
            onChange={(event) => { if (event.target.value) setSettings({ asOf: event.target.value }); }}
            className="mt-1 h-7 w-full rounded-md border border-zinc-300 px-2 text-[12px]"
          />
          <div className="mt-3 border-t border-zinc-100 pt-3">
            <Button variant="danger" size="xs" onClick={() => { resetAll(); setIsOpen(false); }}>Reset local review data</Button>
          </div>
        </div>
      )}
    </div>
  );
}
