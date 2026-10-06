import { NextResponse } from "next/server";
import { chatWithGemini, type AIProvider, type ChatMessageInput } from "@/lib/gemini";
import {
  extractPlainText,
  extractTextFromDocx,
  extractTextFromImage,
  extractTextFromPdf,
} from "@/lib/extract-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function includeReportText(messages: ChatMessageInput[]): Promise<ChatMessageInput[]> {
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  if (lastUserIndex === -1) return messages;

  const lastUserMessage = messages[lastUserIndex];
  if (!lastUserMessage.files?.length) return messages;

  const documentParts: string[] = [];
  const retainedFiles: NonNullable<ChatMessageInput["files"]> = [];

  for (const file of lastUserMessage.files) {
    const name = file.name.toLowerCase();
    const mimeType = file.mimeType.toLowerCase();
    const extension = name.slice(name.lastIndexOf("."));
    const buffer = Buffer.from(file.data, "base64");
    let extractedText: string | null = null;

    if (name.endsWith(".pdf") || mimeType === "application/pdf") {
      extractedText = await extractTextFromPdf(buffer);
    } else if (
      name.endsWith(".docx") ||
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      extractedText = await extractTextFromDocx(buffer);
    } else if (
      name.endsWith(".txt") ||
      name.endsWith(".md") ||
      name.endsWith(".csv") ||
      name.endsWith(".json") ||
      mimeType.startsWith("text/") ||
      mimeType === "application/json"
    ) {
      extractedText = extractPlainText(buffer.toString("utf-8"));
    } else if (
      mimeType.startsWith("image/") ||
      Object.hasOwn(FALLBACK_IMAGE_MIME_TYPES, extension)
    ) {
      extractedText = await extractTextFromImage(buffer);
      retainedFiles.push({
        ...file,
        mimeType: mimeType.startsWith("image/")
          ? file.mimeType
          : FALLBACK_IMAGE_MIME_TYPES[extension],
      });
      if (!extractedText.trim()) extractedText = null;
    } else {
      retainedFiles.push(file);
    }

    if (extractedText !== null) {
      if (!extractedText.trim()) {
        throw new Error(`No readable text could be extracted from "${file.name}".`);
      }
      documentParts.push(
        `--- BEGIN UPLOADED REPORT: ${file.name} ---\n${extractedText}\n--- END UPLOADED REPORT ---`,
      );
    }
  }

  if (documentParts.length === 0) return messages;

  const updatedMessages = [...messages];
  updatedMessages[lastUserIndex] = {
    ...lastUserMessage,
    content: [
      lastUserMessage.content,
      "The following text was extracted from the report attached to this message. Analyze this report directly; it is present in the current message.",
      ...documentParts,
    ].filter(Boolean).join("\n\n"),
    files: retainedFiles,
  };

  return updatedMessages;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, mode, provider, contextChunks } = body as {
      messages: ChatMessageInput[];
      mode: "chat" | "file_query" | "medical" | "legal";
      provider?: AIProvider;
      contextChunks?: Array<{ text: string; sourceName: string; chunkIndex: number }>;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Provide a valid messages array." },
        { status: 400 }
      );
    }

    if (mode === "medical" || mode === "legal") {
      const maxFileBytes = 15 * 1024 * 1024;
      const supportedReport = /\.(pdf|docx|txt|md|csv|json|png|jpe?g|webp|gif)$/i;
      const documentLabel = mode === "medical" ? "medical report" : "legal document";
      for (const message of messages) {
        for (const file of message.files ?? []) {
          if (
            typeof file.name !== "string" ||
            typeof file.mimeType !== "string" ||
            typeof file.data !== "string"
          ) {
            return NextResponse.json(
              { error: `The ${documentLabel} upload is invalid. Please upload it again.` },
              { status: 400 },
            );
          }
          if (!supportedReport.test(file.name)) {
            return NextResponse.json(
              { error: `Unsupported ${documentLabel} type: ${file.name}. Upload a PDF, DOCX, text, CSV, JSON, or supported image file.` },
              { status: 400 },
            );
          }
          if (file.data.length > Math.ceil((maxFileBytes * 4) / 3) + 4) {
            return NextResponse.json(
              { error: `The ${documentLabel} exceeds the 15 MB limit.` },
              { status: 413 },
            );
          }
          if (Buffer.byteLength(file.data, "base64") > maxFileBytes) {
            return NextResponse.json(
              { error: `The ${documentLabel} exceeds the 15 MB limit.` },
              { status: 413 },
            );
          }
        }
      }
    }

    // Determine system instructions based on the mode
    let systemInstruction = "";
    switch (mode) {
      case "medical":
        systemInstruction = 
          "You are a careful Medical AI Assistant. Help users understand medical concepts, symptoms, reports, prescriptions, and terminology in clear, non-diagnostic language. " +
          "When a report is attached to the user's latest message, the attachment and, when readable, its extracted text are included in that message. Analyze the supplied report directly, identify it by filename when possible, and never claim that no document was provided. A prior chat turn may reference a previously uploaded filename without including its contents in this request; acknowledge that it was previously uploaded and ask for a re-upload only if you need to inspect the missing contents. If current attachment contents cannot be read, explain what could not be accessed instead of guessing. Do not invent findings or provide a diagnosis or treatment plan. " +
          "ALWAYS format your response clearly, using bullet points, bold text, or lists where appropriate. " +
          "CRITICAL: Always start or end your message with a prominent medical warning/disclaimer: 'DISCLAIMER: I am an AI, not a doctor. This information is for educational and informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. Please consult with a healthcare professional before making any medical decisions.' " +
          "Be empathetic, clear, objective, and detailed in your explanations.";
        break;
      case "legal":
        systemInstruction =
          "You are an expert Legal AI Assistant. Your goal is to guide users through legal documents, explain agreements, contracts, clauses, terms of service, policies, or explain legal concepts in simple, accessible language. " +
          "When a document is attached to the user's latest message, the attachment and, when readable, its extracted text are included in that message. Analyze the supplied document directly, identify it by filename when possible, and never claim that no document was provided. A prior chat turn may reference a previously uploaded filename without including its contents in this request; acknowledge that it was previously uploaded and ask for a re-upload only if you need to inspect the missing contents. If current attachment contents cannot be read, explain what could not be accessed instead of guessing. " +
          "Highlight potential risks, ambiguous clauses, important deadlines, and key commitments. " +
          "CRITICAL: Always start or end your message with a prominent legal warning/disclaimer: 'DISCLAIMER: I am an AI, not a lawyer. My analysis is for informational and educational guidance only and does not constitute legal advice or create an attorney-client relationship.' " +
          "Be highly analytical, objective, and precise.";
        break;
      case "file_query":
        systemInstruction =
          "You are a multimodal document and media explorer. Analyze the uploaded files, images, videos, or audio recordings and answer any user questions about them. " +
          "Extract and highlight key information, write summaries, find specific details, or explain visual/audio data as requested. " +
          "Be direct, accurate, and focus heavily on the contents of the attached documents or media.";
        break;
      case "chat":
      default:
        systemInstruction =
          "You are a helpful, friendly, and knowledgeable AI assistant. You can chat about anything, answer questions, solve problems, write code, and assist the user with any tasks. " +
          "If the user uploads files, images, video, or audio, help them query and understand the contents. Provide clear, detailed, and nicely formatted responses.";
        break;
    }

    // Inject RAG context if available
    if (contextChunks && contextChunks.length > 0) {
      let contextStr = "RELEVANT DOCUMENT CONTEXT:\n";
      contextChunks.forEach((c) => {
        contextStr += `[source: ${c.sourceName}, chunk ${c.chunkIndex}]: "${c.text}"\n\n`;
      });
      contextStr += "INSTRUCTION: Answer the query using the document contexts above. Cite sources inside your answers using [source: filename, chunk index] format.\n\n";

      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        lastMsg.content = `${contextStr}User Query: ${lastMsg.content}`;
      }
    }

    const chatMessages = mode === "medical" || mode === "legal"
      ? await includeReportText(messages)
      : messages;
    const reply = await chatWithGemini(chatMessages, systemInstruction, provider ?? "auto");
    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat request failed.";
    let status = 500;
    let userMessage = message;

    if (message.includes("No readable text could be extracted")) {
      status = 422;
    } else if (message.includes("GEMINI_API_KEY")) {
      status = 503;
    } else if (message.includes("OPENAI_API_KEY")) {
      status = 503;
    } else if (
      message.includes("fetch failed") ||
      message.includes("LM Studio") ||
      message.includes("ECONNREFUSED")
    ) {
      status = 503;
      userMessage = `Failed to connect to local LLM. Please make sure LM Studio is running at the configured URL (${process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1"}) and the model is fully loaded. Error detail: ${message}`;
    }

    return NextResponse.json({ error: userMessage }, { status });
  }
}
