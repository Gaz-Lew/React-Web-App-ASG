import React from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to Firestore errors collection (best-effort, non-fatal)
    try {
      const userId = localStorage.getItem('asgCurrentUserId') ?? 'unknown';
      addDoc(collection(db, 'errors'), {
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0],
        user: userId,
        message: error.message,
        stack: error.stack ?? '',
        componentStack: info.componentStack ?? '',
      }).catch(() => {/* silent */});
    } catch {
      // Never let error logging crash the boundary itself
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f0f0ee] dark:bg-[#0e0e0d] p-6">
          <div className="bg-white dark:bg-[#1a1a18] border border-[#e2e2de] dark:border-[#2e2e2b] rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-lg font-semibold text-[#1a1a18] dark:text-[#f0f0ee] mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-[#6b6b65] dark:text-[#8a8a84] mb-1">
              The app encountered an unexpected error. Your data is safe.
            </p>
            {this.state.errorMessage && (
              <p className="text-xs text-red-500 dark:text-red-400 font-mono bg-red-50 dark:bg-red-900/20 rounded px-3 py-2 mt-3 mb-5 text-left break-all">
                {this.state.errorMessage}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-lg bg-[#b8933a] text-white font-semibold hover:bg-[#d4aa55] transition text-sm mt-4"
            >
              Reload App
            </button>
            <p className="text-xs text-[#8a8a84] mt-3">
              This error has been logged for the admin.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
