import { mkdir, writeFile } from "node:fs/promises";
import { collectLiveMarket } from "../lib/tsetmc-source.js";

const outputPath = process.env.TSETMC_SNAPSHOT_PATH || "data/live-market.json";

const live = await collectLiveMarket();
if (!live.verified || live.symbolCount < 500) {
  console.error(JSON.stringify({
    ok: false,
    status: live.status,
    source: live.source,
    symbolCount: live.symbolCount,
    diagnostics: live.diagnostics
  }, null, 2));
  process.exit(1);
}

const snapshot = {
  ...live,
  generatedAt: new Date().toISOString(),
  snapshotVersion: 1,
  collector: "github-actions"
};

await mkdir(outputPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(outputPath, JSON.stringify(snapshot));
console.log(JSON.stringify({
  ok: true,
  status: snapshot.status,
  source: snapshot.source,
  symbolCount: snapshot.symbolCount,
  generatedAt: snapshot.generatedAt,
  bytes: Buffer.byteLength(JSON.stringify(snapshot))
}, null, 2));
