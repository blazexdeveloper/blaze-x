/* ==================================================
   BLAZE-X V1.0.2
   OPENROUTER X — Fallback Intelligence Engine
   Developed by Yuva
================================================== */
import "server-only";
import { env } from "@/lib/env";
import { AIProviderError, type AIProvider, type AIRequest, type AIResponse, type AIStreamResponse, type ProviderCapabilities } from "./types";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const FREE_MODEL = "openrouter/free";
const REQUEST_TIMEOUT = 60000;
const MAX_BUFFER = 1000000;

class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter" as const;
  readonly name = "OPENROUTER X";
  readonly capabilities: ProviderCapabilities = {
    text: true, streaming: true, reasoning: false,
    vision: false, files: false, tools: false,
  };

  isConfigured(): boolean {
    return Boolean(env.OPENROUTER_API_KEY?.trim());
  }

  private selectModel(request: AIRequest): string {
    const model = (request.model || process.env.OPENROUTER_MODEL || FREE_MODEL).trim();
    return model === FREE_MODEL || model.endsWith(":free") ? model : FREE_MODEL;
  }

  private handleError(status: number): never {
    if (status === 401 || status === 403) throw new AIProviderError(this.id, "UNAUTHORIZED", "OpenRouter authentication failed.", status);
    if (status === 402) throw new AIProviderError(this.id, "QUOTA_EXCEEDED", "OpenRouter credit or quota limit reached.", status, true);
    if (status === 429) throw new AIProviderError(this.id, "RATE_LIMIT", "OpenRouter usage limit reached.", status, true);
    if (status === 404) throw new AIProviderError(this.id, "MODEL_UNAVAILABLE", "No suitable OpenRouter model is available.", status, true);
    if (status === 400 || status === 422) throw new AIProviderError(this.id, "INVALID_REQUEST", "OpenRouter rejected the request.", status);
    if (status === 408 || status === 504) throw new AIProviderError(this.id, "TIMEOUT", "OpenRouter request timed out.", status, true);
    throw new AIProviderError(this.id, "UNKNOWN", "OpenRouter service request failed.", status, status >= 500);
  }

  private normalizeError(error: unknown, request: AIRequest, timeout: AbortSignal): AIProviderError {
    if (error instanceof AIProviderError) return error;
    if (request.signal?.aborted) return new AIProviderError(this.id, "ABORTED", "OpenRouter request cancelled.");
    if (timeout.aborted) return new AIProviderError(this.id, "TIMEOUT", "OpenRouter request timed out.", undefined, true);
    return new AIProviderError(this.id, "NETWORK_ERROR", "OpenRouter connection failed.", undefined, true);
  }

  private async request(request: AIRequest, streaming: boolean) {
    const key = env.OPENROUTER_API_KEY?.trim();
    if (!key) throw new AIProviderError(this.id, "NOT_CONFIGURED", "OpenRouter API key is missing.");
    const model = this.selectModel(request);
    const startedAt = Date.now();
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    console.info("[BLAZE-X] OPENROUTER REQUEST", { model, streaming, mode: request.mode });
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "BLAZE-X", Accept: streaming ? "text/event-stream" : "application/json" },
        body: JSON.stringify({ model, messages: request.messages, temperature: request.temperature ?? 0.7, max_tokens: request.maxTokens ?? 4096, stream: streaming, provider: { max_price: { prompt: 0, completion: 0 } } }),
        signal, cache: "no-store",
      });
      console.info("[BLAZE-X] OPENROUTER HTTP", { model, status: response.status, elapsedMs: Date.now() - startedAt });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        this.handleError(response.status);
      }
      return { response, model, startedAt, timeout };
    } catch (error) {
      throw this.normalizeError(error, request, timeout);
    }
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const { response, model, startedAt, timeout } = await this.request(request, false);
    try {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (data.error || typeof content !== "string" || !content.trim()) throw new AIProviderError(this.id, "UNKNOWN", "OpenRouter returned no valid text.", undefined, true);
      return { provider: this.id, model: data.model || model, content, latencyMs: Date.now() - startedAt,
        usage: data.usage ? { inputTokens: data.usage.prompt_tokens || 0, outputTokens: data.usage.completion_tokens || 0, totalTokens: data.usage.total_tokens || 0 } : undefined };
    } catch (error) { throw this.normalizeError(error, request, timeout); }
  }

  async stream(request: AIRequest): Promise<AIStreamResponse> {
    const { response, model, startedAt, timeout } = await this.request(request, true);
    if (!response.body) throw new AIProviderError(this.id, "UNKNOWN", "OpenRouter returned an empty stream.", undefined, true);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const provider = this;
    let buffer = "", event = "", finishReason = "";
    let closed = false, released = false, receivedText = false, receivedDone = false;
    function cleanup(cancel: boolean, reason?: unknown) {
      if (released) return;
