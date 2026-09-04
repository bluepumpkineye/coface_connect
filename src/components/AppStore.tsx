"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildPortfolioPayload,
  emptyState,
  loadDemoData as loadDemoDataInto,
  resetPortfolio,
  resolveAlertById,
  setBuyerInsured,
  setBuyerLimit,
  type PortfolioState,
} from "@/lib/portfolio";
import { IngestError, ingestRows as ingestRowsInto } from "@/lib/ingest";
import { simulateNextMonth } from "@/lib/simulate";
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
    clientName?: string,
  ) => Promise<IngestionSummary | null>;
  insureBuyer: (buyerId: number, insured: boolean) => Promise<PolicyActionOutcome>;
  updateBuyerLimit: (buyerId: number, creditLimit: number) => Promise<PolicyActionOutcome>;
  resolveAlert: (alertId: number) => Promise<boolean>;
};

const StoreContext = createContext<StoreValue | null>(null);

const STORAGE_KEY = "coface-connect:portfolio:v1";

/**
 * The book lives in memory here in the browser and is mirrored to
 * localStorage, so a reload keeps whatever the user did. Every buyer is
 * synthetic and generated from a seed, so there is nothing here worth putting
 * in a database — and a serverless host has no durable disk for one anyway.
 */
function readPersisted(): PortfolioState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PortfolioState>;
    if (!Array.isArray(parsed.buyers) || !Array.isArray(parsed.alerts)) return null;
    return {
      policyholder: parsed.policyholder ?? emptyState().policyholder,
      buyers: parsed.buyers,
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      alerts: parsed.alerts,
      nextAlertId: typeof parsed.nextAlertId === "number" ? parsed.nextAlertId : 1,
    };
  } catch {
    // Corrupt or unreadable (private window, cleared site data) — start fresh.
    return null;
  }
}

function persist(state: PortfolioState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or a browser blocking site data. The demo works fine without it.
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const stateRef = useRef<PortfolioState>(emptyState());
  const [data, setData] = useState<PortfolioData | null>(null);
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

  /** Recompute the whole payload from the book and hand it to the UI. */
  const publish = useCallback(() => {
    const payload = buildPortfolioPayload(stateRef.current) as unknown as PortfolioData;
    setData(payload);
    persist(stateRef.current);
    return payload;
  }, []);

  const refresh = useCallback(async () => {
    publish();
    setError(null);
  }, [publish]);

  // Runs once, after mount. It has to be an effect rather than lazy state: the
  // book comes from localStorage, which the server cannot read, so seeding it
  // during render would not match the prerendered HTML and would break
  // hydration.
  useEffect(() => {
    const restored = readPersisted();
    if (restored && restored.buyers.length > 0) {
      stateRef.current = restored;
    } else {
      // A first-time visitor lands on a populated dashboard rather than an
      // empty one — the demo has to be immediately impressive with no setup.
      stateRef.current = emptyState();
      loadDemoDataInto(stateRef.current);
    }
    publish();
  }, [publish]);

  /**
   * Every action mutates the book then republishes the recomputed payload, so
   * a single call invalidates every card, chart, badge and table row at once.
   */
  const runAction = useCallback(
    (label: string | null, mutate: () => void, successMessage?: string): boolean => {
      if (label) setWorking(label);
      setError(null);
      try {
        mutate();
        publish();
        if (successMessage) pushToast(successMessage, "success");
        return true;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Request failed";
        setError(message);
        pushToast(message, "error");
        return false;
      } finally {
        setWorking(null);
      }
    },
    [publish, pushToast],
  );

  const loadDemoData = useCallback(async () => {
    runAction(
      "demo",
      () => loadDemoDataInto(stateRef.current, Math.floor(Math.random() * 100000)),
      "Demo portfolio generated and scored.",
    );
  }, [runAction]);

  const resetData = useCallback(async () => {
    runAction("reset", () => resetPortfolio(stateRef.current), "Workspace cleared.");
  }, [runAction]);

  const simulateMonth = useCallback(async () => {
    runAction(
      "simulate",
      () => simulateNextMonth(stateRef.current),
      "Next month simulated — scores and alerts refreshed.",
    );
  }, [runAction]);

  const ingestRows = useCallback(
    async (rows: Record<string, unknown>[], replace: boolean, clientName?: string) => {
      let summary: IngestionSummary | null = null;
      const ok = runAction("ingest", () => {
        try {
          summary = ingestRowsInto(stateRef.current, rows, replace, clientName).ingestion;
        } catch (caught) {
          throw caught instanceof IngestError ? caught : new Error("Ingestion failed");
        }
      });
      return ok ? summary : null;
    },
    [runAction],
  );

  /**
   * Improvement 1 — the live policy mutation. The engine recomputes the entire
   * portfolio payload from the buyer book, so this invalidates every card,
   * chart, badge and table row in one shot.
   */
  const insureBuyer = useCallback(
    async (buyerId: number, insured: boolean): Promise<PolicyActionOutcome> => {
      let autoResolved = 0;
      const ok = runAction(insured ? "insure" : null, () => {
        const outcome = setBuyerInsured(stateRef.current, buyerId, insured);
        if (!outcome) throw new Error("Buyer not found");
        autoResolved = outcome.resolvedAlerts;
      });
      return { ok, autoResolved: ok ? autoResolved : 0 };
    },
    [runAction],
  );

  const updateBuyerLimit = useCallback(
    async (buyerId: number, creditLimit: number): Promise<PolicyActionOutcome> => {
      let autoResolved = 0;
      const ok = runAction("limit", () => {
        const outcome = setBuyerLimit(stateRef.current, buyerId, creditLimit);
        if (!outcome) throw new Error("Buyer not found");
        autoResolved = outcome.resolvedAlerts;
      });
      return { ok, autoResolved: ok ? autoResolved : 0 };
    },
    [runAction],
  );

  const resolveAlert = useCallback(
    async (alertId: number): Promise<boolean> =>
      runAction(null, () => {
        if (!resolveAlertById(stateRef.current, alertId)) throw new Error("Alert not found");
      }),
    [runAction],
  );

  // Derived, not stored: the dashboard is loading precisely until the first
  // payload exists. Keeping it as separate state would be a second source of
  // truth for the same fact.
  const loading = data === null;

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
