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
