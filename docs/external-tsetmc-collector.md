# External TSETMC Collector

GitHub Actions and Vercel cannot currently reach TSETMC from their network environments. The production architecture therefore uses an external collector running on a network that can reach TSETMC.

## Architecture

TSETMC -> external collector -> GitHub `market-data` branch -> Vercel -> Rubika

The collector refuses to publish a snapshot unless TSETMC is actually verified with at least 500 valid market rows.

## Environment

Required:
- `GITHUB_TOKEN`: fine-grained GitHub token with Contents read/write permission for this repository.
- `GITHUB_REPO`: defaults to `farzadmottaghi88/rubika-stock-bridge`.
- `GITHUB_BRANCH`: defaults to `market-data`.
- `COLLECT_INTERVAL_MS`: defaults to 60000.

Never commit the token to the repository.

## Run

From the repository root:

```bash
export GITHUB_TOKEN='...'
export GITHUB_REPO='farzadmottaghi88/rubika-stock-bridge'
export GITHUB_BRANCH='market-data'
export COLLECT_INTERVAL_MS=60000
node scripts/tsetmc-external-collector.mjs
```

The process continuously verifies TSETMC and publishes only valid snapshots.

## Linux systemd

Copy `scripts/tsetmc-external-collector.service.example` to a systemd unit, replace the token securely, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rubika-stock-bridge-tsetmc.service
sudo systemctl status rubika-stock-bridge-tsetmc.service
```

## Success criterion

After the first successful cycle, this URL must return a fresh JSON snapshot:

https://raw.githubusercontent.com/farzadmottaghi88/rubika-stock-bridge/market-data/live-market.json

Only then should the Rubika bot be tested for live analysis/signals.
