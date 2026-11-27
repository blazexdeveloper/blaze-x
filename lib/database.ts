/* ==================================================
   BLAZE-X V1.0
   DATABASE X — Permanent Storage Engine
   Developed by Yuva
================================================== */

"use client";

import {
  getSupabase,
  getCurrentUser,
} from "@/lib/supabase";

/* ================================================
   TYPE DEFINITIONS
================================================ */

export type ChatMode =
  | "auto"
  | "instant"
  | "deep";

export type MessageRole =
  | "user"
  | "assistant";

export interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  mode: ChatMode;
  archived: boolean;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoredMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  provider: string | null;
  model: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UserMemory {
  id: string;
  user_id: string;
  category: string;
  content: string;
  importance: number;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/* ================================================
   SECURITY & VALIDATION
================================================ */

async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error(
      "Please sign in to continue."
    );
  }

  return user;
}

function validateText(
  value: string,
  maxLength: number,
  field: string
) {
  const text = value.trim();

  if (!text) {
    throw new Error(
      `${field} cannot be empty.`
    );
  }

  if (text.length > maxLength) {
    throw new Error(
      `${field} exceeds the maximum length.`
    );
  }

  return text;
}

/* ================================================
   1. USER PROFILE ENGINE
================================================ */

export async function getProfile():
  Promise<UserProfile> {

  const user = await requireUser();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw new Error(error.message);

  return data as UserProfile;
}

export async function updateProfile(
  updates: {
    full_name?: string;
    avatar_url?: string | null;
    preferences?: Record<string, unknown>;
  }
): Promise<UserProfile> {

  const user = await requireUser();
  const supabase = getSupabase();

  const safeUpdates: Record<string, unknown> = {};

  if (updates.full_name !== undefined) {
    safeUpdates.full_name =
      updates.full_name.trim().slice(0, 100);
  }

  if (updates.avatar_url !== undefined) {
    safeUpdates.avatar_url = updates.avatar_url;
  }

  if (updates.preferences !== undefined) {
    safeUpdates.preferences = updates.preferences;
  }

  if (!Object.keys(safeUpdates).length) {
    return getProfile();
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(safeUpdates)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data as UserProfile;
}

/* ================================================
   2. CONVERSATION ENGINE
================================================ */

export async function createConversation(
  title = "New Chat",
  mode: ChatMode = "auto"
): Promise<Conversation> {

  const user = await requireUser();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: user.id,
      title: title.trim().slice(0, 150)
        || "New Chat",
      mode,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data as Conversation;
}

export async function getConversations(
  archived = false,
  offset = 0,
  limit = 50
): Promise<Conversation[]> {

  const user = await requireUser();
  const supabase = getSupabase();

  const start = Math.max(
    0,
    Math.floor(offset)
  );

  const size = Math.min(
    100,
    Math.max(1, Math.floor(limit))
  );

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", user.id)
    .eq("archived", archived)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + size - 1);

  if (error) throw new Error(error.message);

  return (data || []) as Conversation[];
}

export async function getConversation(
  id: string
): Promise<Conversation> {

  const user = await requireUser();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) throw new Error(error.message);

  return data as Conversation;
}

export async function updateConversation(
  id: string,
  updates: {
    title?: string;
    mode?: ChatMode;
    archived?: boolean;
    pinned?: boolean;
  }
): Promise<Conversation> {

  const user = await requireUser();
  const supabase = getSupabase();

  const safeUpdates: Record<string, unknown> = {};

  if (updates.title !== undefined) {
    safeUpdates.title =
      validateText(updates.title, 150, "Title");
  }

  if (updates.mode !== undefined) {
    safeUpdates.mode = updates.mode;
  }

  if (updates.archived !== undefined) {
    safeUpdates.archived = updates.archived;
  }

  if (updates.pinned !== undefined) {
    safeUpdates.pinned = updates.pinned;
  }

  if (!Object.keys(safeUpdates).length) {
    return getConversation(id);
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(safeUpdates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data as Conversation;
}

export async function renameConversation(
  id: string,
  title: string
) {
  return updateConversation(id, { title });
}

export async function archiveConversation(
  id: string,
  archived = true
) {
  return updateConversation(id, { archived });
}

export async function pinConversation(
  id: string,
  pinned = true
) {
  return updateConversation(id, { pinned });
}

export async function deleteConversation(
  id: string
): Promise<void> {

  const user = await requireUser();
  const supabase = getSupabase();

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/* ================================================
   3. CHAT MESSAGE ENGINE
================================================ */

export async function saveMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  options: {
    provider?: string;
    model?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<StoredMessage> {

  const user = await requireUser();
  const supabase = getSupabase();

  validateText(content, 100000, "Message");

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      role,
      content,
      provider: options.provider || null,
      model: options.model || null,
      metadata: options.metadata || {},
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  // Refresh the conversation's activity timestamp.
  const { error: touchError } = await supabase
    .from("conversations")
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("user_id", user.id);

  // Message is already saved.
  // Do not retry the insert if timestamp update fails.
  if (touchError) {
    console.warn(
      "Conversation timestamp update failed."
    );
  }

  return data as StoredMessage;
}

export async function getMessages(
  conversationId: string,
  offset = 0,
  limit = 100
): Promise<StoredMessage[]> {

  const user = await requireUser();
  const supabase = getSupabase();

  const start = Math.max(
    0,
    Math.floor(offset)
  );

  const size = Math.min(
    200,
    Math.max(1, Math.floor(limit))
  );

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + size - 1);

  if (error) throw new Error(error.message);

  return (
    (data || []) as StoredMessage[]
  ).reverse();
}

export async function deleteMessage(
  id: string
): Promise<void> {

  const user = await requireUser();
  const supabase = getSupabase();

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/* ================================================
   4. PERMANENT MEMORY ENGINE
================================================ */

export async function saveMemory(
  content: string,
  category = "general",
  importance = 5,
  metadata: Record<string, unknown> = {}
): Promise<UserMemory> {

  const user = await requireUser();
  const supabase = getSupabase();

  const text = validateText(
    content,
    8000,
    "Memory"
  );

  const priority = Number.isFinite(importance)
    ? Math.min(
        10,
        Math.max(1, Math.round(importance))
      )
    : 5;

  const { data, error } = await supabase
    .from("memories")
    .insert({
      user_id: user.id,
      category:
        category.trim().slice(0, 100)
        || "general",
      content: text,
      importance: priority,
      active: true,
      metadata,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data as UserMemory;
}

export async function getMemories(
  category?: string,
  limit = 50
): Promise<UserMemory[]> {

  const user = await requireUser();
  const supabase = getSupabase();

  let query = supabase
    .from("memories")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true);

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(
      Math.min(
        100,
        Math.max(1, Math.floor(limit))
      )
    );

  if (error) throw new Error(error.message);

  return (data || []) as UserMemory[];
}

export async function updateMemory(
  id: string,
  updates: {
    content?: string;
    category?: string;
    importance?: number;
    active?: boolean;
  }
): Promise<UserMemory> {

  const user = await requireUser();
  const supabase = getSupabase();

  const safeUpdates: Record<string, unknown> = {};

  if (updates.content !== undefined) {
    safeUpdates.content = validateText(
      updates.content,
      8000,
      "Memory"
    );
  }

  if (updates.category !== undefined) {
    safeUpdates.category =
      updates.category.trim().slice(0, 100)
      || "general";
  }

  if (updates.importance !== undefined) {
    if (!Number.isFinite(updates.importance)) {
      throw new Error("Invalid importance.");
    }

    safeUpdates.importance = Math.min(
      10,
      Math.max(
        1,
        Math.round(updates.importance)
      )
    );
  }

  if (updates.active !== undefined) {
    safeUpdates.active = updates.active;
  }

  if (!Object.keys(safeUpdates).length) {
    throw new Error("No memory updates provided.");
  }

  const { data, error } = await supabase
    .from("memories")
    .update(safeUpdates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return data as UserMemory;
}

export async function deleteMemory(
  id: string
): Promise<void> {

  const user = await requireUser();
  const supabase = getSupabase();

  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

export async function clearAllMemories():
  Promise<void> {

  const user = await requireUser();
  const supabase = getSupabase();

  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}

/* ================================================
   5. DATABASE ENGINE EXPORT
================================================ */

export const database = {
  profiles: {
    get: getProfile,
    update: updateProfile,
  },

  conversations: {
    create: createConversation,
    list: getConversations,
    get: getConversation,
    update: updateConversation,
    rename: renameConversation,
    archive: archiveConversation,
    pin: pinConversation,
    delete: deleteConversation,
  },

  messages: {
    save: saveMessage,
    list: getMessages,
    delete: deleteMessage,
  },

  memories: {
    save: saveMemory,
    list: getMemories,
    update: updateMemory,
    delete: deleteMemory,
    clear: clearAllMemories,
  },
};

/* END OF DATABASE X ENGINE */
