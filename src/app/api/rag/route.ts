import { NextResponse } from "next/server";
import {
  extractTextFromPdf,
  extractTextFromDocx,
  extractTextFromImage,
  extractPlainText,
} from "@/lib/extract-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DocumentChunk {
  text: string;
  sourceName: string;
  chunkIndex: number;
}

function chunkText(text: string, sourceName: string): DocumentChunk[] {
  const words = text.split(/\s+/);
  const chunks: DocumentChunk[] = [];
  let startIndex = 0;
  let chunkIdx = 0;

  // Approx 150 words per chunk (~800 characters) with 30 words overlap
  while (startIndex < words.length) {
    const endIndex = Math.min(startIndex + 150, words.length);
    const chunkWords = words.slice(startIndex, endIndex);
    const chunkTextStr = chunkWords.join(" ");

    chunks.push({
      text: chunkTextStr,
      sourceName,
      chunkIndex: chunkIdx++,
    });

    if (endIndex === words.length) break;
    startIndex += 120; // 30 words overlap
  }
  return chunks;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    // Action 1: Upload and Extract/Chunk
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing file in form data." }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const name = file.name;
      const nameLower = name.toLowerCase();
      let extractedText = "";

      if (nameLower.endsWith(".pdf")) {
        extractedText = await extractTextFromPdf(buffer);
      } else if (nameLower.endsWith(".docx")) {
        extractedText = await extractTextFromDocx(buffer);
      } else if (
        nameLower.endsWith(".png") ||
        nameLower.endsWith(".jpg") ||
        nameLower.endsWith(".jpeg") ||
        nameLower.endsWith(".webp")
      ) {
        extractedText = await extractTextFromImage(buffer);
      } else if (
        nameLower.endsWith(".txt") ||
        nameLower.endsWith(".md") ||
        nameLower.endsWith(".csv")
      ) {
        extractedText = extractPlainText(buffer.toString("utf-8"));
      } else {
        return NextResponse.json(
          { error: "Unsupported file type. Use PDF, DOCX, TXT, MD, CSV, or Image files." },
          { status: 400 }
        );
      }

      if (!extractedText.trim()) {
        return NextResponse.json({ error: "No text could be extracted from the document." }, { status: 400 });
      }

      const chunks = chunkText(extractedText, name);
      return NextResponse.json({
        textPreview: extractedText.slice(0, 300) + "...",
        chunks,
      });
    }

    // Action 2: Retrieve Relevance-Scored Context chunks for RAG query
    const body = await request.json();
    const { query, chunks } = body as { query: string; chunks: DocumentChunk[] };

    if (!query || !chunks || !Array.isArray(chunks)) {
      return NextResponse.json(
        { error: "Missing query or chunks array in request body." },
        { status: 400 }
      );
    }

    const queryWords = query
      .toLowerCase()
      .split(/[\s,.\-?;:!]+/ )
      .filter((w) => w.length > 2);

    if (queryWords.length === 0) {
      return NextResponse.json({ results: chunks.slice(0, 3) });
    }

    // Simple TF-IDF algorithm
    const idf: Record<string, number> = {};
    queryWords.forEach((word) => {
      const matchingChunksCount = chunks.filter((c) =>
        c.text.toLowerCase().includes(word)
      ).length;
      idf[word] = Math.log((chunks.length + 1) / (matchingChunksCount + 1)) + 1;
    });

    const scoredChunks = chunks.map((chunk) => {
      let score = 0;
      const chunkLower = chunk.text.toLowerCase();
      const chunkWordsCount = chunkLower.split(/\s+/).length;

      queryWords.forEach((word) => {
        const wordRegex = new RegExp(escapeRegExp(word), "gi");
        const occurrences = (chunkLower.match(wordRegex) ?? []).length;
        const tf = occurrences / (chunkWordsCount || 1);
        score += tf * (idf[word] ?? 0);
      });

      return { chunk, score };
    });

    const topResults = scoredChunks
      .filter((sc) => sc.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((sc) => sc.chunk);

    const results = topResults.length > 0 ? topResults : chunks.slice(0, 3);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("RAG endpoint error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "RAG processing failed." },
      { status: 500 }
    );
  }
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
