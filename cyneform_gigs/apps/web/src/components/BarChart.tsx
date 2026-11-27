export function BarChart({
  data,
  height = 120,
  label,
}: {
  data: { x: string; y: number }[];
  height?: number;
  label: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.y));
  const w = 600;
  const bw = w / Math.max(1, data.length);
  return (
    <figure>
      <figcaption className="mb-1 text-sm font-medium">{label}</figcaption>
      <svg viewBox={`0 0 ${w} ${height + 18}`} className="w-full" role="img" aria-label={label}>
        {data.map((d, i) => {
          const h = (d.y / max) * height;
          return (
            <g key={d.x}>
              <title>{`${d.x}: ${d.y.toLocaleString("en-KE")}`}</title>
              <rect
                x={i * bw + 1}
                y={height - h}
                width={Math.max(1, bw - 2)}
                height={h}
                className="fill-blue-600"
                rx="1"
              />
            </g>
          );
        })}
        <text x="0" y={height + 14} className="fill-slate-500 text-[10px]">
          {data[0]?.x.slice(5)}
        </text>
        <text x={w} y={height + 14} textAnchor="end" className="fill-slate-500 text-[10px]">
          {data.at(-1)?.x.slice(5)}
        </text>
      </svg>
    </figure>
  );
}
