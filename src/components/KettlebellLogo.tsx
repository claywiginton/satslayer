export default function KettlebellLogo({ size = 36 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <img
        src="/kettlebell.png"
        alt=""
        width={size}
        height={size}
        style={{ objectFit: 'contain', filter: 'brightness(1.3)' }}
      />
      {/* Bitcoin stamp overlay */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ paddingTop: size * 0.18 }}>
        <span style={{
          fontSize: size * 0.32,
          fontWeight: 800,
          color: '#f7931a',
          fontFamily: 'var(--font-display)',
          textShadow: '0 1px 3px rgba(0,0,0,0.6)',
          lineHeight: 1,
        }}>₿</span>
      </div>
    </div>
  );
}
