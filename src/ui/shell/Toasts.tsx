// Toast stack (bottom right): confirmations for applied, accepted, excluded, verified and exported,
// with Undo where the action can be reverted. Reads the store only.

import clsx from 'clsx';
import { CircleCheck, Info, OctagonX, X, type LucideIcon } from 'lucide-react';
import { type ToastTone, useReview } from '../../store/useReview';

const TOAST_ICONS: Record<ToastTone, LucideIcon> = { success: CircleCheck, info: Info, error: OctagonX };
const TOAST_ICON_COLORS: Record<ToastTone, string> = {
  success: 'text-emerald-500', info: 'text-sky-400', error: 'text-red-400',
};

/** The live toast region. */
export function Toasts() {
  const toasts = useReview((state) => state.toasts);
  const dismissToast = useReview((state) => state.dismissToast);
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.tone];
        return (
          <div key={toast.id} className="pointer-events-auto flex items-start gap-2 rounded-md bg-zinc-900 px-3 py-2 text-[13px] text-white shadow-lg">
            <Icon aria-hidden className={clsx('mt-0.5 size-4 shrink-0', TOAST_ICON_COLORS[toast.tone])} />
            <p className="min-w-0 flex-1">{toast.message}</p>
            {toast.undo && (
              <button
                type="button"
                onClick={() => { toast.undo?.(); dismissToast(toast.id); }}
                className="shrink-0 rounded px-1.5 text-[12px] font-semibold text-blue-300 hover:bg-white/10 hover:text-blue-200"
              >
                Undo
              </button>
            )}
            <button type="button" aria-label="Dismiss" onClick={() => dismissToast(toast.id)} className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-white">
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
