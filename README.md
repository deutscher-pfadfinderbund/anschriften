# Anschriftenverzeichnis (anschriften2)

Bundesanschriftenverzeichnis des Deutschen Pfadfinderbundes als Webanwendung. Ersetzt die bisherige MS-Access-Datenbank.

- **Stack:** Next.js 16, Postgres 17 + Drizzle, better-auth (Keycloak-SSO), Typst (PDF-Export)
- **Roadmap & Architektur:** Issue [#7](https://github.com/deutscher-pfadfinderbund/anschriften2/issues/7)
- **Konventionen für Entwicklung & Agenten:** [AGENTS.md](AGENTS.md)

## Entwicklung

```bash
docker compose -f compose.dev.yml up -d   # lokale Postgres (Port 5544)
cp .env.example .env.local                # Werte eintragen
bun install
bunx drizzle-kit migrate                  # Schema anwenden
bun run dev
```

## Mail-Modul (optional)

Die Kanzlei kann Rundmails an einen Verteiler oder eine Tabellen-Auswahl direkt
aus der App verschicken (Betreff + Text, Empfänger im BCC). Das Modul ist
**optional** und **provider-agnostisch**: Versand läuft über SMTP (nodemailer),
kein Provider-SDK. Ein späterer Wechsel (eigener Mailserver, Mailjet, SES,
Postmark, Brevo …) ist nur eine `.env`-Änderung.

- **Aktivieren:** `SMTP_HOST` **und** `MAIL_FROM` setzen (siehe `.env.example`).
  Solange eine der beiden fehlt, sind die Mail-Buttons ausgeblendet und die
  Server Action lehnt ab — kein Feature-Flag-Framework.
- **Versandmodell:** eine Mail pro Chunk, Empfänger im BCC
  (`MAIL_BCC_CHUNK_SIZE`, Default 50), `To:` = `MAIL_FROM`. Plaintext, keine
  Anhänge. Jede Sendung wird in `mail_log` protokolliert (Betreff, Datum,
  Empfängerzahl, Status) und im Verteiler unter „Zuletzt versendet" angezeigt.
- **Lokal testen (ohne echten Provider):** [Mailpit](https://mailpit.axllent.org/)
  aus `compose.dev.yml` starten und die Dev-Env auf den SMTP-Sink zeigen lassen:

  ```bash
  docker compose -f compose.dev.yml up -d mailpit
  # .env.local:
  #   SMTP_HOST=localhost
  #   SMTP_PORT=1025
  #   MAIL_FROM="Kanzlei <kanzlei@example.org>"
  ```

  Gesendete Mails landen im Mailpit-Postfach unter http://localhost:8025
  (JSON-API: `GET http://localhost:8025/api/v1/messages`). Für Tests nur
  fiktive Adressen (`@example.org`) verwenden.

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
- Die Domain ist `anschriften.deutscher-pfadfinderbund.de` (Router-Rule in
  `compose.yml`); der DNS-Eintrag muss auf den Server zeigen.

### Prod-Keycloak-Client (Vorlage: `dev/keycloak/dpb-dev-realm.json`)

- Client `anschriften` (confidential) im Prod-Realm anlegen.
- Redirect-URI: `https://anschriften.deutscher-pfadfinderbund.de/api/auth/oauth2/callback/keycloak`
- Post-Logout-Redirect-URI: `https://anschriften.deutscher-pfadfinderbund.de/login`
- Web Origin: `https://anschriften.deutscher-pfadfinderbund.de`
- Client-Rolle `anschriften` anlegen und den berechtigten Personen zuweisen.
- Protocol-Mapper „client roles" mit **Add to ID token: on** (ohne den schlägt
  jeder Login fehl — das Rollen-Gate liest `resource_access.<client>.roles`
  aus dem ID-Token).

Ohne Traefik lokal testen: in `compose.yml` die `networks`/`labels` auskommentieren
und `ports: ["3000:3000"]` freigeben.

### Backups

Die App macht keine Backups — das gehört an den separaten Postgres. Empfehlung:
[`prodrigestivill/postgres-backup-local`](https://github.com/prodrigestivill/docker-postgres-backup-local)
neben der Datenbank betreiben (täglicher `pg_dump`, Retention z. B. 14 täglich /
8 wöchentlich, Backup-Volume auf ein Host-Verzeichnis). Restore mit `pg_restore`
bzw. `psql` gegen denselben Server. Ein Restore sollte vor dem Cutover einmal
geprobt werden.
