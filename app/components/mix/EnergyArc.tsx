"use client";

interface EnergyArcProps {
  energyValues: number[]; // 0-1 per track
  trackNames?: string[];
}

export default function EnergyArc({ energyValues, trackNames }: EnergyArcProps) {
  if (energyValues.length === 0) return null;

  const width = 600;
  const height = 100;
  const padding = { top: 10, right: 16, bottom: 24, left: 32 };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Build SVG path
  const points = energyValues.map((e, i) => {
    const x =
      padding.left +
      (energyValues.length === 1
        ? plotWidth / 2
        : (i / (energyValues.length - 1)) * plotWidth);
    const y = padding.top + plotHeight * (1 - e);
    return { x, y, energy: e };
  });

  // Smooth curve through points
  const pathD = points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = points[i - 1];
      const cpx = (prev.x + p.x) / 2;
      return `C ${cpx} ${prev.y}, ${cpx} ${p.y}, ${p.x} ${p.y}`;
    })
    .join(" ");

  // Area fill path
  const areaD =
    pathD +
    ` L ${points[points.length - 1].x} ${padding.top + plotHeight} L ${points[0].x} ${padding.top + plotHeight} Z`;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 text-xs font-medium text-zinc-500">Energy Arc</div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((level) => (
          <line
            key={level}
            x1={padding.left}
            y1={padding.top + plotHeight * (1 - level)}
            x2={width - padding.right}
            y2={padding.top + plotHeight * (1 - level)}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="4 4"
          />
        ))}

        {/* Y-axis labels */}
        <text
          x={padding.left - 4}
          y={padding.top + 4}
          textAnchor="end"
          className="fill-zinc-600 text-[8px]"
        >
          1.0
        </text>
        <text
          x={padding.left - 4}
          y={padding.top + plotHeight / 2 + 2}
          textAnchor="end"
          className="fill-zinc-600 text-[8px]"
        >
          0.5
        </text>
        <text
          x={padding.left - 4}
          y={padding.top + plotHeight + 4}
          textAnchor="end"
          className="fill-zinc-600 text-[8px]"
        >
          0
        </text>

        {/* Area fill */}
        <path d={areaD} fill="url(#energyGradient)" opacity={0.3} />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="#a78bfa"
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill="#a78bfa" />
            <circle
              cx={p.x}
              cy={p.y}
              r={6}
              fill="transparent"
              className="hover:fill-violet-400/20"
            >
              <title>
                {trackNames?.[i]
                  ? `${trackNames[i]}: ${(p.energy * 100).toFixed(0)}%`
                  : `Track ${i + 1}: ${(p.energy * 100).toFixed(0)}%`}
              </title>
            </circle>
            {/* Track number label */}
            <text
              x={p.x}
              y={padding.top + plotHeight + 16}
              textAnchor="middle"
              className="fill-zinc-600 text-[7px]"
            >
              {i + 1}
            </text>
          </g>
        ))}

        {/* Gradient definition */}
        <defs>
          <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
