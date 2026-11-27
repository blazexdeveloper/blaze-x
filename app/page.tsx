"use client";

/* ==================================================
   BLAZE-X V1.0
   Main Intelligence Workspace
   Developed by Yuva
================================================== */

import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import {
  Zap,
  Plus,
  Menu,
  PanelLeftClose,
  MessageSquare,
  Search,
  Settings,
  Sun,
  Moon,
  Paperclip,
  ArrowUp,
  Square,
  BrainCircuit,
  Globe,
  FileText,
  Image as ImageIcon,
  Code2,
  GraduationCap,
  Copy,
  Check,
  X,
  Trash2,
  ChevronDown,
  LogOut,
} from "lucide-react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import AuthGuard, { useAuth } from "@/components/AuthGuard";
import { authenticatedFetch } from "@/lib/supabase";
import { database } from "@/lib/database";

/* TYPES */

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: string[];
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

type ModelMode = "auto" | "instant" | "deep";

/* CONFIGURATION */

const APP_NAME = "BLAZE-X";



const MAX_FILES = 5;

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const MODELS = [
  {
    id: "auto",
    name: "BLAZE-X Auto",
    description: "Automatic intelligence selection",
  },
  {
    id: "instant",
    name: "BLAZE-X Instant",
    description: "Fast everyday responses",
  },
  {
    id: "deep",
    name: "BLAZE-X Deep",
    description: "Advanced reasoning",
  },
] as const;

const SUGGESTIONS = [
  {
    icon: Code2,
    label: "Write code",
    prompt: "Help me write a web application.",
  },
  {
    icon: GraduationCap,
    label: "Learn something",
    prompt: "Help me understand a new topic.",
  },
  {
    icon: FileText,
    label: "Analyse documents",
    prompt: "Help me analyse a document.",
  },
  {
    icon: Globe,
    label: "Research a topic",
    prompt: "Help me research a topic.",
  },
];

/* UTILITIES */

function createId() {
  return crypto.randomUUID();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* INSTANT X — ZERO EXTERNAL AI CALLS */

function getInstantResponse(
  input: string,
  hasContext: boolean
): string | null {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, "")
    .trim();

  const greetings = [
    "hi",
    "hii",
    "hiii",
    "hello",
    "hey",
    "hi bro",
    "hello bro",
    "hey bro",
    "hai",
  ];

  if (greetings.includes(text)) {
    if (hasContext) {
      return "Hi again! How can I help?";
    }

    const replies = [
      "Hi! How can I assist you today?",
      "Hello! What can I help you with?",
      "Hey! What are we working on today?",
      "Hi there! Ready to assist you.",
    ];

    return replies[
      Math.floor(Math.random() * replies.length)
    ];
  }

  if (text === "good morning") {
    return "Good morning! How can I help you today?";
  }

  if (text === "good afternoon") {
    return "Good afternoon! How can I assist you?";
  }

  if (text === "good evening") {
    return "Good evening! What can I help you with?";
  }

  if (
    [
      "thanks",
      "thank you",
      "thanks bro",
      "thank you bro",
    ].includes(text)
  ) {
    return "You're welcome!";
  }

  if (
    ["who are you", "what is your name"].includes(text)
  ) {
    return "I'm **BLAZE-X**, your personal AI assistant.";
  }

  if (
    [
      "who created you",
      "who developed you",
      "who made you",
    ].includes(text)
  ) {
    return "BLAZE-X was developed by **Yuva**.";
  }

  if (text === "what time is it") {
    return `Your device's current time is **${new Date().toLocaleTimeString()}**.`;
  }

  if (
    ["what is today's date", "what is the date"].includes(
      text
    )
  ) {
    return `Today's date on your device is **${new Date().toLocaleDateString()}**.`;
  }

  return null;
}

/* MAIN APPLICATION */

export default function Home() {
  return <AuthGuard><Workspace /></AuthGuard>;
}

function Workspace() {
  const { user, logout } = useAuth();
  const busy = useRef(false);
  const alive = useRef(true);
  const [conversations, setConversations] = useState<
    Conversation[]
  >([]);

  const [activeId, setActiveId] = useState<string | null>(
    null
  );

  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [desktopSidebar, setDesktopSidebar] =
    useState(true);

  const [theme, setTheme] = useState<"dark" | "light">(
    "dark"
  );

  const [mode, setMode] = useState<ModelMode>("auto");

  const [modelMenu, setModelMenu] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);

  const [searchText, setSearchText] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(
    null
  );

  const [error, setError] = useState("");

  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const controllerRef = useRef<AbortController | null>(
    null
  );

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeId
  );

  const messages = activeConversation?.messages || [];

  /* LOAD PRIVATE CLOUD HISTORY */
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    async function load() {
      try {
        const rows = await database.conversations.list();
        if (cancelled) return;
        setConversations(rows.map(row => ({
          id: row.id, title: row.title, messages: [],
          updatedAt: Date.parse(row.updated_at),
        })));
        const saved = localStorage.getItem(`blaze-x-theme-${user.id}`);
        if (saved === "light" || saved === "dark") setTheme(saved);
        setReady(true);
      } catch {
        if (!cancelled) setError("Unable to load private history. Refresh to retry.");
      }
    }
    void load();
    return () => { cancelled = true; alive.current = false; controllerRef.current?.abort(); };
  }, [user.id]);

  /* THEME */

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      theme
    );

    if (ready) {
      try { localStorage.setItem(`blaze-x-theme-${user.id}`, theme); } catch {}
    }
  }, [theme, ready, user.id]);

  /* AUTO SCROLL */

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: loading ? "instant" : "smooth",
    });
  }, [conversations, activeId, loading]);

  /* AUTO RESIZE */

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) return;

    textarea.style.height = "44px";

    textarea.style.height = `${Math.min(
      textarea.scrollHeight,
      200
    )}px`;
  }, [input]);

  /* CHAT MANAGEMENT */

  function newChat() {
    if (loading || busy.current) return;

    setActiveId(null);
    setInput("");
    setFiles([]);
    setError("");
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }

  async function openConversation(id: string) {
    if (loading || busy.current || !ready) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const rows = await database.messages.list(id);
      if (!alive.current) return;
      setConversations(previous => previous.map(chat => chat.id === id ? {
        ...chat, messages: rows.map(row => ({ id: row.id, role: row.role, content: row.content }))
      } : chat));
      setActiveId(id);
      setFiles([]); setInput(""); setSidebarOpen(false); setSearchOpen(false);
    } catch { setError("Unable to open chat."); }
    finally { busy.current = false; setLoading(false); }
  }

  async function deleteConversation(id: string) {
    if (loading || busy.current || !ready) return;
    if (!window.confirm("Delete this conversation?")) return;
    busy.current = true; setLoading(true);
    try {
      await database.conversations.delete(id);
      setConversations(previous => previous.filter(chat => chat.id !== id));
      if (activeId === id) setActiveId(null);
    } catch { setError("Unable to delete chat."); }
    finally { busy.current = false; setLoading(false); }
  }

  function updateMessage(
    conversationId: string,
    messageId: string,
    content: string
  ) {
    setConversations((previous) =>
      previous.map((chat) =>
        chat.id === conversationId
          ? {
              ...chat,
              updatedAt: Date.now(),
              messages: chat.messages.map((message) =>
                message.id === messageId
                  ? { ...message, content }
                  : message
              ),
            }
          : chat
      )
    );
  }

  /* ATTACHMENTS */

  function addFiles(incoming: File[]) {
    setError("");

    const accepted: File[] = [];

    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE) {
        setError(
          `${file.name} exceeds the 10 MB file limit.`
        );

        continue;
      }

      accepted.push(file);
    }

    setFiles((previous) => {
      const combined = [...previous, ...accepted];

      return combined.slice(0, MAX_FILES);
    });
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    addFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((previous) =>
      previous.filter((_, i) => i !== index)
    );
  }

  /* COPY RESPONSE */

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(
        message.content
      );

      setCopiedId(message.id);

      window.setTimeout(() => {
        setCopiedId(null);
      }, 1500);
    } catch {
      setError("Unable to copy this response.");
    }
  }

  /* CORE CHAT REQUEST */

  async function sendMessage() {
    const text = input.trim();
    if (!ready || loading || busy.current || (!text && !files.length)) return;
    setError("");
    if (files.length) { setError("File intelligence will be enabled in the upcoming FILE X module."); return; }
    if (text.length > 24000) { setError("Message exceeds 24,000 characters."); return; }
    busy.current = true;
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    let conversationId = activeId;
    let assistantId = "";
    let fullResponse = "";
    let provider: string | undefined;
    let model: string | undefined;
    const previousMessages = [...messages];
    try {
      if (!conversationId) {
        const row = await database.conversations.create(text.slice(0, 55), mode);
        conversationId = row.id;
        setConversations(previous => [{ id: row.id, title: row.title, messages: [], updatedAt: Date.parse(row.updated_at) }, ...previous]);
        setActiveId(row.id);
      }
      if (!alive.current || controller.signal.aborted) return;
      const saved = await database.messages.save(conversationId, "user", text);
      if (!alive.current) return;
      const userMessage: Message = { id: saved.id, role: "user", content: text };
      assistantId = createId();
      const assistantMessage: Message = { id: assistantId, role: "assistant", content: "" };
      setConversations(previous => previous.map(chat => chat.id === conversationId ? { ...chat, updatedAt: Date.now(), messages: [...previousMessages, userMessage, assistantMessage] } : chat));
      setInput("");
      if (controller.signal.aborted) throw new Error("Stopped");
      const instant = mode !== "deep" ? getInstantResponse(text, previousMessages.length > 0) : null;
      if (instant) { fullResponse = instant; provider = "instant-x"; }
      else {
        const response = await authenticatedFetch("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [...previousMessages, userMessage].filter(m => m.content).slice(-40).map(m => ({ role: m.role, content: m.content.slice(0, 24000) })), mode }),
          signal: controller.signal,
        });
       if (!response.ok) {
  const errorData = await response.json()
    .catch(() => null);

  throw new Error(
    errorData?.error ||
    `AI request failed (${response.status}).`
  );
}
        if (!response.body) throw new Error("No response stream received.");
        provider = response.headers.get("X-AI-Provider") || undefined;
        model = response.headers.get("X-AI-Model") || undefined;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullResponse += decoder.decode(value, { stream: true });
            if (alive.current) updateMessage(conversationId, assistantId, fullResponse);
          }
          fullResponse += decoder.decode();
        } finally { reader.releaseLock(); }
      }
      if (!fullResponse.trim()) throw new Error("No response received.");
    } catch (err) {
      if (alive.current) setError(controller.signal.aborted ? "Response stopped." : err instanceof Error ? err.message : "Request failed.");
    } finally {
      if (alive.current && conversationId && assistantId) {
        if (fullResponse.trim()) {
          updateMessage(conversationId, assistantId, fullResponse);
          try {
            const saved = await database.messages.save(conversationId, "assistant", fullResponse, { provider, model });
            setConversations(previous => previous.map(chat => chat.id === conversationId ? { ...chat, messages: chat.messages.map(m => m.id === assistantId ? { ...m, id: saved.id } : m) } : chat));
          } catch { setError("Reply received but cloud saving failed. Copy it before leaving."); }
        } else {
          setConversations(previous => previous.map(chat => chat.id === conversationId ? { ...chat, messages: chat.messages.filter(m => m.id !== assistantId) } : chat));
        }
      }
      busy.current = false; controllerRef.current = null;
      if (alive.current) setLoading(false);
    }
  }

  async function handleLogout() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try { await logout(); }
    catch { setError("Unable to sign out. Try again."); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  }

  function stopResponse() {
    controllerRef.current?.abort();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (event.nativeEvent.isComposing) return;

    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void sendMessage();
    }
  }

  /* FILTERED CHAT HISTORY */

  const sortedChats = [...conversations].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  const filteredChats = sortedChats.filter((chat) =>
    chat.title
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );

  /* INTERFACE */

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`sidebar ${
          sidebarOpen ? "open" : ""
        } ${
          !desktopSidebar && !sidebarOpen
            ? "hidden"
            : ""
        }`}
      >
        <div className="sidebar-header">
          <div className="brand">
            <Zap
              className="brand-icon"
              size={25}
              fill="currentColor"
            />

            {APP_NAME}
          </div>

          <button
            className="icon-button"
            title="Close sidebar"
            aria-label="Close sidebar"
            onClick={() => {
              setSidebarOpen(false);
              setDesktopSidebar(false);
            }}
          >
            <PanelLeftClose size={19} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            className="nav-button"
            onClick={newChat}
            disabled={loading}
          >
            <Plus size={19} />
            New chat
          </button>

          <button
            className="nav-button"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={19} />
            Search chats
          </button>
        </nav>

        <div className="sidebar-label">
          Recent conversations
        </div>

        <div className="chat-history">
          {sortedChats.length === 0 && (
            <p
              className="muted"
              style={{
                padding: "10px",
                fontSize: "13px",
              }}
            >
              No conversations yet.
            </p>
          )}

          {sortedChats.map((chat) => (
            <div
              key={chat.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              <button
                className={`history-item ${
                  activeId === chat.id
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  openConversation(chat.id)
                }
                disabled={loading}
                title={chat.title}
              >
                {chat.title}
              </button>

              <button
                className="icon-button"
                title="Delete chat"
                aria-label="Delete chat"
                disabled={loading}
                onClick={() =>
                  deleteConversation(chat.id)
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="muted" style={{padding: "10px", overflowWrap: "anywhere"}}>{user.email}</div>
          <button className="nav-button" disabled={loading} onClick={() => void handleLogout()}><LogOut size={19} /> Sign out</button>
          <button
            className="nav-button"
            onClick={() =>
              setTheme(
                theme === "dark" ? "light" : "dark"
              )
            }
          >
            {theme === "dark" ? (
              <Sun size={19} />
            ) : (
              <Moon size={19} />
            )}

            {theme === "dark"
              ? "Light mode"
              : "Dark mode"}
          </button>

          <button
            className="nav-button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={19} />
            Settings
          </button>

          <div
            className="muted"
            style={{
              padding: "10px",
              fontSize: "11px",
            }}
          >
            BLAZE-X V1.0 · Foundation
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button"
              title="Open sidebar"
              aria-label="Open sidebar"
              onClick={() => {
                setDesktopSidebar(true);
                setSidebarOpen(true);
              }}
            >
              <Menu size={21} />
            </button>

            <div className="dropdown">
              <button
                className="model-selector"
                onClick={() =>
                  setModelMenu(!modelMenu)
                }
              >
                {
                  MODELS.find(
                    (model) => model.id === mode
                  )?.name
                }

                <ChevronDown size={16} />
              </button>

              {modelMenu && (
                <div className="dropdown-menu">
                  {MODELS.map((model) => (
                    <button
                      key={model.id}
                      className="dropdown-item"
                      onClick={() => {
                        setMode(model.id);
                        setModelMenu(false);
                      }}
                    >
                      <BrainCircuit size={18} />

                      <div style={{ flex: 1 }}>
                        <div>{model.name}</div>

                        <div
                          className="muted"
                          style={{
                            fontSize: "11px",
                          }}
                        >
                          {model.description}
                        </div>
                      </div>

                      {mode === model.id && (
                        <Check size={16} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="topbar-right">
            <button
              className="icon-button"
              title="New chat"
              aria-label="New chat"
              onClick={newChat}
              disabled={loading}
            >
              <MessageSquare size={20} />
            </button>
          </div>
        </header>

        <section
          className="chat-area"
          aria-label="Conversation"
        >
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <Zap
                className="welcome-logo"
                size={60}
                strokeWidth={1.5}
                fill="currentColor"
              />

              <h1 className="welcome-title">
                What can I help with?
              </h1>

              <p className="welcome-subtitle">
                Think. Create. Analyse. Build.
              </p>

              <div className="suggestion-grid">
                {SUGGESTIONS.map((suggestion) => {
                  const Icon = suggestion.icon;

                  return (
                    <button
                      key={suggestion.label}
                      className="suggestion-card"
                      onClick={() => {
                        setInput(suggestion.prompt);
                        textareaRef.current?.focus();
                      }}
                    >
                      <Icon size={22} />
                      {suggestion.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="chat-container">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message-row ${message.role}`}
                >
                  {message.role === "assistant" && (
                    <div className="message-avatar">
                      <Zap
                        size={18}
                        fill="currentColor"
                      />
                    </div>
                  )}

                  <div className="message-content">
                    {message.role === "assistant" ? (
                      <>
                        {!message.content &&
                        loading ? (
                          <div
                            className="typing-indicator"
                            aria-label="Generating response"
                          >
                            <span />
                            <span />
                            <span />
                          </div>
                        ) : (
                          <div className="markdown">
                            <ReactMarkdown
                              remarkPlugins={[
                                remarkGfm,
                              ]}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        )}

                        {message.content && (
                          <div className="message-actions">
                            <button
                              className="icon-button"
                              title="Copy response"
                              aria-label="Copy response"
                              onClick={() =>
                                void copyMessage(
                                  message
                                )
                              }
                            >
                              {copiedId ===
                              message.id ? (
                                <Check size={16} />
                              ) : (
                                <Copy size={16} />
                              )}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              ))}

              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <div className="composer-wrapper">
          <div className="composer-container">
            {error && (
              <div
                className="error-message"
                role="alert"
              >
                {error}
              </div>
            )}

            <div
              className={`composer ${
                dragActive ? "drag-active" : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() =>
                setDragActive(false)
              }
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);

                if (!loading) {
                  addFiles(
                    Array.from(
                      event.dataTransfer.files
                    )
                  );
                }
              }}
            >
              {files.length > 0 && (
                <div className="attachment-list">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="attachment-card"
                    >
                      {file.type.startsWith(
                        "image/"
                      ) ? (
                        <ImageIcon size={24} />
                      ) : (
                        <FileText size={24} />
                      )}

                      <div style={{ minWidth: 0 }}>
                        <div className="attachment-name">
                          {file.name}
                        </div>

                        <div className="attachment-size">
                          {formatFileSize(file.size)}
                        </div>
                      </div>

                      <button
                        className="icon-button"
                        title="Remove attachment"
                        aria-label="Remove attachment"
                        onClick={() =>
                          removeFile(index)
                        }
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                placeholder="Ask anything..."
                aria-label="Message BLAZE-X"
                value={input}
                rows={1}
                onChange={(event) =>
                  setInput(event.target.value)
                }
                onKeyDown={handleKeyDown}
                onPaste={(event) => {
                  const pastedFiles = Array.from(
                    event.clipboardData.files
                  );

                  if (
                    pastedFiles.length > 0 &&
                    !loading
                  ) {
                    event.preventDefault();
                    addFiles(pastedFiles);
                  }
                }}
              />

              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept="image/*,.pdf,.xlsx,.xls,.csv,.docx,.txt,.json"
                onChange={handleFileChange}
              />

              <div className="composer-toolbar">
                <div className="toolbar-left">
                  <button
                    className="icon-button"
                    title="Attach files"
                    aria-label="Attach files"
                    disabled={loading}
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                  >
                    <Paperclip size={21} />
                  </button>

                  <button
                    className={`tool-button ${
                      mode === "deep"
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      setMode(
                        mode === "deep"
                          ? "auto"
                          : "deep"
                      )
                    }
                    disabled={loading}
                  >
                    <BrainCircuit size={16} />
                    Think
                  </button>

                  <button
                    className="tool-button"
                    disabled
                    title="Web search coming soon"
                  >
                    <Globe size={16} />
                    Search
                  </button>
                </div>

                <div className="toolbar-right">
                  {loading ? (
                    <button
                      className="send-button stop-button"
                      title="Stop response"
                      aria-label="Stop response"
                      onClick={stopResponse}
                    >
                      <Square
                        size={16}
                        fill="currentColor"
                      />
                    </button>
                  ) : (
                    <button
                      className="send-button"
                      title="Send message"
                      aria-label="Send message"
                      disabled={
                        !ready ||
                        (!input.trim() &&
                          files.length === 0)
                      }
                      onClick={() =>
                        void sendMessage()
                      }
                    >
                      <ArrowUp size={23} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="disclaimer">
              BLAZE-X can make mistakes. Verify
              important information.
            </div>
          </div>
        </div>
      </main>

      {/* SEARCH MODAL */}

      {searchOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-label="Search conversations"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "16px",
              }}
            >
              <h2>Search chats</h2>

              <button
                className="icon-button"
                aria-label="Close search"
                onClick={() =>
                  setSearchOpen(false)
                }
              >
                <X size={20} />
              </button>
            </div>

            <input
              className="form-input"
              placeholder="Search conversations..."
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              autoFocus
            />

            <div style={{ marginTop: "16px" }}>
              {filteredChats.length === 0 && (
                <p className="muted">
                  No conversations found.
                </p>
              )}

              {filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  className="history-item"
                  disabled={loading}
                  onClick={() =>
                    openConversation(chat.id)
                  }
                >
                  {chat.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}

      {settingsOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-label="Settings"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h2>Settings</h2>

              <button
                className="icon-button"
                aria-label="Close settings"
                onClick={() =>
                  setSettingsOpen(false)
                }
              >
                <X size={20} />
              </button>
            </div>

            <p>Appearance</p>

            <select
              className="form-input"
              value={theme}
              onChange={(event) =>
                setTheme(
                  event.target.value === "light"
                    ? "light"
                    : "dark"
                )
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>

            <div
              style={{
                marginTop: "24px",
                borderTop: "1px solid var(--border)",
                paddingTop: "16px",
              }}
            >
              <h3>About BLAZE-X</h3>

              <p className="muted">
                Version 1.0.0
              </p>

              <p className="muted">
                Developed by Yuva
              </p>

              <p
                className="muted"
                style={{
                  fontSize: "13px",
                  marginTop: "12px",
                }}
              >
                Chats are stored in your private cloud account. File processing and web search are upcoming modules.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* END OF BLAZE-X MAIN WORKSPACE */
