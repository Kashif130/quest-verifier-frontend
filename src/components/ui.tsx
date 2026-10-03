import { useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, Check, Copy, Info, Loader2, X } from "lucide-react";
import { useToast } from "../context/ToastContext";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-beacon-400 text-deep-950 hover:bg-beacon-300 disabled:bg-beacon-600/40 disabled:text-deep-700 shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset]",
  secondary:
    "bg-transparent text-mist-100 border border-deep-600 hover:border-beacon-400 hover:text-beacon-300 disabled:opacity-40",
  ghost: "bg-transparent text-mist-400 hover:text-mist-100 disabled:opacity-40",
  danger: "bg-ember-500 text-white hover:bg-ember-400 disabled:bg-ember-600/40 disabled:text-white/80",
};

export function buttonClass(variant: ButtonVariant = "primary", extra = ""): string {
  return `inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium tracking-[0.01em] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beacon-400 ${variantClasses[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  loading = false,
  icon,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium tracking-[0.01em] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beacon-400 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = "",
  as: Component = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  return (
    <Component
      className={`rounded-lg border border-deep-700 bg-deep-900/80 shadow-sheet backdrop-blur-sm ${className}`}
    >
      {children}
    </Component>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <span className="text-[13px] font-medium text-mist-200">{children}</span>
      {hint && <span className="text-[12px] text-mist-500">{hint}</span>}
    </div>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-deep-600 bg-deep-950/60 px-3 py-2.5 text-[14px] text-mist-100 placeholder:text-mist-500 outline-none transition-colors focus:border-beacon-400 ${className}`}
      {...rest}
    />
  );
}

export function Textarea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-md border border-deep-600 bg-deep-950/60 px-3 py-2.5 text-[14px] text-mist-100 placeholder:text-mist-500 outline-none transition-colors focus:border-beacon-400 ${className}`}
      {...rest}
    />
  );
}

export function HelperText({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <p className={`mt-1.5 text-[12px] ${tone === "error" ? "text-ember-400" : "text-mist-500"}`}>
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-deep-950/80 p-4 backdrop-blur-sm">
      <div className={`max-h-[92vh] w-full ${width} overflow-y-auto rounded-lg border border-deep-700 bg-deep-900 shadow-sheet`}>
        <div className="flex items-center justify-between border-b border-deep-700 px-5 py-4">
          <h2 className="font-display text-[17px] text-mist-100">{title}</h2>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-mist-500 hover:bg-deep-800 hover:text-mist-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Address / copy helpers
// ---------------------------------------------------------------------------

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-[12px] text-mist-500 hover:text-beacon-300"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function AddressPill({ address, you = false }: { address: string; you?: boolean }) {
  const short = address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-deep-600 bg-deep-950/50 px-2.5 py-1 font-mono text-[12px] text-mist-200">
      {short}
      {you && <span className="rounded-full bg-beacon-400/20 px-1.5 text-[10px] text-beacon-300">you</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toast viewport
// ---------------------------------------------------------------------------

export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-md border px-4 py-3 shadow-sheet backdrop-blur ${
            t.kind === "error"
              ? "border-ember-500/50 bg-ember-500/10"
              : t.kind === "success"
                ? "border-jade-500/50 bg-jade-500/10"
                : "border-deep-600 bg-deep-900"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-mist-100">{t.title}</p>
              {t.detail && <p className="mt-0.5 text-[12px] text-mist-400">{t.detail}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-mist-500 hover:text-mist-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Additional primitives for the agreement UI
// ---------------------------------------------------------------------------

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-md border border-deep-600 bg-deep-950/60 px-3 py-2.5 text-[14px] text-mist-100 outline-none transition-colors focus:border-beacon-400 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`h-4 w-4 animate-spin ${className}`} />;
}

export function PageHeader({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] text-mist-100">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-mist-400">{children}</p>}
      </div>
      {actions}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[18px] text-mist-100">{children}</h2>
      {aside}
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-deep-800 py-2.5 last:border-b-0">
      <dt className="text-[12px] text-mist-500">{label}</dt>
      <dd className="text-right text-[13px] text-mist-100">{children}</dd>
    </div>
  );
}

type NoticeTone = "info" | "warn" | "error" | "success";

const noticeStyles: Record<NoticeTone, string> = {
  info: "border-deep-600 bg-deep-850 text-mist-200",
  warn: "border-amber-500/40 bg-amber-500/10 text-mist-200",
  error: "border-ember-500/40 bg-ember-500/10 text-mist-200",
  success: "border-jade-500/40 bg-jade-500/10 text-mist-200",
};

const noticeIcon: Record<NoticeTone, string> = {
  info: "text-beacon-300",
  warn: "text-amber-400",
  error: "text-ember-400",
  success: "text-jade-400",
};

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
}) {
  const Icon = tone === "warn" || tone === "error" ? AlertTriangle : tone === "success" ? Check : Info;
  return (
    <div className={`flex items-start gap-3 rounded-md border p-3.5 ${noticeStyles[tone]}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${noticeIcon[tone]}`} />
      <div className="text-[13px] leading-relaxed">
        {title && <p className="font-medium text-mist-100">{title}</p>}
        {children && <div className={title ? "mt-1 text-mist-400" : ""}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-deep-600 px-6 py-12 text-center">
      <p className="font-display text-[18px] text-mist-100">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-mist-400">{children}</div>}
    </div>
  );
}
