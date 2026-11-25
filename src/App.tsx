/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Info,
  LogIn,
  LogOut,
  Shield,
  WifiOff,
} from 'lucide-react';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { PublicWebsite } from './components/PublicWebsite.tsx';
import { SignInGate } from './components/SignInGate.tsx';
import { AppProvider, useApp } from './contexts/AppContext.tsx';

const AdminAccessGate: React.FC<{ onBackToPublic: () => void }> = ({ onBackToPublic }) => {
  const { user, authReady, signInWithGoogle, logout } = useApp();

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-6">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-neutral-200 border-t-[#F97316]" />
          <p className="mt-4 font-display text-base font-bold text-[#171717]">
            Loading FoodVista Admin Panel...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#171717] p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-white p-8 text-[#171717] shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-[#F97316]">
          <Shield className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-extrabold text-[#171717]">
          FoodVista Authorized Staff Console
        </h1>

        {!user ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Passwordless Google Sign-In only. Only the owner Gmail account or an active
              registered staff Gmail can access this console.
            </p>
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="mt-6 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C]"
            >
              <LogIn className="h-4 w-4" />
              Sign in with Google
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-[#DC2626] font-medium">
              Access Denied for <strong className="text-[#171717]">{user.email}</strong>.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              This Google account is not authorized as an active Administrator or Staff member. Any
              unauthorized Gmail is blocked without password bypass.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  await signInWithGoogle();
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#EA580C]"
              >
                <LogIn className="h-4 w-4" />
                Switch Authorized Google Account
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 px-5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onBackToPublic}
          className="mt-5 inline-flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-[#171717]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Public Website
        </button>
      </div>
    </div>
  );
};

function FoodVistaShell() {
  const { user, authReady, isAdmin, staffRole, toasts, isOnline } = useApp();
  const [viewMode, setViewMode] = useState<'public' | 'admin'>(() =>
    typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
      ? 'admin'
      : 'public',
  );

  useEffect(() => {
    const handlePopState = () => {
      setViewMode(window.location.pathname.startsWith('/admin') ? 'admin' : 'public');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openAdmin = () => {
    setViewMode('admin');
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
      window.history.pushState({}, '', '/admin');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openPublic = () => {
    setViewMode('public');
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      window.history.pushState({}, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const canAccessAdmin = Boolean(authReady && user && (isAdmin || staffRole));

  return (
    <>
      {!isOnline && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-[#171717] px-4 py-2 text-xs font-medium text-white no-print">
          <WifiOff className="h-3.5 w-3.5 text-[#F97316]" />
          You are currently offline. Viewing cached FoodVista menu; live orders resume on reconnect.
        </div>
      )}

      {!authReady ? (
        <div className="flex min-h-screen items-center justify-center bg-[#171717] p-6 text-white">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-[#F97316]" />
            <p className="mt-4 font-display text-base font-bold">FoodVista</p>
          </div>
        </div>
      ) : viewMode === 'admin' ? (
        canAccessAdmin ? (
          <AdminDashboard onBackToPublic={openPublic} />
        ) : (
          <AdminAccessGate onBackToPublic={openPublic} />
        )
      ) : !user ? (
        <SignInGate />
      ) : (
        <PublicWebsite onOpenAdmin={openAdmin} />
      )}

      {/* Floating Toast Notifications */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 flex max-w-sm flex-col gap-2 sm:bottom-6 no-print"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg ${
                toast.type === 'success'
                  ? 'border-green-200 bg-white text-[#16A34A]'
                  : toast.type === 'error'
                    ? 'border-red-200 bg-white text-[#DC2626]'
                    : 'border-neutral-200 bg-[#171717] text-white'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="h-4 w-4 shrink-0" />
              ) : (
                <Info className="h-4 w-4 shrink-0 text-[#F97316]" />
              )}
              <span>{toast.text}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <FoodVistaShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
