/* ==================================================
   BLAZE-X V1.0
   Secure CORE BRAIN Chat API
   Developed by Yuva
================================================== */

import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { z } from "zod";

import { env } from "@/lib/env";

import { checkRateLimit } from "@/lib/redis";

import { coreBrain } from "@/engines/core/router";

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
      const { done, value } =
        await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();

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
  try {
    /* STEP 1 — CONFIGURATION CHECK */

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

    const userId = await authenticate(request);

    if (!userId) {
      return errorResponse(
        "Please sign in to use BLAZE-X AI.",
        401
      );
    }

    /* STEP 3 — CONTENT TYPE CHECK */

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

    const contentLength = Number(
      request.headers.get("content-length") || 0
    );

    if (contentLength > MAX_BODY_BYTES) {
      return errorResponse(
        "Request is too large.",
        413
      );
    }

    /* STEP 5 — PARSE REQUEST */

    let body: unknown;

    try {
      const rawBody = await readBody(request);

      body = JSON.parse(rawBody);
    } catch (error) {
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

    const selected = [];

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

    const rateLimit =
      await checkRateLimit(userId);

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

    /* STEP 9 — CORE BRAIN */

    const response = await coreBrain.stream({
      messages: selected,

      mode,

      signal: request.signal,
    });

    /* STEP 10 — LIVE RESPONSE */

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

        "X-RateLimit-Remaining":
          String(rateLimit.remaining),
      },
    });

  } catch {
    if (request.signal.aborted) {
      return errorResponse(
        "Request cancelled.",
        499
      );
    }

    console.warn(
      "[BLAZE-X] Chat request failed."
    );

    return errorResponse(
      "BLAZE-X AI is temporarily unavailable. Please try again.",
      503
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

/* END OF SECURE CHAT API */
