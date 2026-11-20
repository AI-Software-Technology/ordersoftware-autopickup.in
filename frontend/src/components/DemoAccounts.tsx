import React from 'react';
import { DEMO_ACCOUNTS, type DemoAccount } from '../lib/demoAccounts.js';

interface Props {
  disabled?: boolean;
  onSelect: (account: DemoAccount) => void;
}

// Loaded lazily and only when VITE_DEMO_MODE=true - see pages/Login.tsx
const DemoAccounts: React.FC<Props> = ({ disabled, onSelect }) => (
  <details open className="mt-8 border-t border-slate-300 pt-5 group">
    <summary className="flex cursor-pointer list-none items-center justify-between rounded-md text-sm font-semibold text-oil-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500 [&::-webkit-details-marker]:hidden">
      <span>Demo accounts</span>
      <span className="text-xs font-normal text-slate-500 group-open:hidden">Show</span>
      <span className="hidden text-xs font-normal text-slate-500 group-open:inline">Hide</span>
    </summary>
    <p className="mt-1 text-sm text-slate-600">
      Test data only. Pick a role to sign in without typing credentials.
    </p>
    <ul className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1">
      {DEMO_ACCOUNTS.map((acc) => {
        const Icon = acc.icon;
        return (
          <li key={acc.email}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(acc)}
              aria-label={`Sign in as ${acc.role}`}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left transition hover:border-oil-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${acc.tone}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-oil-900">{acc.role}</span>
                <span className="block text-xs text-slate-600">{acc.summary}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  </details>
);

export default DemoAccounts;
