"use client";

import {
  DEFAULT_PROFILE,
  PROFILE_PRESETS,
  type ReaderProfile,
} from "@/lib/types";
import { UserRound } from "lucide-react";

interface ProfilePanelProps {
  profile: ReaderProfile;
  onChange: (profile: ReaderProfile) => void;
}

export function ProfilePanel({ profile, onChange }: ProfilePanelProps) {
  const set = <K extends keyof ReaderProfile>(
    key: K,
    value: ReaderProfile[K],
  ) => onChange({ ...profile, [key]: value });

  const setPref = <K extends keyof ReaderProfile["preferences"]>(
    key: K,
    value: ReaderProfile["preferences"][K],
  ) =>
    onChange({
      ...profile,
      preferences: { ...profile.preferences, [key]: value },
    });

  return (
    <section className="card" aria-labelledby="profile-heading">
      <div className="card__head card__head--split">
        <h2 id="profile-heading" className="card__title">
          <UserRound className="card__title-icon" size={16} aria-hidden />
          Reader profile
        </h2>
        <div className="preset-row">
          {Object.entries(PROFILE_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              className="btn btn--chip"
              onClick={() => onChange({ ...preset })}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="card__body">
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Age band</span>
            <select
              className="select"
              value={profile.ageBand}
              onChange={(e) =>
                set("ageBand", e.target.value as ReaderProfile["ageBand"])
              }
            >
              <option value="13-17">13–17</option>
              <option value="18-25">18–25</option>
              <option value="26-40">26–40</option>
              <option value="41-60">41–60</option>
              <option value="60+">60+</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">Education</span>
            <select
              className="select"
              value={profile.educationLevel}
              onChange={(e) =>
                set(
                  "educationLevel",
                  e.target.value as ReaderProfile["educationLevel"],
                )
              }
            >
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="undergraduate">Undergraduate</option>
              <option value="graduate">Graduate</option>
              <option value="professional">Professional</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">Goal</span>
            <select
              className="select"
              value={profile.readingGoal}
              onChange={(e) =>
                set("readingGoal", e.target.value as ReaderProfile["readingGoal"])
              }
            >
              <option value="understand">Understand</option>
              <option value="decide">Decide</option>
              <option value="study">Study</option>
              <option value="compliance">Compliance</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">Mental state</span>
            <select
              className="select"
              value={profile.mentalState}
              onChange={(e) =>
                set("mentalState", e.target.value as ReaderProfile["mentalState"])
              }
            >
              <option value="neutral">Neutral</option>
              <option value="anxious">Anxious</option>
              <option value="overwhelmed">Overwhelmed</option>
              <option value="low_energy">Low energy</option>
              <option value="focused">Focused</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">Verbosity</span>
            <select
              className="select"
              value={profile.preferences.verbosity}
              onChange={(e) =>
                setPref(
                  "verbosity",
                  e.target.value as typeof profile.preferences.verbosity,
                )
              }
            >
              <option value="brief">Brief</option>
              <option value="standard">Standard</option>
              <option value="deep">Deep</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">Emotional support</span>
            <select
              className="select"
              value={profile.preferences.emotionSupport}
              onChange={(e) =>
                setPref(
                  "emotionSupport",
                  e.target.value as typeof profile.preferences.emotionSupport,
                )
              }
            >
              <option value="minimal">Minimal</option>
              <option value="balanced">Balanced</option>
              <option value="high">High</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">Cognitive load</span>
            <select
              className="select"
              value={profile.preferences.cognitiveLoad}
              onChange={(e) =>
                setPref(
                  "cognitiveLoad",
                  e.target.value as typeof profile.preferences.cognitiveLoad,
                )
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <label className="field field--spaced">
          <span className="field__label">Context (optional)</span>
          <textarea
            className="textarea"
            value={profile.contextNote ?? ""}
            onChange={(e) => set("contextNote", e.target.value || undefined)}
            placeholder="e.g. Preparing for a meeting tomorrow…"
            rows={2}
          />
        </label>
      </div>
    </section>
  );
}

export { DEFAULT_PROFILE };
