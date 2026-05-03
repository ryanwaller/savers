/**
 * Shared DeepSeek chat completion client.
 *
 * DeepSeek is OpenAI-compatible so we use plain fetch — no SDK needed.
 * Falls back gracefully when DEEPSEEK_API_KEY is not set.
 */

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";
const DEFAULT_MODEL = "deepseek-chat";
const REQUEST_TIMEOUT_MS = 25_000;

function getApiKey(): string | undefined {
  return process.env.DEEPSEEK_API_KEY?.trim() || undefined;
}

export interface CompletionOptions {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  timeout?: number;
  systemPrompt?: string;
  responseFormat?: "json_object";
}

export interface JsonCompletionOptions extends CompletionOptions {
  /** If true, the response is expected to be JSON and will be parsed. */
  json: true;
}

/**
 * Send a prompt to DeepSeek and return the raw text response.
 * Returns null if DEEPSEEK_API_KEY is not configured or on any error.
 */
export async function deepseekComplete(
  prompt: string,
  options?: CompletionOptions,
): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[ai-client] DEEPSEEK_API_KEY is not set — skipping AI call");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options?.timeout ?? REQUEST_TIMEOUT_MS,
  );

  try {
    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model ?? DEFAULT_MODEL,
        messages: [
          ...(options?.systemPrompt
            ? [{ role: "system", content: options.systemPrompt }]
            : []),
          { role: "user", content: prompt },
        ],
        max_tokens: options?.max_tokens ?? 400,
        temperature: options?.temperature ?? 0.3,
        ...(options?.responseFormat
          ? { response_format: { type: options.responseFormat } }
          : null),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[ai-client] DeepSeek API error ${res.status}: ${body.slice(0, 300)}`,
      );
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.warn("[ai-client] DeepSeek returned empty response");
      return null;
    }

    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if ((err as Error).name === "AbortError") {
      console.error(`[ai-client] DeepSeek request timed out after ${options?.timeout ?? REQUEST_TIMEOUT_MS}ms`);
    } else {
      console.error(`[ai-client] DeepSeek request failed: ${message}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send a prompt to DeepSeek and parse the response as JSON.
 * Returns null if the API key is missing, the call fails, or parsing fails.
 */
export async function deepseekJson<T = unknown>(
  prompt: string,
  options?: CompletionOptions,
): Promise<T | null> {
  const text = await deepseekComplete(prompt, options);
  if (!text) return null;

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim()) as T;
  } catch {
    console.error(`[ai-client] Failed to parse DeepSeek response as JSON: ${text.slice(0, 200)}`);
    return null;
  }
}
