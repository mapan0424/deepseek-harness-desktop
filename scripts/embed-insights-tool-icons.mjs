import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve("packages/harness-insights");
const iconRoot = join(root, "assets", "tool-icons");
const clientPath = join(root, "lib", "client.js");
const start = "/* TOOL_ICONS_START */";
const end = "/* TOOL_ICONS_END */";

export async function embedInsightsToolIcons() {
  const lightNames = (await readdir(join(iconRoot, "light"))).filter(name => name.endsWith(".svg")).sort();
  const darkNames = (await readdir(join(iconRoot, "dark"))).filter(name => name.endsWith(".svg")).sort();
  if (lightNames.length !== 26 || JSON.stringify(lightNames) !== JSON.stringify(darkNames)) {
    throw new Error(`Harness Insights requires 26 matching light/dark tool icons; got light=${lightNames.length}, dark=${darkNames.length}`);
  }

  const icons = {};
  for (const filename of lightNames) {
    const slug = filename.slice(0, -4);
    icons[slug] = {
      light: await dataUri(join(iconRoot, "light", filename)),
      dark: await dataUri(join(iconRoot, "dark", filename)),
    };
  }

  const client = await readFile(clientPath, "utf8");
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, "g");
  const matches = client.match(pattern) ?? [];
  if (matches.length !== 1) throw new Error(`Expected exactly one tool-icon marker in ${clientPath}, got ${matches.length}`);
  const generated = `${start}${JSON.stringify(icons)}${end}`;
  await writeFile(clientPath, client.replace(pattern, generated));
  console.log(`Embedded ${lightNames.length} light/dark Harness tool icon pairs into ${clientPath}.`);
}

async function dataUri(path) {
  const svg = (await readFile(path, "utf8"))
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await embedInsightsToolIcons();
}
