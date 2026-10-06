import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import OpenAI from "openai";
import {
  buildAdaptivePrompt,
  buildTraditionalPrompt,
} from "./prompts";
import type {
  AdaptiveAnalysis,
  AnalysisResult,
  ReaderProfile,
  TraditionalAnalysis,
} from "./types";
import { extractTextFromDocx, extractTextFromPdf, extractPlainText } from "./extract-text";

export interface ChatMessageInput {
  role: "user" | "model";
  content: string;
  files?: {
    name: string;
    mimeType: string;
    data: string; // base64
  }[];
}

export type AIProvider = "auto" | "openai" | "gemini" | "lm_studio";

function getModel(
  responseMimeType: "application/json" | "text/plain" = "text/plain",
  systemInstruction?: string
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
    generationConfig: {
      responseMimeType,
      temperature: 0.4,
    },
  });
}

async function getFileContext(f: { name: string; mimeType: string; data: string }): Promise<string> {
  const name = f.name.toLowerCase();
  const buffer = Buffer.from(f.data, "base64");
  if (name.endsWith(".pdf")) {
    try {
      const text = await extractTextFromPdf(buffer);
      return `--- START OF ATTACHED FILE (${f.name}) ---\n${text}\n--- END OF ATTACHED FILE ---`;
    } catch (e) {
      return `[Error extracting text from PDF ${f.name}: ${e instanceof Error ? e.message : String(e)}]`;
    }
  } else if (
    name.endsWith(".docx") ||
    f.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const text = await extractTextFromDocx(buffer);
      return `--- START OF ATTACHED FILE (${f.name}) ---\n${text}\n--- END OF ATTACHED FILE ---`;
    } catch (e) {
      return `[Error extracting text from Word document ${f.name}: ${e instanceof Error ? e.message : String(e)}]`;
    }
  } else if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".json") ||
    f.mimeType === "application/json" ||
    f.mimeType.startsWith("text/")
  ) {
    const text = extractPlainText(buffer.toString("utf-8"));
    return `--- START OF ATTACHED FILE (${f.name}) ---\n${text}\n--- END OF ATTACHED FILE ---`;
  }
  return `[Attached Multimodal File: ${f.name} (type: ${f.mimeType}) - Note: Multimodal files require Gemini API. If using Local LLM, we can only read text-based documents.]`;
}

async function callLMStudio(messages: ChatMessageInput[], systemInstruction: string): Promise<string> {
  const baseUrl = process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1";
  let modelName = process.env.LM_STUDIO_MODEL;

  if (!modelName) {
    try {
      const response = await fetch(`${baseUrl}/models`);
      if (response.ok) {
        const modelsData = await response.json();
        if (modelsData.data && modelsData.data.length > 0) {
          modelName = modelsData.data[0].id;
        }
      }
    } catch (e) {
      console.warn("LM Studio auto-detect model failed", e);
    }
    if (!modelName) {
      modelName = "meta-llama-3.2-3b-instruct";
    }
  }

  const lmStudioMessages = [
    { role: "system", content: systemInstruction },
  ];

  for (const m of messages) {
    let contentText = m.content;
    if (m.files && m.files.length > 0) {
      const fileContexts: string[] = [];
      for (const f of m.files) {
        const ctx = await getFileContext(f);
        fileContexts.push(ctx);
      }
      contentText = `${fileContexts.join("\n\n")}\n\n${contentText}`;
    }
    lmStudioMessages.push({
      role: m.role === "model" ? "assistant" : "user",
      content: contentText,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages: lmStudioMessages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("LM Studio request timed out after 120 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LM Studio API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(messages: ChatMessageInput[], systemInstruction: string): Promise<string> {
  const model = getModel("text/plain", systemInstruction);

  const contents = await Promise.all(
    messages.map(async (m) => {
      const parts: Part[] = [];
      
      if (m.files && m.files.length > 0) {
        for (const f of m.files) {
          const type = f.mimeType.toLowerCase();
          if (
            type.startsWith("image/") ||
            type.startsWith("audio/") ||
            type.startsWith("video/") ||
            type === "application/pdf"
          ) {
            parts.push({
              inlineData: {
                data: f.data,
                mimeType: f.mimeType,
              },
            });
          } else {
            const ctx = await getFileContext(f);
            parts.push({ text: ctx });
          }
        }
      }

      parts.push({ text: m.content || " " });

      return {
        role: m.role === "model" ? "model" : "user",
        parts,
      };
    })
  );

  const result = await model.generateContent({
    contents,
  });

  return result.response.text();
}

async function callOpenAI(
  messages: ChatMessageInput[],
  systemInstruction: string,
  jsonMode = false,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey, timeout: 120_000 });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemInstruction },
  ];

  for (const message of messages) {
    const textParts: string[] = [];
    const imageParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    for (const file of message.files ?? []) {
      const mimeType = file.mimeType.toLowerCase();
      if (mimeType.startsWith("image/")) {
        imageParts.push({
          type: "image_url",
          image_url: {
            url: `data:${file.mimeType};base64,${file.data}`,
          },
        });
      } else if (
        mimeType === "application/pdf" ||
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mimeType === "application/json" ||
        mimeType.startsWith("text/") ||
        /\.(pdf|docx|txt|md|csv|json)$/i.test(file.name)
      ) {
        textParts.push(await getFileContext(file));
      } else {
        throw new Error(
          `OpenAI chat currently supports image, PDF, and text attachments. Unsupported attachment: ${file.name}.`,
        );
      }
    }

    const content = [
      ...textParts,
      message.content,
    ].filter(Boolean).join("\n\n");

    if (message.role === "model") {
      openAIMessages.push({ role: "assistant", content });
    } else if (imageParts.length > 0) {
      openAIMessages.push({
        role: "user",
        content: [
          ...(content ? [{ type: "text" as const, text: content }] : []),
          ...imageParts,
        ],
      });
    } else {
      openAIMessages.push({ role: "user", content });
    }
  }

  const result = await client.chat.completions.create({
    model,
    messages: openAIMessages,
    temperature: jsonMode ? 0.1 : 0.7,
    max_completion_tokens: jsonMode ? 4096 : 2048,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });

  return result.choices[0]?.message?.content ?? "";
}

export async function chatWithGemini(
  messages: ChatMessageInput[],
  systemInstruction: string,
  provider: AIProvider = "auto"
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;
  const hasMultimodal = messages.some((m) =>
    m.files?.some((f) => {
      const type = f.mimeType.toLowerCase();
      return type.startsWith("image/") || type.startsWith("audio/") || type.startsWith("video/");
    })
  );

  if (provider === "openai") {
    return callOpenAI(messages, systemInstruction);
  }

  if (provider === "lm_studio") {
    if (hasMultimodal && !apiKey) {
      throw new Error(
        "Multimodal inputs (images, audio, video) require a Gemini API key. Local LLM does not support audio/video/images."
      );
    }
    try {
      return await callLMStudio(messages, systemInstruction);
    } catch (e) {
      if (apiKey) {
        console.warn("LM Studio failed, falling back to Gemini:", e);
        return await callGemini(messages, systemInstruction);
      }
      throw e;
    }
  }

  if (provider === "gemini") {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    try {
      return await callGemini(messages, systemInstruction);
    } catch (e) {
      if (!hasMultimodal) {
        console.warn("Gemini failed, falling back to LM Studio:", e);
        try {
          return await callLMStudio(messages, systemInstruction);
        } catch (lmErr) {
          throw new Error(
            `Gemini error: ${e instanceof Error ? e.message : String(e)}. Fallback LM Studio error: ${
              lmErr instanceof Error ? lmErr.message : String(lmErr)
            }`
          );
        }
      }
      throw e;
    }
  }

  // provider === "auto"
  if (openAIKey) {
    return callOpenAI(messages, systemInstruction);
  }

  if (apiKey) {
    try {
      return await callGemini(messages, systemInstruction);
    } catch (e) {
      if (!hasMultimodal) {
        console.warn("Gemini call failed under Auto provider, falling back to LM Studio:", e);
        try {
          return await callLMStudio(messages, systemInstruction);
        } catch {
          throw e; // throw original Gemini error if fallback fails
        }
      }
      throw e;
    }
  } else {
    if (hasMultimodal) {
      throw new Error(
        "Multimodal inputs (images, audio, video) require a Gemini API key. Please configure GEMINI_API_KEY."
      );
    }
    return await callLMStudio(messages, systemInstruction);
  }
}

async function queryLMStudio(prompt: string): Promise<string> {
  const baseUrl = process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1";
  let modelName = process.env.LM_STUDIO_MODEL;

  // Auto-detect loaded model in LM Studio if not specified
  if (!modelName) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const modelsResponse = await fetch(`${baseUrl}/models`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json();
        if (modelsData.data && modelsData.data.length > 0) {
          modelName = modelsData.data[0].id;
        }
      }
    } catch (e) {
      console.warn("Failed to auto-detect loaded model from LM Studio:", e);
    }
  }

  // Fallback if still not found
  if (!modelName) {
    modelName = "meta-llama-3.2-3b-instruct";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        response_format: { type: "text" },
        messages: [
          {
            role: "system",
            content: "You are a structured JSON generator. You must output ONLY a valid, parseable JSON object matching the user's requested schema. Do not include any introductory text, warnings, conversational filler, or explanations outside the JSON object. Return ONLY the raw JSON. Double check that every string field uses double quotes, and that double quotes inside strings are correctly escaped as \\\" (backslash double quote). Do not add trailing commas.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("LM Studio request timed out after 120 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LM Studio API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response received from LM Studio");
  }

  return content;
}

function repairJson(jsonStr: string): string {
  let repaired = jsonStr.trim();
  
  // Remove trailing commas before closing braces/brackets
  repaired = repaired.replace(/,\s*([\]}])/g, "$1");
  
  return repaired;
}

function autoCloseJson(jsonStr: string): string {
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") {
        stack.push("}");
      } else if (char === "[") {
        stack.push("]");
      } else if (char === "}") {
        if (stack[stack.length - 1] === "}") {
          stack.pop();
        }
      } else if (char === "]") {
        if (stack[stack.length - 1] === "]") {
          stack.pop();
        }
      }
    }
  }

  let closed = jsonStr.trim();
  
  if (inString) {
    closed += '"';
  } else {
    // 1. If it ends with a colon, the value was missing. Strip the colon.
    if (closed.endsWith(":")) {
      closed = closed.slice(0, -1).trim();
      // Strip the trailing key name
      closed = closed.replace(/"[a-zA-Z0-9_-]+"\s*$/, "").trim();
      // Strip any trailing comma that was before the key
      if (closed.endsWith(",")) {
        closed = closed.slice(0, -1).trim();
      }
    } 
    // 2. If it ends with an unclosed key (a double quoted string without a preceding colon)
    else {
      const lastQuoteIndex = closed.lastIndexOf('"');
      if (lastQuoteIndex !== -1) {
        const secondToLastQuoteIndex = closed.lastIndexOf('"', lastQuoteIndex - 1);
        if (secondToLastQuoteIndex !== -1) {
          const beforeKey = closed.slice(0, secondToLastQuoteIndex).trim();
          // If the character before the key is NOT a colon, then this quoted string is a key. Strip it.
          if (!beforeKey.endsWith(":")) {
            closed = closed.slice(0, secondToLastQuoteIndex).trim();
            if (closed.endsWith(",")) {
              closed = closed.slice(0, -1).trim();
            }
          }
        }
      }
    }

    // 3. Finally, if it ends with a comma, strip it
    if (closed.endsWith(",")) {
      closed = closed.slice(0, -1).trim();
    }
  }

  // Append closing brackets/braces in reverse order
  while (stack.length > 0) {
    const closeChar = stack.pop();
    closed += closeChar;
  }

  return closed;
}

function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  
  // Try standard extraction first
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  
  if (start !== -1 && end !== -1 && end > start) {
    const jsonStr = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(jsonStr) as T;
    } catch (e) {
      console.warn("Failed to parse extracted JSON block directly. Attempting to repair JSON.", e);
      try {
        const repaired = repairJson(jsonStr);
        return JSON.parse(repaired) as T;
      } catch {
        // Fall through to auto-closing attempt below
      }
    }
  }

  // If extraction or parsing failed, check if we have a truncated JSON block starting with '{'
  if (start !== -1) {
    const jsonSubStr = trimmed.slice(start);
    console.warn("Attempting to auto-close potentially truncated JSON response...");
    try {
      const closedJson = autoCloseJson(jsonSubStr);
      const repaired = repairJson(closedJson);
      return JSON.parse(repaired) as T;
    } catch {
      console.error("Auto-close failed. Truncated content was:", jsonSubStr);
    }
  }

  // Fallback to cleaned text parser
  const cleaned = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    console.warn("Failed to parse cleaned text block. Attempting to repair JSON.", e);
    try {
      const repaired = repairJson(cleaned);
      return JSON.parse(repaired) as T;
    } catch {
      console.error("JSON parsing and repair failed for cleaned content. Content was:", cleaned);
      throw new Error(`Failed to parse LLM response as JSON. Error: ${(e as Error).message}. Raw content was: ${raw}`);
    }
  }
}

async function generateTraditional(
  documentText: string,
  provider: AIProvider,
): Promise<TraditionalAnalysis> {
  const useLocal = provider === "lm_studio" ||
    (provider === "auto" && !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && process.env.USE_LOCAL_LLM === "true");
  const prompt = buildTraditionalPrompt(documentText);
  let text: string;

  if (useLocal) {
    text = await queryLMStudio(prompt);
  } else if (provider === "openai" || (provider === "auto" && process.env.OPENAI_API_KEY)) {
    text = await callOpenAI(
      [{ role: "user", content: prompt }],
      "Return only a valid JSON object matching the requested schema.",
      true,
    );
  } else {
    const model = getModel("application/json");
    const result = await model.generateContent(prompt);
    text = result.response.text();
  }

  return parseJson<TraditionalAnalysis>(text);
}

async function generateAdaptive(
  documentText: string,
  profile: ReaderProfile,
  traditional: TraditionalAnalysis,
  provider: AIProvider,
): Promise<{ adaptive: AdaptiveAnalysis; disclaimer: string }> {
  const useLocal = provider === "lm_studio" ||
    (provider === "auto" && !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && process.env.USE_LOCAL_LLM === "true");
  const prompt = buildAdaptivePrompt(documentText, profile, traditional);
  let text: string;

  if (useLocal) {
    text = await queryLMStudio(prompt);
  } else if (provider === "openai" || (provider === "auto" && process.env.OPENAI_API_KEY)) {
    text = await callOpenAI(
      [{ role: "user", content: prompt }],
      "Return only a valid JSON object matching the requested schema.",
      true,
    );
  } else {
    const model = getModel("application/json");
    const result = await model.generateContent(prompt);
    text = result.response.text();
  }

  const parsed = parseJson<
    AdaptiveAnalysis & { disclaimer?: string }
  >(text);
  const { disclaimer, ...adaptive } = parsed;
  return {
    adaptive: adaptive as AdaptiveAnalysis,
    disclaimer:
      disclaimer ??
      "This tool adapts tone and pacing from your profile. It is not medical, psychological, or legal advice.",
  };
}

export async function analyzeDocument(
  documentText: string,
  profile: ReaderProfile,
  provider: AIProvider = "auto",
): Promise<AnalysisResult> {
  const traditional = await generateTraditional(documentText, provider);
  const { adaptive, disclaimer } = await generateAdaptive(
    documentText,
    profile,
    traditional,
    provider,
  );
  return { traditional, adaptive, disclaimer };
}
