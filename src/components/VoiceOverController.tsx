"use client";

import { useTTS } from "@/lib/tts";
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Settings,
} from "lucide-react";
import { useState, useMemo } from "react";

export function VoiceOverController() {
  const {
    activeId,
    isPlaying,
    isPaused,
    currentTitle,
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
  } = useTTS();

  const [isExpanded, setIsExpanded] = useState(false);

  // Filter voices to place English, Bengali, and Hindi at the top for accessibility
  const sortedVoices = useMemo(() => {
    const getLangPriority = (lang: string): number => {
      const code = lang.toLowerCase();
      if (code.startsWith("en")) return 1; // English first
      if (code.startsWith("bn")) return 2; // Bengali second
      if (code.startsWith("hi")) return 3; // Hindi third
      return 4; // Other languages
    };

    return [...voices].sort((a, b) => {
      const prioA = getLangPriority(a.lang);
      const prioB = getLangPriority(b.lang);
      if (prioA !== prioB) {
        return prioA - prioB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [voices]);

  // If nothing is playing and no active voiceover ID, do not show the controller
  if (!activeId) return null;

  return (
    <div 
      className={`tts-controller-card ${isExpanded ? "expanded" : "collapsed"}`}
      role="region"
      aria-label="Voiceover player controls"
    >
      {/* Top Header / Player Controls */}
      <div className="tts-controller-card__header">
        <div className="tts-controller-card__info">
          {/* Animated Waveform Visualizer */}
          <div className={`voice-visualizer ${isPlaying && !isPaused ? "playing" : "paused"}`} aria-hidden="true">
            <span className="voice-visualizer__bar" />
            <span className="voice-visualizer__bar" />
            <span className="voice-visualizer__bar" />
            <span className="voice-visualizer__bar" />
            <span className="voice-visualizer__bar" />
          </div>
          
          <div className="tts-text-info" aria-live="polite">
            <span className="tts-text-info__status">
              {isPlaying && !isPaused ? "Speaking" : isPaused ? "Paused" : "Stopped"}
            </span>
            <span className="tts-text-info__title" title={currentTitle || "AI Output"}>
              {currentTitle || "AI Output"}
            </span>
          </div>
        </div>

        <div className="tts-controller-card__actions">
          {/* Play/Pause */}
          {isPlaying && !isPaused ? (
            <button
              onClick={pause}
              type="button"
              className="tts-btn tts-btn--primary"
              aria-label="Pause voiceover [Alt+P]"
              aria-keyshortcuts="Alt+P"
            >
              <Pause size={14} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button
              onClick={resume}
              type="button"
              className="tts-btn tts-btn--primary"
              aria-label="Resume voiceover [Alt+P]"
              aria-keyshortcuts="Alt+P"
            >
              <Play size={14} fill="currentColor" aria-hidden="true" />
            </button>
          )}

          {/* Stop */}
          <button
            onClick={stop}
            type="button"
            className="tts-btn tts-btn--stop"
            aria-label="Stop and close voiceover [Alt+S]"
            aria-keyshortcuts="Alt+S"
          >
            <Square size={12} fill="currentColor" aria-hidden="true" />
          </button>

          {/* Settings / Collapse toggle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            type="button"
            className={`tts-btn tts-btn--icon ${isExpanded ? "active" : ""}`}
            aria-label={isExpanded ? "Collapse voice settings" : "Expand voice settings"}
            aria-expanded={isExpanded}
          >
            <Settings size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Expandable settings */}
      {isExpanded && (
        <div className="tts-controller-card__settings">
          <div className="tts-settings-divider" />
          
          {/* Voice Dropdown */}
          <div className="tts-setting-row">
            <label className="tts-setting-label">
              <span>Voice</span>
              <select
                className="select tts-select"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                aria-label="Select speaker voice"
              >
                {sortedVoices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Rate/Speed Slider */}
          <div className="tts-setting-row">
            <div className="tts-slider-info">
              <span className="tts-setting-label-text" id="tts-rate-label">Speed</span>
              <span className="tts-slider-val" aria-hidden="true">{rate.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="tts-slider"
              aria-labelledby="tts-rate-label"
              aria-valuetext={`${rate.toFixed(2)} times speed`}
            />
          </div>

          {/* Pitch Slider */}
          <div className="tts-setting-row">
            <div className="tts-slider-info">
              <span className="tts-setting-label-text" id="tts-pitch-label">Pitch</span>
              <span className="tts-slider-val" aria-hidden="true">{pitch.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              className="tts-slider"
              aria-labelledby="tts-pitch-label"
            />
          </div>

          {/* Volume Slider */}
          <div className="tts-setting-row">
            <div className="tts-slider-info">
              <span className="tts-setting-label-text" id="tts-volume-label" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {volume === 0 ? <VolumeX size={12} aria-hidden="true" /> : <Volume2 size={12} aria-hidden="true" />}
                Volume
              </span>
              <span className="tts-slider-val" aria-hidden="true">{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="tts-slider"
              aria-labelledby="tts-volume-label"
              aria-valuetext={`${Math.round(volume * 100)} percent`}
            />
          </div>

          {/* Auto Read Toggle */}
          <div className="tts-setting-row" style={{ marginTop: "0.5rem" }}>
            <label className="tts-toggle-container">
              <input
                type="checkbox"
                checked={autoRead}
                onChange={(e) => setAutoRead(e.target.checked)}
                className="tts-toggle-checkbox"
                aria-label="Automatically read new AI chat replies"
              />
              <span className="tts-toggle-switch" />
              <span className="tts-setting-label-text" style={{ fontWeight: 500 }}>
                Auto-read AI chat replies
              </span>
            </label>
          </div>

          {/* Accessibility shortcuts helper */}
          <div 
            className="tts-shortcuts-hint" 
            style={{ 
              fontSize: "0.675rem", 
              color: "var(--text-muted)", 
              marginTop: "0.5rem", 
              textAlign: "center", 
              display: "flex", 
              justifyContent: "center", 
              gap: "0.75rem",
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: "0.5rem"
            }}
          >
            <span>Alt + P : Pause/Play</span>
            <span>Alt + S : Stop</span>
          </div>
        </div>
      )}
    </div>
  );
}
