"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/coach/matches", label: "경기" },
  { href: "/coach/players", label: "선수" },
];

export function CoachNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 ${active ? "bg-pitch-soft font-semibold text-pitch" : "text-muted"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
