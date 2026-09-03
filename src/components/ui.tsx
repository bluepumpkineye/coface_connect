"use client";

import type { ReactNode } from "react";
import { BAND_COLORS } from "@/lib/format";
import { useStore } from "@/components/AppStore";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`surface ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-navy-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function BandBadge({ band, score }: { band: string; score?: number }) {
  const colors = BAND_COLORS[band] ?? BAND_COLORS.Low;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${colors.bg} ${colors.text} ${colors.ring}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.hex }} />
      {band}
      {typeof score === "number" ? <span className="numeric opacity-70">{score}</span> : null}
    </span>
  );
}

export function Pill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "teal" | "amber" | "rose" | "navy";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    teal: "bg-teal-50 text-teal-700 ring-teal-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    navy: "bg-navy-50 text-navy-700 ring-navy-100",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "teal" | "amber";
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
};

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  className = "",
  type = "button",
  title,
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary:
      "bg-navy-800 text-white hover:bg-navy-700 focus-visible:outline-navy-800 shadow-sm disabled:bg-navy-800/50",
    secondary:
      "bg-white text-navy-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
    danger: "bg-rose-600 text-white hover:bg-rose-500 shadow-sm",
    teal: "bg-brandteal text-white hover:brightness-110 shadow-sm",
    amber:
      "bg-brandamber text-navy-950 hover:brightness-105 shadow-sm disabled:bg-brandamber/60",
  };
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-[13px]",
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ToastHost() {
  const { toasts } = useStore();
  const tones: Record<string, string> = {
    info: "bg-navy-900 text-white ring-navy-950/40",
    success: "bg-teal-700 text-white ring-teal-900/30",
    error: "bg-rose-600 text-white ring-rose-900/30",
  };
  const icons: Record<string, string> = { info: "ℹ", success: "✓", error: "!" };

  return (
    <div className="no-print pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(24rem,calc(100vw-2.5rem))] flex-col items-end gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex w-full items-start gap-2.5 rounded-xl px-4 py-3 text-[12.5px] font-medium leading-snug shadow-xl ring-1 ring-inset ${tones[toast.tone]}`}
          style={{ animation: "toast-in 220ms ease-out" }}
        >
          <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
            {icons[toast.tone]}
          </span>
          <span className="flex-1">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center px-6 text-center text-xs text-slate-400">
      {message}
    </div>
  );
}
