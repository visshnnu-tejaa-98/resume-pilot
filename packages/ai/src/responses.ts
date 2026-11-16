import type OpenAI from "openai";

/** The slice of the OpenAI SDK this package uses — lets tests pass a fake. */
export interface ResponsesClient {
  responses: {
    create(params: OpenAI.Responses.ResponseCreateParamsNonStreaming): Promise<OpenAI.Responses.Response>;
  };
}

export type StructuringFailure = "refused" | "incomplete" | "invalid_output" | "api_error" | "config_error";

/** Any failed structured-output call (resume structuring, JD analysis, …). */
export class StructuringError extends Error {
  constructor(
    readonly kind: StructuringFailure,
    message: string,
    /** Worth retrying (transient API trouble, a one-off bad generation). */
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "StructuringError";
  }
}

export interface StructureUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

/**
 * One Structured Outputs call: sends the request, classifies failures
 * (config vs transient, refusal, truncation) and returns the parsed JSON
 * plus token usage. Validating the JSON is the caller's job.
 */
export async function callStructuredOutput(
  client: ResponsesClient,
  params: {
    model: string;
    instructions: string;
    input: string;
    format: OpenAI.Responses.ResponseFormatTextConfig;
    maxOutputTokens: number;
  },
): Promise<{ json: unknown; usage: StructureUsage }> {
  let response: OpenAI.Responses.Response;
  try {
    response = await client.responses.create({
      model: params.model,
      instructions: params.instructions,
      input: [{ role: "user", content: params.input }],
      text: { format: params.format },
      max_output_tokens: params.maxOutputTokens,
      store: false,
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    // 400/401/403/404/422 mean our request or key is wrong: retrying won't help.
    const config = status !== undefined && [400, 401, 403, 404, 422].includes(status);
    throw new StructuringError(
      config ? "config_error" : "api_error",
      `OpenAI request failed${status ? ` (HTTP ${status})` : ""}: ${(err as Error).message}`,
      !config,
      { cause: err },
    );
  }

  const usage: StructureUsage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
  };

  // A refusal arrives as a content part of type "refusal" on a message.
  for (const item of response.output ?? []) {
    const parts = "content" in item && Array.isArray(item.content) ? (item.content as unknown[]) : [];
    const found = parts.find((c) => (c as { type?: string }).type === "refusal") as { refusal?: string } | undefined;
    if (found) throw new StructuringError("refused", `Model refused: ${found.refusal ?? ""}`.trim(), false);
  }
  if (response.status === "incomplete") {
    // Usually the output budget; the same budget won't do better on retry.
    throw new StructuringError("incomplete", `Model output incomplete: ${response.incomplete_details?.reason ?? "unknown"}`, false);
  }

  try {
    return { json: JSON.parse(response.output_text), usage };
  } catch (err) {
    throw new StructuringError("invalid_output", "Model output is not JSON", true, { cause: err });
  }
}

/** Stops user text from closing its data block early (prompt-injection hygiene, §8.4). */
export function wrapData(tag: string, text: string): string {
  const safe = text.replace(new RegExp(`<\\s*\\/?\\s*${tag}\\s*>`, "gi"), `[${tag} tag removed]`);
  return `<${tag}>\n${safe}\n</${tag}>`;
}
