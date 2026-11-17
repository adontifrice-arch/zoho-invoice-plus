export function Mark({ size = 36, tone = "ink" }: { size?: number; tone?: "ink" | "paper" }) {
  const ink = tone === "paper" ? "#F3EFE6" : "#1A1F1C";
  const teal = tone === "paper" ? "#F3EFE6" : "#0E5F68";
  const gold = tone === "paper" ? "#E4D3A1" : "#8F7340";
  return (
    <svg className="mark-svg" width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="6.5" y="5.5" width="51" height="53" rx="4" stroke={ink} strokeWidth="2.5" />
      <path d="M6.5 10.2C6.5 7.6 8.6 5.5 11.2 5.5H17.5V58.5H11.2C8.6 58.5 6.5 56.4 6.5 53.8V10.2Z" fill={teal} />
      <path d="M44 5.5H52.8C55.4 5.5 57.5 7.6 57.5 10.2V18" stroke={gold} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M26 24H49" stroke={ink} strokeWidth="2.25" strokeLinecap="round" />
      <path d="M26 33H44" stroke={ink} strokeWidth="2.25" strokeLinecap="round" />
      <path d="M26 42H36" stroke={ink} strokeWidth="2.25" strokeLinecap="round" />
      <rect x="45.25" y="37.25" width="9.5" height="9.5" rx="1.6" stroke={teal} strokeWidth="1.75" />
    </svg>
  );
}
