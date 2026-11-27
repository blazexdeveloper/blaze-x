/* ==================================================
   BLAZE-X V1.0
   GROQ X — High-Speed Intelligence Engine
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
  "https://api.groq.com/openai/v1/chat/completions";

const MODELS = {
  instant:
    process.env.GROQ_INSTANT_MODEL ||
    "openai/gpt-oss-20b",

  auto:
    process.env.GROQ_AUTO_MODEL ||
    "openai/gpt-oss-120b",

  deep:
    process.env.GROQ_DEEP_MODEL ||
    "openai/gpt-oss-120b",
};

const REQUEST_TIMEOUT = 30000;

/* GROQ PROVIDER */

class GroqProvider implements AIProvider {
  readonly id = "groq" as const;

  readonly name = "GROQ X";

  readonly capabilities: ProviderCapabilities = {
    text: true,
    streaming: true,
    reasoning: false,
    vision: false,
    files: false,
    tools: false,
  };

  /* CHECK CONFIGURATION */

  isConfigured(): boolean {
    return Boolean(env.GROQ_API_KEY);
  }

  /* MODEL SELECTION */

  private selectModel(request: AIRequest): string {
    return request.model || MODELS[request.mode];
  }

  /* STANDARD ERROR HANDLING */

  private handleError(status: number): never {
    if (status === 401 || status === 403) {
      throw new AIProviderError(
        this.id,
        "UNAUTHORIZED",
        "Groq authentication failed.",
        status
      );
    }

    if (status === 429) {
      throw new AIProviderError(
        this.id,
        "RATE_LIMIT",
        "Groq usage limit reached.",
        status,
        true
      );
    }

    if (status === 404) {
      throw new AIProviderError(
        this.id,
        "MODEL_UNAVAILABLE",
        "The selected Groq model is unavailable.",
        status,
        true
      );
    }

    if (status === 400 || status === 422) {
      throw new AIProviderError(
        this.id,
        "INVALID_REQUEST",
        "Groq rejected the request.",
        status
      );
    }

    throw new AIProviderError(
      this.id,
      "UNKNOWN",
      "Groq service request failed.",
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
        "Groq API key is missing."
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
            `Bearer ${env.GROQ_API_KEY}`,

          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model: this.selectModel(request),

          messages: request.messages,

          temperature: request.temperature ?? 0.7,

          max_completion_tokens:
            request.maxTokens ?? 2048,

          stream: streaming,
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
          "Groq request cancelled."
        );
      }

      if (timeoutSignal.aborted) {
        throw new AIProviderError(
          this.id,
          "TIMEOUT",
          "Groq request timed out.",
          undefined,
          true
        );
      }

      throw new AIProviderError(
        this.id,
        "NETWORK_ERROR",
        "Unable to connect to Groq.",
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

    if (typeof content !== "string") {
      throw new AIProviderError(
        this.id,
        "UNKNOWN",
        "Groq returned an invalid response.",
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

  /* LIVE STREAMING RESPONSE */

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
        "Groq returned an empty stream.",
        undefined,
        true
      );
    }

    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    const encoder = new TextEncoder();

    let buffer = "";

    let completed = false;

    const providerId = this.id;

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (completed) return;

        function processLine(line: string): boolean {
          const clean = line.trim();

          if (!clean.startsWith("data:")) {
            return false;
          }

          const payload = clean.slice(5).trim();

          if (payload === "[DONE]") {
            completed = true;
            return true;
          }

          if (!payload) return false;

          const data = JSON.parse(payload);

          if (data.error) {
            throw new AIProviderError(
              providerId,
              "UNKNOWN",
              "Groq streaming request failed."
            );
          }

          const content =
            data.choices?.[0]?.delta?.content;

          if (
            typeof content === "string" &&
            content.length > 0
          ) {
            controller.enqueue(
              encoder.encode(content)
            );
          }

          return false;
        }

        try {
          const { done, value } =
            await reader.read();

          if (done) {
            buffer += decoder.decode();

            if (buffer.trim()) {
              processLine(buffer);
            }

            if (!completed) {
              throw new AIProviderError(
                providerId,
                "NETWORK_ERROR",
                "Groq stream ended unexpectedly."
              );
            }

            controller.close();
            reader.releaseLock();
            return;
          }

          buffer += decoder.decode(value, {
            stream: true,
          });

          const lines = buffer.split("\n");

          buffer = lines.pop() || "";

          for (const line of lines) {
            if (processLine(line)) {
              controller.close();
              await reader.cancel();
              reader.releaseLock();
              return;
            }
          }
        } catch (error) {
          completed = true;

          controller.error(error);

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

export const groqProvider = new GroqProvider();

/* END OF GROQ X ENGINE */
