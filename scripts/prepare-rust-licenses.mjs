import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(projectRoot, "src-tauri", "Cargo.toml");
const outputPath = join(projectRoot, "src-tauri", "legal", "RUST_THIRD_PARTY_LICENSES.txt");

const metadata = JSON.parse(execFileSync("cargo", [
  "metadata",
  "--locked",
  "--format-version",
  "1",
  "--manifest-path",
  manifestPath,
], { encoding: "utf8", cwd: projectRoot, maxBuffer: 64 * 1024 * 1024 }));

const rootPackage = metadata.packages.find((pkg) => pkg.manifest_path === manifestPath);
const packages = metadata.packages
  .filter((pkg) => pkg.id !== rootPackage?.id)
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const sections = [
  "RUST / TAURI THIRD-PARTY LICENSES",
  "=================================",
  "",
  "Generated from Cargo.lock and the exact Cargo dependency graph used by this build.",
  "Each component remains subject to its own terms. Repository values below are",
  "provided by crate metadata and are not endorsements.",
  "",
  `Generated package count: ${packages.length}`,
  "",
];

for (const pkg of packages) {
  const crateRoot = dirname(pkg.manifest_path);
  const files = existsSync(crateRoot)
    ? (await readdir(crateRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
    : [];

  sections.push("-".repeat(80));
  sections.push(`${pkg.name} ${pkg.version}`);
  sections.push(`Declared license: ${pkg.license ?? "NOT DECLARED"}`);
  if (pkg.repository) sections.push(`Repository: ${pkg.repository}`);
  if (files.length === 0) {
    sections.push("License file: none supplied in the installed crate; see declared SPDX expression above.");
  } else {
    for (const file of files) {
      sections.push("");
      sections.push(`--- ${file} ---`);
      sections.push((await readFile(join(crateRoot, file), "utf8")).trim());
    }
  }
  sections.push("");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, sections.join("\n") + "\n");
console.log(`Generated Rust license report for ${packages.length} packages: ${outputPath}`);
