import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";

// 선수용 공유 화면: 검색엔진에 안 잡히게, 링크 가진 사람만.
// metadataBase: 카톡 미리보기 이미지 주소가 절대 주소여야 해서.
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(await siteUrl()),
    robots: { index: false, follow: false },
  };
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-xl px-4 pt-4 pb-16">{children}</div>
    </div>
  );
}
