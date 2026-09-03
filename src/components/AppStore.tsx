"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { IngestionSummary, PortfolioData } from "@/lib/types";

export type Toast = { id: number; message: string; tone: "info" | "success" | "error" };

export type PolicyActionOutcome = {
  ok: boolean;
  autoResolved: number;
};

type StoreValue = {
  data: PortfolioData | null;
  loading: boolean;
  working: string | null;
  error: string | null;
  toasts: Toast[];
  pushToast: (message: string, tone?: Toast["tone"]) => void;
  refresh: () => Promise<void>;
  loadDemoData: () => Promise<void>;
  resetData: () => Promise<void>;
  simulateMonth: () => Promise<void>;
  ingestRows: (
    rows: Record<string, unknown>[],
    replace: boolean,
  ) => Promise<IngestionSummary | null>;
  insureBuyer: (buyerId: number, insured: boolean) => Promise<PolicyActionOutcome>;
  updateBuyerLimit: (buyerId: number, creditLimit: number) => Promise<PolicyActionOutcome>;
  resolveAlert: (alertId: number) => Promise<boolean>;
};

const StoreContext = createContext<StoreValue | null>(null);

async function parseJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Unexpected response (${response.status})`);
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/portfolio", { cache: "no-store" });
      const payload = await parseJson(response);
      if (!response.ok) throw new Error(String(payload.error ?? "Failed to load portfolio"));
      setData(payload as unknown as PortfolioData);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (
      label: string | null,
      url: string,
      body?: unknown,
      successMessage?: string,
    ) => {
      if (label) setWorking(label);
      setError(null);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const payload = await parseJson(response);
        if (!response.ok) throw new Error(String(payload.error ?? "Request failed"));
        setData(payload as unknown as PortfolioData);
        if (successMessage) pushToast(successMessage, "success");
        return payload;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Request failed";
        setError(message);
        pushToast(message, "error");
        return null;
      } finally {
        setWorking(null);
      }
    },
    [pushToast],
  );

  const loadDemoData = useCallback(async () => {
    await runAction(
      "demo",
      "/api/demo-data",
      { seed: Math.floor(Math.random() * 100000) },
      "Demo portfolio generated and scored.",
    );
  }, [runAction]);

  const resetData = useCallback(async () => {
    await runAction("reset", "/api/reset", {}, "Workspace cleared.");
  }, [runAction]);

  const simulateMonth = useCallback(async () => {
    await runAction(
      "simulate",
      "/api/simulate-month",
      {},
      "Next month simulated — scores and alerts refreshed.",
    );
  }, [runAction]);

  const ingestRows = useCallback(
    async (rows: Record<string, unknown>[], replace: boolean) => {
      const payload = await runAction("ingest", "/api/ingest", { rows, replace });
      if (!payload || typeof payload !== "object") return null;
      return (payload as { ingestion?: IngestionSummary }).ingestion ?? null;
    },
    [runAction],
  );

  /**
   * Improvement 1 — the live policy mutation. The server recomputes the entire
   * portfolio payload from the buyers table, so `setData` here invalidates
   * every card, chart, badge and table row in one shot.
   */
  const insureBuyer = useCallback(
    async (buyerId: number, insured: boolean): Promise<PolicyActionOutcome> => {
      const payload = await runAction(
        insured ? "insure" : null,
        `/api/buyers/${buyerId}/insure`,
        { insured },
      );
      if (!payload) return { ok: false, autoResolved: 0 };
      return {
        ok: true,
        autoResolved: Number((payload as { autoResolved?: number }).autoResolved ?? 0),
      };
    },
    [runAction],
  );

  const updateBuyerLimit = useCallback(
    async (buyerId: number, creditLimit: number): Promise<PolicyActionOutcome> => {
      const payload = await runAction(
        "limit",
        `/api/buyers/${buyerId}/limit`,
        { creditLimit },
      );
      if (!payload) return { ok: false, autoResolved: 0 };
      return {
        ok: true,
        autoResolved: Number((payload as { autoResolved?: number }).autoResolved ?? 0),
      };
    },
    [runAction],
  );

  const resolveAlert = useCallback(
    async (alertId: number): Promise<boolean> => {
      const payload = await runAction(null, `/api/alerts/${alertId}/resolve`, {});
      return Boolean(payload);
    },
    [runAction],
  );

  const value = useMemo<StoreValue>(
    () => ({
      data,
      loading,
      working,
      error,
      toasts,
      pushToast,
      refresh,
      loadDemoData,
      resetData,
      simulateMonth,
      ingestRows,
      insureBuyer,
      updateBuyerLimit,
      resolveAlert,
    }),
    [
      data,
      loading,
      working,
      error,
      toasts,
      pushToast,
      refresh,
      loadDemoData,
      resetData,
      simulateMonth,
      ingestRows,
      insureBuyer,
      updateBuyerLimit,
      resolveAlert,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside AppStoreProvider");
  return context;
}
