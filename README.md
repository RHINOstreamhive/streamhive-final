# StreamHive — Final Product Monorepo

This is a **final‑product** skeleton (not MVP). It includes all locked pillars and stubs for post‑MVP features.

## Quick Start
1) Docker Desktop, Node 20+, FFmpeg, Stripe CLI.
2) `docker compose up -d`
3) Install deps (Windows install each workspace individually):
```bash
npm i
```
4) Copy `.env.example` → `.env` in each service and fill values.
5) Run DB SQL: `services/core-ledger/sql/001_init.sql` in DB `streamhive`.
6) Start core:
```bash
npm run start-core
```
