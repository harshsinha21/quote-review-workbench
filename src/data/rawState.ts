// The single input dataset, typed once. Read-only: buildReview copies it before applying overrides.
import raw from './state.json';
import type { RawState } from '../domain/types';

/** The RFQ, the three vendor threads and the AI extraction, exactly as delivered in state.json. */
export const rawState: RawState = raw as RawState;
