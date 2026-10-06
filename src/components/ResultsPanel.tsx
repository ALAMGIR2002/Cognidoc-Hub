"use client";

import type { AnalysisResult } from "@/lib/types";
import { Brain, Heart, LayoutPanelLeft, ListChecks, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { useTTS } from "@/lib/tts";
import { OutputTranslation } from "@/components/OutputTranslation";
import type { AIProvider } from "@/lib/gemini";

type Tab = "traditional" | "cognitive" | "emotional" | "actions";

interface ResultsPanelProps {
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  provider: AIProvider;
}

export function ResultsPanel({ result, loading, error, provider }: ResultsPanelProps) {
  const [tab, setTab] = useState<Tab>("traditional");
  const { speak, activeId, isPlaying, isPaused } = useTTS();

  const getTabTextToSpeak = (): { text: string; title: string } => {
    if (!result) return { text: "", title: "" };
    const joinList = (label: string, items: string[]) =>
      items.length > 0 ? `${label}: ${items.join(". ")}.` : "";
    const withDisclaimer = (sections: string[]) =>
      [...sections.filter(Boolean), `Disclaimer: ${result.disclaimer}`].join("\n\n");

    if (tab === "traditional") {
      return {
        title: `Analysis: ${result.traditional.title}`,
        text: withDisclaimer([
          `Analysis: ${result.traditional.title}`,
          `Executive summary: ${result.traditional.executiveSummary}`,
          joinList("Key points", result.traditional.keyPoints),
          joinList("Topics and entities", result.traditional.entitiesAndTopics),
          joinList("Risks or concerns", result.traditional.risksOrConcerns),
          joinList("Open questions", result.traditional.openQuestions),
          `Document tone: ${result.traditional.documentTone}`,
        ]),
      };
    }
    if (tab === "cognitive") {
      return {
        title: "Cognitive Insights",
        text: withDisclaimer([
          `Mental model: ${result.adaptive.cognitive.mentalModel}`,
          joinList(
            "Misconceptions to avoid",
            result.adaptive.cognitive.misconceptionsToAvoid,
          ),
          joinList(
            "Check your understanding",
            result.adaptive.cognitive.comprehensionChecks,
          ),
          `Complexity for you: ${result.adaptive.cognitive.complexityNote}`,
          `Reading guidance: ${result.adaptive.readingGuidance}`,
        ]),
      };
    }
    if (tab === "emotional") {
      return {
        title: "Emotional Support",
        text: withDisclaimer([
          `Supportive framing: ${result.adaptive.emotional.supportiveFraming}`,
          `Reassurance: ${result.adaptive.emotional.reassuranceWhereAppropriate}`,
          joinList(
            "Likely reactions",
            result.adaptive.emotional.likelyReactions,
          ),
          joinList(
            "Stress triggers in this document",
            result.adaptive.emotional.stressTriggersInDoc,
          ),
        ]),
      };
    }
    if (tab === "actions") {
      return {
        title: "Personalized Next Steps",
        text: withDisclaimer([
          joinList(
            "Personalized next steps",
            result.adaptive.personalizedActions,
          ),
        ]),
      };
    }
    return { text: "", title: "" };
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "traditional", label: "Analysis", icon: <Sparkles size={14} /> },
    { id: "cognitive", label: "Cognitive", icon: <Brain size={14} /> },
    { id: "emotional", label: "Emotional", icon: <Heart size={14} /> },
    { id: "actions", label: "For you", icon: <ListChecks size={14} /> },
  ];

  return (
    <section
      className="card card--grow"
      style={{ width: "100%" }}
      aria-labelledby="results-heading"
    >
      <div className="card__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 id="results-heading" className="card__title">
          <LayoutPanelLeft className="card__title-icon" size={16} aria-hidden />
          Insights
        </h2>
        {result && (
          <button
            type="button"
            onClick={() => {
              const { text, title } = getTabTextToSpeak();
              speak(`tab-${tab}`, text, title);
            }}
            className={`tts-trigger-btn ${activeId === `tab-${tab}` && isPlaying && !isPaused ? "tts-trigger-btn--active" : ""}`}
            title={activeId === `tab-${tab}` && isPlaying && !isPaused ? "Pause narration [Alt+P]" : "Listen to tab breakdown [Alt+P]"}
            aria-label={activeId === `tab-${tab}` && isPlaying && !isPaused ? `Pause reading ${tab} tab contents` : `Read entire ${tab} tab contents out loud`}
          >
            {activeId === `tab-${tab}` && isPlaying && !isPaused ? (
              <VolumeX size={14} aria-hidden="true" />
            ) : (
              <Volume2 size={14} aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      <div className="tabs" role="tablist" aria-label="Result views">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel-scroll" role="tabpanel">
        {result && !loading && (
          <OutputTranslation
            key={getTabTextToSpeak().text}
            text={getTabTextToSpeak().text}
            provider={provider}
          />
        )}
        {loading && (
          <div className="loader-steps" aria-live="polite">
            <LoaderStep label="Parsing document" state="done" />
            <LoaderStep label="Traditional analysis" state="active" />
            <LoaderStep
              label="Personalizing cognitive & emotional layer"
              state="pending"
            />
            <p className="loader-hint">Gemini is reading your document…</p>
          </div>
        )}

        {error && !loading && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && !result && (
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden>
              <Sparkles size={22} />
            </div>
            <h3 className="empty-state__title">Your adaptive brief appears here</h3>
            <p className="empty-state__text">
              Upload or paste a document, tune your reader profile, then run
              analysis. You&apos;ll get professional document breakdown plus
              responses shaped for your age, education, and mental state—not a
              one-size-fits-all chat reply.
            </p>
          </div>
        )}

        {result && !loading && (
          <div>
            {tab === "traditional" && (
              <>
                <h3 className="result-title">{result.traditional.title}</h3>
                <ResultBlock title="Executive summary">
                  {result.traditional.executiveSummary}
                </ResultBlock>
                <ResultList title="Key points" items={result.traditional.keyPoints} />
                <ResultList
                  title="Topics & entities"
                  items={result.traditional.entitiesAndTopics}
                />
                <ResultList
                  title="Risks or concerns"
                  items={result.traditional.risksOrConcerns}
                />
                <ResultList
                  title="Open questions"
                  items={result.traditional.openQuestions}
                />
                <ResultBlock title="Document tone">
                  {result.traditional.documentTone}
                </ResultBlock>
              </>
            )}

            {tab === "cognitive" && (
              <>
                <ResultBlock title="Mental model">
                  {result.adaptive.cognitive.mentalModel}
                </ResultBlock>
                <ResultBlock title="Complexity for you">
                  {result.adaptive.cognitive.complexityNote}
                </ResultBlock>
                <ResultList
                  title="Misconceptions to avoid"
                  items={result.adaptive.cognitive.misconceptionsToAvoid}
                />
                <ResultList
                  title="Check your understanding"
                  items={result.adaptive.cognitive.comprehensionChecks}
                />
                <ResultBlock title="Reading guidance">
                  {result.adaptive.readingGuidance}
                </ResultBlock>
              </>
            )}

            {tab === "emotional" && (
              <>
                <ResultBlock title="Supportive framing">
                  {result.adaptive.emotional.supportiveFraming}
                </ResultBlock>
                <ResultBlock title="Reassurance">
                  {result.adaptive.emotional.reassuranceWhereAppropriate}
                </ResultBlock>
                <ResultList
                  title="Likely reactions"
                  items={result.adaptive.emotional.likelyReactions}
                />
                <ResultList
                  title="Stress triggers in this document"
                  items={result.adaptive.emotional.stressTriggersInDoc}
                />
              </>
            )}

            {tab === "actions" && (
              <ResultList
                title="Personalized next steps"
                items={result.adaptive.personalizedActions}
              />
            )}

            <p className="disclaimer">{result.disclaimer}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ResultBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { speak, activeId, isPlaying, isPaused } = useTTS();
  const textVal = typeof children === "string" ? children : "";
  const id = `block-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <article className="result-block">
      <h4 className="result-block__label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{title}</span>
        {textVal && (
          <button
            type="button"
            onClick={() => speak(id, textVal, title)}
            className={`tts-trigger-btn ${activeId === id && isPlaying && !isPaused ? "tts-trigger-btn--active" : ""}`}
            title={activeId === id && isPlaying && !isPaused ? "Pause reading [Alt+P]" : `Read ${title.toLowerCase()} out loud [Alt+P]`}
            aria-label={activeId === id && isPlaying && !isPaused ? `Pause reading ${title}` : `Read ${title} out loud`}
          >
            {activeId === id && isPlaying && !isPaused ? (
              <VolumeX size={12} aria-hidden="true" />
            ) : (
              <Volume2 size={12} aria-hidden="true" />
            )}
          </button>
        )}
      </h4>
      <p className="result-block__text">{children}</p>
    </article>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  const { speak, activeId, isPlaying, isPaused } = useTTS();
  const textVal = items.join(". ");
  const id = `list-${title.toLowerCase().replace(/\s+/g, "-")}`;

  if (!items?.length) return null;
  return (
    <article className="result-block">
      <h4 className="result-block__label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{title}</span>
        {textVal && (
          <button
            type="button"
            onClick={() => speak(id, textVal, title)}
            className={`tts-trigger-btn ${activeId === id && isPlaying && !isPaused ? "tts-trigger-btn--active" : ""}`}
            title={activeId === id && isPlaying && !isPaused ? "Pause reading [Alt+P]" : `Read ${title.toLowerCase()} list out loud [Alt+P]`}
            aria-label={activeId === id && isPlaying && !isPaused ? `Pause reading ${title} list` : `Read ${title} list out loud`}
          >
            {activeId === id && isPlaying && !isPaused ? (
              <VolumeX size={12} aria-hidden="true" />
            ) : (
              <Volume2 size={12} aria-hidden="true" />
            )}
          </button>
        )}
      </h4>
      <ul className="result-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function LoaderStep({
  label,
  state,
}: {
  label: string;
  state: "done" | "active" | "pending";
}) {
  const mod =
    state === "done"
      ? " loader-step--done"
      : state === "active"
        ? " loader-step--active"
        : "";
  return (
    <div className={`loader-step${mod}`}>
      <span className="loader-step__dot" aria-hidden />
      <span className="loader-step__label">{label}</span>
    </div>
  );
}
