import Link from "next/link";

export function Logo({ compact = false, href = "/app" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="SR - Feirinhas, página inicial">
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
        <path d="M4 14 L20 5 L36 14 Z" fill="#e2600f" />
        <path d="M4 14 h32 v3 a4 4 0 0 1 -8 0 a4 4 0 0 1 -8 0 a4 4 0 0 1 -8 0 a4 4 0 0 1 -8 0 Z" fill="#fff" stroke="#e2600f" strokeWidth="1.5" />
        <rect x="7" y="20" width="26" height="14" rx="2" fill="#2f9e44" />
        <rect x="11" y="24" width="6" height="10" rx="1" fill="#fdf8f1" />
        <rect x="21" y="24" width="8" height="5" rx="1" fill="#fdf8f1" />
      </svg>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-xs font-bold uppercase tracking-widest text-brand-600">SR</span>
          <span className="block text-lg font-extrabold">Feirinhas</span>
        </span>
      )}
      {compact && <span className="text-lg font-extrabold">Feirinhas</span>}
    </Link>
  );
}
