// A dark strip under the top bar in the Customer and Vendor views, so a preview never looks like the Ops tool.
// It names the audience, holds the vendor picker for the portal preview, and leads back to Ops.

import { rawState } from '../../data/rawState';
import { useReview } from '../../store/useReview';
import { shortVendorName } from '../shared/format';

/** "Previewing what Argus Defense sees" / "Previewing the vendor portal for [Heritage]", plus "Back to Ops". */
export function PreviewRibbon() {
  const role = useReview((state) => state.role);
  const vendorId = useReview((state) => state.vendorId);
  const setRole = useReview((state) => state.setRole);
  const setView = useReview((state) => state.setView);
  if (role === 'ops') return null;
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 bg-zinc-900 px-4 text-[13px] text-zinc-100">
      {role === 'customer' ? (
        <span>Previewing what Argus Defense sees</span>
      ) : (
        <label className="flex items-center gap-2">
          Previewing the vendor portal for
          <select
            value={vendorId ?? ''}
            onChange={(event) => setView('portal', event.target.value)}
            className="h-6 rounded border border-zinc-700 bg-zinc-800 px-1.5 text-[13px] text-white"
          >
            {rawState.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{shortVendorName(vendor.name)}</option>)}
          </select>
        </label>
      )}
      <button type="button" onClick={() => setRole('ops')} className="ml-auto text-zinc-300 hover:text-white">Back to Ops</button>
    </div>
  );
}
