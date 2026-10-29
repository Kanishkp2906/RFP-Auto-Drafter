import React, { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import {
  Menu, X, SquarePen, FolderOpen, CornerDownLeft, Trash2, MoreVertical,
  Eye, EyeOff, LogOut, Settings, Loader2, Copy, Check,
  ChevronDown, Files, Pencil, Pin, PinOff, UserRound, ChevronRight, Download,
  FileText, Scale, PenLine, SquareCheck, Sun, Moon,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { api, ApiError } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { ChatMessage, DocumentResponse, Session } from "../lib/types";

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function truncate(text: string, max = 48) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function parseStoredMessage(raw: {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}): ChatMessage {
  const timestamp = new Date(raw.created_at);
  if (raw.role === "assistant") {
    try {
      const parsed = JSON.parse(raw.content);
      if (parsed && typeof parsed === "object" && typeof parsed.answer === "string") {
        return {
          id: raw.id,
          role: "assistant",
          content: parsed.answer,
          sources: Array.isArray(parsed.sources) ? parsed.sources : [],
          timestamp,
        };
      }
    } catch {
      // fall through to raw content
    }
  }
  return { id: raw.id, role: raw.role, content: raw.content, timestamp };
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// ─── Markdown renderer (simple, no deps) ─────────────────────────────────────

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  const parseInline = (s: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let last = 0;
    const re = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      if (m[2] !== undefined) parts.push(<strong key={key++}>{m[2]}</strong>);
      else if (m[3] !== undefined)
        parts.push(
          <code key={key++} className="px-1 py-0.5 rounded bg-foreground/[0.05] text-[0.85em] font-mono text-[var(--code-ink)]">
            {m[3]}
          </code>
        );
      last = m.index + m[0].length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];

    // heading
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const Tag = (`h${level + 2}`) as "h3" | "h4" | "h5";
      const cls =
        level === 1
          ? "text-base font-semibold text-foreground mt-4 mb-1 first:mt-0"
          : level === 2
          ? "text-sm font-semibold text-foreground mt-3 mb-1 first:mt-0"
          : "text-sm font-medium text-foreground mt-2 mb-0.5 first:mt-0";
      elements.push(<Tag key={i} className={cls}>{parseInline(hMatch[2])}</Tag>);
      i++;
      continue;
    }

    // table
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter((l) => !l.match(/^\|[-\s|]+\|$/))
        .map((l) =>
          l
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim())
        );
      elements.push(
        <div key={i} className="overflow-x-auto my-3">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {rows[0]?.map((cell, ci) => (
                  <th
                    key={ci}
                    className="text-left py-1.5 px-3 text-muted-foreground font-medium border-b border-border text-xs"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, ri) => (
                <tr key={ri} className="border-b border-border last:border-0">
                  {row.map((cell, ci) => (
                    <td key={ci} className="py-1.5 px-3 text-foreground/90">
                      {parseInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // unordered list
    if (line.match(/^[-*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} className="my-2 space-y-0.5 pl-4">
          {items.map((item, idx) => (
            <li key={idx} className="text-foreground/90 list-disc list-outside text-sm leading-relaxed">
              {parseInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ordered list
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={i} className="my-2 space-y-0.5 pl-4">
          {items.map((item, idx) => (
            <li key={idx} className="text-foreground/90 list-decimal list-outside text-sm leading-relaxed">
              {parseInline(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph
    elements.push(
      <p key={i} className="text-foreground/90 text-sm leading-relaxed my-1">
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse"
          style={{ animationDelay: `${i * 180}ms`, animationDuration: "900ms" }}
        />
      ))}
    </div>
  );
}

// ─── Source citations ────────────────────────────────────────────────────────

function SourceChips({ sources }: { sources: NonNullable<ChatMessage["sources"]> }) {
  const MAX_SECTIONS = 8;

  // Merge sections from all chunks of the same document, deduped.
  const byFile = new Map<string, string[]>();
  for (const s of sources) {
    if (!byFile.has(s.filename)) byFile.set(s.filename, []);
    const merged = byFile.get(s.filename)!;
    for (const sec of s.sections ?? []) {
      if (!merged.includes(sec)) merged.push(sec);
    }
  }

  if (byFile.size === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {Array.from(byFile.entries()).map(([filename, sections], i) => {
        const shown = sections.slice(0, MAX_SECTIONS);
        const rest = sections.length - shown.length;
        return (
          <span key={i} className="relative group/section inline-flex">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-foreground/[0.035] border border-border rounded px-1.5 py-0.5 group-hover/section:border-accent/40 group-hover/section:text-foreground/80 transition-colors cursor-default">
              <Files size={9} />
              {filename}
            </span>
            {sections.length > 0 && (
              <span className="pointer-events-none absolute bottom-full left-0 mb-2 z-40 w-64 rounded-lg bg-popover border border-border shadow-xl shadow-black/25 px-3 py-2.5 opacity-0 group-hover/section:opacity-100 transition-opacity duration-150 origin-bottom-left">
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                  Sections used
                </p>
                <ul className="space-y-1">
                  {shown.map((sec, si) => (
                    <li
                      key={si}
                      className="text-[11px] text-foreground/85 leading-snug break-words"
                    >
                      {sec}
                    </li>
                  ))}
                </ul>
                {rest > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    +{rest} more section{rest > 1 ? "s" : ""}
                  </p>
                )}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ─── Message skeletons (chat loading state) ──────────────────────────────────

function MessageSkeleton({
  isUser,
  width,
  delay,
}: {
  isUser: boolean;
  width: string;
  delay: number;
}) {
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="rounded-2xl px-4 py-2.5 animate-pulse"
        style={{
          width,
          animationDelay: `${delay}ms`,
          animationDuration: "1.2s",
        }}
      >
        <div
          className={`h-3 rounded-full ${
            isUser ? "bg-foreground/[0.05]" : "bg-foreground/[0.04]"
          }`}
        />
        <div
          className={`h-3 rounded-full mt-2 ${
            isUser ? "bg-foreground/[0.05]" : "bg-foreground/[0.04]"
          }`}
          style={{ width: "78%" }}
        />
      </div>
    </div>
  );
}

function ChatSkeleton() {
  const rows: { isUser: boolean; width: string }[] = [
    { isUser: true, width: "55%" },
    { isUser: false, width: "85%" },
    { isUser: false, width: "70%" },
    { isUser: true, width: "40%" },
    { isUser: false, width: "90%" },
  ];
  return (
    <div className="space-y-5 py-2">
      {rows.map((row, i) => (
        <MessageSkeleton key={i} {...row} delay={i * 120} />
      ))}
    </div>
  );
}

// ─── Message ──────────────────────────────────────────────────────────────────

function ChatMessage({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable; nothing to do
    }
  };

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} group`}>
      <div className={`max-w-[78%]`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-secondary text-foreground rounded-br-sm"
              : msg.error
              ? "bg-destructive/10 border border-destructive/30 text-[var(--pill-negative-ink)] rounded-bl-sm"
              : "text-foreground/95 rounded-bl-sm"
          }`}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed">{msg.content}</p>
          ) : msg.error ? (
            <p className="text-sm leading-relaxed">{msg.content}</p>
          ) : (
            renderMarkdown(msg.content)
          )}
        </div>
        {!isUser && !msg.error && msg.sources && (
          <SourceChips sources={msg.sources} />
        )}
        <div
          className={`mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ${
            isUser ? "justify-end" : "justify-start pl-1"
          }`}
        >
          {formatTime(msg.timestamp)}
          <button
            onClick={handleCopy}
            className="hover:text-foreground transition-colors"
            aria-label={copied ? "Copied" : "Copy message"}
          >
            {copied ? <Check size={11} className="text-accent" /> : <Copy size={11} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Google Icon ──────────────────────────────────────────────────────────────

function GoogleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────

type AuthView = "login" | "signup" | "reset-password";

interface AuthModalProps {
  view: AuthView;
  onViewChange: (v: AuthView) => void;
  onClose: () => void;
  onSuccess: () => void;
}

function AuthModal({ view, onViewChange, onClose, onSuccess }: AuthModalProps) {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      toast("Password updated — please sign in with your new password.");
      await supabase.auth.signOut();
      setNewPassword("");
      setConfirmPassword("");
      setShowPw(false);
      onClose();
      onViewChange("login");
    } catch (err) {
      setError(errorMessage(err, "Could not update password. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (view === "signup" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      if (view === "login") {
        await signIn(email, password);
        onSuccess();
      } else {
        const result = await signUp(email, username.trim(), password);
        if (result.confirmationRequired) {
          setSignupDone(true);
        } else {
          onSuccess();
        }
      }
    } catch (err) {
      setError(errorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) { setError("Enter your email first."); return; }
    setError("");
    setLoading(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setError(errorMessage(err, "Could not send a reset link. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    setError("");
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // On success the browser navigates away to Google; reset the button
      // in case the user returns with back-navigation instead.
      setGoogleLoading(false);
    } catch (err) {
      setError(errorMessage(err, "Could not start Google sign-in."));
      setGoogleLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-[var(--scrim)]" />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl shadow-black/25 p-8"
        role="dialog"
        aria-modal="true"
      >
        {/* close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-foreground/[0.04]"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* heading */}
        <div className="mb-6">
          {signupDone ? (
            <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
              Check your inbox
            </h2>
          ) : (
            <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
              {view === "reset-password" ? "Update password" : view === "login" ? "Welcome back" : "Create your account"}
            </h2>
          )}
          <p className="text-sm text-muted-foreground mt-1">
              {signupDone
                ? "We sent a confirmation link to " + email
                : view === "reset-password"
                ? "Enter your new password below"
                : view === "login"
                ? "Sign in to continue your work"
                : "Start analyzing RFPs in seconds"}
          </p>
        </div>

        {signupDone ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-accent/10 border border-accent/20 p-3 text-sm text-accent/90">
              After confirming your email, return here to sign in.
            </div>
            <button
              onClick={() => { setSignupDone(false); onViewChange("login"); }}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form
            onSubmit={view === "reset-password" ? handleResetPassword : handleSubmit}
            className="space-y-3"
          >
            {resetSent && (
              <div className="rounded-lg bg-accent/10 border border-accent/20 p-3 text-sm text-accent/90">
                Reset link sent — check your email.
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-[var(--pill-negative-ink)]">
                {error}
              </div>
            )}

            {view === "signup" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="auth-username">
                  Name
                </label>
                <input
                  id="auth-username"
                  type="text"
                  required
                  autoComplete="name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg bg-input-background border border-border px-3 py-2 text-sm text-foreground  focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent/50 transition-[border-color,box-shadow]"
                />
              </div>
            )}

            {view !== "reset-password" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="auth-email">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-lg bg-input-background border border-border px-3 py-2 text-sm text-foreground  focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent/50 transition-[border-color,box-shadow]"
                />
              </div>
            )}

            {view !== "reset-password" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="auth-pw">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="auth-pw"
                    type={showPw ? "text" : "password"}
                    required
                    autoComplete={view === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg bg-input-background border border-border px-3 py-2 pr-9 text-sm text-foreground  focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent/50 transition-[border-color,box-shadow]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}

            {view === "signup" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="auth-confirm">
                  Confirm password
                </label>
                <input
                  id="auth-confirm"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg bg-input-background border border-border px-3 py-2 text-sm text-foreground  focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent/50 transition-[border-color,box-shadow]"
                />
              </div>
            )}

            {view === "reset-password" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="auth-new-pw">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="auth-new-pw"
                    type={showPw ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg bg-input-background border border-border px-3 py-2 pr-9 text-sm text-foreground  focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent/50 transition-[border-color,box-shadow]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}
            {view === "reset-password" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="auth-confirm-pw">
                  Confirm new password
                </label>
                <input
                  id="auth-confirm-pw"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg bg-input-background border border-border px-3 py-2 text-sm text-foreground  focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent/50 transition-[border-color,box-shadow]"
                />
              </div>
            )}

            {view === "login" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 rounded-lg bg-accent text-accent-foreground py-2.5 text-sm font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 transition-[border-color,background-color,color] flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {view === "reset-password"
                ? "Update password"
                : view === "login"
                ? "Sign in"
                : "Create account"}
            </button>

            {view !== "reset-password" && (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full rounded-lg border border-border bg-input-background py-2.5 text-sm font-medium text-foreground hover:bg-foreground/[0.04] focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 transition-[border-color,background-color,color] flex items-center justify-center gap-2.5"
                aria-label="Continue with Google"
              >
                {googleLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </button>
            )}
          </form>
        )}

        {!signupDone && view !== "reset-password" && (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            {view === "login" ? (
              <>
                {"Don't have an account? "}
                <button
                  onClick={() => { onViewChange("signup"); setError(""); }}
                  className="text-foreground/80 hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                {"Already have an account? "}
                <button
                  onClick={() => { onViewChange("login"); setError(""); }}
                  className="text-foreground/80 hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Account Menu ─────────────────────────────────────────────────────────────

function AccountMenu({
  username,
  email,
  onClose,
  onSettings,
  onSignOut,
  signingOut,
}: {
  username: string;
  email: string;
  onClose: () => void;
  onSettings: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-[52px] right-0 z-30 w-52 rounded-xl bg-popover border border-border shadow-xl shadow-black/25 overflow-hidden animate-in fade-in slide-in-from-bottom-1 zoom-in-95 duration-150 origin-bottom-right"
    >
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-medium text-foreground truncate">{username}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>
      </div>
      <div className="p-1">
        <button
          onClick={onSettings}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04] rounded-lg transition-colors text-left"
        >
          <Settings size={13} className="shrink-0" />
          Account settings
        </button>
        <button
          onClick={onSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04] rounded-lg transition-colors text-left disabled:opacity-50"
        >
          {signingOut ? (
            <Loader2 size={13} className="shrink-0 animate-spin" />
          ) : (
            <LogOut size={13} className="shrink-0" />
          )}
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmDeleteModal({
  title,
  description,
  confirmLabel = "Delete",
  onCancel,
  onConfirm,
  deleting,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !deleting && onCancel()}
    >
      <div className="absolute inset-0 bg-[var(--scrim)]" />
      <div
        className="relative z-10 w-full max-w-xs rounded-2xl bg-card border border-border shadow-xl shadow-black/25 p-6 animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        <h2
          className="text-lg font-semibold text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {title}
        </h2>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          {description}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60 transition-colors"
          >
            {deleting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rename Chat Modal ────────────────────────────────────────────────────────

function RenameChatModal({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !saving && onCancel()}
    >
      <div className="absolute inset-0 bg-[var(--scrim)]" />
      <div
        className="relative z-10 w-full max-w-xs rounded-2xl bg-card border border-border shadow-xl shadow-black/25 p-6 animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        <h2
          className="text-lg font-semibold text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Rename chat
        </h2>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !saving) onSave();
            if (e.key === "Escape" && !saving) onCancel();
          }}
          maxLength={120}
          disabled={saving}
          placeholder="Chat title"
          className="mt-4 w-full rounded-lg bg-background border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-50"
          aria-label="New chat title"
        />
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !value.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Documents Drawer ─────────────────────────────────────────────────────────

const DOC_STATUS_LABEL: Record<DocumentResponse["upload_status"], string> = {
  queued: "Queued",
  processing: "Processing",
  failed: "Failed",
  done: "Ready",
};

interface DocsPanelProps {
  files: DocumentResponse[];
  loading: boolean;
  error: string;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onDelete: (file: DocumentResponse) => void;
  onUploadClick: () => void;
  onClose: () => void;
}

function DocsPanel({
  files,
  loading,
  error,
  selectedIds,
  onToggleSelect,
  onDelete,
  onUploadClick,
  onClose,
}: DocsPanelProps) {
  return (
    <div className="absolute top-12 right-3 z-30 w-72 rounded-xl bg-popover border border-border shadow-xl shadow-black/25 overflow-hidden animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-150 origin-top-right">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-foreground">Documents</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-4 pt-2 pb-1">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Click a document to attach it to your next question.
        </p>
      </div>
      <div className="p-1.5 max-h-96 overflow-y-auto scrollbar-thin">
        {error && (
          <p className="px-3 py-2 text-xs text-[var(--pill-negative-ink)]">{error}</p>
        )}
        {loading && !error && files.length === 0 && (
          <div className="px-3 py-2 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 rounded-lg bg-foreground/[0.04] animate-pulse" />
            ))}
          </div>
        )}
        {!loading && !error && files.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No documents yet. Upload an RFP to get started.
          </p>
        )}
        {files.map((f) => {
          const selected = selectedIds.includes(f.id);
          return (
            <div
              key={f.id}
              onClick={() => f.upload_status === "done" && onToggleSelect(f.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                f.upload_status === "done"
                  ? selected
                    ? "bg-accent/10 cursor-pointer"
                    : "hover:bg-foreground/[0.04] cursor-pointer"
                  : "cursor-default"
              }`}
            >
              <div className="shrink-0 w-8 h-8 flex items-center justify-center">
                <svg
                  width="18"
                  height="22"
                  viewBox="0 0 18 22"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className={selected ? "text-accent" : "text-muted-foreground"}
                >
                  <path d="M11 1H3C2.46957 1 1.96086 1.21071 1.58579 1.58579C1.21071 1.96086 1 2.46957 1 3V19C1 19.5304 1.21071 20.0391 1.58579 20.4142C1.96086 20.7893 2.46957 21 3 21H15C15.5304 21 16.0391 20.7893 16.4142 20.4142C16.7893 20.0391 17 19.5304 17 19V7L11 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M11 1V7H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M5 16H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground/90 truncate">{f.filename}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {DOC_STATUS_LABEL[f.upload_status]} ·{" "}
                  {new Date(f.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(f);
                }}
                className="text-muted-foreground/60 hover:text-[var(--pill-negative-ink)] transition-colors p-1 opacity-0 group-hover:opacity-100"
                aria-label={`Delete ${f.filename}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="p-2 border-t border-border">
        <button
          onClick={onUploadClick}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] rounded-lg transition-colors"
        >
          <span>Upload document</span>
        </button>
      </div>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

function Composer({ value, onChange, onSend, disabled }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  };

  // grow the textarea with its content, capped so long prompts scroll instead of
  // pushing the whole workspace
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value]);

  return (
    <div className="flex items-center gap-2 bg-secondary rounded-2xl border border-border shadow-sm shadow-black/5 overflow-hidden focus-within:border-border focus-within:ring-1 focus-within:ring-ring transition-[border-color,background-color,color] pl-4 pr-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        placeholder="Ask about the RFP…"
        rows={1}
        className="resize-none bg-transparent flex-1 py-2 text-sm text-foreground  focus:outline-none disabled:opacity-50 overflow-y-auto"
        aria-label="Message input"
      />
      <button
        onClick={onSend}
        disabled={!value.trim() || disabled}
        aria-label="Send message"
        className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full bg-primary text-primary-foreground disabled:opacity-25 disabled:cursor-default hover:bg-foreground/80 transition-colors"
      >
        <CornerDownLeft size={13} />
      </button>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ userName }: { userName?: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 pt-40 pb-8 select-none">
      <h1
        className="text-[40px] leading-[1.1] max-sm:text-[24px] font-normal text-foreground mb-2"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Hello{userName ? `, ${userName}` : ""}
      </h1>
      <p className="text-[13px] text-muted-foreground mb-10">Upload an RFP document, then ask — answers cite the sections they draw on.</p>
      <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
        {[
          { icon: FileText, label: "Summarize an RFP", desc: "Extract key requirements" },
          { icon: Scale, label: "Compare proposals", desc: "Side-by-side analysis" },
          { icon: SquareCheck, label: "Check compliance", desc: "Review against standards" },
          { icon: PenLine, label: "Draft a response", desc: "AI-assisted writing" },
        ].map((s) => (
          <button
            key={s.label}
            className="flex flex-col items-start gap-1 p-3 rounded-xl bg-secondary border border-border hover:bg-card transition-[border-color,background-color] text-left"
          >
            <s.icon size={15} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground/90">{s.label}</span>
            <span className="text-[13px] text-muted-foreground">{s.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Profile Card Modal ───────────────────────────────────────────────────────

const DOC_CHIP_CLASSES: Record<DocumentResponse["upload_status"], string> = {
  queued: "text-[var(--pill-neutral-ink)] bg-muted border-border",
  processing: "text-[var(--pill-warning-ink)] bg-[var(--pill-warning-bg)] border-[var(--pill-warning-border)]",
  failed: "text-[var(--pill-negative-ink)] bg-[var(--pill-negative-bg)] border-[var(--pill-negative-border)]",
  done: "text-[var(--pill-positive-ink)] bg-[var(--pill-positive-bg)] border-[var(--pill-positive-border)]",
};

function ProfileCardModal({
  username,
  email,
  avatarUrl,
  files,
  filesLoading,
  downloadingId,
  onUpdateUsername,
  onDeleteAccount,
  onDownload,
  onClose,
}: {
  username: string;
  email: string;
  avatarUrl: string | null;
  files: DocumentResponse[];
  filesLoading: boolean;
  downloadingId: string | null;
  onUpdateUsername: (newUsername: string) => Promise<void>;
  onDeleteAccount: () => void;
  onDownload: (file: DocumentResponse) => void;
  onClose: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(username);
  const [savingName, setSavingName] = useState(false);

  const handleSaveName = async () => {
    const next = nameValue.trim();
    if (!next || next === username) {
      setEditingName(false);
      setNameValue(username);
      return;
    }
    setSavingName(true);
    try {
      await onUpdateUsername(next);
      setEditingName(false);
      toast("Username updated.");
    } catch (error) {
      toast(errorMessage(error, "Could not update the username."));
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-[var(--scrim)]" />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl shadow-black/25 p-6 animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-foreground/[0.04]"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2
          className="text-lg font-semibold text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Account
        </h2>

        <div className="mt-5 flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={username}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full object-cover ring-1 ring-white/15 shrink-0"
            />
          ) : (
            <span className="flex w-14 h-14 rounded-full bg-[var(--avatar-bg)] items-center justify-center ring-1 ring-[var(--avatar-ring)] shrink-0">
              <span className="text-sm font-semibold text-foreground/90">
                {username.slice(0, 2)}
              </span>
            </span>
          )}
          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                value={nameValue}
                maxLength={40}
                autoFocus
                disabled={savingName}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNameValue(username);
                  }
                }}
                className="w-full rounded-md bg-input-background border border-border px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-50"
                aria-label="Edit username"
              />
            ) : (
              <p className="text-sm font-medium text-foreground truncate">
                {username}
              </p>
            )}
            <p className="text-xs text-muted-foreground truncate mt-1">
              {email}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 self-center ml-auto">
            <button
              onClick={() => {
                if (editingName) {
                  setEditingName(false);
                  setNameValue(username);
                } else {
                  setNameValue(username);
                  setEditingName(true);
                }
              }}
              disabled={savingName}
              className="p-2 rounded-lg border border-border bg-foreground/[0.035] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors disabled:opacity-40"
              aria-label={editingName ? "Cancel username edit" : "Edit username"}
            >
              {editingName ? (
                <X size={16} />
              ) : (
                <Pencil size={16} />
              )}
            </button>
            <button
              onClick={onDeleteAccount}
              className="p-2 rounded-lg border border-border bg-foreground/[0.035] text-[var(--pill-negative-ink)] hover:text-[#991b1b] hover:bg-destructive/15 hover:border-destructive/40 transition-colors"
              aria-label="Delete account"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium text-muted-foreground">
              Uploaded documents
            </p>
            <span className="text-[11px] font-medium text-muted-foreground bg-foreground/[0.04] border border-border rounded-full px-2 py-0.5">
              {files.length}
            </span>
          </div>

          {filesLoading ? (
            <div className="space-y-1.5 py-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-8 rounded-lg bg-foreground/[0.04] animate-pulse"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          ) : files.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No documents uploaded yet.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
              {files.map((f) => {
                const isDone = f.upload_status === "done";
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-foreground/[0.035] border border-border"
                  >
                    <span className="text-xs text-foreground/85 truncate">
                      {f.filename}
                    </span>
                    <span className="shrink-0 flex items-center gap-1.5">
                      {!isDone && (
                        <span
                          className={`text-[11px] font-medium rounded-full px-2 py-0.5 border ${DOC_CHIP_CLASSES[f.upload_status]}`}
                        >
                          {DOC_STATUS_LABEL[f.upload_status]}
                        </span>
                      )}
                      <button
                        onClick={() => onDownload(f)}
                        disabled={!isDone || downloadingId === f.id}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors disabled:opacity-35 disabled:hover:bg-transparent"
                        aria-label={`Download ${f.filename}`}
                      >
                        {downloadingId === f.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Download size={12} />
                        )}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function AppShell() {
  const { session, profile, initializing, signOut, updateUsername } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window === "undefined" || window.innerWidth >= 640
  );
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, ChatMessage[]>>({});
  const [loadingChat, setLoadingChat] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [showAuth, setShowAuth] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [files, setFiles] = useState<DocumentResponse[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [openChatMenuId, setOpenChatMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingChat, setDeletingChat] = useState(false);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState(false);
  const [renameFor, setRenameFor] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingChat, setRenamingChat] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof window !== "undefined" && localStorage.getItem("theme") === "dark"
      ? "dark"
      : "light"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const creatingRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);

  // ── OAuth callback error surfacing ──────────────────────────────────────────
  // Supabase redirects back to /auth/callback on a fresh page load when the
  // OAuth flow fails (cancelled consent, rejected redirect URI, provider
  // error). The auth modal isn't open then, so surface the error once as a
  // toast and clean the URL so a refresh doesn't re-toast it.
  useEffect(() => {
    const sources = [window.location.search, window.location.hash.slice(1)];
    for (const qs of sources) {
      const params = new URLSearchParams(qs);
      console.log('[AUTH DEBUG] raw search:', window.location.search);
      console.log('[AUTH DEBUG] raw hash:', window.location.hash);
      console.log('[AUTH DEBUG] parsed params:', Object.fromEntries(params));
      const oauthError = params.get("error");
      if (!oauthError) continue;
      const description = params.get("error_description") ?? "";
      let detail: string;
      if (oauthError === "access_denied") {
        detail = "Google sign-in was cancelled.";
      } else if (description.toLowerCase().includes("redirect")) {
        detail =
          "Google sign-in is misconfigured. The redirect URL may not be allowlisted in Supabase or Google Cloud Console.";
      } else {
        detail = description
          ? `Google sign-in failed. ${description}`
          : "Google sign-in failed. Please try again.";
      }
      toast(detail, { duration: 8000 });
      window.history.replaceState({}, "", window.location.pathname);
      break;
    }
  }, []);

  // ── Password-reset recovery arrival ──────────────────────────────────────
  // Supabase redirects back from the forgot-password email link with
  // ?access_token=...&refresh_token=...&type=recovery. Re-establish the session
  // so the authenticated update-user call works, then show the reset form.
  useEffect(() => {
    let handled = false;
    const sources = [window.location.search, window.location.hash.slice(1)];
    console.log('[AUTH RECOVERY DEBUG] raw search:', window.location.search);
    console.log('[AUTH RECOVERY DEBUG] raw hash:', window.location.hash);
    for (const qs of sources) {
      const params = new URLSearchParams(qs);
      console.log('[AUTH RECOVERY DEBUG] parsed params:', Object.fromEntries(params));
      const type = params.get("type");
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      // Only a genuine forgot-password link carries type=recovery. A plain
      // Google OAuth callback also delivers access_token/refresh_token, so it
      // must not open the reset-password form.
      if (type === "recovery" && !handled) {
        handled = true;
        (async () => {
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
          window.history.replaceState({}, "", window.location.pathname);
          setShowAuth(true);
          setAuthView("reset-password");
        })();
        break;
      }
    }
  }, []);

  const activeConversation = sessions.find((c) => c.id === activeChatId) ?? null;
  const sortedSessions = React.useMemo(
    () =>
      [...sessions].sort(
        (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      ),
    [sessions]
  );
  const activeMessages = activeChatId ? messagesByChat[activeChatId] ?? [] : [];
  const isAuthed = Boolean(session);
  const displayMessages = activeMessages;

  // ── Sessions: initial fetch + lifecycle ─────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const data = await api.getSessions();
      setSessions(data);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 500 || error.status === 401) &&
        /user sessions|expir/i.test(error.message)
      ) {
        setSessions([]);
      } else {
        setSessionsError(errorMessage(error, "Could not load chats."));
      }
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchSessions();
    }
  }, [session?.user?.id, fetchSessions]);

  // ── Clear user-scoped state on sign-out / invalid session ───────────────────

  useEffect(() => {
    if (!initializing && !session) {
      setSessions([]);
      setMessagesByChat({});
      setActiveChatId(null);
      setSelectedDocIds([]);
      setFiles([]);
      setShowDocs(false);
      setShowAccountMenu(false);
      setIsSending(false);
      setInput("");
      setSessionsError("");
    }
  }, [initializing, session]);

  // ── Resume pending prompt after authentication ──────────────────────────────

  const sendMessageRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    if (session && pendingPrompt) {
      const p = pendingPrompt;
      setPendingPrompt(null);
      sendMessageRef.current(p);
    }
  }, [session, pendingPrompt]);

  // ── Load message history for a session ──────────────────────────────────────

  const loadMessages = useCallback(async (sessionId: string) => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    setLoadingChat(true);
    try {
      const data = await api.getMessages(sessionId, 50, 0, controller.signal);
      const parsed = data.messages.map(parseStoredMessage);
      setMessagesByChat((prev) => ({
        ...prev,
        [sessionId]: parsed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
      }));
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      if (error instanceof ApiError && error.status === 404) {
        toast("Chat not found.");
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setMessagesByChat((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
        setActiveChatId((current) => (current === sessionId ? null : current));
      } else {
        toast(errorMessage(error, "Could not load messages."));
      }
    } finally {
      if (loadAbortRef.current === controller) setLoadingChat(false);
    }
  }, []);

  const selectSession = useCallback(
    (sessionId: string) => {
      setActiveChatId(sessionId);
      if (!messagesByChat[sessionId]) {
        void loadMessages(sessionId);
      }
    },
    [messagesByChat, loadMessages]
  );

  // ── New chat ────────────────────────────────────────────────────────────────

  const createNewChat = useCallback(async (): Promise<Session | null> => {
    if (!session) {
      setAuthView("login");
      setShowAuth(true);
      return null;
    }
    if (creatingRef.current) return null;
    creatingRef.current = true;
    try {
      const created = await api.createSession();
      setSessions((prev) =>
        prev.some((s) => s.id === created.id) ? prev : [created, ...prev]
      );
      setMessagesByChat((prev) =>
        prev[created.id] ? prev : { ...prev, [created.id]: [] }
      );
      setActiveChatId(created.id);
      return created;
    } catch (error) {
      toast(errorMessage(error, "Could not create a new chat."));
      return null;
    } finally {
      creatingRef.current = false;
    }
  }, [session]);

  const startNewChat = useCallback(() => {
    if (!session) {
      setAuthView("login");
      setShowAuth(true);
      return;
    }
    // Instant, local switch: the session is only created server-side when the
    // first message is sent (see actualSendMessage), so no network round-trip
    // and no premature "New chat" entry in the sidebar.
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    setActiveChatId(null);
    setInput("");
    setOpenChatMenuId(null);
  }, [session]);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    const sessionId = confirmDeleteId;
    const wasActive = sessionId === activeChatId;
    setDeletingChat(true);
    try {
      await api.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setMessagesByChat((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      if (wasActive) setActiveChatId(null);
      setConfirmDeleteId(null);
      toast("Chat deleted.");
    } catch (error) {
      toast(errorMessage(error, "Could not delete chat."));
    } finally {
      setDeletingChat(false);
    }
  }, [confirmDeleteId, activeChatId]);

  const handleConfirmRename = useCallback(async () => {
    if (!renameFor) return;
    const sessionId = renameFor;
    const newTitle = renameValue.trim();
    if (!newTitle) {
      setRenameFor(null);
      return;
    }
    setRenamingChat(true);
    try {
      const updated = await api.renameSession(sessionId, newTitle);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title } : s))
      );
      setRenameFor(null);
      toast("Chat renamed.");
    } catch (error) {
      toast(errorMessage(error, "Could not rename the chat."));
    } finally {
      setRenamingChat(false);
    }
  }, [renameFor, renameValue]);

  const handlePinToggle = useCallback(async (conv: Session) => {
    if (pinningId) return;
    setPinningId(conv.id);
    try {
      const updated = await api.pinSession(conv.id, !conv.pinned);
      setSessions((prev) =>
        prev.map((s) => (s.id === conv.id ? { ...s, pinned: updated.pinned } : s))
      );
      toast(updated.pinned ? "Pinned to top." : "Unpinned from top.");
    } catch (error) {
      toast(errorMessage(error, "Could not update the pin."));
    } finally {
      setPinningId(null);
    }
  }, [pinningId]);

  const chatTitle = useCallback((t: string | null | undefined) => {
    return t && t !== "New chat" ? t : "Untitled chat";
  }, []);

  // ── Refresh sessions after the backend regenerates a title ──────────────────

  const refreshSessions = useCallback(
    async (options?: { fallbackTitleFor?: string; fallbackTitle?: string }) => {
      try {
        const data = await api.getSessions();
        setSessions((prev) => {
          const fetchedIds = new Set(data.map((s) => s.id));
          const extras = prev.filter((s) => !fetchedIds.has(s.id));
          let merged = [...data, ...extras];
          if (options?.fallbackTitleFor) {
            const target = merged.find((s) => s.id === options.fallbackTitleFor);
            if (
              target &&
              (!target.title || target.title === "New chat") &&
              options.fallbackTitle
            ) {
              merged = merged.map((s) =>
                s.id === options.fallbackTitleFor
                  ? { ...s, title: options.fallbackTitle ?? null }
                  : s
              );
            }
          }
          return merged;
        });
      } catch {
        // best effort — sidebar keeps its current titles
      }
    },
    []
  );

  // ── Sending messages ────────────────────────────────────────────────────────

  const resolveDocumentIds = useCallback((): string[] => {
    // Only explicitly selected documents are sent. With no selection, retrieval
    // matches nothing and the request returns "no relevant information" — the
    // old fallback silently attached every ready document instead.
    return selectedDocIds;
  }, [selectedDocIds]);

  const appendMessage = useCallback(
    (sessionId: string, message: ChatMessage) => {
      setMessagesByChat((prev) => ({
        ...prev,
        [sessionId]: [...(prev[sessionId] ?? []), message],
      }));
    },
    []
  );

  const actualSendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (!session) {
        setAuthView("login");
        setShowAuth(true);
        setPendingPrompt(trimmed);
        return;
      }

      if (isSending || creatingRef.current) return;

      let sessionId = activeChatId;
      const isFirstMessage = !sessionId || activeMessages.length === 0;

      if (!sessionId) {
        const created = await createNewChat();
        if (!created) return;
        sessionId = created.id;
      }

      appendMessage(sessionId, {
        id: uid(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      });
      setInput("");
      setIsSending(true);

      try {
        const answer = await api.streamChat({
          sessionId,
          query: trimmed,
          documentIds: resolveDocumentIds(),
        });

        if (answer && typeof answer.answer === "string" && answer.answer.trim()) {
          appendMessage(sessionId, {
            id: uid(),
            role: "assistant",
            content: answer.answer,
            sources: Array.isArray(answer.sources) ? answer.sources : [],
            timestamp: new Date(),
          });
          if (isFirstMessage) {
            void refreshSessions({
              fallbackTitleFor: sessionId,
              fallbackTitle: truncate(trimmed),
            });
          }
        } else {
          appendMessage(sessionId, {
            id: uid(),
            role: "assistant",
            error: true,
            content:
              "I couldn't generate a response. The answer depends on your uploaded RFP documents — try attaching one via Documents and asking again.",
            timestamp: new Date(),
          });
          if (isFirstMessage) {
            void refreshSessions({
              fallbackTitleFor: sessionId,
              fallbackTitle: truncate(trimmed),
            });
          }
        }
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          appendMessage(sessionId, {
            id: uid(),
            role: "assistant",
            error: true,
            content: errorMessage(error, "Something went wrong while generating a response."),
            timestamp: new Date(),
          });
        }
      } finally {
        setIsSending(false);
      }
    },
    [
      session,
      isSending,
      activeChatId,
      activeMessages.length,
      createNewChat,
      appendMessage,
      resolveDocumentIds,
      refreshSessions,
    ]
  );

  useEffect(() => {
    sendMessageRef.current = actualSendMessage;
  }, [actualSendMessage]);

  const handleSend = () => {
    actualSendMessage(input);
  };

  const handleAuthSuccess = useCallback(async () => {
    setShowAuth(false);
    await api.clearRateLimit();
  }, []);

  // ── Sign out ────────────────────────────────────────────────────────────────

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      await api.clearRateLimit();
      await signOut();
      setShowAccountMenu(false);
      toast("Signed out.");
    } catch (error) {
      toast(errorMessage(error, "Could not sign out."));
    } finally {
      setSigningOut(false);
    }
  }, [signOut]);

  // ── Documents ───────────────────────────────────────────────────────────────

  const applyFiles = useCallback((data: DocumentResponse[]) => {
    setFiles(data);
    setSelectedDocIds((prev) =>
      prev.filter((id) => data.some((f) => f.id === id && f.upload_status === "done"))
    );
  }, []);

  const fetchFiles = useCallback(async () => {
    setFilesLoading(true);
    setFilesError("");
    try {
      const data = await api.getUserFiles();
      applyFiles(data);
    } catch (error) {
      setFilesError(errorMessage(error, "Could not load documents."));
    } finally {
      setFilesLoading(false);
    }
  }, [applyFiles]);

  // Fetch only when there is nothing cached; deleting the last file clears the
  // cache and re-triggers a fetch on the next open. Re-fetching on every open
  // caused the panel to flash the skeleton each time it was opened.
  useEffect(() => {
    if (showDocs && session && files.length === 0) {
      void fetchFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDocs, session?.user?.id, files.length, fetchFiles]);

  // While any document is queued/processing, poll for status updates so the
  // panel flips to Ready/Failed on its own once the backend worker finishes.
  const isProcessingDocs = files.some(
    (f) => f.upload_status === "queued" || f.upload_status === "processing"
  );

  useEffect(() => {
    if (!isProcessingDocs || !session) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const data = await api.getUserFiles();
        if (!cancelled) applyFiles(data);
      } catch {
        // transient errors (rate limit, network): keep polling quietly
      }
    }, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isProcessingDocs, session?.user?.id, applyFiles]);

  // Profile card: quietly load the document list when opened with a cold cache.
  useEffect(() => {
    if (showProfileCard && session && files.length === 0) {
      void fetchFiles();
    }
  }, [showProfileCard, session?.user?.id, files.length, fetchFiles]);

  const handleDownloadDoc = useCallback(
    async (file: DocumentResponse) => {
      if (downloadingDocId) return;
      setDownloadingDocId(file.id);
      try {
        const url = await api.getDocumentDownloadUrl(file.storage_path);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (error) {
        toast(errorMessage(error, "Could not start the download."));
      } finally {
        setDownloadingDocId(null);
      }
    },
    [downloadingDocId]
  );

  const handleConfirmDeleteAccount = useCallback(async () => {
    setDeletingAccount(true);
    try {
      await api.deleteProfile();
      setShowProfileCard(false);
      setConfirmDeleteAccount(false);
      await signOut();
      toast("Account deleted.");
    } catch (error) {
      toast(errorMessage(error, "Could not delete the account."));
    } finally {
      setDeletingAccount(false);
    }
  }, [signOut]);

  const handleUploadClick = useCallback(() => {
    if (!session) {
      setAuthView("signup");
      setShowAuth(true);
      return;
    }
    fileInputRef.current?.click();
  }, [session]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (selected.length === 0) return;

      const valid: File[] = [];
      const rejected: string[] = [];
      for (const file of selected) {
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
          rejected.push(`${file.name} (PDF only)`);
        } else if (file.size > 10 * 1024 * 1024) {
          rejected.push(`${file.name} (max 10 MB)`);
        } else {
          valid.push(file);
        }
      }

      if (valid.length > 5) {
        toast("Maximum 5 files at a time.");
        valid.length = 5;
      }
      if (rejected.length > 0) {
        toast(`Skipped: ${rejected.join(", ")}`);
      }
      if (valid.length === 0) return;

      try {
        const response = await api.uploadFiles(valid);
        const queuedCount = response.queued?.length ?? 0;
        const existsCount = response.already_exists?.length ?? 0;
        const failedCount = response.failed?.length ?? 0;

        if (queuedCount > 0) {
          toast(
            `Uploading ${queuedCount} document${queuedCount > 1 ? "s" : ""}.`,
            { description: "They will be ready to use once processing completes." }
          );
        }
        if (existsCount > 0) {
          toast(`${existsCount} document${existsCount > 1 ? "s" : ""} already uploaded.`);
        }
        if (failedCount > 0) {
          toast(
            `${failedCount} upload${failedCount > 1 ? "s" : ""} failed.`,
            {
              description: response.failed.map((f) => `${f.filename}: ${f.reason}`).join("\n"),
            }
          );
        }

        await fetchFiles();
      } catch (error) {
        toast(errorMessage(error, "Upload failed. Please try again."));
      }
    },
    [fetchFiles]
  );

  const handleConfirmDeleteFile = useCallback(async () => {
    if (!confirmDeleteFileId) return;
    const fileId = confirmDeleteFileId;
    const filename = files.find((f) => f.id === fileId)?.filename ?? "Document";
    setDeletingFile(true);
    try {
      await api.deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setSelectedDocIds((prev) => prev.filter((id) => id !== fileId));
      setConfirmDeleteFileId(null);
      toast(`Deleted ${filename}.`);
    } catch (error) {
      toast(errorMessage(error, "Could not delete the document."));
    } finally {
      setDeletingFile(false);
    }
  }, [confirmDeleteFileId, files]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  // ── Scroll & keyboard ───────────────────────────────────────────────────────

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [displayMessages.length, isSending, loadingChat, activeChatId]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAuth(false);
        setShowDocs(false);
        setShowAccountMenu(false);
        setOpenChatMenuId(null);
        if (!deletingChat) setConfirmDeleteId(null);
        if (!deletingFile) setConfirmDeleteFileId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!openChatMenuId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest("[data-chat-menu-open]")) return;
      setOpenChatMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openChatMenuId]);

  const isLoadingEverything = initializing || (isAuthed && sessionsLoading && sessions.length === 0);

  return (
    <div className={`flex h-screen w-screen overflow-hidden bg-background text-foreground ${theme === "dark" ? "dark" : ""}`} style={{ fontFamily: "var(--font-sans)" }}>
      <Toaster
        theme={theme}
        position="bottom-right"
        offset={96}
        toastOptions={{
          style: {
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            borderRadius: "0.75rem",
            fontFamily: "var(--font-sans)",
            fontSize: "13px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
          },
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`flex flex-col shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out max-sm:absolute max-sm:inset-y-0 max-sm:left-0 max-sm:z-20 max-sm:shadow-xl max-sm:shadow-black/25 ${
          sidebarOpen ? "w-56" : "w-0 overflow-hidden"
        }`}
      >
        {sidebarOpen && (
          <>
            {/* top controls */}
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between">
                <span
                  className="text-[17px] leading-none whitespace-nowrap text-foreground"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  RFP Auto&thinsp;Drafter
                </span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                  aria-label="Collapse sidebar"
                >
                  <Menu size={15} />
                </button>
              </div>
              <div className="flex items-center mt-4">
                <button
                  onClick={startNewChat}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium bg-card border border-border hover:border-foreground/25 hover:bg-card transition-colors"
                  aria-label="New chat"
                >
                  <SquarePen size={13} />
                  New chat
                </button>
              </div>
            </div>

            {/* chats list */}
            <div className="px-2 pt-2 pb-1">
              <p className="px-2 mb-1.5 text-[12px] font-medium text-muted-foreground">
                Chats
              </p>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 scrollbar-thin">
              {!isAuthed && (
                <p className="px-2.5 py-2 text-[13px] text-muted-foreground leading-relaxed">
                  Sign in to see your chats.
                </p>
              )}
              {isAuthed && sessionsLoading && sessions.length === 0 && (
                <div className="space-y-1.5 py-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-8 rounded-lg bg-foreground/[0.04] animate-pulse"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </div>
              )}
              {isAuthed && sessionsError && (
                <div className="px-2.5 py-2">
                  <p className="text-[11px] text-[var(--pill-negative-ink)] leading-relaxed mb-1.5">
                    {sessionsError}
                  </p>
                  <button
                    onClick={() => void fetchSessions()}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Try again
                  </button>
                </div>
              )}
              {isAuthed && !sessionsLoading && !sessionsError && sessions.length === 0 && (
                <p className="px-2.5 py-2 text-[13px] text-muted-foreground leading-relaxed">
                  No chats yet. Start a new one.
                </p>
              )}
              {sortedSessions.map((conv) => (
                <div
                  key={conv.id}
                  className="relative group"
                  data-chat-menu-open={openChatMenuId === conv.id ? "" : undefined}
                >
                  <button
                    onClick={() => { selectSession(conv.id); setOpenChatMenuId(null); }}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 pr-8 rounded-lg text-left transition-colors ${
                      activeChatId === conv.id
                        ? "bg-foreground/[0.05] text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
                    }`}
                  >
                    <span className="text-[13px] truncate leading-snug">
                    {chatTitle(conv.title)}
                  </span>
                  {conv.pinned && (
                    <Pin
                      size={9}
                      className="shrink-0 text-accent/80 fill-accent/30 -ml-0.5"
                      aria-hidden="true"
                    />
                  )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenChatMenuId((p) => (p === conv.id ? null : conv.id));
                    }}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-[border-color,background-color,color] ${
                      openChatMenuId === conv.id
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                    aria-label="Chat options"
                  >
                    <MoreVertical size={13} />
                  </button>
                  {openChatMenuId === conv.id && (
                    <div className="absolute right-1 top-9 z-40 w-36 rounded-xl bg-popover border border-border shadow-xl shadow-black/25 overflow-hidden p-1 animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-150 origin-top-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenChatMenuId(null);
                          setRenameValue(conv.title ?? "");
                          setRenameFor(conv.id);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] rounded-lg transition-colors text-left"
                        aria-label="Rename chat"
                      >
                        <Pencil size={12} className="shrink-0" />
                        Rename
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenChatMenuId(null);
                          void handlePinToggle(conv);
                        }}
                        disabled={pinningId === conv.id}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] rounded-lg transition-colors text-left disabled:opacity-50"
                        aria-label={conv.pinned ? "Unpin chat" : "Pin chat"}
                      >
                        {pinningId === conv.id ? (
                          <Loader2 size={12} className="shrink-0 animate-spin" />
                        ) : conv.pinned ? (
                          <PinOff size={12} className="shrink-0" />
                        ) : (
                          <Pin size={12} className="shrink-0" />
                        )}
                        {conv.pinned ? "Unpin" : "Pin to top"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenChatMenuId(null);
                          setConfirmDeleteId(conv.id);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left"
                        aria-label="Delete chat"
                      >
                        <Trash2 size={12} className="shrink-0" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </nav>

            {/* bottom user area */}
            {session?.user && (
              <div className="border-t border-sidebar-border p-2 mt-auto relative">
              <button
                onClick={() => { setShowAccountMenu((p) => !p); setShowDocs(false); }}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-foreground/[0.04] transition-colors"
                aria-label="Account menu"
              >
                <span className="shrink-0">
                  <span className="flex w-9 h-9 rounded-full bg-[var(--avatar-bg)] items-center justify-center ring-1 ring-[var(--avatar-ring)]">
                    <span className="text-[11px] font-semibold text-foreground/90">
                      {(profile?.username || session.user.email || "U").slice(0, 2)}
                    </span>
                  </span>
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-xs font-medium text-foreground truncate">
                    {profile?.username || session.user.email?.split("@")[0] || "User"}
                  </span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {session.user.email}
                  </span>
                </span>
                <ChevronDown
                  size={12}
                  className={`text-muted-foreground shrink-0 transition-transform duration-150 ${
                    showAccountMenu ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showAccountMenu && (
                <AccountMenu
                  username={profile?.username || session.user.email?.split("@")[0] || "User"}
                  email={session.user.email || ""}
                  onClose={() => setShowAccountMenu(false)}
                  onSettings={() => {
                    setShowAccountMenu(false);
                    setShowProfileCard(true);
                  }}
                  onSignOut={handleSignOut}
                  signingOut={signingOut}
                />
              )}
            </div>
            )}
            {!session?.user && (
              <div className="border-t border-sidebar-border p-2 mt-auto">
                <button
                  onClick={() => { setAuthView("login"); setShowAuth(true); }}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-foreground/[0.04] transition-colors"
                  aria-label="Sign in"
                >
                  <span className="shrink-0">
                    <span className="flex w-9 h-9 rounded-full bg-foreground/[0.05] border border-border items-center justify-center">
                      <UserRound size={15} className="text-muted-foreground" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-xs font-medium text-foreground">
                      Sign in
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      or create an account
                    </span>
                  </span>
                  <ChevronRight size={12} className="text-muted-foreground shrink-0" />
                </button>
              </div>
            )}
          </>
        )}
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="flex flex-col flex-1 min-w-0 relative overflow-hidden">
        {/* top bar */}
        <header className="flex items-center justify-between px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                aria-label="Expand sidebar"
              >
                <Menu size={15} />
              </button>
            )}
            {!sidebarOpen && activeChatId === null && (
              <button
                onClick={startNewChat}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
              >
                <SquarePen size={13} />
                New chat
              </button>
            )}
          </div>

          {/* title */}
          {activeChatId &&
            activeConversation &&
            activeConversation.title &&
            activeConversation.title !== "New chat" && (
              <p className="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-foreground/70 truncate max-w-xs pointer-events-none">
                {activeConversation.title}
              </p>
            )}

          <div className="flex items-center gap-1.5 relative">
            {/* Theme switch */}
            <button
              onClick={() => setTheme((p) => (p === "dark" ? "light" : "dark"))}
              className="flex items-center px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            {/* Documents button */}
            <button
              onClick={() => { setShowDocs((p) => !p); setShowAccountMenu(false); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
              aria-label="Documents"
            >
              <FolderOpen size={14} />
              <span className="hidden sm:inline">
                Documents{selectedDocIds.length > 0 ? ` (${selectedDocIds.length})` : ""}
              </span>
            </button>

            {showDocs && (
              <DocsPanel
                files={files}
                loading={filesLoading}
                error={filesError}
                selectedIds={selectedDocIds}
                onToggleSelect={handleToggleSelect}
                onDelete={(file) => setConfirmDeleteFileId(file.id)}
                onUploadClick={handleUploadClick}
                onClose={() => setShowDocs(false)}
              />
            )}
          </div>
        </header>

        {/* conversation */}
        <div className="flex-1 overflow-y-auto">
          {activeChatId ? (
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-4">
              {loadingChat && displayMessages.length === 0 ? (
                <ChatSkeleton />
              ) : (
                <>
                  {displayMessages.map((msg) => (
                    <ChatMessage key={msg.id} msg={msg} />
                  ))}
                  {isSending && (
                    <div className="flex gap-3 justify-start">
                      <div className="rounded-2xl rounded-bl-sm px-4 py-3">
                        <TypingDots />
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <EmptyState userName={profile?.username || session?.user?.email?.split("@")[0] || undefined} />
          )}
        </div>

        {/* composer */}
        <div className="shrink-0 px-4 pb-10 pt-2">
          <div className="max-w-2xl mx-auto">
            {!isAuthed && (
              <p className="text-center text-[12px] text-muted-foreground mb-2">
                Sign in to send questions and upload RFP documents.
              </p>
            )}
            <Composer
              value={input}
              onChange={setInput}
              onSend={handleSend}
              disabled={isSending}
            />
          </div>
        </div>
      </main>

      {/* ── Auth Modal ──────────────────────────────────────────────────────── */}
      {showAuth && (
        <AuthModal
          view={authView}
          onViewChange={setAuthView}
          onClose={() => { setShowAuth(false); setPendingPrompt(null); }}
          onSuccess={handleAuthSuccess}
        />
      )}

      {/* ── Confirm Delete Modals ───────────────────────────────────────────── */}
      {confirmDeleteId && (
        <ConfirmDeleteModal
          title="Delete chat?"
          description={`"${chatTitle(
            sessions.find((s) => s.id === confirmDeleteId)?.title
          )}" and its messages will be permanently removed. This can't be undone.`}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={handleConfirmDelete}
          deleting={deletingChat}
        />
      )}

      {confirmDeleteFileId && (
        <ConfirmDeleteModal
          title="Delete document?"
          description={`"${
            files.find((f) => f.id === confirmDeleteFileId)?.filename ?? "Document"
          }" will be permanently removed. This can't be undone.`}
          onCancel={() => setConfirmDeleteFileId(null)}
          onConfirm={handleConfirmDeleteFile}
          deleting={deletingFile}
        />
      )}

      {renameFor && (
        <RenameChatModal
          value={renameValue}
          onChange={setRenameValue}
          onSave={() => void handleConfirmRename()}
          onCancel={() => !renamingChat && setRenameFor(null)}
          saving={renamingChat}
        />
      )}

      {showProfileCard && session?.user && (
        <ProfileCardModal
          username={
            profile?.username || session.user.email?.split("@")[0] || "User"
          }
          email={session.user.email || ""}
          avatarUrl={
            (session.user.user_metadata?.picture as string | undefined) ??
            (session.user.user_metadata?.avatar_url as string | undefined) ??
            null
          }
          files={files}
          filesLoading={filesLoading}
          downloadingId={downloadingDocId}
          onUpdateUsername={updateUsername}
          onDeleteAccount={() => {
            setShowProfileCard(false);
            setConfirmDeleteAccount(true);
          }}
          onDownload={(file) => void handleDownloadDoc(file)}
          onClose={() => setShowProfileCard(false)}
        />
      )}

      {confirmDeleteAccount && (
        <ConfirmDeleteModal
          title="Delete account?"
          description="Your account and all of its data — chats, messages and uploaded documents — will be permanently removed. This can't be undone."
          confirmLabel="Delete account"
          onCancel={() => !deletingAccount && setConfirmDeleteAccount(false)}
          onConfirm={handleConfirmDeleteAccount}
          deleting={deletingAccount}
        />
      )}

      {isLoadingEverything && (
        <div className="fixed inset-x-0 top-0 h-0.5 overflow-hidden pointer-events-none z-40">
          <div className="h-full w-1/3 bg-accent animate-pulse" />
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
