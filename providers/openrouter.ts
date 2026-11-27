/* ==================================================
   BLAZE-X V1.0
   OPENROUTER X — Fallback Intelligence Engine
   Developed by Yuva
================================================== */

import "server-only";

import { env } from "@/lib/env";

import {
  AIProviderError,
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type AIStreamResponse,
  type ProviderCapabilities,
} from "./types";

/* CONFIGURATION */

const API_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const FREE_MODEL = "openrouter/free";

const REQUEST_TIMEOUT = 60000;

/* OPENROUTER PROVIDER */

class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter" as const;

  readonly name = "OPENROUTER X";

  readonly capabilities: ProviderCapabilities = {
    text: true,
    streaming: true,
    reasoning: false,
    vision: false,
    files: false,
    tools: false,
  };

  /* CONFIGURATION CHECK */

  isConfigured(): boolean {
    return Boolean(env.OPENROUTER_API_KEY);
  }

  /* FREE MODEL SELECTION */

  private selectModel(request: AIRequest): string {
    const model =
      request.model ||
      process.env.OPENROUTER_MODEL ||
      FREE_MODEL;

    if (
      model === FREE_MODEL ||
      model.endsWith(":free")
    ) {
      return model;
    }

    return FREE_MODEL;
  }

  /* STANDARD ERROR HANDLING */

  private handleError(status: number): never {
    if (status === 401 || status === 403) {
      throw new AIProviderError(
        this.id,
        "UNAUTHORIZED",
        "OpenRouter authentication failed.",
        status
      );
    }

    if (status === 402) {
      throw new AIProviderError(
        this.id,
        "QUOTA_EXCEEDED",
        "OpenRouter credit or quota limit reached.",
        status,
        true
      );
    }

    if (status === 429) {
      throw new AIProviderError(
        this.id,
        "RATE_LIMIT",
        "OpenRouter usage limit reached.",
        status,
        true
      );
    }

    if (status === 404) {
      throw new AIProviderError(
        this.id,
        "MODEL_UNAVAILABLE",
        "No suitable OpenRouter model is available.",
        status,
        true
      );
    }

    if (status === 400 || status === 422) {
      throw new AIProviderError(
        this.id,
        "INVALID_REQUEST",
        "OpenRouter rejected the request.",
        status
      );
    }

    throw new AIProviderError(
      this.id,
      "UNKNOWN",
      "OpenRouter service request failed.",
      status,
      status >= 500
    );
  }

  /* API REQUEST */

  private async request(
    request: AIRequest,
    streaming: boolean
  ): Promise<Response> {
    if (!this.isConfigured()) {
      throw new AIProviderError(
        this.id,
        "NOT_CONFIGURED",
        "OpenRouter API key is missing."
      );
    }

    const timeoutSignal =
      AbortSignal.timeout(REQUEST_TIMEOUT);

    const signal = request.signal
      ? AbortSignal.any([
          request.signal,
          timeoutSignal,
        ])
      : timeoutSignal;

    try {
      const response = await fetch(API_URL, {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${env.OPENROUTER_API_KEY}`,

          "Content-Type": "application/json",

          "X-Title": "BLAZE-X",
        },

        body: JSON.stringify({
          model: this.selectModel(request),

          messages: request.messages,

          temperature: request.temperature ?? 0.7,

          max_tokens: request.maxTokens ?? 4096,

          stream: streaming,

          provider: {
            max_price: {
              prompt: 0,
              completion: 0,
            },
          },
        }),

        signal,

        cache: "no-store",
      });

      if (!response.ok) {
        await response.body?.cancel();

        this.handleError(response.status);
      }

      return response;
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error;
      }

      if (request.signal?.aborted) {
        throw new AIProviderError(
          this.id,
          "ABORTED",
          "OpenRouter request cancelled."
        );
      }

      if (timeoutSignal.aborted) {
        throw new AIProviderError(
          this.id,
          "TIMEOUT",
          "OpenRouter request timed out.",
          undefined,
          true
        );
      }

      throw new AIProviderError(
        this.id,
        "NETWORK_ERROR",
        "Unable to connect to OpenRouter.",
        undefined,
        true
      );
    }
  }

  /* STANDARD RESPONSE */

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {
    const startedAt = Date.now();

    const response = await this.request(
      request,
      false
    );

    const data = await response.json();

    const content =
      data.choices?.[0]?.message?.content;

    if (
      typeof content !== "string" ||
      !content.trim()
    ) {
      throw new AIProviderError(
        this.id,
        "UNKNOWN",
        "OpenRouter returned no valid text.",
        undefined,
        true
      );
    }

    return {
      provider: this.id,

      model:
        data.model || this.selectModel(request),

      content,

      latencyMs: Date.now() - startedAt,

      usage: data.usage
        ? {
            inputTokens:
              data.usage.prompt_tokens || 0,

            outputTokens:
              data.usage.completion_tokens || 0,

            totalTokens:
              data.usage.total_tokens || 0,
          }
        : undefined,
    };
  }

  /* LIVE STREAMING */

  async stream(
    request: AIRequest
  ): Promise<AIStreamResponse> {
    const response = await this.request(
      request,
      true
    );

    if (!response.body) {
      throw new AIProviderError(
        this.id,
        "UNKNOWN",
        "OpenRouter returned an empty stream.",
        undefined,
        true
      );
    }

    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    const encoder = new TextEncoder();

    let buffer = "";

    let completed = false;

    let receivedText = false;

    let receivedDone = false;

    let finishReason = "";

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (completed) return;

        function processLine(line: string) {
          const clean = line.trim();

          if (!clean.startsWith("data:")) {
            return;
          }

          const payload = clean.slice(5).trim();

          if (!payload) return;

          if (payload === "[DONE]") {
            receivedDone = true;
            return;
          }

          const data = JSON.parse(payload);

          if (data.error) {
            throw new AIProviderError(
              "openrouter",
              "UNKNOWN",
              "OpenRouter streaming request failed.",
              undefined,
              true
            );
          }

          const choice = data.choices?.[0];

          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }

          const content = choice?.delta?.content;

          if (
            typeof content === "string" &&
            content.length > 0
          ) {
            receivedText = true;

            controller.enqueue(
              encoder.encode(content)
            );
          }
        }

        function finishStream() {
          if (!receivedText) {
            throw new AIProviderError(
              "openrouter",
              "UNKNOWN",
              "OpenRouter returned no text.",
              undefined,
              true
            );
          }

          if (!receivedDone) {
            throw new AIProviderError(
              "openrouter",
              "NETWORK_ERROR",
              "OpenRouter stream ended unexpectedly.",
              undefined,
              true
            );
          }

          if (
            finishReason &&
            finishReason !== "stop"
          ) {
            controller.enqueue(
              encoder.encode(
                finishReason === "length"
                  ? "\n\n[Response reached its output limit.]"
                  : "\n\n[Response ended before completion.]"
              )
            );
          }

          completed = true;

          controller.close();
        }

        try {
          const { done, value } =
            await reader.read();

          if (done) {
            buffer += decoder.decode();

            if (buffer.trim()) {
              processLine(buffer);
            }

            finishStream();

            reader.releaseLock();

            return;
          }

          buffer += decoder.decode(value, {
            stream: true,
          });

          const lines = buffer.split("\n");

          buffer = lines.pop() || "";

          for (const line of lines) {
            processLine(line);

            if (receivedDone) {
              finishStream();

              try {
                await reader.cancel();
              } finally {
                reader.releaseLock();
              }

              return;
            }
          }
        } catch (error) {
          if (!completed) {
            completed = true;
            controller.error(error);
          }

          try {
            await reader.cancel();
          } catch {
            // Stream already closed.
          }

          try {
            reader.releaseLock();
          } catch {
            // Reader already released.
          }
        }
      },

      async cancel(reason) {
        completed = true;

        try {
          await reader.cancel(reason);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return {
      provider: this.id,

      model: this.selectModel(request),

      stream,
    };
  }
}

/* EXPORT PROVIDER */

export const openRouterProvider =
  new OpenRouterProvider();

/* END OF OPENROUTER X ENGINE */
