import Link from "next/link";
import { logout } from "@/app/login/actions";

/** 오른쪽 위 동그라미 하나. 로그아웃처럼 가끔 쓰는 것은 여기 안으로 넣어 메뉴 자리를 비운다. */
export function AccountMenu({ initial, role, links = [] }: { initial: string; role: string; links?: { href: string; label: string }[] }) {
  return (
    <details className="group relative">
      <summary
        aria-label="내 계정 메뉴"
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full bg-pitch-soft text-sm font-bold text-pitch [&::-webkit-details-marker]:hidden"
      >
        {initial}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-card text-sm shadow-lg">
        <p className="px-4 py-2.5 text-xs text-muted">{role}</p>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="block border-t border-line px-4 py-3">
            {l.label}
          </Link>
        ))}
        <form action={logout} className="border-t border-line">
          <button className="block w-full px-4 py-3 text-left text-muted">로그아웃</button>
        </form>
      </div>
    </details>
  );
}
