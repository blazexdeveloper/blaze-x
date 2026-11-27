/* ==================================================
   BLAZE-X V1.0
   AUTH GUARD X — Workspace Protection
   Developed by Yuva
================================================== */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

import type { ReactNode } from "react";

import type {
  Session,
  User,
} from "@supabase/supabase-js";

import {
  Zap,
  Loader2,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";

import {
  getSupabase,
  signOut,
} from "@/lib/supabase";

import AuthScreen from "@/components/AuthScreen";

/* ================================================
   AUTHENTICATION CONTEXT
================================================ */

interface AuthContextType {
  user: User;
  session: Session;
  logout: () => Promise<void>;
}

const AuthContext =
  createContext<AuthContextType | null>(null);

/* ================================================
   AUTHENTICATION HOOK
================================================ */

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthGuard."
    );
  }

  return context;
}

/* ================================================
   COMPONENT PROPERTIES
================================================ */

interface AuthGuardProps {
  children: ReactNode;
}

/* ================================================
   AUTHENTICATION GUARD
================================================ */

export default function AuthGuard({
  children,
}: AuthGuardProps) {

  const [session, setSession] =
    useState<Session | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [retry, setRetry] =
    useState(0);

  /* INITIALIZE AUTHENTICATION */

  useEffect(() => {
    let active = true;

    let revision = 0;

    let unsubscribe:
      (() => void) | undefined;

    setLoading(true);
    setError("");
    setSession(null);

    async function initialize() {
      try {
        const supabase = getSupabase();

        /* LISTEN FOR AUTHENTICATION CHANGES */

        const { data } =
          supabase.auth.onAuthStateChange(
            (_event, nextSession) => {
              if (!active) return;

              revision++;

              setSession(nextSession);
              setLoading(false);
              setError("");
            }
          );

        unsubscribe = () => {
          data.subscription.unsubscribe();
        };

        /* RESTORE EXISTING SESSION */

        const currentRevision = revision;

        const {
          data: sessionData,
          error: sessionError,
        } = await supabase.auth.getSession();

        if (
          !active ||
          currentRevision !== revision
        ) {
          return;
        }

        if (sessionError) {
          throw sessionError;
        }

        setSession(sessionData.session);
        setLoading(false);

      } catch {
        if (!active) return;

        setSession(null);

        setError(
          "Unable to initialize authentication. Please try again."
        );

        setLoading(false);
      }
    }

    void initialize();

    /* CLEANUP */

    return () => {
      active = false;
      unsubscribe?.();
    };

  }, [retry]);

  /* ================================================
     SECURE LOGOUT
  ================================================ */

  const logout = useCallback(async () => {
    await signOut();
    setSession(null);
  }, []);

  /* ================================================
     LOADING SCREEN
  ================================================ */

  if (loading) {
    return (
      <main style={screenStyle}>

        <div style={logoStyle}>
          <Zap
            size={36}
            fill="currentColor"
          />
        </div>

        <h1 style={titleStyle}>
          BLAZE-X
        </h1>

        <Loader2
          size={25}
          color="#a78bfa"
          style={{
            animation:
              "bx-auth-loading 1s linear infinite",
          }}
        />

        <p style={textStyle}>
          Initializing secure workspace...
        </p>

        <style jsx>{`
          @keyframes bx-auth-loading {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>

      </main>
    );
  }

  /* ================================================
     ERROR SCREEN
  ================================================ */

  if (error) {
    return (
      <main style={screenStyle}>

        <ShieldAlert
          size={48}
          color="#f87171"
        />

        <h2 style={{ margin: 0 }}>
          Connection Error
        </h2>

        <p
          style={textStyle}
          role="alert"
        >
          {error}
        </p>

        <button
          type="button"
          style={buttonStyle}
          onClick={() =>
            setRetry((value) => value + 1)
          }
        >
          <RefreshCw size={17} />
          Try Again
        </button>

      </main>
    );
  }

  /* ================================================
     UNAUTHENTICATED USER
  ================================================ */

  if (!session?.user) {
    return <AuthScreen />;
  }

  /* ================================================
     AUTHENTICATED WORKSPACE
  ================================================ */

  return (
    <AuthContext.Provider
      value={{
        user: session.user,
        session,
        logout,
      }}
    >
      <div key={session.user.id}>
        {children}
      </div>
    </AuthContext.Provider>
  );
}

/* ================================================
   COMPONENT STYLES
================================================ */

const screenStyle = {
  minHeight: "100dvh",
  width: "100%",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  gap: "20px",
  background: "#08080d",
  color: "#ffffff",
  padding: "24px",
  textAlign: "center" as const,
};

const logoStyle = {
  width: "76px",
  height: "76px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "24px",
  background:
    "linear-gradient(135deg, #7c3aed, #a855f7)",
  boxShadow:
    "0 10px 40px rgba(124,58,237,0.35)",
};

const titleStyle = {
  fontSize: "32px",
  fontWeight: 800,
  letterSpacing: "5px",
  margin: 0,
};

const textStyle = {
  color: "#a1a1b5",
  fontSize: "14px",
  lineHeight: 1.6,
  maxWidth: "380px",
  margin: 0,
};

const buttonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  padding: "12px 24px",
  border: "none",
  borderRadius: "12px",
  background: "#7c3aed",
  color: "#ffffff",
  fontWeight: 600,
  cursor: "pointer",
};

/* END OF AUTH GUARD X */
