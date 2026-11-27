
/* ==================================================
   BLAZE-X V1.0.2
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

const MAX_STREAM_BUFFER = 1000000;

/* GROQ PROVIDER */

class GroqProvider implements AIProvider {
  readonly id = "groq" as const;

  readonly name = "GROQ X";

  readonly capabilities: ProviderCapabilities = {
    text: true,
    streaming: true,
    reasoning: true,
    vision: false,
    files: false,
    tools: false,
  };

  /* CHECK CONFIGURATION */

  isConfigured(): boolean {
    return Boolean(env.GROQ_API_KEY?.trim());
  }

  /* MODEL SELECTION */

  private selectModel(request: AIRequest): string {
    return (
      request.model ||
      MODELS[request.mode]
    ).trim();
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

    if (status === 408 || status === 504) {
      throw new AIProviderError(
        this.id,
        "TIMEOUT",
        "Groq request timed out.",
        status,
        true
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
  ) {
    if (!this.isConfigured()) {
      throw new AIProviderError(
        this.id,
        "NOT_CONFIGURED",
        "Groq API key is missing."
      );
    }

    const startedAt = Date.now();

    const model = this.selectModel(request);

    const timeoutSignal =
      AbortSignal.timeout(REQUEST_TIMEOUT);

    const signal = request.signal
      ? AbortSignal.any([
          request.signal,
          timeoutSignal,
        ])
      : timeoutSignal;

    const isGptOss =
      model.startsWith("openai/gpt-oss-");

    const payload = {
      model,

      messages: request.messages,

      temperature:
        request.temperature ?? 0.7,

      max_completion_tokens:
        request.maxTokens ?? 2048,

      stream: streaming,

      ...(isGptOss
        ? {
            reasoning_effort:
              request.mode === "deep"
                ? "medium"
                : "low",
          }
        : {}),
    };

    console.info("[BLAZE-X] GROQ REQUEST", {
      model,
      mode: request.mode,
      streaming,
    });

    try {
      const response = await fetch(API_URL, {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${env.GROQ_API_KEY.trim()}`,

          "Content-Type": "application/json",

          Accept: streaming
            ? "text/event-stream"
            : "application/json",
        },

        body: JSON.stringify(payload),

        signal,

        cache: "no-store",
      });

      console.info("[BLAZE-X] GROQ HTTP", {
        model,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
      });

      if (!response.ok) {

        if (response.body) {
          void response.body
            .cancel()
            .catch(() => {});
        }

        this.handleError(response.status);
      }

      return {
        response,
        model,
        startedAt,
        timeoutSignal,
      };

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

      console.warn("[BLAZE-X] GROQ NETWORK ERROR", {
        model,
        elapsedMs: Date.now() - startedAt,
      });

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

    const {
      response,
      model,
      startedAt,
      timeoutSignal,
    } = await this.request(request, false);

    try {
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
          "Groq returned an empty response.",
          undefined,
          true
        );
      }

      return {
        provider: this.id,

        model: data.model || model,

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
          "Groq response timed out.",
          undefined,
          true
        );
      }

      throw new AIProviderError(
        this.id,
        "NETWORK_ERROR",
        "Unable to read Groq response.",
        undefined,
        true
      );
    }
  }

  /* LIVE STREAMING RESPONSE */

  async stream(
    request: AIRequest
  ): Promise<AIStreamResponse> {

    const {
      response,
      model,
      startedAt,
      timeoutSignal,
    } = await this.request(request, true);

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

    const providerId = this.id;

    let buffer = "";

    let completed = false;

    let receivedContent = false;

    let finishReason: string | null = null;

    let cleanedUp = false;

    let eventData: string[] = [];

    /* NON-BLOCKING STREAM CLEANUP */

    function cleanup(
      cancelReader: boolean,
      reason?: unknown
    ) {
      if (cleanedUp) return;

      cleanedUp = true;

      if (cancelReader) {
        void reader.cancel(reason)
          .catch(() => {});
      }

      try {
        reader.releaseLock();
      } catch {
        // Reader already released.
      }
    }

    /* SSE EVENT PROCESSOR */

    function processEvent(
      payload: string,
      controller:
        ReadableStreamDefaultController<Uint8Array>
    ): boolean {

      const clean = payload.trim();

      if (!clean) return false;

      if (clean === "[DONE]") {
        completed = true;
        return true;
      }

      let data;

      try {
        data = JSON.parse(clean);
      } catch {
        throw new AIProviderError(
          providerId,
          "UNKNOWN",
          "Groq returned invalid streaming data.",
          undefined,
          true
        );
      }

      if (data.error) {
        console.warn(
          "[BLAZE-X] GROQ STREAM ERROR",
          { model }
        );

        throw new AIProviderError(
          providerId,
          "UNKNOWN",
          "Groq streaming request failed.",
          undefined,
          true
        );
      }

      const choice = data.choices?.[0];

      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }

      /*
        GPT-OSS may return reasoning before
        final answer content.

        Only final answer content is sent
        to the BLAZE-X chat interface.
      */

      const content = choice?.delta?.content;

      if (
        typeof content === "string" &&
        content.length > 0
      ) {

        if (!receivedContent) {
          receivedContent = true;

          console.info(
            "[BLAZE-X] GROQ FIRST TOKEN",
            {
              model,
              elapsedMs:
                Date.now() - startedAt,
            }
          );
        }

        controller.enqueue(
          encoder.encode(content)
        );
      }

      return false;
    }

    /* SSE LINE PROCESSOR */

    function processLine(
      line: string,
      controller:
        ReadableStreamDefaultController<Uint8Array>
    ): boolean {

      const clean = line.replace(/\r$/, "");

      if (clean === "") {

        if (!eventData.length) {
          return false;
        }

        const payload = eventData.join("\n");

        eventData = [];

        return processEvent(
          payload,
          controller
        );
      }

      if (clean.startsWith("data:")) {

        eventData.push(
          clean.slice(5).replace(/^ /, "")
        );

        const eventSize = eventData.reduce(
          (total, part) => total + part.length,
          0
        );

        if (eventSize > MAX_STREAM_BUFFER) {
          throw new AIProviderError(
            providerId,
            "UNKNOWN",
            "Groq streaming event exceeded limit.",
            undefined,
            true
          );
        }
      }

      return false;
    }

    /* STREAM COMPLETION */

    function finish(
      controller:
        ReadableStreamDefaultController<Uint8Array>,
      cancelReader: boolean
    ) {

      completed = true;

      if (!receivedContent) {
        throw new AIProviderError(
          providerId,
          "UNKNOWN",
          "Groq completed without answer content.",
          undefined,
          true
        );
      }

      console.info("[BLAZE-X] GROQ COMPLETE", {
        model,
        finishReason,
        elapsedMs: Date.now() - startedAt,
      });

      controller.close();

      cleanup(cancelReader);
    }

    /* CONTINUOUS STREAM READER */

    const stream = new ReadableStream<Uint8Array>({

      async pull(controller) {

        if (completed) return;

        try {

          /*
            Continue reading when chunks contain
            reasoning, metadata or partial SSE.

            Return only after answer content is
            available or the stream has ended.
          */

          while (!completed) {

            if (request.signal?.aborted) {
              throw new AIProviderError(
                providerId,
                "ABORTED",
                "Groq request cancelled."
              );
            }

            if (timeoutSignal.aborted) {
              throw new AIProviderError(
                providerId,
                "TIMEOUT",
                "Groq stream timed out.",
                undefined,
                true
              );
            }

            const { done, value } =
              await reader.read();

            if (completed) return;

            if (done) {

              buffer += decoder.decode();

              if (buffer.length > 0) {
                processLine(
                  buffer,
                  controller
                );

                buffer = "";
              }

              if (eventData.length > 0) {

                const payload =
                  eventData.join("\n");

                eventData = [];

                processEvent(
                  payload,
                  controller
                );
              }

              if (!completed && !finishReason) {
                throw new AIProviderError(
                  providerId,
                  "NETWORK_ERROR",
                  "Groq stream ended unexpectedly.",
                  undefined,
                  true
                );
              }

              finish(controller, false);

              return;
            }

            buffer += decoder.decode(value, {
              stream: true,
            });

            if (buffer.length > MAX_STREAM_BUFFER) {
              throw new AIProviderError(
                providerId,
                "UNKNOWN",
                "Groq stream buffer exceeded limit.",
                undefined,
                true
              );
            }

            const lines = buffer.split("\n");

            buffer = lines.pop() || "";

            for (const line of lines) {

              const ended = processLine(
                line,
                controller
              );

              if (ended) {

                finish(controller, true);

                return;
              }
            }

            /*
              Respect downstream backpressure
              after actual content is queued.
            */

            if (
              controller.desiredSize !== null &&
              controller.desiredSize <= 0
            ) {
              return;
            }
          }

        } catch (error) {

          completed = true;

          let safeError: unknown = error;

          if (!(error instanceof AIProviderError)) {

            if (request.signal?.aborted) {

              safeError = new AIProviderError(
                providerId,
                "ABORTED",
                "Groq request cancelled."
              );

            } else if (timeoutSignal.aborted) {

              safeError = new AIProviderError(
                providerId,
                "TIMEOUT",
                "Groq stream timed out.",
                undefined,
                true
              );

            } else {

              safeError = new AIProviderError(
                providerId,
                "NETWORK_ERROR",
                "Groq streaming connection failed.",
                undefined,
                true
              );
            }
          }

          console.warn(
            "[BLAZE-X] GROQ STREAM FAILED",
            {
              model,

              code:
                safeError instanceof AIProviderError
                  ? safeError.code
                  : "UNKNOWN",

              elapsedMs:
                Date.now() - startedAt,
            }
          );

          try {
            controller.error(safeError);
          } finally {
            cleanup(true);
          }
        }
      },

      cancel(reason) {

        completed = true;

        cleanup(true, reason);
      },
    });

    return {
      provider: this.id,

      model,

      stream,
    };
  }
}

/* EXPORT PROVIDER */

export const groqProvider = new GroqProvider();

/* END OF GROQ X ENGINE V1.0.2 */
