"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";

export function cleanTextForSpeech(text: string): string {
  if (!text) return "";

  // 1. Remove code blocks entirely
  let clean = text.replace(/```[\s\S]*?```/g, "");

  // 2. Remove inline code blocks
  clean = clean.replace(/`([^`]+)`/g, "$1");

  // 3. Remove citations like [source: filename, chunk index]
  clean = clean.replace(/\[source:[^\]]+\]/g, "");

  // 4. Remove markdown links: [text](url) -> text
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 5. Remove headers: #, ##, ###, etc.
  clean = clean.replace(/^(#+)\s+/gm, "");

  // 6. Remove list markers: -, *, +, numbers
  clean = clean.replace(/^[\s]*[-*+]\s+/gm, "");
  clean = clean.replace(/^[\s]*\d+\.\s+/gm, "");

  // 7. Remove other markdown styling: bold, italic, strikethrough
  clean = clean.replace(/(\*\*|__)(.*?)\1/g, "$2");
  clean = clean.replace(/(\*|_)(.*?)\1/g, "$2");
  clean = clean.replace(/~~(.*?)~~/g, "$1");

  // 8. Replace newlines with spaces and clean up spacing
  clean = clean.replace(/\n+/g, " ");
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

export function detectLanguage(text: string): "bn" | "hi" | "en" {
  if (!text) return "en";
  // Bengali Unicode range: \u0980-\u09FF
  if (/[\u0980-\u09ff]/.test(text)) {
    return "bn";
  }
  // Hindi (Devanagari) Unicode range: \u0900-\u097F
  if (/[\u0900-\u097f]/.test(text)) {
    return "hi";
  }
  return "en";
}

interface TTSContextType {
  activeId: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  currentTitle: string | null;
  speak: (id: string, text: string, title?: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  rate: number;
  setRate: (r: number) => void;
  pitch: number;
  setPitch: (p: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  voiceName: string;
  setVoiceName: (v: string) => void;
  voices: SpeechSynthesisVoice[];
  autoRead: boolean;
  setAutoRead: (val: boolean) => void;
}

const TTSContext = createContext<TTSContextType | undefined>(undefined);

export function TTSProvider({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);

  // Settings with lazy initializers to avoid SSR issues and ESLint react-hooks/set-state-in-effect errors
  const [rate, setRateState] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cognidoc_tts_rate");
      return saved ? parseFloat(saved) : 1;
    }
    return 1;
  });
  const [pitch, setPitchState] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cognidoc_tts_pitch");
      return saved ? parseFloat(saved) : 1;
    }
    return 1;
  });
  const [volume, setVolumeState] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cognidoc_tts_volume");
      return saved ? parseFloat(saved) : 1;
    }
    return 1;
  });
  const [voiceName, setVoiceNameState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cognidoc_tts_voice");
      return saved || "";
    }
    return "";
  });
  const [autoRead, setAutoReadState] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cognidoc_tts_autoread");
      return saved === "true";
    }
    return false;
  });

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);


  // State update helpers with persistence
  const setRate = (r: number) => {
    setRateState(r);
    localStorage.setItem("cognidoc_tts_rate", r.toString());
    if (utteranceRef.current) utteranceRef.current.rate = r;
  };

  const setPitch = (p: number) => {
    setPitchState(p);
    localStorage.setItem("cognidoc_tts_pitch", p.toString());
    if (utteranceRef.current) utteranceRef.current.pitch = p;
  };

  const setVolume = (v: number) => {
    setVolumeState(v);
    localStorage.setItem("cognidoc_tts_volume", v.toString());
    if (utteranceRef.current) utteranceRef.current.volume = v;
  };

  const setVoiceName = (name: string) => {
    setVoiceNameState(name);
    localStorage.setItem("cognidoc_tts_voice", name);
  };

  const setAutoRead = (val: boolean) => {
    setAutoReadState(val);
    localStorage.setItem("cognidoc_tts_autoread", val ? "true" : "false");
  };

  const stop = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setActiveId(null);
    setCurrentTitle(null);
    utteranceRef.current = null;
  };

  const pause = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.pause();
  };

  const resume = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.resume();
  };

  // Accessibility Keyboard Shortcut Refs
  const triggerTogglePauseRef = useRef<() => void>(null);
  const triggerStopRef = useRef<() => void>(null);

  // Synchronize event handlers to avoid closure issues
  useEffect(() => {
    triggerTogglePauseRef.current = () => {
      if (activeId) {
        if (isPaused) {
          resume();
        } else if (isPlaying) {
          pause();
        }
      }
    };
    triggerStopRef.current = () => {
      stop();
    };
  }, [activeId, isPlaying, isPaused]);

  // Keyboard listener for visually impaired accessibility (Alt+P, Alt+S)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.altKey && key === "p") {
        e.preventDefault();
        triggerTogglePauseRef.current?.();
      } else if (e.altKey && key === "s") {
        e.preventDefault();
        triggerStopRef.current?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Load voices
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      setVoices(allVoices);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const speak = (id: string, text: string, title: string = "AI Output") => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    // If same item is already playing, toggle pause
    if (activeId === id) {
      if (isPaused) {
        resume();
      } else if (isPlaying) {
        pause();
      }
      return;
    }

    // Stop current speech
    stop();

    const cleanedText = cleanTextForSpeech(text);
    if (!cleanedText) return;

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utteranceRef.current = utterance;

    // Set voice: auto-detect language (Bengali, Hindi) and match native system voice
    const detectedLang = detectLanguage(cleanedText);
    let matchedVoice: SpeechSynthesisVoice | undefined;

    if (detectedLang === "bn") {
      matchedVoice = voices.find((v) => v.lang.toLowerCase().startsWith("bn"));
      utterance.lang = "bn-IN";
    } else if (detectedLang === "hi") {
      matchedVoice = voices.find((v) => v.lang.toLowerCase().startsWith("hi"));
      utterance.lang = "hi-IN";
    } else {
      utterance.lang = "en-US";
    }

    // Respect manual user selection if it matches detected language
    if (!matchedVoice && voiceName) {
      const selected = voices.find((v) => v.name === voiceName);
      if (selected && selected.lang.toLowerCase().startsWith(detectedLang)) {
        matchedVoice = selected;
      }
    }

    // English/Fallback (Only for English text)
    if (!matchedVoice && detectedLang === "en") {
      matchedVoice = voices.find((v) => v.lang.toLowerCase().startsWith("en")) || voices[0];
    }

    if (matchedVoice) {
      utterance.voice = matchedVoice;
      utterance.lang = matchedVoice.lang;
    }

    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    utterance.onstart = () => {
      setActiveId(id);
      setIsPlaying(true);
      setIsPaused(false);
      setCurrentTitle(title);
    };

    utterance.onend = () => {
      setActiveId(null);
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentTitle(null);
      utteranceRef.current = null;
    };

    utterance.onerror = () => {
      setActiveId(null);
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentTitle(null);
      utteranceRef.current = null;
    };

    utterance.onpause = () => {
      setIsPaused(true);
    };

    utterance.onresume = () => {
      setIsPaused(false);
      setIsPlaying(true);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <TTSContext.Provider
      value={{
        activeId,
        isPlaying,
        isPaused,
        currentTitle,
        speak,
        pause,
        resume,
        stop,
        rate,
        setRate,
        pitch,
        setPitch,
        volume,
        setVolume,
        voiceName,
        setVoiceName,
        voices,
        autoRead,
        setAutoRead,
      }}
    >
      {children}
    </TTSContext.Provider>
  );
}

export function useTTS() {
  const context = useContext(TTSContext);
  if (context === undefined) {
    throw new Error("useTTS must be used within a TTSProvider");
  }
  return context;
}
