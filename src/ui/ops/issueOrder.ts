// The one order issues are worked in: blockers, then warnings, then info; within each, by RFQ item and qty.
// Shared by the issues panel (display, j/k) and the vendor review (auto-select, next blocker). Pure.

import type { Flag, Severity } from '../../domain/types';

const SEVERITY_RANK: Record<Severity, number> = { blocker: 0, warning: 1, info: 2 };

/** Issues in working order. Whole-quote and not-in-RFQ issues (no item number) come last in their severity. */
export function orderIssues(flags: readonly Flag[]): Flag[] {
  return [...flags].sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
    || (left.rfqNo ?? Number.POSITIVE_INFINITY) - (right.rfqNo ?? Number.POSITIVE_INFINITY)
    || (left.qty ?? 0) - (right.qty ?? 0));
}
