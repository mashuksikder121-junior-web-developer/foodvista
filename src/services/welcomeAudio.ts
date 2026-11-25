import type { Language } from '../shared/i18n.ts';

function playWarmChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.09 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.45);
    });

    setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 1000);
  } catch {
    // Web Audio unavailable or blocked
  }
}

export function speakWelcomeGreeting(displayName: string, lang: Language = 'en'): void {
  if (typeof window === 'undefined') return;

  const cleanName = displayName.trim() || (lang === 'bn' ? 'অতিথি' : 'Guest');
  playWarmChime();

  try {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      return;
    }

    window.speechSynthesis.cancel();
    const text = `${cleanName}, welcome to our FoodVista!`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.96;
    utterance.pitch = 1.04;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('natural')) ||
      voices.find((v) => v.lang.startsWith('en'));
    if (preferred) {
      utterance.voice = preferred;
    }

    // Small delay so the warm welcome chime finishes smoothly before speech starts
    setTimeout(() => {
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        // Ignore speech synthesis autoplay rejections
      }
    }, 260);
  } catch {
    // Ignore speech synthesis errors
  }
}
