/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, WifiOff } from 'lucide-react';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { PublicWebsite } from './components/PublicWebsite.tsx';
import { AppProvider, useApp } from './contexts/AppContext.tsx';

function FoodVistaShell() {
  const { isAdmin, toasts, isOnline } = useApp();
  const [viewMode, setViewMode] = useState<'public' | 'admin'>(() =>
    typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
      ? 'admin'
      : 'public',
  );

  useEffect(() => {
    if (viewMode === 'admin' && !isAdmin) {
      setViewMode('public');
    }
  }, [viewMode, isAdmin]);

  const openAdmin = () => {
    if (!isAdmin) return;
    setViewMode('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openPublic = () => {
    setViewMode('public');
    if (window.location.pathname.startsWith('/admin')) {
      window.history.replaceState({}, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {!isOnline && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-[#171717] px-4 py-2 text-xs font-medium text-white no-print">
          <WifiOff className="h-3.5 w-3.5 text-[#F97316]" />
          You are currently offline. Viewing cached FoodVista menu; live orders resume on reconnect.
        </div>
      )}

      {viewMode === 'admin' && isAdmin ? (
        <AdminDashboard onBackToPublic={openPublic} />
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
