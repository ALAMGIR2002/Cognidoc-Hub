"use client";

import { useState, type ReactNode } from "react";
import { Languages, Loader2 } from "lucide-react";
import type { AIProvider } from "@/lib/gemini";

type TargetLanguage = "en" | "hi" | "bn";

const LANGUAGES: { id: TargetLanguage; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
  { id: "bn", label: "Bengali" },
];

interface OutputTranslationProps {
  text: string;
  provider: AIProvider;
  renderText?: (text: string) => ReactNode;
}

export function OutputTranslation({
  text,
  provider,
  renderText,
}: OutputTranslationProps) {
  const [language, setLanguage] = useState<TargetLanguage>("hi");
  const [translation, setTranslation] = useState("");
  const [translatedLanguage, setTranslatedLanguage] =
    useState<TargetLanguage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translate = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLanguage: language, provider }),
      });
      const data = (await response.json()) as {
        translation?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Translation failed.");
      }
      if (!data.translation?.trim()) {
        throw new Error("The translation service returned an empty result.");
      }
      setTranslation(data.translation);
      setTranslatedLanguage(language);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Translation failed.");
    } finally {
      setLoading(false);
    }
  };

  const selectedLabel = LANGUAGES.find(
    (item) => item.id === translatedLanguage,
  )?.label;

  return (
    <div className="output-translation">
      <div className="output-translation__controls">
        <label className="output-translation__select-label">
          <span className="sr-only">Translation language</span>
          <select
            className="select output-translation__select"
            value={language}
            onChange={(event) => {
              setLanguage(event.target.value as TargetLanguage);
              setTranslation("");
              setTranslatedLanguage(null);
              setError(null);
            }}
            disabled={loading}
            aria-label="Choose translation language"
          >
            {LANGUAGES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="output-translation__button"
          onClick={translate}
          disabled={loading || !text.trim()}
          aria-label={`Translate output to ${LANGUAGES.find((item) => item.id === language)?.label}`}
        >
          {loading ? (
            <Loader2 className="output-translation__spinner" size={14} aria-hidden />
          ) : (
            <Languages size={14} aria-hidden />
          )}
          {loading ? "Translating" : "Translate"}
        </button>
      </div>
      {error && (
        <p className="output-translation__error" role="alert">
          {error}
        </p>
      )}
      {translation && selectedLabel && (
        <section className="output-translation__result" aria-live="polite">
          <h4>{selectedLabel} translation</h4>
          <div className="output-translation__text">
            {renderText ? renderText(translation) : translation}
          </div>
        </section>
      )}
    </div>
  );
}
