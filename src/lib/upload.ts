export const TEMPLATE_HEADERS = [
  "buyer_name",
  "country",
  "industry",
  "outstanding_amount",
  "credit_limit_used",
  "credit_limit_requested",
  "avg_days_late",
  "payment_trend",
  "is_insured",
  "buyer_since",
] as const;

export type TemplateField = (typeof TEMPLATE_HEADERS)[number];

export const FIELD_LABELS: Record<TemplateField, string> = {
  buyer_name: "Buyer name",
  country: "Country",
  industry: "Industry",
  outstanding_amount: "Outstanding amount",
  credit_limit_used: "Credit limit used",
  credit_limit_requested: "Credit limit requested",
  avg_days_late: "Avg days late",
  payment_trend: "Payment trend",
  is_insured: "Insured?",
  buyer_since: "Buyer since",
};

export const REQUIRED_FIELDS: TemplateField[] = ["buyer_name", "outstanding_amount"];

export const SAMPLE_ROWS: Record<TemplateField, string>[] = [
  {
    buyer_name: "Golden Harbour Trading Ltd",
    country: "Hong Kong SAR",
    industry: "Trading",
    outstanding_amount: "485000",
    credit_limit_used: "400000",
    credit_limit_requested: "600000",
    avg_days_late: "4",
    payment_trend: "stable",
    is_insured: "no",
    buyer_since: "2019-04-11",
  },
  {
    buyer_name: "Shenzhen Bright Electronics Co., Ltd",
    country: "China (Mainland)",
    industry: "Electronics",
    outstanding_amount: "1820000",
    credit_limit_used: "1650000",
    credit_limit_requested: "2200000",
    avg_days_late: "52",
    payment_trend: "worsening",
    is_insured: "yes",
    buyer_since: "2014-09-02",
  },
  {
    buyer_name: "PT Nusantara Materials",
    country: "Indonesia",
    industry: "Building Materials",
    outstanding_amount: "620000",
    credit_limit_used: "500000",
    credit_limit_requested: "700000",
    avg_days_late: "31",
    payment_trend: "stable",
    is_insured: "no",
    buyer_since: "2021-01-20",
  },
];

/** Header aliases used to auto-guess the column mapping. */
export const FIELD_ALIASES: Record<TemplateField, string[]> = {
  buyer_name: ["buyername", "buyer", "name", "customername", "customer", "company", "counterparty", "accountname", "debtor"],
  country: ["country", "countryregion", "buyermarket", "market", "geography", "location"],
  industry: ["industry", "sector", "segment", "tradecategory"],
  outstanding_amount: [
    "outstandingamount",
    "outstanding",
    "balance",
    "arbalance",
    "exposure",
    "amountoutstanding",
    "openbalance",
    "totalreceivable",
    "receivable",
  ],
  credit_limit_used: ["creditlimitused", "limitused", "usedlimit", "currentlimit"],
  credit_limit_requested: [
    "creditlimitrequested",
    "limitrequested",
    "requestedlimit",
    "requestedcreditlimit",
    "creditlimit",
  ],
  avg_days_late: ["avgdayslate", "averagedayslate", "dayslate", "pastdue", "dayspastdue", "dsoverdue", "ageddays"],
  payment_trend: ["paymenttrend", "trend", "paymentdirection", "behaviourtrend"],
  is_insured: ["isinsured", "insured", "covered", "oncover", "policystatus", "insuredflag"],
  buyer_since: ["buyersince", "clientsince", "firstinvoice", "relationshipstart", "startdate", "since"],
};

export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function guessMapping(headers: string[]): Record<TemplateField, string> {
  const normalised = headers.map((header) => ({ header, key: normaliseHeader(header) }));
  const mapping = {} as Record<TemplateField, string>;

  for (const field of TEMPLATE_HEADERS) {
    const aliases = FIELD_ALIASES[field];
    const exact = normalised.find((item) => aliases.includes(item.key));
    if (exact) {
      mapping[field] = exact.header;
      continue;
    }
    const partial = normalised.find(
      (item) => !Object.values(mapping).includes(item.header) && aliases.some((alias) => item.key.includes(alias)),
    );
    mapping[field] = partial?.header ?? "";
  }
  return mapping;
}

export function buildTemplateCsv(): string {
  const escape = (value: string) => (/[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [
    TEMPLATE_HEADERS.join(","),
    ...SAMPLE_ROWS.map((row) => TEMPLATE_HEADERS.map((field) => escape(row[field])).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}
