/* ==================================================
   BLAZE-X V1.0
   Secure Authentication Interface
   Developed by Yuva
================================================== */

"use client";

import { useState } from "react";

import type { FormEvent } from "react";

import {
  Zap,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import {
  signIn,
  signUp,
} from "@/lib/supabase";

/* COMPONENT PROPERTIES */

interface AuthScreenProps {
  onAuthenticated?: () => void;
}

/* AUTHENTICATION SCREEN */

export default function AuthScreen({
  onAuthenticated,
}: AuthScreenProps) {
  const [mode, setMode] =
    useState<"login" | "register">("login");

  const [name, setName] = useState("");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  /* CHANGE AUTHENTICATION MODE */

  function switchMode() {
    if (loading) return;

    setMode(
      mode === "login"
        ? "register"
        : "login"
    );

    setError("");
    setSuccess("");
    setPassword("");
    setShowPassword(false);
  }

  /* HANDLE FORM SUBMISSION */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    if (mode === "register") {
      if (!name.trim()) {
        setError("Please enter your name.");
        return;
      }

      if (password.length < 8) {
        setError(
          "Password must contain at least 8 characters."
        );
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const data = await signIn(
          email,
          password
        );

        if (data.session) {
          onAuthenticated?.();
        }
      } else {
        const data = await signUp(
          email,
          password,
          name
        );

        if (data.session) {
          onAuthenticated?.();
        } else {
          setSuccess(
            "Check your email for the confirmation link, then sign in."
          );

          setMode("login");
          setPassword("");
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Authentication failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  /* USER INTERFACE */

  return (
    <main className="bx-auth">

      <div className="bx-auth-glow" />

      <section className="bx-auth-card">

        {/* BRAND */}

        <div className="bx-auth-brand">

          <div className="bx-auth-logo">
            <Zap size={34} fill="currentColor" />
          </div>

          <h1>BLAZE-X</h1>

          <p>YOUR INTELLIGENCE. REIMAGINED.</p>

        </div>

        {/* TITLE */}

        <div className="bx-auth-heading">

          <h2>
            {mode === "login"
              ? "Welcome back"
              : "Create your account"}
          </h2>

          <p>
            {mode === "login"
              ? "Sign in to access your AI workspace."
              : "Start your journey with BLAZE-X."}
          </p>

        </div>

        {/* NOTIFICATIONS */}

        {error && (
          <div
            className="bx-auth-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            className="bx-auth-success"
            role="status"
          >
            {success}
          </div>
        )}

        {/* AUTHENTICATION FORM */}

        <form
          onSubmit={handleSubmit}
          className="bx-auth-form"
        >

          {mode === "register" && (
            <div className="bx-auth-field">

              <label htmlFor="bx-name">
                Full name
              </label>

              <div className="bx-auth-input">

                <User size={18} />

                <input
                  id="bx-name"
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value)
                  }
                  autoComplete="name"
                  maxLength={100}
                  disabled={loading}
                  required
                />

              </div>

            </div>
          )}

          {/* EMAIL */}

          <div className="bx-auth-field">

            <label htmlFor="bx-email">
              Email address
            </label>

            <div className="bx-auth-input">

              <Mail size={18} />

              <input
                id="bx-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                autoComplete="email"
                maxLength={254}
                disabled={loading}
                required
              />

            </div>

          </div>

          {/* PASSWORD */}

          <div className="bx-auth-field">

            <label htmlFor="bx-password">
              Password
            </label>

            <div className="bx-auth-input">

              <Lock size={18} />

              <input
                id="bx-password"
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                placeholder="Enter your password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                autoComplete={
                  mode === "login"
                    ? "current-password"
                    : "new-password"
                }
                minLength={
                  mode === "register"
                    ? 8
                    : undefined
                }
                disabled={loading}
                required
              />

              <button
                type="button"
                className="bx-auth-eye"
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                onClick={() =>
                  setShowPassword(!showPassword)
                }
              >
                {showPassword
                  ? <EyeOff size={18} />
                  : <Eye size={18} />}
              </button>

            </div>

          </div>

          {/* SUBMIT */}

          <button
            type="submit"
            className="bx-auth-submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2
                  size={19}
                  className="bx-auth-spinner"
                />
                Please wait...
              </>
            ) : (
              <>
                {mode === "login"
                  ? "Sign in"
                  : "Create account"}

                <ArrowRight size={19} />
              </>
            )}
          </button>

        </form>

        {/* SWITCH MODE */}

        <div className="bx-auth-switch">

          <span>
            {mode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}
          </span>

          <button
            type="button"
            onClick={switchMode}
            disabled={loading}
          >
            {mode === "login"
              ? "Create account"
              : "Sign in"}
          </button>

        </div>

        {/* SECURITY */}

        <div className="bx-auth-security">

          <ShieldCheck size={16} />

          <span>
            Protected by Supabase Authentication
          </span>

        </div>

      </section>

      <footer className="bx-auth-footer">
        BLAZE-X AI © {new Date().getFullYear()}
        {" · "}
        Developed by Yuva
      </footer>

      {/* COMPONENT STYLES */}

      <style jsx>{`
        .bx-auth {
          min-height: 100dvh;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #08080d;
          color: #ffffff;
          padding: 24px;
          position: relative;
          overflow: hidden;
          font-family: Arial, sans-serif;
        }

        .bx-auth-glow {
          position: absolute;
          width: 550px;
          height: 550px;
          background: radial-gradient(
            circle,
            rgba(124, 58, 237, 0.2),
            transparent 70%
          );
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        .bx-auth-card {
          width: 100%;
          max-width: 420px;
          background: rgba(20, 20, 29, 0.96);
          border: 1px solid #292936;
          border-radius: 24px;
          padding: 36px;
          position: relative;
          z-index: 1;
          box-shadow: 0 24px 80px
            rgba(0, 0, 0, 0.35);
        }

        .bx-auth-brand {
          text-align: center;
          margin-bottom: 30px;
        }

        .bx-auth-logo {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(
            135deg,
            #7c3aed,
            #a855f7
          );
          color: white;
          box-shadow: 0 8px 30px
            rgba(124, 58, 237, 0.35);
        }

        .bx-auth-brand h1 {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: 4px;
          margin: 0;
        }

        .bx-auth-brand p {
          font-size: 9px;
          letter-spacing: 2px;
          color: #a1a1b5;
          margin-top: 8px;
        }

        .bx-auth-heading {
          margin-bottom: 24px;
        }

        .bx-auth-heading h2 {
          font-size: 24px;
          margin: 0 0 8px;
          font-weight: 700;
        }

        .bx-auth-heading p {
          font-size: 13px;
          color: #a1a1b5;
          line-height: 1.5;
          margin: 0;
        }

        .bx-auth-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .bx-auth-field label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #d4d4df;
          margin-bottom: 8px;
        }

        .bx-auth-input {
          display: flex;
          align-items: center;
          gap: 12px;
          border: 1px solid #30303d;
          background: #101017;
          border-radius: 12px;
          padding: 0 14px;
          min-height: 49px;
          color: #9999aa;
          transition: border-color 0.2s;
        }

        .bx-auth-input:focus-within {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px
            rgba(139, 92, 246, 0.1);
        }

        .bx-auth-input input {
          width: 100%;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          color: #ffffff;
          font-size: 14px;
          padding: 14px 0;
        }

        .bx-auth-input input::placeholder {
          color: #777788;
        }

        .bx-auth-eye {
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: #a1a1b5;
          cursor: pointer;
          padding: 4px;
        }

        .bx-auth-submit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 49px;
          width: 100%;
          border: none;
          border-radius: 12px;
          background: linear-gradient(
            135deg,
            #7c3aed,
            #9333ea
          );
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 4px;
        }

        .bx-auth-submit:hover {
          filter: brightness(1.12);
        }

        .bx-auth-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .bx-auth-switch {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          align-items: center;
          gap: 6px;
          margin-top: 24px;
          font-size: 12px;
          color: #a1a1b5;
        }

        .bx-auth-switch button {
          background: transparent;
          border: none;
          color: #b794ff;
          font-weight: 600;
          cursor: pointer;
          padding: 4px;
        }

        .bx-auth-security {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 7px;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid #292936;
          color: #a1a1b5;
          font-size: 11px;
        }

        .bx-auth-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid
            rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 12px;
          border-radius: 10px;
          margin-bottom: 18px;
          font-size: 13px;
          line-height: 1.5;
        }

        .bx-auth-success {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid
            rgba(34, 197, 94, 0.3);
          color: #86efac;
          padding: 12px;
          border-radius: 10px;
          margin-bottom: 18px;
          font-size: 13px;
          line-height: 1.5;
        }

        .bx-auth-footer {
          position: relative;
          z-index: 1;
          color: #777788;
          font-size: 11px;
          text-align: center;
          margin-top: 24px;
        }

        .bx-auth-spinner {
          animation: bx-spin 0.8s
            linear infinite;
        }

        @keyframes bx-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 480px) {
          .bx-auth {
            padding: 16px;
          }

          .bx-auth-card {
            padding: 26px 22px;
            border-radius: 20px;
          }
        }
      `}</style>

    </main>
  );
}

/* END OF AUTHENTICATION INTERFACE */
