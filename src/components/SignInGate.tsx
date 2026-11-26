import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Globe,
  Lock,
  LogIn,
  Mail,
  MapPin,
  QrCode,
  ShieldCheck,
  User as UserIcon,
  UserPlus,
  Volume2,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext.tsx';
import { FOOD_IMAGES } from '../data/seedDefaults.ts';
import { FoodImage } from './FoodImage.tsx';

export const SignInGate: React.FC = () => {
  const { settings, signUpDemo, signInDemo, signInWithGoogle, lang, setLang, t, qrTable } =
    useApp();

  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg(
        lang === 'bn'
          ? 'অনুগ্রহ করে একটি সঠিক ইমেইল ঠিকানা দিন।'
          : 'Please enter a valid email address.',
      );
      return;
    }
    if (!password) {
      setErrorMsg(
        lang === 'bn' ? 'অনুগ্রহ করে একটি পাসওয়ার্ড দিন।' : 'Please enter a password.',
      );
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUpDemo({
          email: cleanEmail,
          password,
          displayName: displayName.trim() || undefined,
        });
      } else {
        await signInDemo({
          email: cleanEmail,
          password,
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : lang === 'bn'
            ? 'প্রবেশ করা সম্ভব হয়নি। আবার চেষ্টা করুন।'
            : 'Authentication failed. Please try again.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setGoogleLoading(false);
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
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-8 sm:px-6">
        <div className="grid w-full grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          {/* Left: Demo Sign-Up / Sign-In Card */}
          <div className="flex flex-col justify-center rounded-3xl border border-neutral-800 bg-white p-7 text-[#171717] shadow-2xl sm:p-9 lg:col-span-6">
            <p className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
              {t.signInBadge}
            </p>

            <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight text-[#171717] sm:text-3xl">
              {t.signInHeading}
            </h1>

            <p className="mt-2 text-xs leading-relaxed text-neutral-600 sm:text-sm">
              {t.signInSubheading}
            </p>

            {qrTable && qrTable.verified && (
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs font-semibold text-[#171717]">
                <QrCode className="h-4 w-4 shrink-0 text-[#F97316]" />
                <span>
                  Table {qrTable.tableNumber} ({qrTable.zone}) detected — sign up or sign in to
                  order for your table.
                </span>
              </div>
            )}

            {/* Mode Switcher Tabs: Demo Sign Up vs Returning Sign In */}
            <div className="mt-5 grid grid-cols-2 rounded-2xl border border-neutral-200 bg-neutral-100 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition-all ${
                  mode === 'signup'
                    ? 'bg-[#171717] text-white shadow-sm'
                    : 'text-neutral-600 hover:text-[#171717]'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {t.signUpTab}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMsg(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition-all ${
                  mode === 'signin'
                    ? 'bg-[#171717] text-white shadow-sm'
                    : 'text-neutral-600 hover:text-[#171717]'
                }`}
              >
                <LogIn className="h-3.5 w-3.5" />
                {t.signInTab}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
              {mode === 'signup' && (
                <div>
                  <label className="text-xs font-semibold text-neutral-700">
                    {t.nameOptionalLabel}
                  </label>
                  <div className="relative mt-1">
                    <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t.namePlaceholder}
                      maxLength={80}
                      className="w-full rounded-xl border border-neutral-200 bg-[#F8FAFC] py-2.5 pl-10 pr-3.5 text-sm text-[#171717] placeholder:text-neutral-400 focus:border-[#F97316] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-neutral-700">{t.emailLabel}</label>
                <div className="relative mt-1">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.emailPlaceholder}
                    autoComplete="email"
                    className="w-full rounded-xl border border-neutral-200 bg-[#F8FAFC] py-2.5 pl-10 pr-3.5 text-sm text-[#171717] placeholder:text-neutral-400 focus:border-[#F97316] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700">{t.passwordLabel}</label>
                <div className="relative mt-1">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.passwordPlaceholder}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="w-full rounded-xl border border-neutral-200 bg-[#F8FAFC] py-2.5 pl-10 pr-10 text-sm text-[#171717] placeholder:text-neutral-400 focus:border-[#F97316] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-[#171717]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-neutral-500">{t.demoSignUpNote}</p>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-[#DC2626]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#F97316] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition-colors hover:bg-[#EA580C] disabled:opacity-60"
              >
                {mode === 'signup' ? (
                  <UserPlus className="h-4 w-4" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {submitting
                  ? '...'
                  : mode === 'signup'
                    ? t.signUpCta
                    : t.signInPasswordCta}
              </button>
            </form>

            {/* Optional Google Sign-In Divider */}
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-200" />
              <span className="text-[11px] font-medium text-neutral-400">
                {t.orContinueGoogle}
              </span>
              <div className="h-px flex-1 bg-neutral-200" />
            </div>

            <button
              type="button"
              disabled={googleLoading}
              onClick={() => void handleGoogleLogin()}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-bold text-[#171717] transition-colors hover:border-[#171717] hover:bg-neutral-50 disabled:opacity-60"
            >
              <LogIn className="h-4 w-4 text-[#F97316]" />
              {googleLoading ? '...' : t.signInGoogleCta}
            </button>

            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-neutral-100 pt-4 text-[11px] text-neutral-600">
              {[
                t.signInHighlight1,
                t.signInHighlight2,
                t.signInHighlight3,
                t.signInHighlight4,
              ].map((item) => (
                <div key={item} className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
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
