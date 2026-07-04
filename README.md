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

Ein Container (`Dockerfile`, multi-stage): Next im `standalone`-Modus, die gepinnte
Typst-CLI (Fonts + Briefkopf für den PDF-Export eingebacken) und `scripts/migrate.mjs`
als Entrypoint. Beim Start werden erst die eingecheckten Migrationen aus `drizzle/`
angewendet (solange noch keine existieren: Warnung + Skip), dann startet der Server.

**Postgres läuft separat** (selbst verwaltet, nicht in `compose.yml`). `DATABASE_URL`
in `.env` muss darauf zeigen. `compose.yml` enthält nur den App-Service samt
Traefik-Labels.

```bash
cp .env.example .env        # Prod-Werte eintragen (DATABASE_URL, BETTER_AUTH_URL, Keycloak …)
docker compose up -d --build
```

### Voraussetzungen (Server)

- Ein laufender **Traefik** mit einem `websecure`-Entrypoint und einem
  `certresolver` (in `compose.yml`: `letsencrypt`) für automatisches TLS.
- Ein **externes Docker-Netz**, an dem Traefik hängt (in `compose.yml`: `traefik`).
  Anlegen bzw. Namen an das Server-Setup anpassen: `docker network create traefik`.
- Die Router-`Host(...)`-Rule in `compose.yml` auf die finale Domain setzen.

Ohne Traefik lokal testen: in `compose.yml` die `networks`/`labels` auskommentieren
und `ports: ["3000:3000"]` freigeben.

### Backups

Die App macht keine Backups — das gehört an den separaten Postgres. Empfehlung:
[`prodrigestivill/postgres-backup-local`](https://github.com/prodrigestivill/docker-postgres-backup-local)
neben der Datenbank betreiben (täglicher `pg_dump`, Retention z. B. 14 täglich /
8 wöchentlich, Backup-Volume auf ein Host-Verzeichnis). Restore mit `pg_restore`
bzw. `psql` gegen denselben Server. Ein Restore sollte vor dem Cutover einmal
geprobt werden.
