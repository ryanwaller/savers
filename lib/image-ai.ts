import "server-only";

/**
 * Vision AI client for image enrichment.
 *
 * Asks a vision model to look at a freshly uploaded image and return:
 *   - title       a 2–6 word title that reads like a caption
 *   - description a 1–2 sentence description grounded in what's visible
 *   - tags        a list of 3–8 lowercase keyword tags
 *
 * Provider defaults to Anthropic Claude Sonnet (single vendor, no extra
 * keys if the user already runs Anthropic for anything else). DeepSeek's
 * public chat completions endpoint historically does not accept image
 * content blocks via `messages[].content[].image_url` the way OpenAI does,
 * so DeepSeek is not the default. Set IMAGE_AI_PROVIDER=deepseek if you
 * want to try it anyway — failures are logged and the row stays in its
 * pre-AI state (title from filename, no description, empty tags).
 *
 * Env:
 *   IMAGE_AI_PROVIDER   "anthropic" | "deepseek"     default: "anthropic"
 *   ANTHROPIC_API_KEY   required for anthropic
 *   IMAGE_AI_MODEL      override model name          default per-provider
 *   DEEPSEEK_API_KEY    required if provider=deepseek
 */

const PROVIDER = (process.env.IMAGE_AI_PROVIDER?.trim() || "anthropic").toLowerCase();
const ANTHROPIC_MODEL = process.env.IMAGE_AI_MODEL?.trim() || "claude-sonnet-4-6";
const DEEPSEEK_MODEL = process.env.IMAGE_AI_MODEL?.trim() || "deepseek-chat";
const REQUEST_TIMEOUT_MS = 30_000;

export interface ImageDescription {
  title: string;
  description: string;
  tags: string[];
}

const SYSTEM_PROMPT = `You are tagging images for a personal save-it-for-later library. Look at the image and return JSON with three fields:
  - "title": a 2–6 word title written like an editorial caption. No quotes. No trailing punctuation.
  - "description": a single sentence (or two short sentences) that describes what is visible. Grounded in the image only — no speculation.
  - "tags": 3 to 8 lowercase keyword tags. Single words or short phrases. No "#" prefix.
Return ONLY the JSON object. No prose, no markdown, no fences.`;

function safeBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

async function describeViaAnthropic(
  imageBase64: string,
  mimeType: string,
): Promise<ImageDescription | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[image-ai] ANTHROPIC_API_KEY not set, skipping vision enrichment");
    return null;
  }

  // Anthropic's image content block accepts a constrained list of media
  // types; coerce unusual ones into something the API will take.
  const apiMediaType = (() => {
    const m = mimeType.toLowerCase();
    if (m === "image/jpeg" || m === "image/png" || m === "image/gif" || m === "image/webp") return m;
    // SVG and HEIC are rejected — caller should only invoke this with a
    // raster JPEG preview, so we default to image/jpeg.
    return "image/jpeg";
  })();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: apiMediaType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: "Describe and tag this image. JSON only.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[image-ai] anthropic error ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((b) => b.type === "text")?.text?.trim();
    if (!text) return null;
    return parseJson(text);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      console.error("[image-ai] anthropic request timed out");
    } else {
      console.error(`[image-ai] anthropic request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function describeViaDeepseek(
  imageBase64: string,
  mimeType: string,
): Promise<ImageDescription | null> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY)?.trim();
  if (!apiKey) {
    console.warn("[image-ai] DEEPSEEK_API_KEY not set, skipping vision enrichment");
    return null;
  }

  // Speculative OpenAI-compatible image content shape. DeepSeek's public
  // chat completions endpoint may reject this — the failure path is just
  // a logged error and a null return.
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const baseUrl = (process.env.AI_BASE_URL?.trim() || "https://api.deepseek.com/v1").replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 400,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Describe and tag this image. JSON only." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[image-ai] deepseek error ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return parseJson(text);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      console.error("[image-ai] deepseek request timed out");
    } else {
      console.error(`[image-ai] deepseek request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(raw: string): ImageDescription | null {
  // Strip code fences the model might wrap around its JSON.
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const obj = JSON.parse(cleaned) as Partial<ImageDescription>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    const description = typeof obj.description === "string" ? obj.description.trim() : "";
    const tags = Array.isArray(obj.tags)
      ? obj.tags
          .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
          .filter((t) => t.length > 0 && t.length <= 40)
          .slice(0, 12)
      : [];
    if (!title && !description && tags.length === 0) return null;
    return { title, description, tags };
  } catch {
    console.error(`[image-ai] response was not valid JSON: ${raw.slice(0, 200)}`);
    return null;
  }
}

/**
 * Run vision enrichment on a raster image buffer. Returns null if the
 * provider isn't configured or the call fails — caller should leave the
 * existing title (filename-derived) and empty tags in place when null.
 */
export async function describeImage(
  buffer: Buffer,
  mimeType: string,
): Promise<ImageDescription | null> {
  const base64 = safeBase64(buffer);
  if (PROVIDER === "deepseek") {
    return describeViaDeepseek(base64, mimeType);
  }
  return describeViaAnthropic(base64, mimeType);
}
