interface Day {
  day: string;
  ok: number;
  failed: number;
}

/**
 * Stacked bars per day: succeeded (link blue) with failed (accent) on
 * top. Fills missing days with zero so gaps read as "no activity".
 */
export function ActionsChart({ data, days }: { data: Day[]; days: number }) {
  const byDay = new Map(data.map((d) => [d.day, d]));
  const series: Day[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    series.push(byDay.get(key) ?? { day: key, ok: 0, failed: 0 });
  }
  const peak = Math.max(4, ...series.map((d) => d.ok + d.failed));
  const step = Math.ceil(peak / 3);
  const max = step * 3;
  const W = 700;
  const top = 10;
  const base = 196;
  const h = base - top;
  const slot = (W - 48) / series.length;
  const bw = Math.min(30, slot * 0.65);
  const labelEvery = series.length > 16 ? Math.ceil(series.length / 10) : 1;
  const label = (iso: string, i: number) => {
    const d = new Date(`${iso}T00:00:00`);
    return i === 0 || d.getDate() === 1 ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : String(d.getDate());
  };

  return (
    <svg viewBox={`0 0 ${W} 220`} width="100%" role="img" aria-label={`AI actions per day for the last ${days} days, succeeded and failed`}>
      {[0, step, step * 2, max].map((v) => {
        const y = base - (v / max) * h;
        return (
          <g key={v}>
            <line x1="40" x2={W - 10} y1={y} y2={y} className="stroke-border" />
            <text x="32" y={y + 3} textAnchor="end" fontSize="10" className="fill-text-2 font-mono">
              {v}
            </text>
          </g>
        );
      })}
      {series.map((d, i) => {
        const x = 48 + i * slot + (slot - bw) / 2;
        const hs = (d.ok / max) * h;
        const hf = (d.failed / max) * h;
        return (
          <g key={d.day}>
            <title>{`${d.day}: ${d.ok} succeeded, ${d.failed} failed`}</title>
            <rect x={x} y={base - hs} width={bw} height={hs} rx="3" className="fill-link" />
            {d.failed > 0 ? <rect x={x} y={base - hs - Math.max(hf, 2) - 1} width={bw} height={Math.max(hf, 2)} rx="2" className="fill-accent" /> : null}
            {i % labelEvery === 0 ? (
              <text x={x + bw / 2} y="214" textAnchor="middle" fontSize="10" className="fill-text-2">
                {label(d.day, i)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
