export default function KettlebellLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none">
      {/* Handle — connected to body */}
      <path d="M30,52 C30,20 38,10 50,10 C62,10 70,20 70,52" fill="none" stroke="#666" strokeWidth="9" strokeLinecap="round" />
      {/* Handle inner gap */}
      <path d="M36,50 C36,28 42,18 50,18 C58,18 64,28 64,50" fill="var(--bg, #0a0a0b)" stroke="none" />
      {/* Body */}
      <ellipse cx="50" cy="72" rx="38" ry="38" fill="#555" />
      {/* Highlight */}
      <ellipse cx="38" cy="60" rx="14" ry="16" fill="#6a6a6a" opacity="0.45" />
      {/* Bitcoin stamp */}
      <circle cx="50" cy="70" r="18" fill="none" stroke="#f7931a" strokeWidth="1.8" />
      <text textAnchor="middle" dominantBaseline="central" x="50" y="70" fontSize="20" fontWeight="700" fill="#f7931a" fontFamily="var(--font-display)">₿</text>
    </svg>
  );
}
