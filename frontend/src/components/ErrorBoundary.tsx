import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: React.ReactNode; resetKey?: string }
interface State { error: Error | null }

/**
 * Catches a crash inside one page so the sidebar/header stay alive and the user
 * sees a message + Reload button, instead of a blank white screen.
 * resetKey = current URL: moving to another page clears the error automatically.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6 sm:p-12 max-w-lg mx-auto my-12 bg-white rounded-2xl border border-rose-200 shadow-md text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">This page hit a problem</h2>
        <p className="text-xs text-slate-600">{this.state.error.message || 'Unexpected error'}</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
        >
          <RefreshCw className="w-4 h-4" /> Reload page
        </button>
      </div>
    );
  }
}
