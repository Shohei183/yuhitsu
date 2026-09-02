import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// キャッシュは当面 Cloudflare のデフォルト（無指定）。
// ISR/大量アクセスが必要になったら incrementalCache に R2 を割り当てる。
export default defineCloudflareConfig();
