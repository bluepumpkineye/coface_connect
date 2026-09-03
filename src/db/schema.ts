import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Coface Connect — DEMO schema.
 *
 * Everything here is synthetic demo data. There is no connection to any real
 * Coface system, and none of these figures represent real companies.
 */

export type ScoreBreakdown = {
  payment: number;
  country: number;
  industry: number;
  concentration: number;
  /** Weighted contributions actually applied to the final score. */
  weights: { payment: number; country: number; industry: number; concentration: number };
  /** Share of total portfolio exposure used for the concentration sub-score. */
  exposureShare: number;
};

export const buyers = pgTable(
  "buyers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    country: text("country").notNull(),
    industry: text("industry").notNull(),
    /** Outstanding AR balance, in whole USD. */
    outstandingAmount: integer("outstanding_amount").notNull(),
    creditLimitUsed: integer("credit_limit_used").notNull().default(0),
    creditLimitRequested: integer("credit_limit_requested").notNull().default(0),
    avgDaysLate: integer("avg_days_late").notNull().default(0),
    /** improving | stable | worsening */
    paymentTrend: text("payment_trend").notNull().default("stable"),
    isInsured: boolean("is_insured").notNull().default(false),
    buyerSince: date("buyer_since", { mode: "string" }).notNull(),
    riskScore: integer("risk_score").notNull().default(0),
    /** Low | Medium | High | Critical */
    riskBand: text("risk_band").notNull().default("Low"),
    scoreBreakdown: jsonb("score_breakdown").$type<ScoreBreakdown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("buyers_risk_score_idx").on(table.riskScore),
    index("buyers_is_insured_idx").on(table.isInsured),
  ],
);

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: serial("id").primaryKey(),
    buyerId: integer("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    riskScore: integer("risk_score").notNull(),
  },
  (table) => [index("snapshots_buyer_idx").on(table.buyerId, table.snapshotDate)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    buyerId: integer("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    /** upsell | deterioration | concentration */
    type: text("type").notNull(),
    message: text("message").notNull(),
    /**
     * User-dismissed alerts. Resolution is keyed on (buyer_id, type) and carried
     * across regenerations so refreshing the ledger does not resurrect an alert
     * somebody has already dealt with.
     */
    resolved: boolean("resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("alerts_buyer_idx").on(table.buyerId),
    index("alerts_resolved_idx").on(table.resolved),
  ],
);

export type Buyer = typeof buyers.$inferSelect;
export type NewBuyer = typeof buyers.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
