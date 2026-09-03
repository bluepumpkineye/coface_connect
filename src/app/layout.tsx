import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppStoreProvider } from "@/components/AppStore";
import { ToastHost } from "@/components/ui";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Coface Connect — Portfolio Visibility & Risk Monitoring (Demo)",
  description:
    "Illustrative demo: ingest a full accounts receivable ledger, score every buyer for credit risk, and expose adverse selection in trade credit insurance programmes.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AppStoreProvider>
          <TopNav />
          <main className="mx-auto max-w-[1500px] px-6 py-6">{children}</main>
          <footer className="no-print mx-auto max-w-[1500px] px-6 pb-10 pt-4">
            <p className="text-[11px] leading-relaxed text-slate-400">
              <strong className="font-semibold text-slate-500">Demo only.</strong> Coface Connect is
              an independent product concept built for demonstration purposes. All buyers, figures,
              scores and premiums are synthetic; the scoring model is a simplified, transparent
              heuristic and is not Coface&apos;s CUBE engine or any actuarial model. No real Coface
              systems, data or APIs are used.
            </p>
          </footer>
          <ToastHost />
        </AppStoreProvider>
      </body>
    </html>
  );
}
