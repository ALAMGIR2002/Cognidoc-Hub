"use client";

import { FileText, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface DocumentInputProps {
  text: string;
  file: File | null;
  onTextChange: (text: string) => void;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}

export function DocumentInput({
  text,
  file,
  onTextChange,
  onFileChange,
  disabled,
}: DocumentInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) {
        onFileChange(f);
        onTextChange("");
      }
    },
    [onFileChange, onTextChange],
  );

  return (
    <section className="card card--grow" aria-labelledby="document-heading">
      <div className="card__head">
        <h2 id="document-heading" className="card__title">
          <FileText className="card__title-icon" size={16} aria-hidden />
          Document
        </h2>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={14} aria-hidden />
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,.csv"
          hidden
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFileChange(f);
            if (f) onTextChange("");
          }}
        />
      </div>

      <div className="card__body--flush">
        {file ? (
          <div className="file-badge">
            <div className="file-badge__box">
              <p className="file-badge__name">{file.name}</p>
              <p className="file-badge__meta">
                {(file.size / 1024).toFixed(1)} KB · Ready to analyze
              </p>
            </div>
            <button
              type="button"
              className="link-muted"
              disabled={disabled}
              onClick={() => onFileChange(null)}
            >
              Remove file
            </button>
          </div>
        ) : (
          <div
            className={`dropzone${dragOver ? " dropzone--active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <textarea
              className="textarea textarea--doc"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              disabled={disabled}
              placeholder="Paste your document here, or drag and drop PDF, TXT, MD, or CSV…"
              aria-label="Document text"
            />
          </div>
        )}
      </div>
    </section>
  );
}
