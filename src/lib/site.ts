import { headers } from "next/headers";

/**
 * 공유 링크에 쓸 사이트 주소. 배포하면 NEXT_PUBLIC_SITE_URL 을 넣고,
 * 없으면 지금 요청의 주소를 쓴다 (로컬 개발).
 */
export async function siteUrl() {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function sharePath(token: string, sub?: { match?: string; player?: string }) {
  if (sub?.match) return `/s/${token}/m/${sub.match}`;
  if (sub?.player) return `/s/${token}/p/${sub.player}`;
  return `/s/${token}`;
}
