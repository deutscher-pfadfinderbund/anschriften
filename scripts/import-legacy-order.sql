-- Legacy print order for the PDF directory — the last step of every Access import
-- (scripts/import-mdb.ts), so a fresh database gets it as well as a re-imported one. Access
-- itself knows no such order beyond the Hilfsgruppe numbers. Every UPDATE only touches the
-- value the import wrote, so an order already changed in the Gliederungen/Stammdaten is left
-- alone. Statements end with ";" at the end of a line (the import splits on that).

-- The Gaue led by a Gauvögtin belong to the Mädchenbund (the import filed every Gau under the
-- Jungenbund), together with everything beneath them.
WITH RECURSIVE "tree" AS (
  SELECT "id" FROM "groups" WHERE "name" IN ('Gau Sueben', 'Gau Wolkenburg') AND "parent_id" IS NULL AND "section" = 'jungenbund'
  UNION ALL
  SELECT "g"."id" FROM "groups" "g" JOIN "tree" "t" ON "g"."parent_id" = "t"."id"
)
UPDATE "groups" SET "section" = 'maedchenbund' WHERE "id" IN (SELECT "id" FROM "tree") AND "section" = 'jungenbund';

-- Gliederungen: Mädchenbund with its Gaue, Mädelschaften and Hage, then the Jungenbund with its
-- Gaue, Ringe A–Z, Jungenschaften and Stämme, then Bundesgilde, Orden St. Christophorus,
-- Orden St. Georg.
UPDATE "groups" SET "sort_key" = 30 WHERE "name" = 'Mädchenbund' AND "parent_id" IS NULL AND "sort_key" = 40;
UPDATE "groups" SET "sort_key" = 40 WHERE "name" = 'Jungenbund' AND "parent_id" IS NULL AND "sort_key" = 30;
UPDATE "groups" SET "sort_key" = 175 WHERE "name" IN ('Ring Goldener Löwe', 'RIng Goldener Löwe') AND "parent_id" IS NULL AND "sort_key" = 120;
UPDATE "groups" SET "sort_key" = 180 WHERE "name" = 'Ring Namata' AND "parent_id" IS NULL AND "sort_key" = 190;
UPDATE "groups" SET "sort_key" = 190 WHERE "name" = 'Ring Rote Erde' AND "parent_id" IS NULL AND "sort_key" = 180;
UPDATE "groups" SET "sort_key" = 32 WHERE "name" = 'Gau Sueben' AND "parent_id" IS NULL AND "sort_key" = 140;
UPDATE "groups" SET "sort_key" = 34 WHERE "name" = 'Gau Wolkenburg' AND "parent_id" IS NULL AND "sort_key" = 160;
UPDATE "groups" SET "sort_key" = 36 WHERE "name" = 'Bundesunmittelbare Mädelschaften' AND "parent_id" IS NULL AND "sort_key" = 220;
UPDATE "groups" SET "sort_key" = 38 WHERE "name" = 'Bundesunmittelbare Hage' AND "parent_id" IS NULL AND "sort_key" = 240;
UPDATE "groups" SET "sort_key" = 235 WHERE "name" = 'Bundesunmittelbare Stämme' AND "parent_id" IS NULL AND "sort_key" = 230;
UPDATE "groups" SET "sort_key" = 500 WHERE "name" = 'Bundesgilde' AND "parent_id" IS NULL AND "sort_key" = 520;
UPDATE "groups" SET "sort_key" = 520 WHERE "name" = 'Orden St. Georg' AND "parent_id" IS NULL AND "sort_key" = 500;

-- Ämter (Reihenfolge within a group): Bundesführung reads Vogt, Kanzler, Kämmerer, then
-- Bundesjungenvogt, Bundesmädchenvögtin and the two Orden heads; the Ordensleitung reads
-- Komtur, Herold, Kanzler, Kämmerer, Novizenmeister, Archivar, Richter; Konventmeister and
-- Kollegiumssprecher open their group.
UPDATE "offices" SET "rank" = 32 WHERE "name" = 'Bundesjungenvogt' AND "rank" = 10;
UPDATE "offices" SET "rank" = 34 WHERE "name" = 'Bundesmädchenvögtin' AND "rank" = 10;
UPDATE "offices" SET "rank" = 36 WHERE "name" = 'Hochmeister des Ordens St. Georg' AND "rank" = 999;
UPDATE "offices" SET "rank" = 38 WHERE "name" = 'Ordensmeisterin des Ordens St. Christophorus' AND "rank" = 999;
UPDATE "offices" SET "rank" = 12 WHERE "name" = 'Ordenskomtur' AND "rank" = 999;
UPDATE "offices" SET "rank" = 14 WHERE "name" IN ('Ordensherold', 'Ordensheroldin') AND "rank" = 999;
UPDATE "offices" SET "rank" = 40 WHERE "name" IN ('Novizenmeister', 'Novizenmeisterin') AND "rank" = 999;
UPDATE "offices" SET "rank" = 42 WHERE "name" IN ('Ordensarchivar', 'Ordensarchivarin') AND "rank" = 999;
UPDATE "offices" SET "rank" = 44 WHERE "name" IN ('Ordensrichter', 'Ordensrichterin') AND "rank" = 999;
UPDATE "offices" SET "rank" = 10 WHERE "name" IN ('Konventmeister', 'Konventmeisterin', 'Kollegiumssprecher', 'Kollegiumssprecherin') AND "rank" = 999;
