# Anschriftenverzeichnis (anschriften2)

Bundesanschriftenverzeichnis des Deutschen Pfadfinderbundes als Webanwendung. Ersetzt die bisherige MS-Access-Datenbank.

- **Stack:** Next.js 16, Postgres 17 + Drizzle, better-auth (Keycloak-SSO), Typst (PDF-Export)
- **Roadmap & Architektur:** Issue [#7](https://github.com/deutscher-pfadfinderbund/anschriften2/issues/7)
- **Konventionen für Entwicklung & Agenten:** [AGENTS.md](AGENTS.md)

## Entwicklung

```bash
docker compose -f compose.dev.yml up -d   # lokale Postgres (Port 5544)
cp .env.example .env.local                # Werte eintragen
npm install
npx drizzle-kit migrate                   # Schema anwenden
npm run dev
```

## Deployment

Ein Container (`Dockerfile`, Next standalone + Migrationen beim Start). Postgres läuft separat; `DATABASE_URL` in `.env` setzen. `compose.yml` enthält das Traefik-Setup — Domain in den Labels anpassen.

```bash
docker compose up -d --build
```
