import React, { Suspense, lazy, useState } from 'react';
import { Droplets, Eye, EyeOff, ArrowRight, WifiOff } from 'lucide-react';
import { useAuth } from '../store/authStore.js';
import type { DemoAccount } from '../lib/demoAccounts.js';

// With VITE_DEMO_MODE off this is `null` and the bundler drops the whole demo chunk (accounts + passwords).
const DemoAccounts = import.meta.env.VITE_DEMO_MODE === 'true' ? lazy(() => import('../components/DemoAccounts.js')) : null;

// The real order lifecycle of the product, who does each step, and what they do.
const STAGES = [
  { who: 'Sales', what: 'Creates the order with custom rates' },
  { who: 'Admin', what: 'Approves it and assigns packing' },
  { who: 'Packing team', what: 'Checks stock, packs, hands over' },
  { who: 'Dispatch', what: 'Assigns vehicle and LR, records delivery' },
  { who: 'Accounts', what: 'Verifies the payment in the ledger' }
];

const inputClass =
  'block h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-oil-900 ' +
  'placeholder:text-slate-400 transition focus:border-oil-700 focus:outline-none focus:ring-2 focus:ring-amber-400/70';

const Brand: React.FC<{ tone: 'light' | 'dark' }> = ({ tone }) => (
  <div className="flex items-center gap-3">
    <span className="flex h-10 w-10 items-center justify-center rounded-xl text-oil-950 shadow-md">
        <img src='https://i.ibb.co/YFZDpyCf/download-2.png' className='w-full' />
    </span>
    <span className={`font-display text-xl font-semibold tracking-tight ${tone === 'dark' ? 'text-white' : 'text-oil-900'}`}>
      Auto pickup<span className="text-amber-500">Lubricant</span> ERP
    </span>
  </div>
);

export const Login: React.FC = () => {
  const { login, refreshUser, connectionError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResetHelp, setShowResetHelp] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const signIn = async (emailValue: string, passwordValue: string) => {
    setError(null);
    setLoading(true);
    try {
      await login(emailValue.trim(), passwordValue, remember);
      // On success the router sends the user on to the dashboard (or the page they were opening)
    } catch (err: any) {
      setError(err?.message || 'Could not sign in. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter both your email and password.');
      return;
    }
    signIn(email, password);
  };

  const handleDemoSelect = (acc: DemoAccount) => {
    setEmail(acc.email);
    setPassword(acc.password);
    signIn(acc.email, acc.password);
  };

  const handleRetry = async () => {
    setRetrying(true);
    await refreshUser();
    setRetrying(false);
  };

  return (
    <div className="min-h-screen bg-paper font-sans text-oil-900 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel - desktop only */}
      <aside className="relative hidden flex-col bg-oil-900 p-12 text-slate-200 lg:flex xl:p-16">
        <Brand tone="dark" />

        <div className="my-auto max-w-md py-12">
          <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-5xl">
            From order to verified payment, in one system.
          </h1>

          <ol className="mt-12">
            {STAGES.map((stage, i) => {
              const last = i === STAGES.length - 1;
              return (
                <li key={stage.who} className="relative pb-7 pl-9 last:pb-0">
                  {!last && <span className="absolute left-[7px] top-5 bottom-[-2px] w-px bg-oil-700" aria-hidden="true" />}
                  <span
                    className={`absolute left-0 top-[5px] h-[15px] w-[15px] rounded-full border-2 border-amber-400 ${last ? 'bg-amber-400' : 'bg-oil-900'}`}
                    aria-hidden="true"
                  />
                  <p className="text-sm text-slate-400">{stage.who}</p>
                  <p className="text-base font-medium text-white">{stage.what}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>

      {/* Form side */}
      <main className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10 lg:min-h-0">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-10 lg:hidden">
            <Brand tone="light" />
          </div>

          <h2 className="font-display text-3xl font-semibold tracking-tight text-oil-900">Sign in</h2>
          <p className="mt-2 text-[15px] text-slate-600">Use your Auto pickup account to continue.</p>

          {connectionError && (
            <div role="alert" className="mt-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <p>{connectionError}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying}
                  className="mt-1.5 font-semibold underline underline-offset-2 hover:text-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-60"
                >
                  {retrying ? 'Retrying…' : 'Try again'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="you@company.com"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:text-oil-900 focus-visible:outline-2 focus-visible:outline-amber-500"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-400 accent-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                />
                <span>Keep me signed in on this device</span>
              </label>
              <button
                type="button"
                onClick={() => setShowResetHelp((v) => !v)}
                aria-expanded={showResetHelp}
                aria-controls="reset-help"
                className="shrink-0 rounded font-medium text-oil-800 underline underline-offset-2 hover:text-oil-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              >
                Forgot password?
              </button>
            </div>

            {showResetHelp && (
              <p id="reset-help" className="rounded-lg bg-white px-3.5 py-3 text-sm text-slate-700 ring-1 ring-slate-300">
                Passwords are reset by your administrator. Ask them to set a new one for your account.
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 text-base font-semibold text-oil-950 shadow-sm transition hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oil-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-oil-950 border-t-transparent motion-safe:animate-spin" aria-hidden="true" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          {DemoAccounts && (
            <Suspense fallback={null}>
              <DemoAccounts disabled={loading} onSelect={handleDemoSelect} />
            </Suspense>
          )}
        </div>
      </main>
    </div>
  );
};
