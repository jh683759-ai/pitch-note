import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // 서비스 워커는 바뀌면 바로 반영되게 캐시하지 않는다.
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
  },
};

export default nextConfig;
