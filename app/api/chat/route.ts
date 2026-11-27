
/* ==================================================
   BLAZE-X V1.0.2
   Secure CORE BRAIN Chat API
   Developed by Yuva
================================================== */

import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { z } from "zod";

import { env } from "@/lib/env";

import { checkRateLimit } from "@/lib/redis";

import { coreBrain } from "@/engines/core/router";

import { AIProviderError } from "@/providers/types";

/* RUNTIME CONFIGURATION */

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export const maxDuration = 90;

/* REQUEST LIMITS */

const MAX_BODY_BYTES = 512000;

const MAX_CONTEXT_LENGTH = 60000;

/* REQUEST VALIDATION */

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),

  content: z.string()
    .trim()
    .min(1)
    .max(24000),
});

const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema)
    .min(1)
    .max(100),

  mode: z.enum([
    "auto",
    "instant",
    "deep",
  ]).default("auto"),
}).strict();

/* SAFE ERROR RESPONSE */

function errorResponse(
  message: string,
  status: number,
  headers: Record<string, string> = {}
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status,

      headers: {
        "Cache-Control": "no-store",
        ...headers,
      },
    }
  );
}

/* AUTHENTICATION */

async function authenticate(
  request: NextRequest
): Promise<string | null> {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();

  if (!token) return null;

  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );

  const { data, error } =
    await supabase.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

/* SAFE REQUEST BODY READER */

async function readBody(
  request: NextRequest
): Promise<string> {
  if (!request.body) {
    throw new Error("EMPTY_BODY");
  }

  const reader = request.body.getReader();

  const decoder = new TextDecoder();

  let totalBytes = 0;

  let body = "";

  try {
    while (true) {
      if (request.signal.aborted) {
        throw new Error("REQUEST_ABORTED");
      }

      const { done, value } =
        await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});

        throw new Error("BODY_TOO_LARGE");
      }

      body += decoder.decode(value, {
        stream: true,
      });
    }

    body += decoder.decode();

    return body;

  } finally {
    reader.releaseLock();
  }
}

/* MAIN CHAT ENDPOINT */

export async function POST(
  request: NextRequest
) {
  const startedAt = Date.now();

  const requestId = crypto.randomUUID();

  let stage = "INITIALIZATION";

  function logStage(nextStage: string) {
    stage = nextStage;

    console.info("[BLAZE-X] CHAT STAGE", {
      requestId,
      stage,
      elapsedMs: Date.now() - startedAt,
    });
  }

  try {

    /* STEP 1 — CONFIGURATION CHECK */

    logStage("CONFIGURATION");

    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_ANON_KEY
    ) {
      return errorResponse(
        "Authentication service is not configured.",
        503
      );
    }

    /* STEP 2 — AUTHENTICATE USER */

    logStage("AUTHENTICATION");

    const userId = await authenticate(request);

    if (!userId) {
      return errorResponse(
        "Please sign in to use BLAZE-X AI.",
        401
      );
    }

    /* STEP 3 — CONTENT TYPE CHECK */

    logStage("CONTENT_TYPE");

    const contentType =
      request.headers.get("content-type") || "";

    if (
      !contentType.toLowerCase()
        .includes("application/json")
    ) {
      return errorResponse(
        "Only JSON requests are supported.",
        415
      );
    }

    /* STEP 4 — BODY SIZE CHECK */

    logStage("BODY_SIZE");

    const contentLength = Number(
      request.headers.get("content-length") || 0
    );

    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0
    ) {
      return errorResponse(
        "Invalid content length.",
        400
      );
    }

    if (contentLength > MAX_BODY_BYTES) {
      return errorResponse(
        "Request is too large.",
        413
      );
    }

    /* STEP 5 — PARSE REQUEST */

    logStage("BODY_PARSING");

    let body: unknown;

    try {
      const rawBody = await readBody(request);

      body = JSON.parse(rawBody);

    } catch (error) {

      if (request.signal.aborted) {
        return errorResponse(
          "Request cancelled.",
          499
        );
      }

      if (
        error instanceof Error &&
        error.message === "BODY_TOO_LARGE"
      ) {
        return errorResponse(
          "Request is too large.",
          413
        );
      }

      return errorResponse(
        "Invalid request body.",
        400
      );
    }

    /* STEP 6 — VALIDATE REQUEST */

    logStage("VALIDATION");

    const validated =
      ChatRequestSchema.safeParse(body);

    if (!validated.success) {
      return errorResponse(
        "Invalid chat request.",
        400
      );
    }

    const { messages, mode } = validated.data;

    const lastMessage =
      messages[messages.length - 1];

    if (lastMessage.role !== "user") {
      return errorResponse(
        "The final message must be from the user.",
        400
      );
    }

    /* STEP 7 — CONTEXT MANAGEMENT */

    logStage("CONTEXT_MANAGEMENT");

    const selected: typeof messages = [];

    let totalLength = 0;

    for (
      let i = messages.length - 1;
      i >= 0;
      i--
    ) {
      const message = messages[i];

      if (
        totalLength + message.content.length >
        MAX_CONTEXT_LENGTH
      ) {
        break;
      }

      selected.unshift(message);

      totalLength += message.content.length;
    }

    /* STEP 8 — RATE LIMIT PROTECTION */

    logStage("REDIS_RATE_LIMIT");

    const rateLimit =
      await checkRateLimit(userId);

    console.info("[BLAZE-X] REDIS RESULT", {
      requestId,
      allowed: rateLimit.allowed,
      reason: rateLimit.reason || "OK",
      elapsedMs: Date.now() - startedAt,
    });

    if (!rateLimit.allowed) {

      const retryAfter = Math.max(
        1,
        Math.ceil(
          (rateLimit.reset - Date.now()) / 1000
        )
      );

      if (
        rateLimit.reason === "SERVICE_UNAVAILABLE"
      ) {
        return errorResponse(
          "AI usage protection is temporarily unavailable.",
          503,
          {
            "Retry-After": String(retryAfter),
          }
        );
      }

      const message =
        rateLimit.reason === "GLOBAL_LIMIT"
          ? "BLAZE-X has reached its daily usage limit."
          : rateLimit.reason === "DAILY_LIMIT"
            ? "Your daily AI usage limit has been reached."
            : "Too many requests. Please wait and try again.";

      return errorResponse(
        message,
        429,
        {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
        }
      );
    }

    /* CHECK CANCELLATION */

    if (request.signal.aborted) {
      return errorResponse(
        "Request cancelled.",
        499
      );
    }

    /* STEP 9 — CORE BRAIN */

    logStage("CORE_BRAIN");

    console.info("[BLAZE-X] AI REQUEST", {
      requestId,
      mode,
      messageCount: selected.length,
      contextLength: totalLength,
    });

    const response = await coreBrain.stream({
      messages: selected,

      mode,

      signal: request.signal,
    });

    /* STEP 10 — LIVE RESPONSE */

    logStage("STREAM_INITIALIZED");

    console.info("[BLAZE-X] AI PROVIDER READY", {
      requestId,
      provider: response.provider,
      model: response.model,
      elapsedMs: Date.now() - startedAt,
    });

    return new Response(response.stream, {
      status: 200,

      headers: {
        "Content-Type":
          "text/plain; charset=utf-8",

        "Cache-Control":
          "no-cache, no-store, no-transform",

        "X-Content-Type-Options":
          "nosniff",

        "X-AI-Provider":
          response.provider,

        "X-AI-Model":
          response.model,

        "X-Request-ID":
          requestId,

        "X-RateLimit-Remaining":
          String(rateLimit.remaining),
      },
    });

  } catch (error) {

    /* SAFE BACKEND ERROR DIAGNOSTICS */

    console.error("[BLAZE-X] CHAT ERROR", {
      requestId,

      stage,

      elapsedMs: Date.now() - startedAt,

      errorType:
        error instanceof Error
          ? error.name
          : "UNKNOWN_ERROR",

      errorCode:
        error instanceof AIProviderError
          ? error.code
          : "INTERNAL_ERROR",
    });

    /* REQUEST CANCELLED */

    if (request.signal.aborted) {
      return errorResponse(
        "Request cancelled.",
        499
      );
    }

    /* PROVIDER ERROR */

    if (error instanceof AIProviderError) {

      if (error.code === "TIMEOUT") {
        return errorResponse(
          "AI providers are taking too long to respond. Please try again.",
          504
        );
      }

      if (error.code === "RATE_LIMIT") {
        return errorResponse(
          "AI provider usage limit reached. Please try again later.",
          429
        );
      }

      if (error.code === "MODEL_UNAVAILABLE") {
        return errorResponse(
          "The selected AI model is currently unavailable.",
          503
        );
      }

      if (error.code === "UNAUTHORIZED") {
        return errorResponse(
          "AI provider authentication failed.",
          503
        );
      }

      if (error.code === "NOT_CONFIGURED") {
        return errorResponse(
          "AI provider is not configured.",
          503
        );
      }
    }

    /* STAGE-SPECIFIC ERROR */

    if (stage === "AUTHENTICATION") {
      return errorResponse(
        "Authentication service is temporarily unavailable.",
        503
      );
    }

    if (stage === "REDIS_RATE_LIMIT") {
      return errorResponse(
        "AI usage protection is temporarily unavailable.",
        503
      );
    }

    if (stage === "CORE_BRAIN") {
      return errorResponse(
        "Core Brain could not initialize an AI response.",
        503,
        {
          "X-Request-ID": requestId,
        }
      );
    }

    /* GENERAL BACKEND ERROR */

    return errorResponse(
      "BLAZE-X AI is temporarily unavailable. Please try again.",
      503,
      {
        "X-Request-ID": requestId,
      }
    );
  }
}

/* BLOCK UNSUPPORTED GET REQUESTS */

export async function GET() {
  return errorResponse(
    "Method not allowed.",
    405,
    {
      Allow: "POST",
    }
  );
}

/* END OF SECURE CHAT API V1.0.2 */
