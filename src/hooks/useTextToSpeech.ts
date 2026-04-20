/**
 * useTextToSpeech.ts — Browser-native speech synthesis hook
 *
 * Uses window.speechSynthesis — supported on all modern browsers.
 *
 * Voice selection:
 *  - Prefers a high-quality English voice (Google / Microsoft) over plain default
 *  - Falls back through en-AU → en-GB → en-US → first available en → default
 *
 * Usage:
 *   const tts = useTextToSpeech();
 *   tts.speak("Hello there");
 *   tts.stop();
 */

import { useState, useRef, useCallback, useEffect } from "react";

export interface UseTTSReturn {
  speak: (text: string) => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  setSelectedVoice: (v: SpeechSynthesisVoice | null) => void;
}

const TTS_SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Select the best available English voice.
 * Priority: Google/Microsoft premium voices → en-AU → en-GB → en-US → first en → default.
 */
function pickBestVoice(englishVoices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // 1. Prefer "Google" or "Microsoft" branded voices (usually higher quality)
  const branded = englishVoices.find(
    (v) => v.name.toLowerCase().includes("google") || v.name.toLowerCase().includes("microsoft"),
  );
  if (branded) return branded;

  // 2. Australian English
  const au = englishVoices.find((v) => v.lang === "en-AU");
  if (au) return au;

  // 3. British English
  const gb = englishVoices.find((v) => v.lang === "en-GB");
  if (gb) return gb;

  // 4. US English
  const us = englishVoices.find((v) => v.lang === "en-US");
  if (us) return us;

  // 5. Any English
  if (englishVoices.length > 0) return englishVoices[0];

  // 6. Browser default
  return null;
}

export function useTextToSpeech(): UseTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  // Track the current utterance so we can cancel it
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesLoadedRef = useRef(false);

  // ── Voice loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!TTS_SUPPORTED) return;

    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      const english = all.filter((v) => v.lang.startsWith("en"));
      setVoices(english);

      // Auto-select best voice on first load only
      if (!voicesLoadedRef.current) {
        voicesLoadedRef.current = true;
        const best = pickBestVoice(english);
        setSelectedVoice(best);
      }
    };

    loadVoices();

    // Chrome loads voices asynchronously
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (!TTS_SUPPORTED) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  // ── speak ─────────────────────────────────────────────────────────────────
  const speak = useCallback(
    (text: string) => {
      if (!TTS_SUPPORTED || !text.trim()) return;

      // Cancel any in-progress speech before starting new one
      window.speechSynthesis.cancel();
      utteranceRef.current = null;

      const utt = new SpeechSynthesisUtterance(text);

      if (selectedVoice) utt.voice = selectedVoice;
      utt.rate = 0.95; // natural, slightly relaxed
      utt.pitch = 1.0;
      utt.volume = 1.0;

      setIsSpeaking(true);

      utt.onend = () => {
        utteranceRef.current = null;
        setIsSpeaking(false);
      };
      utt.onerror = () => {
        utteranceRef.current = null;
        setIsSpeaking(false);
      };

      utteranceRef.current = utt;
      window.speechSynthesis.speak(utt);
    },
    [selectedVoice],
  );

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (TTS_SUPPORTED) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported: TTS_SUPPORTED,
    voices,
    selectedVoice,
    setSelectedVoice,
  };
}

export default useTextToSpeech;
