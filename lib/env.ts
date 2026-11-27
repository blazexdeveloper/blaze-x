/* ==================================================
   BLAZE-X V1.0
   Secure Environment Configuration
   Developed by Yuva
================================================== */

import "server-only";

/* SECURE ENVIRONMENT VARIABLES */

function readEnv(name: string): string {
  return process.env[name]?.trim() || "";
}

/* AI PROVIDER CONFIGURATION */

export const env = Object.freeze({
  GROQ_API_KEY: readEnv("GROQ_API_KEY"),

  CEREBRAS_API_KEY: readEnv("CEREBRAS_API_KEY"),

  GEMINI_API_KEY: readEnv("GEMINI_API_KEY"),

  OPENROUTER_API_KEY: readEnv("OPENROUTER_API_KEY"),

  UPSTASH_REDIS_REST_URL: readEnv(
    "UPSTASH_REDIS_REST_URL"
  ),

  UPSTASH_REDIS_REST_TOKEN: readEnv(
    "UPSTASH_REDIS_REST_TOKEN"
  ),

  SUPABASE_URL: readEnv(
    "NEXT_PUBLIC_SUPABASE_URL"
  ),

  SUPABASE_ANON_KEY: readEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  ),

  NODE_ENV: process.env.NODE_ENV || "development",
});

/* PROVIDER CONFIGURATION STATUS */

export const providers = Object.freeze({
  groq: Boolean(env.GROQ_API_KEY),

  cerebras: Boolean(env.CEREBRAS_API_KEY),

  gemini: Boolean(env.GEMINI_API_KEY),

  openrouter: Boolean(env.OPENROUTER_API_KEY),

  redis: Boolean(
    env.UPSTASH_REDIS_REST_URL &&
    env.UPSTASH_REDIS_REST_TOKEN
  ),

  supabase: Boolean(
    env.SUPABASE_URL &&
    env.SUPABASE_ANON_KEY
  ),
});

/* AVAILABLE AI PROVIDERS */

export function getAvailableProviders(): string[] {
  const available: string[] = [];

  if (providers.groq) available.push("groq");

  if (providers.cerebras) available.push("cerebras");

  if (providers.gemini) available.push("gemini");

  if (providers.openrouter) {
    available.push("openrouter");
  }

  return available;
}

/* SAFE CONFIGURATION STATUS */

export function getConfigurationStatus() {
  return {
    application: "BLAZE-X",
    version: "1.0.0",
    environment: env.NODE_ENV,

    ai: {
      configured: getAvailableProviders().length > 0,
      providers: getAvailableProviders(),
    },

    cache: {
      configured: providers.redis,
    },

    database: {
      configured: providers.supabase,
    },
  };
}

/* END OF SECURE CONFIGURATION */
