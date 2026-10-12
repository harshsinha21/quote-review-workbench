// Catches a crash inside one view so the rest of the app keeps working.
// The fallback says what happened and offers "Reload view" and "Reset local review data".

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../shared/primitives';

/** Props: the view to protect, and the reset action for local review data. */
export interface ErrorBoundaryProps { children: ReactNode; onResetData: () => void }

interface ErrorBoundaryState { error?: Error }

/** A per-view error boundary (class component: React has no hook equivalent). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('View crashed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="m-6 max-w-xl rounded-md border border-red-200 bg-white p-4">
        <p className="text-[14px] font-semibold text-zinc-900">This view hit an error and stopped rendering.</p>
        <p className="mt-1 text-[13px] text-zinc-600">
          Your saved review decisions are untouched. Reload the view, or reset local review data if the error comes back.
        </p>
        <pre className="mt-3 overflow-auto rounded-md bg-zinc-50 p-2 font-mono text-[11px] text-red-700">{error.message}</pre>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={() => this.setState({ error: undefined })}>Reload view</Button>
          <Button variant="danger" onClick={() => { this.props.onResetData(); this.setState({ error: undefined }); }}>
            Reset local review data
          </Button>
        </div>
      </div>
    );
  }
}
