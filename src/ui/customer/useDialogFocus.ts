// Keyboard behavior for a modal sheet: focus moves in on open, Tab stays inside, Escape closes,
// and focus returns to the opener on close. DOM only; it knows nothing about review data.

import { useEffect, useRef, type RefObject } from 'react';

/** Elements that can take keyboard focus inside the sheet. */
const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', 'summary', '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Traps focus in `containerRef` while mounted.
 * @param containerRef the dialog element; Tab and Shift+Tab wrap within it
 * @param initialFocusRef the element focused on open (usually the close button)
 * @param onClose called on Escape; the latest callback is always used, so it need not be stable
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === 'Tab' && containerRef.current) {
        keepFocusInside(containerRef.current, event);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      opener?.focus();
    };
  }, [containerRef, initialFocusRef]);
}

/** Wraps Tab from the last focusable element to the first, and Shift+Tab the other way. */
function keepFocusInside(container: HTMLElement, event: KeyboardEvent): void {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const isFocusOutside = !container.contains(active);
  if (event.shiftKey && (active === first || isFocusOutside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || isFocusOutside)) {
    event.preventDefault();
    first.focus();
  }
}
