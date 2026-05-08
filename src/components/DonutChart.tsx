
interface Segment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: Segment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}

export function DonutChart({
  segments,
  size = 140,
  thickness = 22,
  centerLabel,
  centerSub,
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-gray-200 dark:text-gray-400"
        />
        {centerLabel && (
          <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="middle"
            className="text-gray-400" fontSize="18" fontWeight="700" fill="currentColor">
            0
          </text>
        )}
      </svg>
    );
  }

  // Build segments from bottom (offset accumulates)
  let offset = circumference * 0.25; // start at top (12 o'clock)
  const renderedSegments = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const dash = (s.value / total) * circumference;
      const gap = circumference - dash;
      const seg = { ...s, dash, gap, offset };
      offset -= dash;
      return seg;
    });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={thickness}
        className="text-gray-100 dark:text-gray-300"
      />
      {renderedSegments.map((s, i) => (
        <circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={s.color}
          strokeWidth={thickness}
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={s.offset}
          strokeLinecap="butt"
        />
      ))}
      {/* Center text — counter-rotate so it reads correctly */}
      {centerLabel && (
        <text
          x={size / 2}
          y={size / 2 - (centerSub ? 8 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ transform: `rotate(90deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}
          fontSize="22"
          fontWeight="700"
          fill="currentColor"
          className="text-gray-900 dark:text-white"
        >
          {centerLabel}
        </text>
      )}
      {centerSub && (
        <text
          x={size / 2}
          y={size / 2 + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ transform: `rotate(90deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}
          fontSize="11"
          fill="#9ca3af"
        >
          {centerSub}
        </text>
      )}
    </svg>
  );
}

export default DonutChart;
