// pitch-note 서비스 워커: 홈 화면 앱 설치 조건을 채우고, 오프라인일 때 안내만 보여준다.
// 기록은 늘 최신이어야 해서 페이지를 캐시하지 않는다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const OFFLINE_HTML = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>pitch-note</title><body style="font-family:system-ui,sans-serif;display:flex;min-height:100dvh;align-items:center;justify-content:center;margin:0;background:#f6f7f5;color:#1b1f1d;text-align:center;padding:24px">
<div><p style="font-weight:700;color:#0f5132">pitch-note</p><p>인터넷에 연결되지 않았어요.<br>연결되면 다시 열어 주세요.</p>
<button onclick="location.reload()" style="margin-top:12px;min-height:48px;padding:0 20px;border:0;border-radius:12px;background:#0f5132;color:#fff;font-weight:600">다시 시도</button></div></body></html>`;

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
