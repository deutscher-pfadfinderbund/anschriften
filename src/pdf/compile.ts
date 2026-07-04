/**
 * Compile a `ProfileData` tree into a PDF via the Typst CLI (issue #5).
 *
 * A throwaway temp dir gets the template, the bundled letterhead asset and the generated
 * `data.json` side by side, then `typst compile` runs against it. The Typst binary is taken
 * from `PATH` (local: Homebrew; container: installed in the image) — never hard-coded. The
 * temp dir is always removed afterwards.
 *
 * Deployment note (M6): the template/assets/fonts under `src/pdf` must be present next to the
 * running server; they are resolved relative to `process.cwd()`, or from `PDF_ASSETS_DIR` when
 * that env var is set (the container points it at `/app/src/pdf`).
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ProfileData } from "./build-data";

const execFileAsync = promisify(execFile);

const PDF_DIR = process.env.PDF_ASSETS_DIR ?? path.join(process.cwd(), "src", "pdf");
const TEMPLATE = path.join(PDF_DIR, "templates", "main.typ");
const ASSETS_DIR = path.join(PDF_DIR, "assets");
const FONT_DIR = path.join(PDF_DIR, "fonts");

export async function compilePdf(data: ProfileData): Promise<Buffer> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "anschriften-pdf-"));
  try {
    // The template reads "data.json" and "assets/…" relative to its own location, so
    // everything must live together inside the compile root.
    await fs.copyFile(TEMPLATE, path.join(tmp, "main.typ"));
    await fs.cp(ASSETS_DIR, path.join(tmp, "assets"), { recursive: true });
    await fs.writeFile(path.join(tmp, "data.json"), JSON.stringify(data), "utf8");

    await execFileAsync(
      "typst",
      ["compile", "--root", tmp, "--font-path", FONT_DIR, "main.typ", "out.pdf"],
      { cwd: tmp, maxBuffer: 128 * 1024 * 1024 },
    );

    return await fs.readFile(path.join(tmp, "out.pdf"));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
