import { fetchPageContent, type PageContent } from "./page-content";
import { deepseekComplete } from "./ai-client";

type MetadataResult = {
  title: string | null;
  description: string | null;
};
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

  console.log(`[refresh-metadata] Calling DeepSeek API (model: deepseek-chat, max_tokens: 100)`);

  try {
    const result = await deepseekComplete(prompt, {
      max_tokens: 100,
      temperature: 0.2,
      timeout: 10_000,
    });

    if (!result) {
      console.warn("[refresh-metadata] DeepSeek returned empty response");
      return null;
    }
    console.log(`[refresh-metadata] DeepSeek response: "${result.slice(0, 120)}"`);

    if (!result) {
      console.warn("[refresh-metadata] DeepSeek returned empty text");
      return null;
    }

    if (result === "NONE" || result.length < 3) {
      console.log("[refresh-metadata] DeepSeek indicated no useful description possible");
      return null;
    }

    if (result.length > 300) {
      console.warn(`[refresh-metadata] DeepSeek response too long (${result.length} chars), truncating`);
      return result.slice(0, 300);
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[refresh-metadata] DeepSeek API call failed: ${message}`);
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
