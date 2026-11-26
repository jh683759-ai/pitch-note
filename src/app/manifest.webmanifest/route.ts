import { type NextRequest } from "next/server";

// 홈 화면 앱(PWA) 설정. 선수 공유 화면에서 설치하면 그 공유 링크로 바로 열리게 start 를 받는다.
// 아이폰 홈 화면 앱은 사파리와 저장소가 따로라서, 공유 링크를 기억시키는 방법이 이것뿐이다.
const SHARE_PATH = /^\/s\/[A-Za-z0-9_-]{6,128}$/;

export function GET(request: NextRequest) {
  const start = request.nextUrl.searchParams.get("start");
  const startUrl = start && SHARE_PATH.test(start) ? start : "/launch";

  const manifest = {
    id: "/",
    name: "pitch-note",
    short_name: "pitch-note",
    description: "풋살팀 감독을 위한 경기 기록. 많이 모으고, 지금 필요한 것만 본다.",
    lang: "ko",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f5",
    theme_color: "#0f5132",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
