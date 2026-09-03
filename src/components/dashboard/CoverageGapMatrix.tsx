"use client";

import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ClientBuyer } from "@/lib/types";
import { BAND_COLORS, formatMoney } from "@/lib/format";

const INSURED_COLOR = "#e11d48";
const UNINSURED_COLOR = "#2563eb";

type Point = {
  id: number;
  name: string;
  country: string;
  industry: string;
  riskScore: number;
  riskBand: string;
  exposure: number;
  share: number;
  isInsured: boolean;
  avgDaysLate: number;
};

function toPoints(buyers: ClientBuyer[], totalExposure: number): Point[] {
  return buyers.map((buyer) => ({
    id: buyer.id,
    name: buyer.name,
    country: buyer.country,
    industry: buyer.industry,
    riskScore: buyer.riskScore,
    riskBand: buyer.riskBand,
    exposure: buyer.outstandingAmount,
    share: totalExposure > 0 ? (buyer.outstandingAmount / totalExposure) * 100 : 0,
    isInsured: buyer.isInsured,
    avgDaysLate: buyer.avgDaysLate,
  }));
}

/** Improvement 4 — one tooltip look across every chart. */
function TooltipCard({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const colors = BAND_COLORS[point.riskBand] ?? BAND_COLORS.Low;
  return (
    <div className="min-w-[218px] rounded-xl bg-navy-900/97 px-3.5 py-3 text-white shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur">
      <p className="text-[12.5px] font-semibold leading-tight">{point.name}</p>
      <p className="mt-0.5 text-[11px] text-navy-100">
        {point.country} · {point.industry}
      </p>
      <div className="mt-2 space-y-1">
        {[
          {
            label: "Outstanding",
            value: formatMoney(point.exposure),
          },
          {
            label: "Risk score",
            value: `${point.riskScore}/100 · ${point.riskBand}`,
            color: colors.hex,
          },
          { label: "Avg days late", value: String(point.avgDaysLate) },
          { label: "Portfolio share", value: `${point.share.toFixed(1)}%` },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-5 text-[11.5px]">
            <span className="flex items-center gap-1.5 text-navy-100">
              {row.color ? (
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
              ) : null}
              {row.label}
            </span>
            <span className="numeric font-semibold text-white">{row.value}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-5 border-t border-white/10 pt-1 text-[11.5px]">
          <span className="text-navy-100">Insured</span>
          <span
            className="font-semibold"
            style={{ color: point.isInsured ? "#fda4af" : "#93c5fd" }}
          >
            {point.isInsured ? "Yes — on programme" : "No — uninsured"}
          </span>
        </div>
      </div>
      <p className="mt-2 border-t border-white/10 pt-1.5 text-[10.5px] text-navy-100/70">
        Click the dot for an instant assessment
      </p>
    </div>
  );
}

/**
 * Custom scatter shape so each dot is a real, individually clickable element
 * (Improvement 5e). Radius is derived from exposure — same intent as the ZAxis
 * range, but computed here so it is guaranteed to match the click target.
 */
function makeDotShape(
  points: Point[],
  maxExposure: number,
  onSelect: (buyerId: number) => void,
  radiusFor: (exposure: number) => number,
) {
  const byId = new Map(points.map((point) => [point.id, point]));
  // Typed as `unknown` on purpose: Recharts passes its own ScatterPointItem
  // union here, and we only need a handful of well-known keys off it.
  return function DotShape(shapeProps: unknown) {
    const props = (shapeProps ?? {}) as {
      cx?: number;
      cy?: number;
      payload?: Point;
      id?: number;
    };
    const cx = Number(props.cx ?? 0);
    const cy = Number(props.cy ?? 0);
    const payload = props.payload;
    const point = payload
      ? (byId.get(payload.id) ?? payload)
      : byId.get(Number(props.id ?? -1));

    if (!point || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    const radius = radiusFor(point.exposure || 0);
    const fill = point.isInsured ? INSURED_COLOR : UNINSURED_COLOR;

    return (
      <g
        className="chart-clickable"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(point.id);
        }}
      >
        <circle cx={cx} cy={cy} r={radius + 5} fill="transparent" />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill={fill}
          fillOpacity={point.isInsured ? 0.78 : 0.62}
          stroke={fill}
          strokeWidth={1.4}
        />
      </g>
    );
  };
}

export function CoverageGapMatrix({
  buyers,
  totalExposure,
  onSelect,
}: {
  buyers: ClientBuyer[];
  totalExposure: number;
  onSelect: (buyerId: number) => void;
}) {
  const points = toPoints(buyers, totalExposure);
  const insured = points.filter((point) => point.isInsured);
  const uninsured = points.filter((point) => !point.isInsured);

  const exposures = points.map((point) => point.exposure);
  const maxExposure = Math.max(1, ...exposures);
  const domainMin = Math.max(1, Math.floor(Math.min(8000, ...exposures) * 0.8));
  const domainMax = Math.max(6000000, maxExposure * 1.4);

  const radiusFor = (exposure: number) => {
    const ratio = Math.sqrt(Math.min(1, exposure / Math.max(1, domainMax)));
    return 3.4 + ratio * 10.5;
  };

  return (
    <div className="relative h-[352px] w-full px-1 pb-2 pt-3">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 6, right: 18, bottom: 14, left: 4 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          {/* Risk band zones along the X axis */}
          <ReferenceArea x1={0} x2={25} fill="#059669" fillOpacity={0.045} />
          <ReferenceArea x1={26} x2={50} fill="#d97706" fillOpacity={0.05} />
          <ReferenceArea x1={51} x2={75} fill="#ea580c" fillOpacity={0.055} />
          <ReferenceArea x1={76} x2={100} fill="#e11d48" fillOpacity={0.07} />
          <ReferenceLine x={76} stroke="#e11d48" strokeDasharray="4 4" strokeOpacity={0.45} />

          <XAxis
            type="number"
            dataKey="riskScore"
            name="Risk score"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
            label={{
              value: "Risk score (0 = safest, 100 = riskiest)",
              position: "insideBottom",
              offset: -10,
              fontSize: 11,
              fill: "#64748b",
            }}
          />
          <YAxis
            type="number"
            dataKey="exposure"
            name="Outstanding"
            scale="log"
            domain={[domainMin, domainMax]}
            allowDataOverflow
            ticks={[10000, 100000, 1000000]}
            tickFormatter={(value: number) => formatMoney(value, { compact: true })}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
            width={64}
          />
          <ZAxis type="number" dataKey="exposure" range={[36, 460]} domain={[0, domainMax]} />
          <Tooltip
            content={<TooltipCard />}
            cursor={{ strokeDasharray: "3 3", stroke: "#94a3b8" }}
            isAnimationActive={false}
          />

          {/* Shape-based dots give per-point click targets (Improvement 5e). */}
          <Scatter
            name="Uninsured"
            data={uninsured}
            fill={UNINSURED_COLOR}
            shape={makeDotShape(points, maxExposure, onSelect, radiusFor)}
            isAnimationActive={false}
          />
          <Scatter
            name="Insured"
            data={insured}
            fill={INSURED_COLOR}
            shape={makeDotShape(points, maxExposure, onSelect, radiusFor)}
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>

      <div className="absolute right-6 top-1 flex items-center gap-4 text-[11px] font-medium text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INSURED_COLOR }} />
          Insured
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: UNINSURED_COLOR }} />
          Uninsured
        </span>
        <span className="text-slate-400">Bubble size = exposure</span>
      </div>
    </div>
  );
}
