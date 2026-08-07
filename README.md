# Anschriftenverzeichnis (anschriften)

Bundesanschriftenverzeichnis des Deutschen Pfadfinderbundes als Webanwendung. Ersetzt die bisherige MS-Access-Datenbank.

- **Stack:** Next.js 16, Postgres 17 + Drizzle, better-auth (Keycloak-SSO), Typst (PDF-Export)
- **Roadmap & Architektur:** Issue [#7](https://github.com/deutscher-pfadfinderbund/anschriften/issues/7)
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

`compose.yml` beschreibt den kompletten Produktions-Stack: den App-Container
(`Dockerfile`, multi-stage: Next im `standalone`-Modus, die gepinnte Typst-CLI mit
eingebackenen Fonts + Briefkopf, `scripts/migrate.mjs` als Entrypoint), einen
**Postgres 17 im selben Compose** (Service `db`, kein Host-Port, benanntes Volume
`db-data`) und einen **Backup-Service** (täglicher `pg_dump` nach `./backups`). Beim
Start des App-Containers werden erst die eingecheckten Migrationen aus `drizzle/`
angewendet (per Advisory-Lock serialisiert; fehlt die Migrations-Historie, bricht der
Start bewusst ab), dann startet der Server.

`DATABASE_URL` in `.env` zeigt containerintern auf `db:5432` — Benutzer/Passwort/DB-Name
müssen mit dem `POSTGRES_*`-Block übereinstimmen (siehe `.env.example`).

```bash
cp .env.example .env             # Prod-Werte eintragen (POSTGRES_*, DATABASE_URL, Keycloak …)
docker compose pull              # das von der CI gebaute GHCR-Image holen
docker compose up -d
```

Das App-Image wird von der CI nach GHCR gepusht (`ghcr.io/deutscher-pfadfinderbund/anschriften`).
Im Normalfall daher `docker compose pull` (kein lokaler Build). Ein lokaler Build
(`docker compose up -d --build`) ist nur für Tests ohne CI-Image oder zum Reproduzieren
eines Build-Problems nötig. Deploy, Rollback (Pinnen eines Versions-Tags), Restore und
den Cutover-Ablauf beschreibt der Runbook **[docs/deployment.md](docs/deployment.md)**.

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

Der `backup`-Service in `compose.yml`
([`prodrigestivill/postgres-backup-local`](https://github.com/prodrigestivill/docker-postgres-backup-local))
läuft mit und schreibt täglich einen `pg_dump` nach `./backups` auf dem Host
(Retention: 14 tägliche / 8 wöchentliche Dumps, konfigurierbar über `BACKUP_*` in
`.env`). Restore- und Cutover-Prozedur (inkl. Backup-Probe vor dem Go-live) stehen im
Runbook **[docs/deployment.md](docs/deployment.md)**.
