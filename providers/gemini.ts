/* ==================================================
   BLAZE-X V1.0.2
   GEMINI X — Intelligence Engine
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

const BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

const MODELS = {
  instant:
    process.env.GEMINI_INSTANT_MODEL ||
    "gemini-2.5-flash-lite",

  auto:
    process.env.GEMINI_AUTO_MODEL ||
    "gemini-2.5-flash",

  deep:
    process.env.GEMINI_DEEP_MODEL ||
    "gemini-2.5-flash",
};

const REQUEST_TIMEOUT = 60000;

/* GEMINI PROVIDER */

class GeminiProvider implements AIProvider {
  readonly id = "gemini" as const;

  readonly name = "GEMINI X";

  readonly capabilities: ProviderCapabilities = {
    text: true,
    streaming: true,
    reasoning: true,
    vision: false,
    files: false,
    tools: false,
  };

  /* CONFIGURATION CHECK */

  isConfigured(): boolean {
    return Boolean(env.GEMINI_API_KEY?.trim());
  }

  /* MODEL SELECTION */

  private selectModel(request: AIRequest): string {
    return (request.model || MODELS[request.mode]).trim().replace(/^models\//, "");
  }

  /* REQUEST CONVERSION */

  private buildPayload(request: AIRequest) {
    const systemMessages = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    const contents = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role:
          message.role === "assistant"
            ? "model"
            : "user",

        parts: [
          {
            text: message.content,
          },
        ],
      }));

    return {
      contents,

      ...(systemMessages
        ? {
            systemInstruction: {
              parts: [
                {
                  text: systemMessages,
                },
              ],
            },
          }
        : {}),

      generationConfig: {
        temperature: request.temperature ?? 0.7,

        maxOutputTokens:
          request.maxTokens ?? 4096,
      },
    };
  }

  /* STANDARD ERROR HANDLING */

  private handleError(status: number): never {
    if (status === 401 || status === 403) {
      throw new AIProviderError(
        this.id,
        "UNAUTHORIZED",
        "Gemini authentication or access failed.",
        status
      );
    }

    if (status === 429) {
      throw new AIProviderError(
        this.id,
        "RATE_LIMIT",
        "Gemini usage limit reached.",
        status,
        true
      );
    }

    if (status === 404) {
      throw new AIProviderError(
        this.id,
        "MODEL_UNAVAILABLE",
        "The selected Gemini model is unavailable.",
        status,
        true
      );
    }

    if (status === 400 || status === 422) {
      throw new AIProviderError(
        this.id,
        "INVALID_REQUEST",
        "Gemini rejected the request.",
        status
      );
    }

    throw new AIProviderError(
      this.id,
      "UNKNOWN",
      "Gemini service request failed.",
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
        "Gemini API key is missing."
      );
    }

    const model = this.selectModel(request);

    const endpoint = streaming
      ? "streamGenerateContent?alt=sse"
      : "generateContent";

    const url =
      `${BASE_URL}/models/` +
      `${encodeURIComponent(model)}:${endpoint}`;

    const timeoutSignal =
      AbortSignal.timeout(REQUEST_TIMEOUT);

    const signal = request.signal
      ? AbortSignal.any([
          request.signal,
          timeoutSignal,
        ])
      : timeoutSignal;

    const startedAt = Date.now();
    console.info("[BLAZE-X] GEMINI REQUEST", { model, streaming });
    try {
      const response = await fetch(url, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "x-goog-api-key": env.GEMINI_API_KEY.trim(),
          Accept: streaming ? "text/event-stream" : "application/json",
        },

        body: JSON.stringify(
          this.buildPayload(request)
        ),

        signal,

        cache: "no-store",
      });

      console.info("[BLAZE-X] GEMINI HTTP", { model, status: response.status, elapsedMs: Date.now() - startedAt });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});

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
          "Gemini request cancelled."
        );
      }

      if (timeoutSignal.aborted) {
        throw new AIProviderError(
          this.id,
          "TIMEOUT",
          "Gemini request timed out.",
          undefined,
          true
        );
      }

      throw new AIProviderError(
        this.id,
        "NETWORK_ERROR",
        "Unable to connect to Gemini.",
        undefined,
        true
      );
    }
  }

  /* EXTRACT GENERATED TEXT */

  private extractText(data: any): string {
    const parts =
      data.candidates?.[0]?.content?.parts;

    if (!Array.isArray(parts)) {
      return "";
    }

    return parts
      .filter(
        (part: any) =>
          typeof part.text === "string" &&
          !part.thought
      )
      .map((part: any) => part.text)
      .join("");
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

    const content = this.extractText(data);

    if (!content) {
      throw new AIProviderError(
        this.id,
        "UNKNOWN",
        "Gemini returned no text response."
      );
    }

    return {
      provider: this.id,

      model: this.selectModel(request),

      content,

      latencyMs: Date.now() - startedAt,

      usage: data.usageMetadata
        ? {
            inputTokens:
              data.usageMetadata.promptTokenCount ||
              0,

            outputTokens:
              data.usageMetadata.candidatesTokenCount ||
              0,

            totalTokens:
              data.usageMetadata.totalTokenCount ||
              0,
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
        "Gemini returned an empty stream.",
        undefined,
        true
      );
    }

    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    const encoder = new TextEncoder();

    const provider = this;

    let buffer = "";

    let completed = false;

    let receivedText = false;

    let finishReason = "";
    let cleaned = false;
    function cleanup(cancel: boolean, reason?: unknown) {
      if (cleaned) return;
      cleaned = true;
      if (cancel) void reader.cancel(reason).catch(() => {});
      try { reader.releaseLock(); } catch { /* already released */ }
    }

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (completed) return;

        function processLine(line: string) {
          const clean = line.trim();

          if (!clean.startsWith("data:")) {
            return;
          }

          const payload = clean.slice(5).trim();

          if (!payload || payload === "[DONE]") {
            return;
          }

          const data = JSON.parse(payload);

          if (data.error) {
            throw new AIProviderError(
              "gemini",
              "UNKNOWN",
              "Gemini streaming request failed."
            );
          }

          const reason =
            data.candidates?.[0]?.finishReason;

          if (reason) {
            finishReason = reason;
          }

          if (data.promptFeedback?.blockReason) {
            throw new AIProviderError(
              "gemini",
              "INVALID_REQUEST",
              "Gemini blocked the request."
            );
          }

          const text = provider.extractText(data);

          if (text) {
            if (!receivedText) console.info("[BLAZE-X] GEMINI FIRST TOKEN");
            receivedText = true;

            controller.enqueue(
              encoder.encode(text)
            );
          }
        }

        try {
          while (!completed) {
          request.signal?.throwIfAborted();
          const { done, value } =
            await reader.read();
          if (completed) return;

          if (done) {
            buffer += decoder.decode();

            if (buffer.trim()) {
              processLine(buffer);
            }

            if (!receivedText) {
              throw new AIProviderError(
                "gemini",
                "UNKNOWN",
                "Gemini returned no text."
              );
            }

            if (!finishReason) {
              throw new AIProviderError(
                "gemini",
                "NETWORK_ERROR",
                "Gemini stream ended unexpectedly."
              );
            }

            if (finishReason !== "STOP") {
              controller.enqueue(
                encoder.encode(
                  finishReason === "MAX_TOKENS"
                    ? "\n\n[Response reached its output limit.]"
                    : "\n\n[Response ended before completion.]"
                )
              );
            }

            completed = true;

            controller.close();

            cleanup(false);

            return;
          }

          buffer += decoder.decode(value, {
            stream: true,
          });

          if (buffer.length > 1000000) throw new AIProviderError("gemini", "UNKNOWN", "Gemini stream buffer exceeded limit.");
          const lines = buffer.split("\n");

          buffer = lines.pop() || "";

          for (const line of lines) {
            processLine(line);
          }
          if (controller.desiredSize !== null && controller.desiredSize <= 0) return;
          }
        } catch (error) {
          if (completed) return;
          completed = true;
          try { controller.error(error); } finally { cleanup(true); }
        }
      },
      cancel(reason) {
        completed = true;
        cleanup(true, reason);
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

export const geminiProvider =
  new GeminiProvider();

/* END OF GEMINI X ENGINE */
