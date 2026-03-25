export default function KettlebellLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-50 -95 100 145" fill="none">
      {/* Handle */}
      <path d="M-20,-58 C-20,-82 -14,-90 0,-90 C14,-90 20,-82 20,-58" stroke="#777" strokeWidth="7" strokeLinecap="round" />
      {/* Body */}
      <circle cx="0" cy="4" r="42" fill="#555" />
      <circle cx="-12" cy="-12" r="18" fill="#666" opacity="0.5" />
      {/* Flat bottom */}
      <rect x="-28" y="34" width="56" height="7" rx="3" fill="#444" />
      {/* Bitcoin stamp */}
      <circle cx="0" cy="0" r="20" fill="none" stroke="#f7931a" strokeWidth="2" />
      <text textAnchor="middle" dominantBaseline="central" y="0" fontSize="22" fontWeight="700" fill="#f7931a" fontFamily="var(--font-display)">₿</text>
    </svg>
  );
}
