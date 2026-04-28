import Anthropic from "@anthropic-ai/sdk";
import { fetchPageContent, type PageContent } from "./page-content";

type MetadataResult = {
  title: string | null;
  description: string | null;
};

const AI_TIMEOUT_MS = 10_000;

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstParagraph(html: string): string | null {
  // Lightweight extraction from raw HTML as a last-resort fallback.
  // Avoids a second cheerio parse when fetchPageContent already ran.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return null;

  const m = bodyMatch[1].match(
    /<(?:p|h1|h2|h3|article|section|div)[^>]*>([\s\S]*?)<\/(?:p|h1|h2|h3|article|section|div)>/i
  );
  if (!m) return null;

  const text = m[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 300) || null;
}

export async function fetchMetadata(url: string): Promise<MetadataResult> {
  // Step 1: scrape HTML metadata
  const content: PageContent | null = await fetchPageContent(url);

  const title = content?.title ?? null;
  const scrapedDesc = content?.description ?? null;

  if (title && scrapedDesc) {
    return { title, description: scrapedDesc };
  }

  // Step 2: AI fallback for missing description
  const aiDesc = scrapedDesc
    ? null
    : await generateDescription({
        url,
        title: title ?? undefined,
        bodyText: content?.body_text ?? undefined,
      });

  return {
    title,
    description: scrapedDesc ?? aiDesc,
  };
}

async function generateDescription(params: {
  url: string;
  title?: string;
  bodyText?: string;
}): Promise<string | null> {
  const apiKey =
    process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) return null;

  const prompt = buildDescriptionPrompt(params);
  if (!prompt) return null;

  const client = new Anthropic({ apiKey });

  try {
    const response = await withTimeout(
      client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 100,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      AI_TIMEOUT_MS
    );

    const block = response.content[0];
    if (block?.type !== "text" || !block.text.trim()) return null;

    const result = block.text.trim();
    // Guard against the model returning a refusal / nothing useful
    if (result.length < 10 || result.length > 300) return null;

    return result;
  } catch {
    return null;
  }
}

function buildDescriptionPrompt(params: {
  title?: string;
  bodyText?: string;
}): string | null {
  const parts: string[] = [];
  if (params.title) parts.push(`Title: ${cleanText(params.title)}`);

  const body = params.bodyText ? cleanText(params.bodyText).slice(0, 2000) : null;
  if (body) parts.push(`Text: ${body}`);

  if (parts.length === 0) return null;

  return `${parts.join("\n\n")}

Write a single neutral sentence (no more than ~25 words) that describes what this page is about. Do not invent facts. If the page content is too thin to describe, reply with just the word "NONE".`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("AI timeout")), ms)
    ),
  ]);
}
