import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pitch-note",
  description: "풋살팀 감독을 위한 경기 기록. 많이 모으고, 지금 필요한 것만 본다.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "pitch-note",
    statusBarStyle: "default",
  },
  // 옛 iOS(16.3 이하)는 manifest 대신 이 태그로 전체 화면 앱을 연다.
  other: { "apple-mobile-web-app-capable": "yes" },
};

// 크롬의 설치 이벤트는 화면이 뜨기 전에 올 수 있어서 가장 먼저 붙잡아 둔다. 서비스 워커도 여기서 등록.
const installScript = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__pnInstall=e;window.dispatchEvent(new Event("pn-installable"))});
if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f5132",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: installScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
