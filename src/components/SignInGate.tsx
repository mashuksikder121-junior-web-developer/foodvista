import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Globe,
  LogIn,
  MapPin,
  QrCode,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext.tsx';
import { FOOD_IMAGES } from '../data/seedDefaults.ts';
import { FoodImage } from './FoodImage.tsx';

export const SignInGate: React.FC = () => {
  const { settings, signInWithGoogle, lang, setLang, t, qrTable } = useApp();
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#171717] text-white flex flex-col">
      {/* Minimal Top Bar */}
      <header className="border-b border-neutral-800 bg-[#171717]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="font-display text-xl font-extrabold tracking-tight text-white">
              {settings.restaurantName || 'FoodVista'}
            </span>
            <span className="hidden text-xs font-medium text-[#F97316] sm:inline">
              {settings.tagline || 'Good Food • Good Mood'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-neutral-400" />
            <div className="inline-flex rounded-xl border border-neutral-700 bg-neutral-900 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  lang === 'en' ? 'bg-[#F97316] text-white' : 'text-neutral-300 hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('bn')}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  lang === 'bn' ? 'bg-[#F97316] text-white' : 'text-neutral-300 hover:text-white'
                }`}
              >
                বাংলা
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Centered Split Showcase */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-10 sm:px-6">
        <div className="grid w-full grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          {/* Left: Sign-In Card */}
          <div className="flex flex-col justify-center rounded-3xl border border-neutral-800 bg-white p-7 text-[#171717] shadow-2xl sm:p-10 lg:col-span-6">
            <p className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
              {t.signInBadge}
            </p>

            <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-[#171717] sm:text-4xl">
              {t.signInHeading}
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-neutral-600">{t.signInSubheading}</p>

            {qrTable && qrTable.verified && (
              <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-semibold text-[#171717]">
                <QrCode className="h-4 w-4 shrink-0 text-[#F97316]" />
                <span>
                  Table {qrTable.tableNumber} ({qrTable.zone}) detected — sign in to start ordering
                  for your table.
                </span>
              </div>
            )}

            <ul className="mt-6 space-y-2.5 text-sm text-neutral-700">
              {[
                t.signInHighlight1,
                t.signInHighlight2,
                t.signInHighlight3,
                t.signInHighlight4,
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16A34A]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              disabled={signingIn}
              onClick={() => void handleGoogleLogin()}
              className="mt-8 flex min-h-[52px] w-full items-center justify-center gap-3 rounded-2xl bg-[#F97316] px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-orange-500/20 transition-colors hover:bg-[#EA580C] disabled:opacity-60"
            >
              <LogIn className="h-5 w-5" />
              {signingIn ? '...' : t.signInGoogleCta}
            </button>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#16A34A]" />
                {t.signInSecurityNote}
              </span>
              <Volume2 className="h-4 w-4 text-[#F97316]" />
            </div>
          </div>

          {/* Right: Editorial Food Showcase */}
          <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 lg:col-span-6 min-h-[320px]">
            <FoodImage
              src={settings.heroBannerUrl || FOOD_IMAGES.chickenBurger}
              alt={settings.restaurantName || 'FoodVista Signature Dish'}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 space-y-2 text-white">
              <p className="font-display text-2xl font-extrabold">{settings.heroTitle}</p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-300">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#F97316]" />
                  {settings.openingHours}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[#F97316]" />
                  {settings.address}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
