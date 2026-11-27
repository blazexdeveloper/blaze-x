/* ==================================================
   BLAZE-X V1.0
   SUPABASE X — Authentication Engine
   Developed by Yuva
================================================== */

"use client";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/* CONFIGURATION */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "";

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/* CLIENT INSTANCE */

let client: SupabaseClient | null = null;

/* INITIALIZE SUPABASE */

export function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Supabase authentication is not configured."
    );
  }

  if (!client) {
    client = createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth: {
          persistSession: true,

          autoRefreshToken: true,

          detectSessionInUrl: true,

          flowType: "pkce",

          storageKey: "blaze-x-auth",
        },
      }
    );
  }

  return client;
}

/* REGISTER NEW USER */

export async function signUp(
  email: string,
  password: string,
  name: string
) {
  const supabase = getSupabase();

  const { data, error } =
    await supabase.auth.signUp({
      email: email.trim().toLowerCase(),

      password,

      options: {
        data: {
          full_name: name.trim(),
        },

        emailRedirectTo:
          window.location.origin,
      },
    });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/* USER LOGIN */

export async function signIn(
  email: string,
  password: string
) {
  const supabase = getSupabase();

  const { data, error } =
    await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),

      password,
    });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/* USER LOGOUT */

export async function signOut() {
  const supabase = getSupabase();

  const { error } =
    await supabase.auth.signOut({
      scope: "local",
    });

  if (error) {
    throw new Error(error.message);
  }
}

/* GET CURRENT SESSION */

export async function getSession() {
  const supabase = getSupabase();

  const { data, error } =
    await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  return data.session;
}

/* GET VERIFIED USER */

export async function getCurrentUser() {
  const supabase = getSupabase();

  const { data, error } =
    await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user;
}

/* GET ACCESS TOKEN */

export async function getAccessToken() {
  const session = await getSession();

  return session?.access_token || null;
}

/* AUTHENTICATED API REQUEST */

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const target = new URL(
    url,
    window.location.origin
  );

  if (
    target.origin !== window.location.origin ||
    !target.pathname.startsWith("/api/")
  ) {
    throw new Error(
      "Invalid authenticated API destination."
    );
  }

  const token = await getAccessToken();

  if (!token) {
    throw new Error(
      "Please sign in to continue."
    );
  }

  const headers = new Headers(options.headers);

  headers.set(
    "Authorization",
    `Bearer ${token}`
  );

  return fetch(target.toString(), {
    ...options,

    headers,

    redirect: "error",
  });
}

/* AUTHENTICATION STATE LISTENER */

export function onAuthChange(
  callback: Parameters<
    SupabaseClient["auth"]["onAuthStateChange"]
  >[0]
) {
  const supabase = getSupabase();

  const { data } =
    supabase.auth.onAuthStateChange(callback);

  return () => {
    data.subscription.unsubscribe();
  };
}

/* END OF SUPABASE X ENGINE */
