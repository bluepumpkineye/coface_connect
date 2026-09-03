export function formatMoney(value: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(value)) return "$0";
  if (opts.compact) {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`;
    return `$${Math.round(value)}`;
  }
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function formatPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(digits)}%`;
}

export function formatBandLabel(band: string): string {
  return band;
}

export function trendArrow(trend: string): { icon: string; className: string; label: string } {
  if (trend === "improving") {
    return { icon: "▼", className: "text-emerald-600", label: "Improving" };
  }
  if (trend === "worsening") {
    return { icon: "▲", className: "text-rose-600", label: "Worsening" };
  }
  return { icon: "—", className: "text-slate-400", label: "Stable" };
}

export const BAND_COLORS: Record<string, { bg: string; text: string; ring: string; hex: string }> = {
  Low: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", hex: "#059669" },
  Medium: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", hex: "#d97706" },
  High: { bg: "bg-orange-50", text: "text-orange-700", ring: "ring-orange-200", hex: "#ea580c" },
  Critical: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200", hex: "#e11d48" },
};

/**
 * Higher-contrast band colours for use on the dark navy hero panel. The normal
 * band palette is tuned for white surfaces and loses legibility on navy.
 */
export const BAND_ON_DARK: Record<string, { text: string; hex: string; bg: string }> = {
  Low: { text: "#6ee7b7", hex: "#10b981", bg: "rgba(16, 185, 129, 0.16)" },
  Medium: { text: "#fcd34d", hex: "#f59e0b", bg: "rgba(245, 158, 11, 0.16)" },
  High: { text: "#fdba74", hex: "#f97316", bg: "rgba(249, 115, 22, 0.18)" },
  Critical: { text: "#fda4af", hex: "#f43f5e", bg: "rgba(244, 63, 94, 0.2)" },
};

export function monthLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}
