import { useEffect, useId, useRef, useState } from "react";

// ============================================================================
// Responsive width hook — keeps SVG charts crisp at any size
// ============================================================================
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

// Catmull-Rom -> cubic bezier for smooth lines
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return "";
  const d = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }
  return d.join(" ");
}

// ============================================================================
// TrendChart — area + line for vital-sign trends
// ============================================================================
export function TrendChart({
  data,
  color = "#13726c",
  height = 120,
  unit = "",
  min,
  max,
}: {
  data: number[];
  color?: string;
  height?: number;
  unit?: string;
  min?: number;
  max?: number;
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const uid = useId();
  const W = width || 600;
  const H = height;
  const padX = 8;
  const padY = 18;

  if (data.length === 0) {
    return <div ref={ref} className="w-full" />;
  }

  const lo = min ?? Math.min(...data);
  const hi = max ?? Math.max(...data);
  const range = hi - lo || 1;

  const pts = data.map((v, i) => ({
    x: padX + (i / (data.length - 1 || 1)) * (W - padX * 2),
    y: H - padY - ((v - lo) / range) * (H - padY * 2),
  }));

  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;
  const last = pts[pts.length - 1];
  const gid = `grad-${uid.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div ref={ref} className="w-full" data-testid="trend-chart">
      <svg width={W} height={H} className="overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* baseline gridlines */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={0}
            x2={W}
            y1={padY + g * (H - padY * 2)}
            y2={padY + g * (H - padY * 2)}
            stroke="#f1f5f9"
            strokeWidth={1}
          />
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last.x} cy={last.y} r={4} fill={color} />
        <circle cx={last.x} cy={last.y} r={7} fill={color} opacity={0.18} />
        {unit && (
          <text x={W - 4} y={13} textAnchor="end" className="fill-slate-400" style={{ fontSize: 10 }}>
            {data[data.length - 1]} {unit}
          </text>
        )}
      </svg>
    </div>
  );
}

// ============================================================================
// Sparkline — tiny inline trend
// ============================================================================
export function Sparkline({
  data,
  color = "#13726c",
  height = 32,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const W = 90;
  const H = height;
  if (data.length === 0) return null;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const range = hi - lo || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1 || 1)) * W,
    y: H - 4 - ((v - lo) / range) * (H - 8),
  }));
  return (
    <svg width={W} height={H} className="overflow-visible">
      <path
        d={smoothPath(pts)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================================================
// GroupedBarChart — two-series bars (e.g. admissions vs discharges)
// ============================================================================
export function GroupedBarChart({
  data,
  height = 200,
}: {
  data: { day: string; admitted: number; discharged: number }[];
  height?: number;
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const W = width || 600;
  const H = height;
  const padX = 24;
  const padY = 24;

  if (data.length === 0) {
    return <div ref={ref} className="w-full" />;
  }

  const max = Math.max(...data.flatMap((d) => [d.admitted, d.discharged])) * 1.15;
  const groupW = (W - padX * 2) / data.length;
  const barW = Math.min(14, groupW / 3.2);

  return (
    <div ref={ref} className="w-full" data-testid="bar-chart">
      <svg width={W} height={H}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={padX}
            x2={W - padX}
            y1={H - padY - g * (H - padY * 2)}
            y2={H - padY - g * (H - padY * 2)}
            stroke="#f1f5f9"
            strokeWidth={1}
          />
        ))}
        {data.map((d, i) => {
          const cx = padX + i * groupW + groupW / 2;
          const hA = (d.admitted / max) * (H - padY * 2);
          const hD = (d.discharged / max) * (H - padY * 2);
          return (
            <g key={d.day}>
              <rect
                x={cx - barW - 1}
                y={H - padY - hA}
                width={barW}
                height={hA}
                rx={3}
                fill="#13726c"
              />
              <rect
                x={cx + 1}
                y={H - padY - hD}
                width={barW}
                height={hD}
                rx={3}
                fill="#cbd5e1"
              />
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                className="fill-slate-400"
                style={{ fontSize: 11 }}
              >
                {d.day}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ============================================================================
// RadialGauge — circular progress for capacity / utilization
// ============================================================================
export function RadialGauge({
  value,
  size = 64,
  stroke = 7,
  color = "#13726c",
  label,
}: {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  // Draw-in: start from an empty ring, settle to the target on the next frame.
  // Reduced motion renders the final value immediately.
  const [drawn, setDrawn] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    if (drawn) return;
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [drawn]);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f6" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={drawn ? offset : c}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.23, 1, 0.32, 1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-sm font-bold text-slate-800">{Math.round(value)}%</span>
        {label && <span className="text-[9px] text-slate-400">{label}</span>}
      </div>
    </div>
  );
}
