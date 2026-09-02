import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// `next dev` 実行時に Cloudflare のバインディング（env など）を利用可能にする
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
