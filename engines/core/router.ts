/* ==================================================
   BLAZE-X V1.0
   CORE BRAIN — Intelligent Routing Engine
   Developed by Yuva
================================================== */

import "server-only";

import { groqProvider } from "@/providers/groq";

import { geminiProvider } from "@/providers/gemini";

import {
  openRouterProvider,
} from "@/providers/openrouter";

import {
  AIProviderError,
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type AIStreamResponse,
  type IntelligenceMode,
  type ChatMessage,
} from "@/providers/types";

/* CORE BRAIN PERSONALITY */

const SYSTEM_PROMPT = `
You are BLAZE-X, a multipurpose AI assistant
developed by Yuva.

Your purpose is to assist users with:

- General knowledge and conversation
- Coding and software development
- Mathematics and logical reasoning
- Education and learning
- Business and professional communication
- Technical and engineering assistance
- Research and creative work

RESPONSE PRINCIPLES:

1. Understand the user's actual intention.
2. Provide accurate and practical answers.
3. Use conversation context when relevant.
4. Do not invent facts or specifications.
5. Clearly distinguish facts from assumptions.
6. Admit uncertainty when necessary.
7. Follow the user's preferred language.
8. Use clear Markdown formatting.
9. Provide complete code when requested.
10. Do not claim access to unavailable tools.
11. Never expose private credentials.
12. Do not claim to have searched the web,
    analysed files or generated artifacts
    unless those tools were actually used.

Be natural, helpful and professional.

Your application identity is BLAZE-X.
Be truthful about your underlying AI provider
when that information is available.
`;

/* PROVIDER REGISTRY */

const PROVIDERS = {
  groq: groqProvider,
  gemini: geminiProvider,
  openrouter: openRouterProvider,
};

/* REQUEST LIMITS */

const MAX_CONTEXT_MESSAGES = 40;

const MAX_MESSAGE_LENGTH = 24000;

const MAX_CONTEXT_LENGTH = 60000;

const ROUTER_TIMEOUT = 65000;
const FIRST_CHUNK_TIMEOUT = 12000;
const GENERATE_TIMEOUT = 18000;

/* COMPLEXITY DETECTION */

function detectComplexity(
  messages: ChatMessage[]
): "simple" | "normal" | "complex" {
  const lastMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  const text =
    lastMessage?.content.toLowerCase() || "";

  const complexPatterns = [
    /\barchitecture\b/,
    /\bdebug\b/,
    /\brefactor\b/,
    /\bderive\b/,
    /\bprove\b/,
    /\bcomplex\b/,
    /\bdetailed analysis\b/,
    /\bcompare in detail\b/,
    /\bstep.by.step\b/,
    /\bfull source code\b/,
    /\bmathematical proof\b/,
    /\bengineering calculation\b/,
    /\broot cause\b/,
    /\boptimize\b/,
  ];

  if (
    text.length > 1500 ||
    complexPatterns.some((pattern) =>
      pattern.test(text)
    )
  ) {
    return "complex";
  }

  if (
    text.length < 80 &&
    messages.length <= 2
  ) {
    return "simple";
  }

  return "normal";
}

/* INTELLIGENCE MODE SELECTION */

function resolveMode(
  request: AIRequest
): IntelligenceMode {
  if (request.mode !== "auto") {
    return request.mode;
  }

  const complexity = detectComplexity(
    request.messages
  );

  if (complexity === "complex") {
    return "deep";
  }

  if (complexity === "simple") {
    return "instant";
  }

  return "auto";
}

/* CONTEXT MANAGEMENT */

function prepareMessages(
  messages: ChatMessage[]
): ChatMessage[] {
  /*
    Only the server may supply system instructions.
    User-provided system messages are ignored.
  */

  const validMessages = messages.filter(
    (message) =>
      (
        message.role === "user" ||
        message.role === "assistant"
      ) &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
  );

  const recentMessages = validMessages.slice(
    -MAX_CONTEXT_MESSAGES
  );

  const selected: ChatMessage[] = [];

  let totalLength = 0;

  for (
    let i = recentMessages.length - 1;
    i >= 0;
    i--
  ) {
    const message = recentMessages[i];

    if (
      message.content.length >
      MAX_MESSAGE_LENGTH
    ) {
      throw new Error(
        "A message exceeds the allowed length."
      );
    }

    if (
      totalLength + message.content.length >
      MAX_CONTEXT_LENGTH
    ) {
      break;
    }

    selected.unshift(message);

    totalLength += message.content.length;
  }

  /*
    Keep the conversation beginning with a user
    message after trimming older context.
  */

  while (
    selected.length &&
    selected[0].role === "assistant"
  ) {
    selected.shift();
  }

  if (
    !selected.length ||
    selected[selected.length - 1].role !== "user"
  ) {
    throw new Error(
      "The request must end with a user message."
    );
  }

  return [
    {
      role: "system",
      content: SYSTEM_PROMPT.trim(),
    },
    ...selected,
  ];
}

/* PROVIDER PRIORITY */

function getProviderOrder(
  mode: IntelligenceMode
): AIProvider[] {
  let order: AIProvider[];

  switch (mode) {
    case "instant":
      order = [
        PROVIDERS.groq,
        PROVIDERS.gemini,
        PROVIDERS.openrouter,
      ];

      break;

    case "deep":
      order = [
        PROVIDERS.gemini,
        PROVIDERS.groq,
        PROVIDERS.openrouter,
      ];

      break;

    default:
      order = [
        PROVIDERS.groq,
        PROVIDERS.gemini,
        PROVIDERS.openrouter,
      ];
  }

  return order.filter(
    (provider) => provider.isConfigured()
  );
}

/* OUTPUT LIMITS */

function getOutputLimit(
  mode: IntelligenceMode
): number {
  switch (mode) {
    case "instant":
      return 1024;

    case "deep":
      return 4096;

    default:
      return 2048;
  }
}

/* REQUEST PREPARATION */

function prepareRequest(
  request: AIRequest
): AIRequest {
  const mode = resolveMode(request);

  const timeoutSignal =
    AbortSignal.timeout(ROUTER_TIMEOUT);

  const signal = request.signal
    ? AbortSignal.any([
        request.signal,
        timeoutSignal,
      ])
    : timeoutSignal;

  return {
    messages: prepareMessages(
      request.messages
    ),

    mode,

    temperature:
      mode === "deep" ? 0.4 : 0.7,

    maxTokens: getOutputLimit(mode),

    signal,
  };
}

/* SAFE ERROR LOGGING */

function logProviderFailure(
  provider: AIProvider,
  error: unknown
) {
  const code =
    error instanceof Error && error.name === "TimeoutError"
      ? "TIMEOUT"
      : error instanceof AIProviderError
      ? error.code
      : "UNKNOWN";

  console.warn(
    `[BLAZE-X] Provider ${provider.id} failed: ${code}`
  );
}

/* STREAM VALIDATION */

/*
  Wait for the first non-empty response chunk.

  If a provider fails before returning text,
  CORE BRAIN can try another provider.

  After text has been delivered, do not switch
  providers mid-response.
*/

// Race even operations that do not honour AbortSignal.
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
    if (signal.aborted) abort();
  });
}

function attemptDeadline(parent: AbortSignal, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Provider deadline exceeded", "TimeoutError"));
  }, ms);
  return {
    signal: AbortSignal.any([parent, controller.signal]),
    clear: () => clearTimeout(timer),
    abort: () => controller.abort(),
  };
}

async function primeStream(
  response: AIStreamResponse,
  signal: AbortSignal
): Promise<AIStreamResponse> {
  const reader = response.stream.getReader();
  let released = false;
  function release() {
    if (!released) {
      released = true;
      reader.releaseLock();
    }
  }
  function cleanup(reason?: unknown) {
    if (released) return;
    try {
      void reader.cancel(reason).catch(() => {});
    } finally {
      release();
    }
  }
  let first: Uint8Array;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await abortable(reader.read(), signal);
      if (done) throw new Error("Provider returned an empty response.");
      if (value?.length) { first = value; break; }
    }
  } catch (error) {
    cleanup(error);
    throw error;
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(first); },
    async pull(controller) {
      try {
        signal.throwIfAborted();
        const { done, value } = await abortable(reader.read(), signal);
        if (done) { release(); controller.close(); return; }
        if (value?.length) controller.enqueue(value);
      } catch (error) {
        if (!released) {
          cleanup(error);
          controller.error(error);
        }
      }
    },
    cancel(reason) { cleanup(reason); },
  });
  return { ...response, stream };
}

/* CORE BRAIN CLASS */

class CoreBrain {
  readonly name = "BLAZE-X CORE BRAIN";

  readonly version = "1.0.1";

  /* STANDARD GENERATION */

  async generate(
    request: AIRequest
  ): Promise<AIResponse> {
    const prepared = prepareRequest(request);

    const providers = getProviderOrder(
      prepared.mode
    );

    if (!providers.length) {
      throw new Error(
        "No AI providers are configured."
      );
    }

    for (const provider of providers) {
      prepared.signal?.throwIfAborted();

      const attempt = attemptDeadline(prepared.signal!, GENERATE_TIMEOUT);
      try {
        const response = await abortable(provider.generate({
          ...prepared, signal: attempt.signal,
        }), attempt.signal);

        if (!response.content.trim()) {
          throw new Error(
            "Empty provider response."
          );
        }

        return response;
      } catch (error) {
        if (prepared.signal?.aborted) {
          throw error;
        }

        logProviderFailure(provider, error);
      } finally {
        attempt.clear();
        attempt.abort();
      }
    }

    throw new Error(
      "All available AI providers are currently unavailable. Please try again later."
    );
  }

  /* LIVE STREAMING */

  async stream(
    request: AIRequest
  ): Promise<AIStreamResponse> {
    const prepared = prepareRequest(request);

    const providers = getProviderOrder(
      prepared.mode
    );

    if (!providers.length) {
      throw new Error(
        "No AI providers are configured."
      );
    }

    for (const provider of providers) {
      prepared.signal?.throwIfAborted();

      const attempt = attemptDeadline(prepared.signal!, FIRST_CHUNK_TIMEOUT);
      try {
        const pending = provider.stream({ ...prepared, signal: attempt.signal });
        // Dispose a response that arrives after its attempt has expired.
        void pending.then(response => {
          if (attempt.signal.aborted) void response.stream.cancel().catch(() => {});
        }, () => {});
        const response = await abortable(pending, attempt.signal);
        const primed = await primeStream(response, attempt.signal);
        attempt.clear(); // First text arrived; overall deadline still applies.
        return primed;
      } catch (error) {
        attempt.clear();
        attempt.abort();
        if (prepared.signal?.aborted) throw error;
        logProviderFailure(provider, error);
      }
    }

    throw new Error(
      "All available AI providers are currently unavailable. Please try again later."
    );
  }

  /* SAFE ENGINE STATUS */

  getStatus() {
    return {
      name: this.name,

      version: this.version,

      providers: Object.values(PROVIDERS)
        .map((provider) => ({
          id: provider.id,

          name: provider.name,

          configured:
            provider.isConfigured(),

          capabilities:
            provider.capabilities,
        })),

      modes: [
        "auto",
        "instant",
        "deep",
      ],

      streaming: true,

      automaticFallback: true,
    };
  }
}

/* EXPORT CORE BRAIN */

export const coreBrain = new CoreBrain();

/* END OF CORE BRAIN ROUTING ENGINE */
