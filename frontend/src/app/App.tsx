import React, { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import {
  Menu, X, Plus, FolderOpen, Send, Paperclip,
  Eye, EyeOff, LogOut, Settings, Loader2,
  ChevronDown, MessageSquare,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

type AuthView = "login" | "signup";

interface User {
  email: string;
  name: string;
}

// ─── Sample Data ──────────────────────────────────────────────────────────────

const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    title: "City of Austin IT Infrastructure RFP",
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Can you summarize the key requirements from this RFP?",
        timestamp: new Date("2026-10-18T09:14:00"),
      },
      {
        id: "m2",
        role: "assistant",
        content:
          "## Summary — City of Austin IT Infrastructure RFP\n\nThis RFP seeks a managed services provider for the city's enterprise IT infrastructure. Here are the key requirements:\n\n### Scope of Work\n- **Network management** — 24/7 monitoring, incident response within 15 minutes for P1 issues\n- **Cloud migration** — Move 60% of on-prem workloads to GovCloud within 18 months\n- **Security compliance** — Must maintain FedRAMP Moderate and CJIS compliance throughout the engagement\n- **Help desk** — Tier 1–3 support with a 4-hour SLA for business-critical systems\n\n### Mandatory Qualifications\n1. 5+ years managing municipal IT environments with 1,000+ endpoints\n2. Demonstrated GovCloud migration experience (references required)\n3. SOC 2 Type II certification or equivalent\n4. Local office within 50 miles of Austin city limits\n\n### Evaluation Criteria\n| Criterion | Weight |\n|---|---|\n| Technical approach | 35% |\n| Past performance | 25% |\n| Price / cost model | 25% |\n| Local economic impact | 15% |\n\n### Key Dates\n- Questions due: November 4, 2026\n- Proposals due: November 21, 2026\n- Contract award: January 15, 2027\n\nWould you like me to extract the full technical requirements, identify potential compliance gaps, or draft a response outline?",
        timestamp: new Date("2026-10-18T09:14:45"),
      },
      {
        id: "m3",
        role: "user",
        content: "What are the insurance requirements?",
        timestamp: new Date("2026-10-18T09:17:00"),
      },
      {
        id: "m4",
        role: "assistant",
        content:
          "The RFP specifies the following insurance requirements on pages 18–19:\n\n- **Commercial General Liability** — $1,000,000 per occurrence / $2,000,000 aggregate\n- **Professional Liability (E&O)** — $2,000,000 per claim\n- **Cyber Liability** — $5,000,000 per occurrence (elevated due to data sensitivity)\n- **Workers' Compensation** — Statutory limits per Texas law\n- **Auto Liability** — $500,000 combined single limit\n\nThe City of Austin must be named as an additional insured on all policies except Workers' Comp. Certificates are due with the proposal submission.\n\nThe cyber liability requirement is notably high — do you want me to flag this as a risk item in the proposal checklist?",
        timestamp: new Date("2026-10-18T09:17:30"),
      },
    ],
  },
  {
    id: "c2",
    title: "Healthcare Data Analytics Platform",
    messages: [
      {
        id: "m5",
        role: "user",
        content: "Compare this RFP to the previous one we reviewed.",
        timestamp: new Date("2026-10-17T14:30:00"),
      },
      {
        id: "m6",
        role: "assistant",
        content:
          "Here is a side-by-side comparison of the two RFPs:\n\n| Dimension | City of Austin IT | Healthcare Analytics |\n|---|---|---|\n| Contract value | ~$4.2M/yr | ~$1.8M one-time |\n| Duration | 3 + 2 year options | 18-month project |\n| Compliance | FedRAMP, CJIS | HIPAA, SOC 2 |\n| Team size | 12–15 FTEs required | 4–6 FTEs |\n| Subcontracting | Allowed up to 40% | Prohibited |\n\nThe healthcare RFP is a better fit for a smaller firm — lower risk, tighter scope, and the HIPAA compliance requirement is more straightforward than combined FedRAMP/CJIS.",
        timestamp: new Date("2026-10-17T14:31:10"),
      },
    ],
  },
  {
    id: "c3",
    title: "State DOT Bridge Inspection Services",
    messages: [
      {
        id: "m7",
        role: "user",
        content: "What certifications are required for this bid?",
        timestamp: new Date("2026-10-16T11:05:00"),
      },
      {
        id: "m8",
        role: "assistant",
        content:
          "The State DOT RFP requires the following certifications from the prime contractor and all sub-consultants:\n\n1. **NBIS certification** — All lead inspectors must be certified under the National Bridge Inspection Standards\n2. **PE licensure** — At least one licensed Professional Engineer per state (TX required; others optional)\n3. **FHWA approval** — Bridge inspection program must be pre-approved by the Federal Highway Administration\n4. **Safety certifications** — OSHA 30, confined space entry, traffic control supervisor\n\nNotably, the RFP requires these certifications to be current (not expired) at the time of proposal submission, not just at contract award.",
        timestamp: new Date("2026-10-16T11:05:55"),
      },
    ],
  },
  {
    id: "c4",
    title: "Federal Cloud Security Assessment",
    messages: [
      {
        id: "m9",
        role: "user",
        content: "Draft an executive summary for our response.",
        timestamp: new Date("2026-10-15T16:20:00"),
      },
      {
        id: "m10",
        role: "assistant",
        content: "I can draft that. Let me review the RFP requirements first...",
        timestamp: new Date("2026-10-15T16:20:30"),
      },
    ],
  },
  {
    id: "c5",
    title: "Municipal Waste Management RFP",
    messages: [
      {
        id: "m11",
        role: "user",
        content: "What is the submission deadline?",
        timestamp: new Date("2026-10-14T10:00:00"),
      },
      {
        id: "m12",
        role: "assistant",
        content:
          "The submission deadline is **December 3, 2026 at 4:00 PM CST**. Late proposals will not be accepted under any circumstances. The RFP also requires a pre-proposal conference attendance on November 12 — this is mandatory for all bidders.",
        timestamp: new Date("2026-10-14T10:00:42"),
      },
    ],
  },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
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
          <code key={key++} className="px-1 py-0.5 rounded bg-white/[0.06] text-[0.85em] font-mono text-[#a5b4fc]">
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
                    className="text-left py-1.5 px-3 text-muted-foreground font-medium border-b border-border text-xs uppercase tracking-wide"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, ri) => (
                <tr key={ri} className="border-b border-border/50 last:border-0">
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

// ─── Message ──────────────────────────────────────────────────────────────────

function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} group`}>
      {!isUser && (
        <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center">
          <span className="text-[10px] font-semibold text-accent tracking-tight">AI</span>
        </div>
      )}
      <div className={`max-w-[78%] ${isUser ? "order-first" : ""}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-secondary text-foreground rounded-br-sm"
              : "text-foreground/95 rounded-bl-sm"
          }`}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed">{msg.content}</p>
          ) : (
            renderMarkdown(msg.content)
          )}
        </div>
        <div
          className={`mt-1 text-[11px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity ${
            isUser ? "text-right" : "text-left pl-1"
          }`}
        >
          {formatTime(msg.timestamp)}
        </div>
      </div>
      {isUser && (
        <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
          <span className="text-[10px] font-semibold text-foreground/60 tracking-tight">You</span>
        </div>
      )}
    </div>
  );
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────

interface AuthModalProps {
  view: AuthView;
  onViewChange: (v: AuthView) => void;
  onClose: () => void;
  onSuccess: (user: User) => void;
  pendingPrompt?: string;
}

function AuthModal({ view, onViewChange, onClose, onSuccess }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (view === "signup" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1100));
    setLoading(false);
    if (view === "signup") {
      setSignupDone(true);
    } else {
      onSuccess({ email, name: email.split("@")[0] });
    }
  };

  const handleForgotPassword = async () => {
    if (!email) { setError("Enter your email first."); return; }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    setLoading(false);
    setResetSent(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl shadow-black/60 p-8"
        role="dialog"
        aria-modal="true"
      >
        {/* close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-white/[0.05]"
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
              {view === "login" ? "Welcome back" : "Create your account"}
            </h2>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            {signupDone
              ? "We sent a confirmation link to " + email
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
          <form onSubmit={handleSubmit} className="space-y-3">
            {resetSent && (
              <div className="rounded-lg bg-accent/10 border border-accent/20 p-3 text-sm text-accent/90">
                Reset link sent — check your email.
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive-foreground/80">
                {error}
              </div>
            )}

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
                className="w-full rounded-lg bg-input-background border border-border px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent/50 transition-all"
              />
            </div>

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
                  className="w-full rounded-lg bg-input-background border border-border px-3 py-2 pr-9 text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

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
                  className="w-full rounded-lg bg-input-background border border-border px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-accent/50 transition-all"
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
              className="w-full mt-1 rounded-lg bg-accent text-accent-foreground py-2.5 text-sm font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {view === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        {!signupDone && (
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

function AccountMenu({ user, onClose, onSignOut }: { user: User; onClose: () => void; onSignOut: () => void }) {
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
      className="absolute bottom-12 right-0 z-30 w-52 rounded-xl bg-popover border border-border shadow-xl shadow-black/50 overflow-hidden"
    >
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
      </div>
      <div className="p-1">
        <button className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-white/[0.05] rounded-lg transition-colors text-left">
          <Settings size={13} className="shrink-0" />
          Account settings
        </button>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-white/[0.05] rounded-lg transition-colors text-left"
        >
          <LogOut size={13} className="shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── Documents Drawer ─────────────────────────────────────────────────────────

function DocsPanel({ onClose }: { onClose: () => void }) {
  const files = [
    { name: "Austin_IT_RFP_2026.pdf", size: "2.4 MB", date: "Oct 18" },
    { name: "Healthcare_Analytics_RFP.pdf", size: "1.1 MB", date: "Oct 17" },
    { name: "DOT_Bridge_Inspection_RFP.pdf", size: "3.7 MB", date: "Oct 16" },
    { name: "Federal_Cloud_Security_RFP.pdf", size: "890 KB", date: "Oct 15" },
  ];

  return (
    <div className="absolute top-12 right-3 z-30 w-72 rounded-xl bg-popover border border-border shadow-xl shadow-black/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-foreground">Documents</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
        >
          <X size={14} />
        </button>
      </div>
      <div className="p-1.5 max-h-72 overflow-y-auto">
        {files.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors group"
          >
            <div className="shrink-0 w-8 h-8 flex items-center justify-center">
              <svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-foreground/50">
                <path d="M11 1H3C2.46957 1 1.96086 1.21071 1.58579 1.58579C1.21071 1.96086 1 2.46957 1 3V19C1 19.5304 1.21071 20.0391 1.58579 20.4142C1.96086 20.7893 2.46957 21 3 21H15C15.5304 21 16.0391 20.7893 16.4142 20.4142C16.7893 20.0391 17 19.5304 17 19V7L11 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M11 1V7H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M5 16H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground/90 truncate">{f.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{f.size} · {f.date}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-border">
        <button className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] rounded-lg transition-colors">
          <Paperclip size={13} />
          Upload document
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
  onUploadClick: () => void;
  disabled?: boolean;
  uploading?: boolean;
}

function Composer({ value, onChange, onSend, onUploadClick, disabled, uploading }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + "px";
    }
  }, [value]);

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  };

  return (
    <div className="flex flex-col gap-2 bg-secondary rounded-2xl border border-border/60 shadow-lg shadow-black/20 overflow-hidden focus-within:border-border focus-within:ring-1 focus-within:ring-ring transition-all">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        placeholder="Ask about the RFP…"
        rows={1}
        className="resize-none bg-transparent px-4 pt-3.5 pb-1 text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none leading-relaxed disabled:opacity-50"
        style={{ maxHeight: 200 }}
        aria-label="Message input"
      />
      <div className="flex items-center justify-between px-3 pb-2.5">
        <button
          onClick={onUploadClick}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
          aria-label="Attach document"
        >
          {uploading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Paperclip size={13} />
          )}
          <span>{uploading ? "Uploading…" : "Attach"}</span>
        </button>
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          aria-label="Send message"
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent text-accent-foreground disabled:opacity-30 disabled:cursor-default hover:bg-accent/90 transition-all"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ userName }: { userName?: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 pb-8 select-none">
      <h1
        className="text-3xl font-medium text-foreground tracking-tight mb-2"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Hello{userName ? `, ${userName}` : ""} 👋
      </h1>
      <p className="text-base text-muted-foreground mb-10">Let&apos;s get started</p>
      <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
        {[
          { icon: "📄", label: "Summarize an RFP", desc: "Extract key requirements" },
          { icon: "⚖️", label: "Compare proposals", desc: "Side-by-side analysis" },
          { icon: "✅", label: "Check compliance", desc: "Review against standards" },
          { icon: "✍️", label: "Draft a response", desc: "AI-assisted writing" },
        ].map((s) => (
          <button
            key={s.label}
            className="flex flex-col items-start gap-1 p-3 rounded-xl bg-card/60 border border-border/60 hover:border-border hover:bg-card transition-all text-left"
          >
            <span className="text-base">{s.icon}</span>
            <span className="text-sm font-medium text-foreground/90">{s.label}</span>
            <span className="text-xs text-muted-foreground">{s.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>(SAMPLE_CONVERSATIONS);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [showAuth, setShowAuth] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const activeConversation = conversations.find((c) => c.id === activeChatId) ?? null;

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeConversation?.messages.length, isTyping]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAuth(false);
        setShowDocs(false);
        setShowAccountMenu(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const startNewChat = useCallback(() => {
    setActiveChatId(null);
    setInput("");
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      if (!user) {
        setPendingPrompt(text);
        setShowAuth(true);
        return;
      }

      let chatId = activeChatId;

      if (!chatId) {
        const newConv: Conversation = {
          id: uid(),
          title: text.length > 48 ? text.slice(0, 48) + "…" : text,
          messages: [],
        };
        setConversations((prev) => [newConv, ...prev]);
        chatId = newConv.id;
        setActiveChatId(chatId);
      }

      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, messages: [...c.messages, userMsg] } : c
        )
      );
      setInput("");
      setIsTyping(true);

      await new Promise((r) => setTimeout(r, 1400 + Math.random() * 800));

      const assistantMsg: Message = {
        id: uid(),
        role: "assistant",
        content:
          "I've reviewed the document. Here is a summary of the key points:\n\n**Scope** — The RFP requests a comprehensive solution covering implementation, integration, and ongoing support.\n\n**Eligibility** — Vendors must demonstrate at least three years of relevant experience and provide two client references.\n\n**Deadline** — Proposals are due November 30, 2026 at 5:00 PM ET. No extensions will be granted.\n\nWould you like me to extract the full requirements list or help draft a section of your response?",
        timestamp: new Date(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, messages: [...c.messages, assistantMsg] } : c
        )
      );
      setIsTyping(false);
    },
    [activeChatId, user]
  );

  const handleSend = () => {
    sendMessage(input);
  };

  const handleAuthSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    setShowAuth(false);
    if (pendingPrompt) {
      const p = pendingPrompt;
      setPendingPrompt("");
      setInput(p);
      setTimeout(() => sendMessage(p), 100);
    }
  };

  const handleSignOut = () => {
    setUser(null);
    setShowAccountMenu(false);
    setActiveChatId(null);
  };

  const handleUpload = () => {
    if (!user) { setShowAuth(true); return; }
    fileInputRef.current?.click();
  };

  const handleFileChange = async () => {
    setUploading(true);
    await new Promise((r) => setTimeout(r, 1800));
    setUploading(false);
  };

  return (
    <div className="dark flex h-screen w-screen overflow-hidden bg-background text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`flex flex-col shrink-0 border-r border-sidebar-border bg-sidebar transition-all duration-200 ease-in-out ${
          sidebarOpen ? "w-56" : "w-0 overflow-hidden"
        }`}
      >
        {sidebarOpen && (
          <>
            {/* top controls */}
            <div className="flex items-center justify-between px-3 pt-4 pb-2">
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
                aria-label="Collapse sidebar"
              >
                <Menu size={15} />
              </button>
              <button
                onClick={startNewChat}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
                aria-label="New chat"
              >
                <Plus size={13} />
                New chat
              </button>
            </div>

            {/* chats list */}
            <div className="px-2 pt-2 pb-1">
              <p className="px-2 mb-1.5 text-[10px] font-medium tracking-widest uppercase text-muted-foreground/50">
                Chats
              </p>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 scrollbar-thin">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setActiveChatId(conv.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors group ${
                    activeChatId === conv.id
                      ? "bg-white/[0.07] text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                  }`}
                >
                  <MessageSquare size={12} className="shrink-0 opacity-50" />
                  <span className="text-[13px] truncate leading-snug">{conv.title}</span>
                </button>
              ))}
            </nav>

            {/* bottom user area */}
            {user && (
              <div className="border-t border-sidebar-border p-2 mt-auto">
                <button
                  onClick={() => setShowAccountMenu((p) => !p)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-semibold text-accent uppercase">
                      {user.name.slice(0, 2)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate flex-1 text-left">{user.email}</span>
                  <ChevronDown size={10} className="text-muted-foreground/50 shrink-0" />
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
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
                aria-label="Expand sidebar"
              >
                <Menu size={15} />
              </button>
            )}
            {!sidebarOpen && activeChatId === null && (
              <button
                onClick={startNewChat}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
              >
                <Plus size={13} />
                New chat
              </button>
            )}
          </div>

          {/* title */}
          {activeChatId && activeConversation && (
            <p className="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-foreground/70 truncate max-w-xs pointer-events-none">
              {activeConversation.title}
            </p>
          )}

          <div className="flex items-center gap-1.5 relative">
            {/* Documents button */}
            <button
              onClick={() => { setShowDocs((p) => !p); setShowAccountMenu(false); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
              aria-label="Documents"
            >
              <FolderOpen size={14} />
              <span className="hidden sm:inline">Documents</span>
            </button>

            {showDocs && <DocsPanel onClose={() => setShowDocs(false)} />}
          </div>
        </header>

        {/* conversation */}
        <div className="flex-1 overflow-y-auto">
          {activeConversation ? (
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-4">
              {activeConversation.messages.map((msg) => (
                <ChatMessage key={msg.id} msg={msg} />
              ))}
              {isTyping && (
                <div className="flex gap-3 justify-start">
                  <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center">
                    <span className="text-[10px] font-semibold text-accent tracking-tight">AI</span>
                  </div>
                  <div className="rounded-2xl rounded-bl-sm px-4 py-3">
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <EmptyState userName={user?.name} />
          )}
        </div>

        {/* composer */}
        <div className="shrink-0 px-4 pb-5 pt-2">
          <div className="max-w-2xl mx-auto">
            <Composer
              value={input}
              onChange={setInput}
              onSend={handleSend}
              onUploadClick={handleUpload}
              disabled={isTyping}
              uploading={uploading}
            />
          </div>
        </div>
      </main>

      {/* ── Auth Modal ──────────────────────────────────────────────────────── */}
      {showAuth && (
        <AuthModal
          view={authView}
          onViewChange={setAuthView}
          onClose={() => { setShowAuth(false); setPendingPrompt(""); }}
          onSuccess={handleAuthSuccess}
          pendingPrompt={pendingPrompt}
        />
      )}
    </div>
  );
}
