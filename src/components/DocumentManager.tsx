"use client";

import { FileText, Trash2, CheckCircle, Database, PlusCircle } from "lucide-react";

export interface IndexedDocument {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
  chunks: Array<{
    text: string;
    sourceName: string;
    chunkIndex: number;
  }>;
}

interface DocumentManagerProps {
  documents: IndexedDocument[];
  activeDocIds: string[];
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  onTriggerUploadClick: () => void;
}

export function DocumentManager({
  documents,
  activeDocIds,
  onToggleActive,
  onDelete,
  onTriggerUploadClick,
}: DocumentManagerProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <section className="card card--grow" aria-labelledby="docmanager-heading" style={{ width: "100%" }}>
      <div className="card__head card__head--split">
        <h2 id="docmanager-heading" className="card__title">
          <Database className="card__title-icon" size={16} aria-hidden />
          Document Vault ({documents.length})
        </h2>
        <button
          type="button"
          className="btn btn--ghost"
          style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
          onClick={onTriggerUploadClick}
        >
          <PlusCircle size={12} /> Index New
        </button>
      </div>

      <div className="panel-scroll" style={{ padding: "1rem" }}>
        {documents.length === 0 ? (
          <div className="chat-workspace__empty" style={{ padding: "2rem" }}>
            <FileText size={32} style={{ color: "var(--text-muted)", marginBottom: "0.75rem" }} />
            <h3 className="empty-state__title" style={{ fontSize: "0.9rem" }}>No indexed documents</h3>
            <p className="empty-state__text" style={{ fontSize: "0.775rem" }}>
              Upload PDF, DOCX, TXT, or Image files in the chat or click &quot;Index New&quot; to add them to your local RAG index.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 0.25rem" }}>
              Select documents to include them in the active RAG contextual queries.
            </p>
            {documents.map((doc) => {
              const isActive = activeDocIds.includes(doc.id);
              return (
                <div
                  key={doc.id}
                  className={`result-block`}
                  style={{
                    margin: 0,
                    padding: "0.75rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    borderColor: isActive ? "rgba(96, 165, 250, 0.35)" : "var(--border-subtle)",
                    background: isActive ? "rgba(59, 130, 246, 0.08)" : "rgba(255, 255, 255, 0.02)",
                    cursor: "pointer",
                  }}
                  onClick={() => onToggleActive(doc.id)}
                >
                  <div
                    style={{
                      color: isActive ? "var(--accent)" : "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {isActive ? <CheckCircle size={18} /> : <FileText size={18} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {doc.name}
                    </p>
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      {formatSize(doc.sizeBytes)} · {doc.chunks.length} chunks · Indexed {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="link-muted"
                    style={{
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      padding: "0.25rem",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(doc.id);
                    }}
                  >
                    <Trash2 size={14} className="hover-red" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
