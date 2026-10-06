const MAX_CHARS = 120_000;

export function truncateDocument(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CHARS) return trimmed;
  return (
    trimmed.slice(0, MAX_CHARS) +
    "\n\n[Document truncated for analysis length limits.]"
  );
}

import { createRequire } from "module";
import fs from "fs";

/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof process !== "undefined" && !(process as any).getBuiltinModule) {
  (process as any).getBuiltinModule = (name: string): object => {
    if (name === "fs") return fs;
    if (name === "module") return { createRequire };
    throw new Error(`Unsupported builtin module: ${name}`);
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const supportedRuntime =
    (major === 20 && minor >= 16) ||
    (major === 22 && minor >= 3) ||
    major >= 24;
  if (!supportedRuntime) {
    throw new Error(
      `PDF parsing requires Node.js 20.16+, 22.3+, or 24+. Current runtime: ${process.versions.node}.`,
    );
  }

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const extractedText = result.text?.trim() ?? "";
    if (extractedText.length >= 100) return truncateDocument(extractedText);

    const screenshot = await parser.getScreenshot({
      scale: 1.5,
      first: 20,
      imageBuffer: true,
      imageDataUrl: false,
    });
    if (screenshot.pages.length === 0) return truncateDocument(extractedText);

    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const recognizedPages: string[] = [];
      for (const page of screenshot.pages) {
        const recognized = await worker.recognize(Buffer.from(page.data));
        const text = recognized.data.text.trim();
        if (text) recognizedPages.push(text);
      }

      const ocrText = recognizedPages.join("\n\n");
      const combinedText = [extractedText, ocrText]
        .filter(Boolean)
        .join("\n\n");
      const pageLimitNotice = screenshot.total > screenshot.pages.length
        ? `\n\n[OCR processed the first ${screenshot.pages.length} of ${screenshot.total} pages.]`
        : "";
      return truncateDocument(`${combinedText}${pageLimitNotice}`);
    } finally {
      await worker.terminate();
    }
  } finally {
    await parser.destroy();
  }
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.default.extractRawText({ buffer });
  return truncateDocument(result.value ?? "");
}

export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker();
  try {
    const ret = await worker.recognize(buffer);
    return truncateDocument(ret.data.text ?? "");
  } finally {
    await worker.terminate();
  }
}

export function extractPlainText(content: string): string {
  return truncateDocument(content);
}
