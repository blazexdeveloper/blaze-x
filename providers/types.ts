/* ==================================================
   BLAZE-X V1.0
   Universal AI Provider Interface
   Developed by Yuva
================================================== */

/* PROVIDER IDENTITIES */

export type ProviderId =
  | "groq"
  | "cerebras"
  | "gemini"
  | "openrouter";

/* INTELLIGENCE MODES */

export type IntelligenceMode =
  | "auto"
  | "instant"
  | "deep";

/* MESSAGE ROLES */

export type MessageRole =
  | "system"
  | "user"
  | "assistant";

/* CHAT MESSAGE */

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/* AI REQUEST */

export interface AIRequest {
  messages: ChatMessage[];

  mode: IntelligenceMode;

  model?: string;

  temperature?: number;

  maxTokens?: number;

  signal?: AbortSignal;
}

/* TOKEN USAGE */

export interface TokenUsage {
  inputTokens: number;

  outputTokens: number;

  totalTokens: number;
}

/* AI RESPONSE */

export interface AIResponse {
  provider: ProviderId;

  model: string;

  content: string;

  usage?: TokenUsage;

  latencyMs?: number;
}

/* STREAMING RESPONSE */

export interface AIStreamResponse {
  provider: ProviderId;

  model: string;

  stream: ReadableStream<Uint8Array>;
}

/* PROVIDER CAPABILITIES */

export interface ProviderCapabilities {
  text: boolean;

  streaming: boolean;

  reasoning: boolean;

  vision: boolean;

  files: boolean;

  tools: boolean;
}

/* PROVIDER INTERFACE */

export interface AIProvider {
  readonly id: ProviderId;

  readonly name: string;

  readonly capabilities: ProviderCapabilities;

  isConfigured(): boolean;

  generate(
    request: AIRequest
  ): Promise<AIResponse>;

  stream(
    request: AIRequest
  ): Promise<AIStreamResponse>;
}

/* PROVIDER ERROR CODES */

export type ProviderErrorCode =
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "RATE_LIMIT"
  | "QUOTA_EXCEEDED"
  | "MODEL_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "ABORTED"
  | "UNKNOWN";

/* STANDARD PROVIDER ERROR */

export class AIProviderError extends Error {
  readonly provider: ProviderId;

  readonly code: ProviderErrorCode;

  readonly status?: number;

  readonly retryable: boolean;

  constructor(
    provider: ProviderId,
    code: ProviderErrorCode,
    message: string,
    status?: number,
    retryable = false
  ) {
    super(message);

    this.name = "AIProviderError";
    this.provider = provider;
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/* END OF UNIVERSAL PROVIDER INTERFACE */
