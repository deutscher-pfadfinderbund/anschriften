# Runbook: Deployment, Backup, Restore, Cutover

Praktischer Leitfaden für den Betrieb des Anschriftenverzeichnisses (Issue #6). Alle
Befehle laufen im Verzeichnis, in dem `compose.yml` und `.env` liegen. Der Stack besteht
aus drei Services: `app` (Next-Standalone hinter Traefik), `db` (Postgres 17, kein
Host-Port, Volume `db-data`) und `backup` (täglicher `pg_dump` nach `./backups`).

## 1. Erstinstallation / Deployment

```bash
cp .env.example .env          # echte Werte eintragen (POSTGRES_*, DATABASE_URL, Keycloak …)
docker compose pull           # von der CI gebautes GHCR-Image holen
docker compose up -d
docker compose ps             # app + db "healthy", backup "running"
docker compose logs -f app    # Start: "migrations applied", dann Next-Server
```

`DATABASE_URL` muss auf `db:5432` zeigen und in Benutzer/Passwort/DB mit dem
`POSTGRES_*`-Block übereinstimmen. Sonderzeichen im Passwort in der URL prozentkodieren.

**Update auf eine neue Version:**

```bash
docker compose pull && docker compose up -d
```

Migrationen werden beim App-Start automatisch angewendet (per Advisory-Lock
serialisiert, damit parallele Starts nicht kollidieren).

## 2. Rollback

Die CI taggt jedes Release als Versions-Image (`v1.2.3` → Tags `1.2.3` und `1.2`,
zusätzlich `latest` und `sha-…`). Für ein Rollback in `compose.yml` bzw. per Override
das gewünschte Tag pinnen:

```bash
# compose.yml: image: ghcr.io/deutscher-pfadfinderbund/anschriften:1.2.3
docker compose pull app && docker compose up -d app
```

Versions-Tags sind von der GHCR-Aufräumroutine geschützt und bleiben dauerhaft
verfügbar. Achtung: Ein Rollback des Images macht keine Schema-Migration rückgängig —
bei inkompatiblen Migrationen zusätzlich das Backup einspielen (Abschnitt 4).

## 3. Backups

Der `backup`-Service schreibt täglich nach `./backups` auf dem Host:

```
backups/
  last/     # jeweils neuester Dump (…-latest.sql.gz)
  daily/    # 14 Tage
  weekly/   # 8 Wochen
```

**Backup ansehen / prüfen:**

```bash
ls -lh backups/last
gunzip -c backups/last/anschriften-latest.sql.gz | head -40   # Kopf des Dumps
```

**Backup sofort auslösen (ohne auf den Zeitplan zu warten):**

```bash
docker compose exec backup /backup.sh
```

## 4. Restore

Ein Restore läuft gegen den `db`-Service im Compose — **kein Host-Port nötig**. Vorher
die App stoppen, damit keine Schreibzugriffe laufen.

```bash
# 1) App stoppen (db + backup laufen weiter)
docker compose stop app

# 2) Dump auswählen
ls -lh backups/daily

# 3) Schema leeren und Dump einspielen (-T = kein TTY, Pipe funktioniert)
docker compose exec -T db psql -U anschriften -d anschriften \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c backups/daily/anschriften-2026-08-05.sql.gz \
  | docker compose exec -T db psql -U anschriften -d anschriften

# 4) App wieder starten (wendet ggf. fehlende Migrationen an)
docker compose up -d app
```

`anschriften` / DB-Name ggf. an `POSTGRES_*` anpassen.

## 5. Import der Alt-Datenbank (finaler .mdb-Import gegen die Prod-DB)

Das Laufzeit-Image enthält **weder bun noch mdbtools noch `import-mdb.ts`** — der Import
läuft daher aus einem Einmal-Container, der sich ins interne Compose-Netz hängt und die
DB unter `db:5432` erreicht (der Host-Port bleibt zu). Das Repo wird eingehängt, die
`.mdb` liegt lokal daneben.

```bash
# Name des internen Netzes ermitteln (i. d. R. <projekt>_internal)
docker network ls | grep internal        # z. B. anschriften_internal

# a) Trockenlauf: parst, validiert, druckt Statistik — schreibt NICHTS
docker run --rm -it \
  --network anschriften_internal \
  -v "$PWD:/repo" -w /repo \
  -e DATABASE_URL="postgres://anschriften:<pass>@db:5432/anschriften" \
  oven/bun:1.2 \
  bash -c "apt-get update && apt-get install -y --no-install-recommends mdbtools \
           && bun install --frozen-lockfile \
           && bun scripts/import-mdb.ts adressen.mdb --dry-run"

# b) Echter Import (denselben Befehl ohne --dry-run)
#    …&& bun scripts/import-mdb.ts adressen.mdb
```

**Schutz vor Datenverlust:** Ein erneuter Import löscht die Zuordnungen (Amtszeiten)
der betroffenen Personen und legt sie neu an — die `.mdb` kennt nur Person/Gruppe/Amt,
nicht die von Hand gepflegten Amtszeiten (`start_date`/`end_date`/„Ende unbekannt",
Issues #22/#26). Sind solche Daten schon vorhanden, **bricht der Import ab**. Nur wenn
das Überschreiben gewollt ist, mit `--overwrite-assignments` erneut aufrufen. Der
`--dry-run` schreibt ohnehin nie.

> Alternative ohne Docker-Netz: auf dem Arbeitsplatz `bun scripts/import-mdb.ts … --dry-run`
> gegen eine lokale Kopie prüfen, dann den echten Import über einen temporär via SSH
> getunnelten Port fahren. Der Einmal-Container oben ist der empfohlene Weg.

## 6. Cutover-Checkliste (Go-live, Issue #6)

- [ ] **Prod-Keycloak-Client** angelegt (Redirect-/Logout-URIs, Client-Rolle
      `anschriften`, Protocol-Mapper „client roles" → *Add to ID token: on*; Details im
      README).
- [ ] **Finaler .mdb-Import** gegen die Prod-DB (Abschnitt 5): erst `--dry-run`,
      Statistik prüfen, dann echter Lauf.
- [ ] **Login-Test über die Prod-URL** `https://anschriften.deutscher-pfadfinderbund.de`
      (TLS gültig, Rollen-Gate lässt berechtigte Person rein, sperrt andere aus).
- [ ] **Restore-Probe**: einen Backup-Dump in eine Wegwerf-DB einspielen (Abschnitt 4
      sinngemäß gegen eine leere Test-DB) — bestätigt, dass Backups brauchbar sind.
- [ ] **Access-DB read-only archivieren**: die alte `.mdb` an einen sicheren Ort legen
      und schreibgeschützt setzen (keine Doppelpflege, aber Nachschlage-Referenz).

## 7. Betriebs-Randbedingungen

**ICU/Sortierung — das Laufzeit-Image muss volle ICU behalten.** Das Base-Image ist
`node:24-bookworm-slim` (glibc + ICU), **nicht** Alpine. Die deutsche Sortierung
(Umlaute, „ß") läuft in TypeScript über `Intl`/`localeCompare` und braucht die
ICU-Daten. Ein Wechsel auf ein Alpine-/musl-Image ohne vollständige ICU würde die
Sortierung stillschweigend verschlechtern (ASCII-artige Ordnung, Umlaute falsch
einsortiert). Beim Aktualisieren des Base-Image also bei einer ICU-vollständigen
Variante bleiben.

Der Postgres läuft auf `postgres:17-alpine` mit C-Collation; das ist bewusst so, weil
die fachliche Sortierung in TS passiert und nicht von der DB-Collation abhängt. Wer die
DB-seitige Sortierung dennoch deutsch haben möchte, kann bei **frischem** Volume die
initdb-Locale über `POSTGRES_INITDB_ARGS` setzen — das wirkt nur bei der Erstanlage und
ändert an der TS-Sortierung nichts.
