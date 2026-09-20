import fs from "node:fs/promises";
import { collectLiveMarket } from "../lib/tsetmc-source.js";

const repo = process.env.GITHUB_REPO || "farzadmottaghi88/rubika-stock-bridge";
const branch = process.env.GITHUB_BRANCH || "market-data";
const intervalMs = Math.max(30_000, Number(process.env.COLLECT_INTERVAL_MS || 60_000));
const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("Missing GITHUB_TOKEN");
}

const apiBase = "https://api.github.com";
const filePath = "data/live-market.json";

function headers() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "rubika-stock-bridge-tsetmc-collector"
  };
}

async function githubJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function ensureBranch() {
  const refUrl = `${apiBase}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const response = await fetch(refUrl, { headers: headers() });
  if (response.ok) return;
  if (response.status !== 404) {
    const raw = await response.text();
    throw new Error(`Branch check failed ${response.status}: ${raw}`);
  }

  const mainRef = await githubJson(`${apiBase}/repos/${repo}/git/ref/heads/main`);
  await githubJson(`${apiBase}/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: mainRef.object.sha
    })
  });
  console.log(`Created branch ${branch}`);
}

async function pushSnapshot(snapshot) {
  await ensureBranch();

  const content = JSON.stringify(snapshot, null, 2) + "\n";
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const url = `${apiBase}/repos/${repo}/contents/${filePath}`;

  let sha = null;
  const existing = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers: headers() });
  if (existing.ok) {
    const data = await existing.json();
    sha = data.sha;
  } else if (existing.status !== 404) {
    const raw = await existing.text();
    throw new Error(`Snapshot lookup failed ${existing.status}: ${raw}`);
  }

  const payload = {
    message: `Update live TSETMC snapshot ${snapshot.generatedAt}`,
    content: encoded,
    branch
  };
  if (sha) payload.sha = sha;

  await githubJson(url, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  console.log(`Snapshot pushed: ${snapshot.symbolCount} symbols | ${snapshot.generatedAt}`);
}

async function collectOnce() {
  const live = await collectLiveMarket();

  console.log(JSON.stringify({
    status: live.status,
    verified: live.verified,
    source: live.source,
    symbolCount: live.symbolCount,
    diagnostics: live.diagnostics
  }));

  if (!live.verified || live.symbolCount < 500 || !Array.isArray(live.rows) || live.rows.length < 500) {
    console.error("TSETMC snapshot rejected: live data was not verified.");
    return false;
  }

  const snapshot = {
    ...live,
    generatedAt: new Date().toISOString(),
    snapshotVersion: 1,
    collector: "external-vps"
  };

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  await pushSnapshot(snapshot);
  return true;
}

async function main() {
  console.log(`TSETMC external collector started: interval=${intervalMs}ms repo=${repo} branch=${branch}`);
  while (true) {
    try {
      await collectOnce();
    } catch (error) {
      console.error("Collector error:", error instanceof Error ? error.stack || error.message : error);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
