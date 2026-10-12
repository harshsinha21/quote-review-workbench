// Builds the downloadable JSON: state.json with the reviewer's line overrides and submittedAt applied, plus the
// review trail. Works on structured clones only; never mutates the state or the overlay.

import { applyLineOverride } from './match';
import type { Decision, Overlay, RawState, RawVendor } from './types';

/** The exported document: state.json with overrides and submittedAt applied, plus the review trail. */
export interface ExportDocument {
  vendors: RawVendor[];
  review: { settings: Overlay['settings']; decisions: Record<string, Decision>; audit: Overlay['audit'] };
}

/** One vendor as exported: a clone with every line override and the overlay's submittedAt written in. */
function exportVendor(vendor: RawVendor, overlay: Overlay): RawVendor {
  const exported = structuredClone(vendor);
  const submittedAt = overlay.submittedAt?.[vendor.id];
  if (submittedAt) exported.submittedAt = submittedAt;
  exported.products = (Array.isArray(exported.products) ? exported.products : []).map((product) => ({
    ...product,
    lines: (Array.isArray(product.lines) ? product.lines : [])
      .map((line) => applyLineOverride(line, overlay.lineOverrides?.[line.id])),
  }));
  return exported;
}

/** Builds the export without mutating `state` or `overlay`. */
export function buildExportDocument(state: RawState, overlay: Overlay): ExportDocument {
  const vendors = (Array.isArray(state?.vendors) ? state.vendors : [])
    .filter((vendor) => vendor !== null && typeof vendor === 'object')
    .map((vendor) => exportVendor(vendor, overlay));
  return {
    vendors,
    review: {
      settings: { ...overlay.settings },
      decisions: structuredClone(overlay.decisions ?? {}),
      audit: structuredClone(overlay.audit ?? []),
    },
  };
}
