import { NextResponse } from "next/server";
import { analyzeDocument, type AIProvider } from "@/lib/gemini";
import {
  extractPlainText,
  extractTextFromPdf,
} from "@/lib/extract-text";
import { DEFAULT_PROFILE, type ReaderProfile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mergeProfile(raw: Partial<ReaderProfile> | undefined): ReaderProfile {
  if (!raw) return DEFAULT_PROFILE;
  return {
    ...DEFAULT_PROFILE,
    ...raw,
    preferences: {
      ...DEFAULT_PROFILE.preferences,
      ...raw.preferences,
    },
  };
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let documentText = "";
    let profile = DEFAULT_PROFILE;
    let provider: AIProvider = "auto";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const textField = form.get("text");
      const profileField = form.get("profile");
      const providerField = form.get("provider");

      if (
        typeof providerField === "string" &&
        ["auto", "openai", "gemini", "lm_studio"].includes(providerField)
      ) {
        provider = providerField as AIProvider;
      }

      if (profileField && typeof profileField === "string") {
        profile = mergeProfile(JSON.parse(profileField) as ReaderProfile);
      }

      if (textField && typeof textField === "string" && textField.trim()) {
        documentText = extractPlainText(textField);
      } else if (file instanceof File) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const name = file.name.toLowerCase();
        if (name.endsWith(".pdf")) {
          documentText = await extractTextFromPdf(buffer);
        } else if (
          name.endsWith(".txt") ||
          name.endsWith(".md") ||
          name.endsWith(".csv")
        ) {
          documentText = extractPlainText(buffer.toString("utf-8"));
        } else {
          return NextResponse.json(
            { error: "Unsupported file type. Use PDF, TXT, MD, or CSV." },
            { status: 400 },
          );
        }
      }
    } else {
      const body = (await request.json()) as {
        text?: string;
        profile?: Partial<ReaderProfile>;
        provider?: AIProvider;
      };
      profile = mergeProfile(body.profile);
      provider = body.provider ?? "auto";
      if (body.text?.trim()) {
        documentText = extractPlainText(body.text);
      }
    }

    if (!documentText.trim()) {
      return NextResponse.json(
        { error: "Provide document text or upload a file." },
        { status: 400 },
      );
    }

    const result = await analyzeDocument(documentText, profile, provider);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Analysis failed.";
    let status = 500;
    let userMessage = message;

    if (message.includes("GEMINI_API_KEY")) {
      status = 503;
    } else if (message.includes("OPENAI_API_KEY")) {
      status = 503;
    } else if (
      message.includes("exceeds the available context size") ||
      message.includes("exceed_context_size_error")
    ) {
      status = 413;
      userMessage =
        "The loaded LM Studio model's context window is too small for this document. In LM Studio, increase the model's Context Length to at least 16,384 tokens, then unload and reload the model. You can also switch the provider to Gemini or analyze a shorter document.";
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
