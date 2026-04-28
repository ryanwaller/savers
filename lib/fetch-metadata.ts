import Anthropic from "@anthropic-ai/sdk";
import { fetchPageContent, type PageContent } from "./page-content";

type MetadataResult = {
  title: string | null;
  description: string | null;
};

const client = new Anthropic();
const AI_TIMEOUT_MS = 10_000;

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function fetchMetadata(url: string): Promise<MetadataResult> {
  console.log(`[refresh-metadata] Scraping ${url}`);

  const content: PageContent | null = await fetchPageContent(url);

  if (!content) {
    console.warn("[refresh-metadata] fetchPageContent returned null — page unreachable or empty");
    return { title: null, description: null };
  }

  const title = content.title ?? null;
  const scrapedDesc = content.description ?? null;

  console.log(
    `[refresh-metadata] Scrape result — title: ${title ? `"${title.slice(0, 60)}"` : "null"}, description: ${scrapedDesc ? `"${scrapedDesc.slice(0, 60)}"` : "null"}`
  );

  if (title && scrapedDesc) {
    console.log("[refresh-metadata] Both title and description found — skipping AI fallback");
    return { title, description: scrapedDesc };
  }

  if (!scrapedDesc) {
    console.log("[refresh-metadata] Description missing, triggering AI fallback…");
    const aiDesc = await generateDescription({
      url,
      title: title ?? undefined,
      bodyText: content.body_text || undefined,
    });
    console.log(
      `[refresh-metadata] AI fallback result: ${aiDesc ? `"${aiDesc.slice(0, 60)}"` : "null"}`
    );
    return { title, description: scrapedDesc ?? aiDesc };
  }

  // title is missing but description exists
  return { title, description: scrapedDesc };
}

async function generateDescription(params: {
  url: string;
  title?: string;
  bodyText?: string;
}): Promise<string | null> {
  const prompt = buildDescriptionPrompt(params);
  if (!prompt) {
    console.warn("[refresh-metadata] Skipping AI — unable to build a prompt (no title, body, or useful context)");
    return null;
  }

  console.log(`[refresh-metadata] Calling Anthropic API (model: claude-3-haiku-20240307, max_tokens: 100)`);

  try {
    const response = await withTimeout(
      client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 100,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
      AI_TIMEOUT_MS
    );

    const block = response.content[0];
    if (block?.type !== "text") {
      console.warn(`[refresh-metadata] Unexpected response type: ${block?.type ?? "none"}`);
      return null;
    }

    const result = block.text.trim();
    console.log(`[refresh-metadata] Claude response: "${result.slice(0, 120)}"`);

    if (!result) {
      console.warn("[refresh-metadata] Claude returned empty text");
      return null;
    }

    if (result === "NONE" || result.length < 3) {
      console.log("[refresh-metadata] Claude indicated no useful description possible");
      return null;
    }

    if (result.length > 300) {
      console.warn(`[refresh-metadata] Claude response too long (${result.length} chars), truncating`);
      return result.slice(0, 300);
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[refresh-metadata] Anthropic API call failed: ${message}`);
    return null;
  }
}

function buildDescriptionPrompt(params: {
  url: string;
  title?: string;
  bodyText?: string;
}): string | null {
  const parts: string[] = [];

  parts.push(`URL: ${params.url}`);

  if (params.title) {
    parts.push(`Title: ${cleanText(params.title)}`);
  }

  const body = params.bodyText ? cleanText(params.bodyText).slice(0, 2000) : null;
  if (body) {
    parts.push(`Page text excerpt: ${body}`);
  }

  // We always have at least the URL, so parts.length >= 1
  console.log(
    `[refresh-metadata] Prompt built — ${params.title ? "title" : "no title"}, ${body ? `${body.length} chars body text` : "no body text"}`
  );

  return `${parts.join("\n\n")}

Write a single neutral sentence (no more than ~25 words) that describes what this web page is about. Base it only on the URL, title, and text excerpt above. Do not invent facts. If there is not enough information to describe the page, reply with just the word "NONE".`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("AI timeout")), ms)
    ),
  ]);
}
