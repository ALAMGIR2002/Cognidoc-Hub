"use client";

import { DocumentInput } from "@/components/DocumentInput";
import { ProfilePanel, DEFAULT_PROFILE } from "@/components/ProfilePanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { LoginModal, type UserProfile } from "@/components/LoginModal";
import { DocumentManager, type IndexedDocument } from "@/components/DocumentManager";
import { OutputTranslation } from "@/components/OutputTranslation";
import type { AnalysisResult, ReaderProfile } from "@/lib/types";
import type { AIProvider, ChatMessageInput } from "@/lib/gemini";
import {
  BrainCircuit,
  Loader2,
  MessageSquare,
  FileVideo,
  Stethoscope,
  Scale,
  Send,
  Trash2,
  Image as ImageIcon,
  FileText,
  Mic,
  Video,
  LogIn,
  LogOut,
  Plus,
  FolderOpen,
  Database,
  Download,
  Volume2,
  VolumeX,
  Upload,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo, type SetStateAction } from "react";
import { useTTS } from "@/lib/tts";
import { VoiceOverController } from "@/components/VoiceOverController";

interface ChatMsg {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string; // ISO string for local storage compatibility
  attachments?: Array<{
    name: string;
    mimeType: string;
    type: "image" | "file" | "voice" | "video";
  }>;
}

interface ChatThread {
  id: string;
  title: string;
  mode: ChatMode;
  messages: ChatMsg[];
}

type ChatMode = "chat" | "file_query" | "medical" | "legal";
type AssistantMode = ChatMode | "analyze" | "docs";

interface StagedFile {
  name: string;
  mimeType: string;
  data: string;
  type: "image" | "file" | "voice" | "video";
  analyzed?: boolean;
}

function isChatMode(mode: unknown): mode is ChatMode {
  return mode === "chat" || mode === "file_query" || mode === "medical" || mode === "legal";
}

function isAIProvider(value: string | null): value is AIProvider {
  return value === "auto" || value === "openai" || value === "gemini" || value === "lm_studio";
}

export function AnalyzerApp() {
  const { speak, activeId, isPlaying, isPaused, autoRead } = useTTS();

  // --- Original Analyzer State ---
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<ReaderProfile>(DEFAULT_PROFILE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Hub & Multi-Mode State ---
  const [activeMode, setActiveMode] = useState<AssistantMode>("chat");
  const [aiProvider, setAiProvider] = useState<AIProvider>("openai");

  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // --- Chat Threads State ---
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [stagedFilesByMode, setStagedFilesByMode] = useState<Record<ChatMode, StagedFile[]>>({
    chat: [],
    file_query: [],
    medical: [],
    legal: [],
  });
  const activeChatMode = isChatMode(activeMode) ? activeMode : "chat";
  const stagedFiles = stagedFilesByMode[activeChatMode];
  const setStagedFiles = (update: SetStateAction<StagedFile[]>) => {
    setStagedFilesByMode((current) => ({
      ...current,
      [activeChatMode]:
        typeof update === "function" ? update(current[activeChatMode]) : update,
    }));
  };
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatUploadError, setChatUploadError] = useState<string | null>(null);
  const [documentUploadDragOver, setDocumentUploadDragOver] = useState(false);

  // --- Document Manager (RAG) State ---
  const [indexedDocs, setIndexedDocs] = useState<IndexedDocument[]>([]);
  const [activeDocIds, setActiveDocIds] = useState<string[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);

  // --- Citation View Modal State ---
  const [selectedCitation, setSelectedCitation] = useState<{
    sourceName: string;
    chunkIndex: number;
    text: string;
  } | null>(null);

  // References
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatDocumentInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const directIndexerRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Modes list
  const MODES = [
    { id: "chat", title: "General Chat", desc: "General multi-turn chat helper", icon: <MessageSquare size={16} /> },
    { id: "file_query", title: "File & Video Query", desc: "Query documents, video & audio", icon: <FileVideo size={16} /> },
    { id: "medical", title: "Medical AI Assistant", desc: "Clinical concepts & reports analyzer", icon: <Stethoscope size={16} /> },
    { id: "legal", title: "Legal Document Guide", desc: "Understand terms & agreements", icon: <Scale size={16} /> },
    { id: "analyze", title: "Document Analyzer", desc: "Original adaptive breakdown", icon: <BrainCircuit size={16} /> },
    { id: "docs", title: "Document Vault", desc: "RAG Document Manager", icon: <Database size={16} /> },
  ] as const;

  // --- Lifecycle Hooks (Load/Save from LocalStorage) ---
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // 1. Auth load
    const savedUser = localStorage.getItem("cognidoc_current_user");
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }

    const savedProvider = localStorage.getItem("cognidoc_ai_provider");
    if (isAIProvider(savedProvider)) {
      setAiProvider(savedProvider);
    }

    // 2. Chat threads load
    const savedThreads = localStorage.getItem("cognidoc_chat_threads");
    if (savedThreads) {
      const parsedThreads = (JSON.parse(savedThreads) as ChatThread[]).map((thread) => ({
        ...thread,
        mode: isChatMode(thread.mode) ? thread.mode : "chat",
      }));
      let initialThread = parsedThreads.find((thread) => thread.mode === "chat");
      if (!initialThread) {
        initialThread = {
          id: "default-thread",
          title: "Default Chat",
          mode: "chat",
          messages: [],
        };
        parsedThreads.push(initialThread);
        localStorage.setItem("cognidoc_chat_threads", JSON.stringify(parsedThreads));
      }
      setThreads(parsedThreads);
      setActiveThreadId(initialThread.id);
    } else {
      // Create a default thread
      const defaultThread: ChatThread = {
        id: "default-thread",
        title: "Default Chat",
        mode: "chat",
        messages: [],
      };
      setThreads([defaultThread]);
      setActiveThreadId("default-thread");
      localStorage.setItem("cognidoc_chat_threads", JSON.stringify([defaultThread]));
    }

    // 3. Document Vault load
    const savedDocs = localStorage.getItem("cognidoc_indexed_docs");
    if (savedDocs) {
      const docs: IndexedDocument[] = JSON.parse(savedDocs);
      setIndexedDocs(docs);
      // Auto select all as active RAG targets initially
      setActiveDocIds(docs.map((d) => d.id));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Sync threads to localStorage on change
  const saveThreadsToStorage = (updatedThreads: ChatThread[]) => {
    localStorage.setItem("cognidoc_chat_threads", JSON.stringify(updatedThreads));
  };

  const activeThread = threads.find(
    (thread) => thread.id === activeThreadId && thread.mode === activeChatMode,
  ) || null;
  const visibleThreads = threads.filter((thread) => thread.mode === activeChatMode);
  const chatMessages = useMemo(() => activeThread ? activeThread.messages : [], [activeThread]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // Handle Login
  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("cognidoc_current_user");
    setCurrentUser(null);
  };

  const handleProviderChange = (value: string) => {
    if (!isAIProvider(value)) return;
    setAiProvider(value);
    localStorage.setItem("cognidoc_ai_provider", value);
  };

  // --- Thread Management ---
  const handleNewThread = () => {
    const newThread: ChatThread = {
      id: crypto.randomUUID(),
      title: `New Chat - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      mode: activeChatMode,
      messages: [],
    };
    const updatedThreads = [newThread, ...threads];
    setThreads(updatedThreads);
    setActiveThreadId(newThread.id);
    saveThreadsToStorage(updatedThreads);
  };

  const handleModeChange = (mode: AssistantMode) => {
    setActiveMode(mode);
    setChatInput("");
    setChatError(null);

    if (!isChatMode(mode)) return;

    const modeThread = threads.find((thread) => thread.mode === mode);
    if (modeThread) {
      setActiveThreadId(modeThread.id);
      return;
    }

    const newThread: ChatThread = {
      id: crypto.randomUUID(),
      title: `New Chat - ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      mode,
      messages: [],
    };
    const updatedThreads = [newThread, ...threads];
    setThreads(updatedThreads);
    setActiveThreadId(newThread.id);
    saveThreadsToStorage(updatedThreads);
  };

  const handleDeleteThread = (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedThreads = threads.filter((t) => t.id !== threadId);

    if (activeThreadId === threadId) {
      const nextThread = updatedThreads.find((thread) => thread.mode === activeChatMode);
      if (nextThread) {
        setActiveThreadId(nextThread.id);
      } else {
        const defaultThread: ChatThread = {
          id: crypto.randomUUID(),
          title: `New Chat - ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          mode: activeChatMode,
          messages: [],
        };
        updatedThreads.unshift(defaultThread);
        setActiveThreadId(defaultThread.id);
      }
    }

    setThreads(updatedThreads);
    saveThreadsToStorage(updatedThreads);
  };

  // --- Document Manager & RAG upload ---
  const uploadAndIndexFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFile = e.target.files?.[0];
    if (!uploadFile) return;

    if (uploadFile.size > 20 * 1024 * 1024) {
      alert("File size exceeds 20MB limit.");
      return;
    }

    setIsIndexing(true);
    setError(null);
    setChatError(null);

    try {
      const form = new FormData();
      form.append("file", uploadFile);

      const res = await fetch("/api/rag", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to extract and index document.");
      }

      // Add to index
      const newDoc: IndexedDocument = {
        id: Math.random().toString(36).substring(7),
        name: uploadFile.name,
        sizeBytes: uploadFile.size,
        uploadedAt: new Date().toISOString(),
        chunks: data.chunks,
      };

      const updatedDocs = [newDoc, ...indexedDocs];
      setIndexedDocs(updatedDocs);
      localStorage.setItem("cognidoc_indexed_docs", JSON.stringify(updatedDocs));
      setActiveDocIds((prev) => [...prev, newDoc.id]); // auto-activate

      alert(`Successfully indexed "${uploadFile.name}" into your Document Vault!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload error.";
      setError(msg);
      setChatError(msg);
    } finally {
      setIsIndexing(false);
      e.target.value = ""; // clear inputs
    }
  };

  const handleToggleDocActive = (docId: string) => {
    setActiveDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handleDeleteDoc = (docId: string) => {
    const updated = indexedDocs.filter((d) => d.id !== docId);
    setIndexedDocs(updated);
    localStorage.setItem("cognidoc_indexed_docs", JSON.stringify(updated));
    setActiveDocIds((prev) => prev.filter((id) => id !== docId));
  };

  // --- Multimedia Chat Upload ---
  const stageFile = (file: File, type: "image" | "file" | "voice" | "video") => {
    if (chatLoading) return;
    setChatUploadError(null);
    if (file.size > 15 * 1024 * 1024) {
      setChatUploadError("File exceeds the 15 MB limit.");
      return;
    }

    const isSupportedDocument =
      /\.(pdf|docx|txt|md|csv|json|png|jpe?g|webp|gif)$/i.test(file.name);
    if (
      (activeChatMode === "medical" || activeChatMode === "legal") &&
      !isSupportedDocument
    ) {
      setChatUploadError(
        "Unsupported document type. Upload a PDF, DOCX, TXT, MD, CSV, JSON, PNG, JPG, WEBP, or GIF file.",
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const resultData = event.target?.result;
      if (typeof resultData !== "string") {
        setChatUploadError(`Could not read "${file.name}". Please try another file.`);
        return;
      }
      const base64 = resultData.split(",")[1];
      if (!base64) {
        setChatUploadError(`Could not read "${file.name}". Please try another file.`);
        return;
      }
      setStagedFiles((prev) => [
        ...prev,
        {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          data: base64,
          type: (activeChatMode === "medical" || activeChatMode === "legal") && file.type.startsWith("image/")
            ? "image"
            : type,
          analyzed: false,
        },
      ]);
    };
    reader.onerror = () => {
      setChatUploadError(`Could not read "${file.name}". Please try another file.`);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "image" | "file" | "voice" | "video",
  ) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) stageFile(selectedFile, type);
    e.target.value = "";
  };

  const removeStagedFile = (index: number) => {
    setChatUploadError(null);
    setStagedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  const clearChatHistory = () => {
    if (!activeThreadId) return;
    const updatedThreads = threads.map((t) => {
      if (t.id === activeThreadId) {
        return { ...t, messages: [] };
      }
      return t;
    });
    setThreads(updatedThreads);
    setStagedFiles([]);
    setChatError(null);
    saveThreadsToStorage(updatedThreads);
  };

  // --- Exporting Chat transcripts ---
  const handleExportChatMarkdown = () => {
    if (chatMessages.length === 0) return;
    let md = `# Chat transcript - ${MODES.find(m => m.id === activeMode)?.title}\n`;
    md += `Exported on: ${new Date().toLocaleString()}\n\n`;

    chatMessages.forEach((m) => {
      md += `### ${m.sender === "user" ? "User" : "AI Assistant"} (${new Date(m.timestamp).toLocaleTimeString()})\n`;
      md += `${m.text}\n\n`;
      if (m.attachments && m.attachments.length > 0) {
        md += `*Attachments:* ${m.attachments.map(a => `[${a.type}] ${a.name}`).join(", ")}\n\n`;
      }
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_export_${activeMode}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportChatWord = () => {
    if (chatMessages.length === 0) return;
    let html = `<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;color:#333;padding:20px;">`;
    html += `<h2>Chat Transcript - ${MODES.find(m => m.id === activeMode)?.title}</h2>`;
    html += `<p style="color:#777;">Exported: ${new Date().toLocaleString()}</p><hr/>`;

    chatMessages.forEach((m) => {
      html += `<p><strong>${m.sender === "user" ? "User" : "Assistant"}</strong> <span style="font-size:0.8rem;color:#666;">(${new Date(m.timestamp).toLocaleTimeString()})</span></p>`;
      html += `<div style="background:#f9f9f9;padding:10px 15px;border-left:4px solid #3b82f6;margin-bottom:15px;white-space:pre-wrap;">${m.text}</div>`;
    });
    html += `</body></html>`;

    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_export_${activeMode}_${Date.now()}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Send Message and RAG context retrieval ---
  const sendChatMessage = async () => {
    if (!chatInput.trim() && stagedFiles.length === 0) return;
    if (!activeThreadId) return;

    const typedText = chatInput.trim();
    const currentStaged = [...stagedFiles];
    const userText = typedText || (
      activeMode === "medical"
        ? "Please review the attached medical report and explain its key findings in clear, non-diagnostic language."
        : activeMode === "legal"
          ? "Please review the attached legal document and summarize its key terms, obligations, and potential risks. Do not provide legal advice."
          : "Please review the attached file and summarize its relevant contents."
    );

    // 1. Stage User message UI
    const newUserMsg: ChatMsg = {
      id: Math.random().toString(36).substring(7),
      sender: "user" as const,
      text: userText || `[Attached ${currentStaged.length} file(s)]`,
      timestamp: new Date().toISOString(),
      attachments: currentStaged.map(f => ({ name: f.name, mimeType: f.mimeType, type: f.type })),
    };

    const updatedMsgs = [...chatMessages, newUserMsg];
    
    // Update thread locally
    const updatedThreads = threads.map((t) => {
      if (t.id === activeThreadId) {
        return {
          ...t,
          title: t.title.startsWith("New Chat") ? (userText.slice(0, 24) || t.title) : t.title,
          messages: updatedMsgs,
        };
      }
      return t;
    });

    setThreads(updatedThreads);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);
    setChatUploadError(null);
    saveThreadsToStorage(updatedThreads);

    try {
      // 2. RAG Chunk Retrieval
      type DocumentChunk = IndexedDocument["chunks"][number];
      let contextChunks: DocumentChunk[] = [];
      const activeDocs = activeMode === "file_query"
        ? indexedDocs.filter((d) => activeDocIds.includes(d.id))
        : [];

      if (activeDocs.length > 0 && userText) {
        // Collect all chunks from active docs
        const allChunks = activeDocs.reduce<DocumentChunk[]>((acc, doc) => {
          return [...acc, ...doc.chunks];
        }, []);

        if (allChunks.length > 0) {
          const ragRes = await fetch("/api/rag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: userText, chunks: allChunks }),
          });
          if (ragRes.ok) {
            const ragData = await ragRes.json();
            contextChunks = ragData.results ?? [];
          }
        }
      }

      // 3. Call Chat API
      const apiMessages: ChatMessageInput[] = updatedMsgs.map((m, index) => {
        const unavailableAttachments = m.attachments?.filter(
          (attachment) =>
            index !== updatedMsgs.length - 1 ||
            !currentStaged.some((file) => file.name === attachment.name),
        );
        const attachmentNote = unavailableAttachments?.length
          ? `\n\n[Previously attached file(s): ${unavailableAttachments.map((attachment) => attachment.name).join(", ")}. Their contents are not available in this request. They were uploaded earlier; do not say they were never provided. Ask the user to upload them again if you need to inspect their contents.]`
          : "";
        return {
          role: m.sender === "user" ? ("user" as const) : ("model" as const),
          content: `${m.text}${attachmentNote}`,
        };
      });

      // For the final call, we attach files to the user prompt block
      const lastApiMsg = apiMessages[apiMessages.length - 1];
      if (lastApiMsg && currentStaged.length > 0) {
        lastApiMsg.files = currentStaged.map(f => ({ name: f.name, mimeType: f.mimeType, data: f.data }));
      }

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          mode: activeMode === "chat" || activeMode === "file_query" || activeMode === "medical" || activeMode === "legal" ? activeMode : "chat",
          provider: aiProvider,
          contextChunks,
        }),
      });

      const data = await chatRes.json();
      if (!chatRes.ok) {
        throw new Error(data.error ?? "Failed to get AI response.");
      }

      // 4. Save model message
      const modelMsg: ChatMsg = {
        id: Math.random().toString(36).substring(7),
        sender: "ai" as const,
        text: data.reply,
        timestamp: new Date().toISOString(),
      };

      const finalMsgs = [...updatedMsgs, modelMsg];
      const finalThreads = threads.map((t) => {
        if (t.id === activeThreadId) {
          return { ...t, messages: finalMsgs };
        }
        return t;
      });

      setThreads(finalThreads);
      saveThreadsToStorage(finalThreads);
      if (activeChatMode === "medical" || activeChatMode === "legal") {
        setStagedFiles((current) => current.map((file) => ({ ...file, analyzed: true })));
      } else {
        setStagedFiles([]);
      }
      if (autoRead) {
        speak(modelMsg.id, modelMsg.text, "Chat Response");
      }
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Something went wrong.");
      setChatInput(typedText);
    } finally {
      setChatLoading(false);
    }
  };

  // --- Original Doc Analyzer call ---
  async function analyze() {
    if (!text.trim() && !file) {
      setError("Add document text or upload a file.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("profile", JSON.stringify(profile));
      form.append("provider", aiProvider);
      if (file) form.append("file", file);
      else form.append("text", text);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      setResult(data as AnalysisResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Clickable Citation Click Handler
  const handleCitationClick = (filename: string, chunkIdxText: string) => {
    const cleanFilename = filename.trim();
    const idx = parseInt(chunkIdxText.trim(), 10);

    const doc = indexedDocs.find((d) => d.name === cleanFilename);
    if (doc) {
      const chunk = doc.chunks.find((c) => c.chunkIndex === idx);
      if (chunk) {
        setSelectedCitation({
          sourceName: cleanFilename,
          chunkIndex: idx,
          text: chunk.text,
        });
      }
    }
  };

  // Inline citation badges parser
  function parseInlineFormatting(inputText: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    let tempText = inputText;
    let i = 0;

    while (tempText.length > 0) {
      const boldStart = tempText.indexOf("**");
      const codeStart = tempText.indexOf("`");
      const citeStart = tempText.indexOf("[source:");

      // Check which comes first
      if (citeStart !== -1 && (boldStart === -1 || citeStart < boldStart) && (codeStart === -1 || citeStart < codeStart)) {
        // Citation tag found
        if (citeStart > 0) {
          parts.push(tempText.slice(0, citeStart));
        }
        const citeEnd = tempText.indexOf("]", citeStart);
        if (citeEnd !== -1) {
          const rawCitation = tempText.slice(citeStart + 8, citeEnd); // string between "[source:" and "]"
          const citationParts = rawCitation.split(",");
          const filename = citationParts[0] ?? "unknown";
          const chunkIdx = citationParts[1]?.replace("chunk", "") ?? "0";

          parts.push(
            <span
              key={`cite-${i}`}
              className="citation-badge"
              onClick={() => handleCitationClick(filename, chunkIdx)}
            >
              📄 {filename.substring(0, 12)}... [ch {chunkIdx.trim()}]
            </span>
          );
          tempText = tempText.slice(citeEnd + 1);
        } else {
          parts.push(tempText.slice(citeStart));
          tempText = "";
        }
      } else if (boldStart !== -1 && (codeStart === -1 || boldStart < codeStart)) {
        if (boldStart > 0) {
          parts.push(tempText.slice(0, boldStart));
        }
        const boldEnd = tempText.indexOf("**", boldStart + 2);
        if (boldEnd !== -1) {
          parts.push(<strong key={`b-${i}`}>{tempText.slice(boldStart + 2, boldEnd)}</strong>);
          tempText = tempText.slice(boldEnd + 2);
        } else {
          parts.push(tempText.slice(boldStart));
          tempText = "";
        }
      } else if (codeStart !== -1 && (boldStart === -1 || codeStart < boldStart)) {
        if (codeStart > 0) {
          parts.push(tempText.slice(0, codeStart));
        }
        const codeEnd = tempText.indexOf("`", codeStart + 1);
        if (codeEnd !== -1) {
          parts.push(<code key={`c-${i}`}>{tempText.slice(codeStart + 1, codeEnd)}</code>);
          tempText = tempText.slice(codeEnd + 1);
        } else {
          parts.push(tempText.slice(codeStart));
          tempText = "";
        }
      } else {
        parts.push(tempText);
        tempText = "";
      }
      i++;
    }
    return parts;
  }

  // Custom markdown structures rendering
  function renderMessageContent(rawText: string) {
    if (!rawText) return null;

    const lines = rawText.split("\n");
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    const renderedElements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          inCodeBlock = false;
          renderedElements.push(
            <pre key={`code-${index}`}>
              <code>{codeBlockLines.join("\n")}</code>
            </pre>
          );
          codeBlockLines = [];
        } else {
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        return;
      }

      if (line.startsWith("### ")) {
        renderedElements.push(
          <h3 key={index}>
            {parseInlineFormatting(line.slice(4))}
          </h3>
        );
        return;
      }
      if (line.startsWith("## ")) {
        renderedElements.push(
          <h2 key={index}>
            {parseInlineFormatting(line.slice(3))}
          </h2>
        );
        return;
      }
      if (line.startsWith("# ")) {
        renderedElements.push(
          <h1 key={index}>
            {parseInlineFormatting(line.slice(2))}
          </h1>
        );
        return;
      }

      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const cleanLine = line.trim().slice(2);
        renderedElements.push(
          <ul key={index} className="result-list" style={{ marginTop: "0.25rem", marginBottom: "0.25rem" }}>
            <li style={{ marginBottom: "0.15rem" }}>{parseInlineFormatting(cleanLine)}</li>
          </ul>
        );
        return;
      }

      if (line.trim() === "") {
        renderedElements.push(<div key={index} style={{ height: "0.5rem" }} />);
      } else {
        renderedElements.push(
          <p key={index} style={{ marginBottom: "0.5rem" }}>
            {parseInlineFormatting(line)}
          </p>
        );
      }
    });

    return <div>{renderedElements}</div>;
  }

  const isChatView = activeMode === "chat" || activeMode === "file_query" || activeMode === "medical" || activeMode === "legal";

  return (
    <div className={`app${isChatView ? " app--chat-fullscreen" : ""}`}>
      <header className="app__header">
        <div className="app__header-inner">
          <div className="brand">
            <div className="brand__logo" aria-hidden>
              <BrainCircuit size={22} color="#93c5fd" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="brand__title">CogniDoc Hub</h1>
              <p className="brand__tagline">
                Multi-mode Chat · Multimodal Vault · Fallback LLM · Gemini
              </p>
            </div>
          </div>

          <div className="app__header-actions">
            <label className="provider-switcher">
              <span className="provider-switcher__label">AI Provider</span>
              <select
                className="select provider-switcher__select"
                value={aiProvider}
                onChange={(event) => handleProviderChange(event.target.value)}
                aria-label="Choose AI provider"
                aria-describedby="provider-switcher-hint"
              >
                <option value="openai">OpenAI API</option>
                <option value="lm_studio">LM Studio Local</option>
                <option value="gemini">Gemini API</option>
                <option value="auto">Auto Select</option>
              </select>
              <span className="provider-switcher__hint" id="provider-switcher-hint">
                {aiProvider === "openai" && "Requires OPENAI_API_KEY"}
                {aiProvider === "lm_studio" && "Requires LM Studio running"}
                {aiProvider === "gemini" && "Requires GEMINI_API_KEY"}
                {aiProvider === "auto" && "Uses configured providers"}
              </span>
            </label>

            {/* Header controls for auth */}
            {currentUser ? (
              <div className="btn btn--ghost" style={{ padding: "0.45rem 0.75rem", cursor: "default" }}>
                <span style={{ color: "var(--accent)", fontWeight: "bold", marginRight: "0.35rem" }}>
                  {currentUser.username[0].toUpperCase()}
                </span>
                <span>{currentUser.username}</span>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "var(--text-muted)", marginLeft: "0.50rem", cursor: "pointer" }}
                  onClick={handleLogout}
                  title="Logout"
                >
                  <LogOut size={14} className="hover-red" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setIsLoginOpen(true)}
              >
                <LogIn size={14} /> Login
              </button>
            )}

            {activeMode === "analyze" && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={analyze}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="spin" aria-hidden />
                    Analyzing…
                  </>
                ) : (
                  "Analyze document"
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={`app__main${isChatView ? " app__main--chat-view app__main--chat-fullscreen" : ""}`}>
        {/* Dynamic Sidebar */}
        <aside className={`app__sidebar${isChatView ? " app__sidebar--chat-fullscreen" : ""}`} aria-label="Modes and profiles">
            {isChatView && (
              <section className="card chat-thread-card">
                <div className="chat-thread-pane__header">
                  <h2 className="card__title">
                    <FolderOpen className="card__title-icon" size={16} aria-hidden />
                    Conversations
                  </h2>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={handleNewThread}
                    aria-label="New conversation"
                    title="New conversation"
                  >
                    <Plus size={15} aria-hidden />
                  </button>
                </div>
                <div className="thread-list chat-thread-pane__list">
                  {visibleThreads.map((thread) => (
                    <div className="chat-thread-entry" key={thread.id}>
                      <button
                        type="button"
                        className={`thread-item ${activeThreadId === thread.id ? "thread-item--active" : ""}`}
                        onClick={() => setActiveThreadId(thread.id)}
                        aria-current={activeThreadId === thread.id ? "page" : undefined}
                      >
                        <span className="thread-item__title">{thread.title}</span>
                      </button>
                      <button
                        type="button"
                        className="thread-item__delete hover-red"
                        onClick={(event) => handleDeleteThread(thread.id, event)}
                        aria-label={`Delete ${thread.title}`}
                        title="Delete conversation"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Mode Selector section */}
            <section className="card" style={{ marginBottom: "0.5rem" }}>
              <div className="card__head">
                <h2 className="card__title">
                  <BrainCircuit className="card__title-icon" size={16} aria-hidden />
                  Select Assistant Mode
                </h2>
              </div>
              <div className="card__body" style={{ padding: "0.75rem" }}>
                <div className="mode-list">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`mode-card ${activeMode === m.id ? "mode-card--active" : ""}`}
                      onClick={() => handleModeChange(m.id)}
                    >
                      <div className="mode-card__icon">{m.icon}</div>
                      <div>
                        <span className="mode-card__title">{m.title}</span>
                        <span className="mode-card__desc">{m.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Disclaimers */}
            {activeMode === "medical" && (
              <div className="chat-disclaimer chat-disclaimer--medical">
                <strong>Medical AI Active</strong>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.725rem" }}>
                  Understand symptoms, check reports, or translate prescriptions. Consult with a clinician before taking clinical actions.
                </p>
              </div>
            )}

            {activeMode === "legal" && (
              <div className="chat-disclaimer chat-disclaimer--legal">
                <strong>Legal Guide Active</strong>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.725rem" }}>
                  Understand clauses, verify liability, or summarize conditions. AI findings are educational and not legal advice.
                </p>
              </div>
            )}

            {/* Profile Panel: show ONLY in analyzer mode */}
            {activeMode === "analyze" && (
              <>
                <ProfilePanel profile={profile} onChange={setProfile} />
                <DocumentInput
                  text={text}
                  file={file}
                  onTextChange={setText}
                  onFileChange={setFile}
                  disabled={loading}
                />
              </>
            )}
        </aside>

        {/* Workspaces Rendering */}
        {activeMode === "docs" ? (
          <DocumentManager
            documents={indexedDocs}
            activeDocIds={activeDocIds}
            onToggleActive={handleToggleDocActive}
            onDelete={handleDeleteDoc}
            onTriggerUploadClick={() => directIndexerRef.current?.click()}
          />
        ) : activeMode === "analyze" ? (
          <div className="app__workspace">
            <ResultsPanel
              result={result}
              loading={loading}
              error={error}
              provider={aiProvider}
            />
          </div>
        ) : (
          <div className={`chat-workspace${isChatView ? " chat-workspace--fullscreen" : ""}`}>
            {/* Header top-bar with toggle controls */}
            <div className="card__head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-subtle)", padding: "0.75rem 1.25rem" }}>
              <h2 className="card__title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {MODES.find((m) => m.id === activeMode)?.icon}
                <span>{MODES.find((m) => m.id === activeMode)?.title}</span>
                {activeMode === "file_query" && activeDocIds.length > 0 && (
                  <span style={{ fontSize: "0.725rem", color: "var(--accent)", background: "var(--accent-dim)", padding: "0.15rem 0.35rem", borderRadius: "4px", marginLeft: "0.5rem" }}>
                    RAG Active: {activeDocIds.length} files
                  </span>
                )}
              </h2>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                {chatMessages.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                      onClick={handleExportChatMarkdown}
                      title="Export Chat as Markdown"
                    >
                      <Download size={13} />
                      <span>MD</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                      onClick={handleExportChatWord}
                      title="Export Chat as DOC (Word)"
                    >
                      <Download size={13} />
                      <span>Word</span>
                    </button>
                  </>
                )}

              </div>
            </div>

            {/* Message log */}
            <div className="chat-workspace__messages">
              {chatMessages.length === 0 ? (
                <div className="chat-workspace__empty">
                  <div className="empty-state__icon" style={{ margin: "0 auto 1rem" }}>
                    {MODES.find((m) => m.id === activeMode)?.icon}
                  </div>
                  <h3 className="empty-state__title">
                    {MODES.find((m) => m.id === activeMode)?.title}
                  </h3>
                  <p className="empty-state__text" style={{ maxWidth: "28rem", margin: "0 auto" }}>
                    {activeMode === "chat" && "Start chatting with the assistant. You can upload images, PDF files, audio formats, or video clips below and query them."}
                    {activeMode === "file_query" && "Index document vaults or upload files below to query context, summarize agreements, or extract terms."}
                    {activeMode === "medical" && "Upload a medical report to review its findings, or ask a question about medical terminology. Analysis is informational and includes a medical disclaimer."}
                    {activeMode === "legal" && "Guiding you through contracts, liability agreements, or policies. Upload documents to analyze potential risk details."}
                  </p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`chat-msg chat-msg--${msg.sender === "user" ? "user" : "ai"}`}
                  >
                    <div className="chat-msg__bubble">
                      {renderMessageContent(msg.text)}
                      {msg.sender === "ai" && (
                        <OutputTranslation
                          text={msg.text}
                          provider={aiProvider}
                          renderText={renderMessageContent}
                        />
                      )}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="chat-msg__attachments">
                          {msg.attachments.map((att, i) => (
                            <span key={i} className="chat-attachment-pill">
                              {att.type === "image" && "📷"}
                              {att.type === "file" && "📄"}
                              {att.type === "voice" && "🎙️"}
                              {att.type === "video" && "🎥"}
                              {" "}
                              {att.name}
                              {(activeMode === "medical" || activeMode === "legal") &&
                                !stagedFiles.some((file) => file.name === att.name) && (
                                  <span className="chat-attachment-pill__notice">
                                    {" · re-upload to analyze"}
                                  </span>
                                )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="chat-msg__meta">
                      <span>{msg.sender === "user" ? "You" : "Assistant"}</span>
                      {msg.sender === "ai" && (
                        <>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => speak(msg.id, msg.text, "Chat Response")}
                            className={`tts-trigger-btn ${activeId === msg.id && isPlaying && !isPaused ? "tts-trigger-btn--active" : ""}`}
                            title={activeId === msg.id && isPlaying && !isPaused ? "Pause reading [Alt+P]" : "Read response out loud [Alt+P]"}
                            aria-label={activeId === msg.id && isPlaying && !isPaused ? "Pause reading assistant response" : "Read assistant response out loud"}
                          >
                            {activeId === msg.id && isPlaying && !isPaused ? (
                              <VolumeX size={12} aria-hidden="true" />
                            ) : (
                              <Volume2 size={12} aria-hidden="true" />
                            )}
                          </button>
                        </>
                      )}
                      <span>•</span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="chat-msg chat-msg--ai" role="status" aria-live="polite">
                  <div className="chat-msg__bubble" style={{ background: "rgba(255, 255, 255, 0.01)", border: "none" }}>
                    <span>Processing your request...</span>
                    <div className="thinking">
                      <span className="thinking__dot" />
                      <span className="thinking__dot" />
                      <span className="thinking__dot" />
                    </div>
                  </div>
                </div>
              )}
              {chatError && (
                <div className="alert alert--error" style={{ margin: "1rem 0" }}>
                  {chatError}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input & upload section */}
            <div className="chat-workspace__input-area">
              {stagedFiles.length > 0 && (
                <div className="chat-staged-files">
                  {stagedFiles.map((sf, idx) => (
                    <div key={idx} className="staged-card">
                      <span>
                        {sf.type === "image" && "📷"}
                        {sf.type === "file" && "📄"}
                        {sf.type === "voice" && "🎙️"}
                        {sf.type === "video" && "🎥"}
                      </span>
                      <span className="staged-card__name">{sf.name}</span>
                      {(activeMode === "medical" || activeMode === "legal") && (
                        <span className="staged-card__status">
                          {sf.analyzed ? "Loaded for follow-up" : "Ready to analyze"}
                        </span>
                      )}
                      <button
                        type="button"
                        className="staged-card__remove"
                        onClick={() => removeStagedFile(idx)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {chatUploadError && (
                <div className="alert alert--error" role="alert" style={{ marginBottom: "0.75rem" }}>
                  {chatUploadError}
                </div>
              )}

              <div className="chat-input-row">
                <textarea
                  className="textarea chat-textarea"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    activeMode === "medical"
                      ? "Ask a question about your report (optional)..."
                      : activeMode === "legal"
                        ? "Ask a question about your document (optional)..."
                        : `Send a message in ${MODES.find((m) => m.id === activeMode)?.title}...`
                  }
                  disabled={chatLoading}
                />
                <button
                  type="button"
                  className={`btn btn--primary chat-send-btn${(activeMode === "medical" || activeMode === "legal") && stagedFiles.length > 0 ? " chat-send-btn--analyze" : ""}`}
                  onClick={sendChatMessage}
                  disabled={chatLoading || (!chatInput.trim() && stagedFiles.length === 0)}
                  title={chatLoading ? "Sending message" : "Send message"}
                  aria-label={
                    chatLoading
                      ? "Sending message"
                      : activeMode === "medical" && stagedFiles.length > 0
                      ? "Analyze uploaded medical report"
                      : activeMode === "legal" && stagedFiles.length > 0
                        ? "Analyze uploaded legal document"
                        : "Send message"
                  }
                >
                  {chatLoading ? (
                    <>
                      <Loader2 className="chat-send-btn__spinner" size={16} aria-hidden />
                      <span className="chat-send-btn__label">Sending</span>
                    </>
                  ) : (activeMode === "medical" || activeMode === "legal") && stagedFiles.length > 0 ? (
                    <>
                      <BrainCircuit className="chat-send-btn__icon" size={16} aria-hidden />
                      <span className="chat-send-btn__label">
                        {chatInput.trim()
                        ? activeMode === "medical"
                          ? "Ask about report"
                          : "Ask about document"
                        : stagedFiles.every((file) => file.analyzed)
                          ? "Analyze again"
                          : activeMode === "medical"
                            ? "Analyze report"
                            : "Analyze document"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="chat-send-btn__label">Send</span>
                      <Send className="chat-send-btn__icon" size={16} aria-hidden />
                    </>
                  )}
                </button>
              </div>

              {/* Upload toggles row */}
              {activeMode === "medical" || activeMode === "legal" ? (
                <div
                  className={`document-upload${documentUploadDragOver ? " document-upload--active" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDocumentUploadDragOver(true);
                  }}
                  onDragLeave={() => setDocumentUploadDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDocumentUploadDragOver(false);
                    const droppedFile = event.dataTransfer.files[0];
                    if (droppedFile) {
                      stageFile(
                        droppedFile,
                        droppedFile.type.startsWith("image/") ? "image" : "file",
                      );
                    }
                  }}
                >
                  <input
                    ref={chatDocumentInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif"
                    hidden
                    disabled={chatLoading}
                    onChange={(event) => handleFileSelect(event, "file")}
                  />
                  <div>
                    <strong>
                      {activeMode === "medical"
                        ? "Upload a medical report"
                        : "Upload a legal document"}
                    </strong>
                    <p>
                      PDF, DOCX, TXT, MD, CSV, JSON, or PNG/JPG/WEBP/GIF · up to 15 MB
                    </p>
                  </div>
                  <button
                    type="button"
                    className="upload-toggle-btn"
                    onClick={() => chatDocumentInputRef.current?.click()}
                    disabled={chatLoading}
                  >
                    <Upload size={14} />
                    {activeMode === "medical" ? "Choose report" : "Choose document"}
                  </button>
                  <span className="document-upload__hint">
                    or drag and drop {activeMode === "medical" ? "here" : "a document here"}
                  </span>
                </div>
              ) : (
              <div className="chat-upload-row">
                <span className="chat-upload-row__label">
                  Attach to this chat:
                </span>

                <input
                  type="file"
                  accept="image/*"
                  ref={imageInputRef}
                  style={{ display: "none" }}
                  onChange={(e) => handleFileSelect(e, "image")}
                />
                <button
                  type="button"
                  className="upload-toggle-btn"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={chatLoading}
                >
                  <ImageIcon size={14} /> Image
                </button>

                <input
                  type="file"
                  accept=".pdf,.txt,.md,.csv,.json,.docx"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={(e) => handleFileSelect(e, "file")}
                />
                <button
                  type="button"
                  className="upload-toggle-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={chatLoading}
                >
                  <FileText size={14} /> File
                </button>

                <input
                  type="file"
                  accept="audio/*"
                  ref={voiceInputRef}
                  style={{ display: "none" }}
                  onChange={(e) => handleFileSelect(e, "voice")}
                />
                <button
                  type="button"
                  className="upload-toggle-btn"
                  onClick={() => voiceInputRef.current?.click()}
                  disabled={chatLoading}
                >
                  <Mic size={14} /> Voice
                </button>

                <input
                  type="file"
                  accept="video/*"
                  ref={videoInputRef}
                  style={{ display: "none" }}
                  onChange={(e) => handleFileSelect(e, "video")}
                />
                <button
                  type="button"
                  className="upload-toggle-btn"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={chatLoading}
                >
                  <Video size={14} /> Video
                </button>

                <div style={{ marginLeft: "auto", display: "flex", gap: "0.35rem" }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                    onClick={clearChatHistory}
                    disabled={chatMessages.length === 0 && stagedFiles.length === 0}
                  >
                    Clear Chat
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Hidden file input for Document Indexer uploads */}
      <input
        type="file"
        accept=".pdf,.docx,.txt,.md,.csv,image/*"
        ref={directIndexerRef}
        style={{ display: "none" }}
        onChange={uploadAndIndexFile}
      />

      {/* Mock Authentication Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />

      {/* RAG Clickable Citation Viewer Overlay */}
      {selectedCitation && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: "550px" }}>
            <div className="modal-card__header">
              <h3 className="modal-card__title">
                Source Document Chunk Citation
              </h3>
              <button
                type="button"
                className="modal-card__close"
                onClick={() => setSelectedCitation(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-card__body">
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                <span>File: <strong>{selectedCitation.sourceName}</strong></span>
                <span>Chunk Index: <strong>{selectedCitation.chunkIndex}</strong></span>
              </div>
              <div
                style={{
                  background: "rgba(0, 0, 0, 0.2)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "1rem",
                  fontSize: "0.85rem",
                  lineHeight: "1.6",
                  color: "var(--text-secondary)",
                  maxHeight: "300px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {selectedCitation.text}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setSelectedCitation(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loader Modal when document indexing is running */}
      {isIndexing && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: "320px", textAlign: "center" }}>
            <div className="modal-card__body" style={{ padding: "2rem 1.5rem" }}>
              <Loader2 size={32} className="spin" style={{ color: "var(--accent)", margin: "0 auto 1rem" }} />
              <h4 style={{ margin: "0 0 0.5rem", color: "var(--text-primary)" }}>Extracting Document...</h4>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Parsing text chunks and building local RAG index. Please wait.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Floating Voiceover Controller Panel */}
      <VoiceOverController />
    </div>
  );
}

// Inline custom X icon component since we use it in modals
function X({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
