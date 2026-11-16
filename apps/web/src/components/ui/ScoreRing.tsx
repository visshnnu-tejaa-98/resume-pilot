interface ScoreRingProps {
  score: number;
  max?: number;
  size?: number;
  /** Small caption inside the ring, under the number. */
  caption?: string;
}

const R = 48;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Circular ATS score gauge (120-unit viewBox, as in the designs). */
export function ScoreRing({ score, max = 100, size = 112, caption }: ScoreRingProps) {
  const filled = (Math.max(0, Math.min(score, max)) / max) * CIRCUMFERENCE;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`ATS score ${score} out of ${max}`}>
      <circle cx="60" cy="60" r={R} fill="none" className="stroke-surface-2" strokeWidth="12" />
      <circle
        cx="60"
        cy="60"
        r={R}
        fill="none"
        className="stroke-accent"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${filled.toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`}
        transform="rotate(-90 60 60)"
      />
      <text
        x="60"
        y={caption ? 64 : 68}
        textAnchor="middle"
        className="fill-text font-mono"
        fontSize="30"
        fontWeight="600"
      >
        {score}
      </text>
      {caption ? (
        <text x="60" y="84" textAnchor="middle" className="fill-text-2 font-sans" fontSize="11">
          {caption}
        </text>
      ) : null}
    </svg>
  );
}
