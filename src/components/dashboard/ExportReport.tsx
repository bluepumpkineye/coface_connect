"use client";

import { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PortfolioData } from "@/lib/types";
import { formatMoney, formatPct } from "@/lib/format";
import { Button, Spinner } from "@/components/ui";

/**
 * Lightweight PDF export: summary cards + full buyer table.
 * Uses jsPDF in the browser so no server-side rendering is required.
 */
export function ExportReport({ data }: { data: PortfolioData }) {
  const [busy, setBusy] = useState(false);
  const { summary } = data;

  const generate = () => {
    setBusy(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const now = new Date();

      // ---- Header band ----
      doc.setFillColor(13, 35, 64);
      doc.rect(0, 0, pageWidth, 72, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Coface Connect — Portfolio Risk Report", 40, 32);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(200, 214, 233);
      doc.text(
        `Generated ${now.toLocaleString("en-GB")} · ${summary.totalBuyers} buyers · ${formatMoney(summary.totalExposure)} outstanding · DEMO / SYNTHETIC DATA`,
        40,
        50,
      );

      // ---- Headline adverse selection stat ----
      let y = 100;
      doc.setTextColor(13, 35, 64);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Adverse selection snapshot", 40, y);
      y += 8;

      autoTable(doc, {
        startY: y + 6,
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 5, textColor: [30, 41, 59] },
        headStyles: { fillColor: [13, 35, 64], textColor: 255, fontSize: 8 },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
        head: [["Metric", "Insured book", "Uninsured book", "Gap"]],
        body: [
          ["Buyers", String(summary.insuredBuyers), String(summary.uninsuredBuyers), "—"],
          [
            "Outstanding exposure",
            formatMoney(summary.insuredExposure),
            formatMoney(summary.uninsuredExposure),
            "—",
          ],
          [
            "Average risk score (0–100)",
            `${summary.avgRiskInsured} (${summary.bandInsured})`,
            `${summary.avgRiskUninsured} (${summary.bandUninsured})`,
            `+${summary.adverseSelectionGap} pts`,
          ],
        ],
      });

      let cursor = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

      // ---- Summary metrics ----
      autoTable(doc, {
        startY: cursor + 16,
        theme: "plain",
        styles: { fontSize: 8.5, cellPadding: 3.5 },
        columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
        head: [["Portfolio summary", ""]],
        headStyles: { fillColor: [241, 246, 252], textColor: [13, 35, 64], fontSize: 9 },
        body: [
          ["Total buyers", String(summary.totalBuyers)],
          ["Buyers insured", `${formatPct(summary.pctBuyersInsured, 0)} (${summary.insuredBuyers})`],
          ["Exposure insured", `${formatPct(summary.pctExposureInsured, 0)} (${formatMoney(summary.insuredExposure)})`],
          [
            "Uninsured low/medium-risk exposure",
            `${formatMoney(summary.missedOpportunityExposure)} (${summary.missedOpportunityCount} buyers)`,
          ],
          [
            "Uninsured high/critical-risk exposure",
            `${formatMoney(summary.uninsuredHighRiskExposure)} (${summary.uninsuredHighRiskCount} buyers)`,
          ],
          [
            "Open alerts",
            `${summary.alertCounts.upsell} upsell · ${summary.alertCounts.deterioration} deterioration · ${summary.alertCounts.concentration} concentration`,
          ],
          ["Months monitored", String(summary.monthsMonitored)],
        ],
      });

      cursor = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursor;

      // ---- Buyer table ----
      autoTable(doc, {
        startY: cursor + 16,
        theme: "striped",
        styles: { fontSize: 7.5, cellPadding: 3.5 },
        headStyles: { fillColor: [13, 35, 64], textColor: 255, fontSize: 7.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        head: [["Buyer", "Country", "Industry", "Outstanding", "Days late", "Score", "Band", "Insured", "Trend"]],
        columnStyles: {
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          7: { halign: "center" },
          8: { halign: "center" },
        },
        body: [...data.buyers]
          .sort((a, b) => b.riskScore - a.riskScore)
          .map((buyer) => [
            buyer.name,
            buyer.country,
            buyer.industry,
            formatMoney(buyer.outstandingAmount),
            String(buyer.avgDaysLate),
            String(buyer.riskScore),
            buyer.riskBand,
            buyer.isInsured ? "Yes" : "No",
            buyer.paymentTrend,
          ]),
        didDrawPage: () => {
          const footer = doc.getCurrentPageInfo().pageNumber;
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text(
            "Demo only — synthetic data. Scoring is a simplified illustrative model, not Coface's CUBE engine or an actuarial model.",
            40,
            doc.internal.pageSize.getHeight() - 18,
          );
          doc.text(`Page ${footer}`, pageWidth - 60, doc.internal.pageSize.getHeight() - 18);
        },
      });

      doc.save(`coface-connect-portfolio-report-${now.toISOString().slice(0, 10)}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" onClick={generate} disabled={busy}>
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <span aria-hidden>⤓</span>}
      Export Portfolio Report
    </Button>
  );
}
