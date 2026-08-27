import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

// ponytail: single root boundary; per-route boundaries if pages grow their own
// failure modes. Render-time throws otherwise white-screen the whole SPA.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
          <p className="max-w-md text-sm text-slate-500">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
