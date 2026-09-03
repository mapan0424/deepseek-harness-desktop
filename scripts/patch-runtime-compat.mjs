import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const expectedFrontendVersions = ["0.1.2-alpha.5", "0.1.2-rc.1"];

// 0.1.2-alpha.x / 0.1.2-rc.x ships the GFM email autolink as a regex literal (not `new RegExp("...")`).
// macOS 12.7.6 WebKit rejects the lookbehind + Unicode property escapes, so drop the
// lookbehind and keep the same capture groups. test-runtime-compat.mjs still enforces
// the boundary rules in JS.
const bundleOld = "/(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu";
const bundleNew = "/([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu";

export async function patchRuntimeCompatibility(runtimeRoot) {
  const modules = join(runtimeRoot, "node_modules");
  const frontendRoot = join(modules, "@deepseek-ai", "dsh-web-frontend");

  await assertPackageVersion(frontendRoot, "@deepseek-ai/dsh-web-frontend", expectedFrontendVersions);

  const assetsRoot = join(frontendRoot, "dist", "assets");
  const assetNames = (await readdir(assetsRoot)).filter((name) => name.endsWith(".js")).sort();
  const matches = [];
  let compatibleCount = 0;
  for (const name of assetNames) {
    const path = join(assetsRoot, name);
    const content = await readFile(path, "utf8");
    const oldCount = count(content, bundleOld);
    const newCount = count(content, bundleNew);
    if (oldCount) matches.push({ path, oldCount });
    compatibleCount += newCount;
  }

  if (matches.length !== 1 || matches[0].oldCount !== 1 || compatibleCount !== 0) {
    throw new Error(
      `Runtime compatibility patch no longer matches the prebuilt frontend: expected one legacy email autolink and no patched copies, got ${JSON.stringify({ matches, compatibleCount })}. Review the upstream frontend before packaging.`,
    );
  }
  await patchExactFile(matches[0].path, bundleOld, bundleNew, "prebuilt GFM email autolink");
  await patchFrontendClassStaticBlocks(runtimeRoot);
  await patchFrontendWindowControls(runtimeRoot);
  await patchFrontendPromiseWithResolvers(runtimeRoot);
  await patchHostWebserverReadyMarkup(runtimeRoot);
  await patchLocalConnectionAuth(runtimeRoot);
  await verifyRuntimeCompatibility(runtimeRoot);
  console.log(`Patched macOS 12.7.6 GFM email autolink compatibility: ${matches[0].path}`);
}

const macosTitlebarSnippet = `    <style id="dsh-macos-titlebar-style">
      [class*="_root"][class*="Sidebar"], [class*="sidebar"], aside, .hHd-Xa_root {
        padding-top: 12px !important;
      }
    </style>
    <script id="dsh-macos-titlebar-script">
      if (typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")) {
        window.__dsh_titlebar_injected = true;
        var pendingDrag = null;
        function isTitlebarHit(e) {
          if (e.clientY > 52 || e.clientX < 78) return false;
          var el = e.target;
          if (!el || !el.closest) return true;
          return !el.closest("button, a, input, textarea, select, [role='button'], [role='tab'], [role='menuitem'], [contenteditable='true'], .hi-tab");
        }
        document.addEventListener("mousedown", function(e) {
          if (e.button !== 0 || !isTitlebarHit(e)) return;
          var sx = e.screenX, sy = e.screenY;
          function onMove(ev) {
            if (Math.abs(ev.screenX - sx) > 4 || Math.abs(ev.screenY - sy) > 4) {
              cleanup();
              fetch("http://127.0.0.1:27891/start-drag", { mode: "no-cors" }).catch(function(){});
            }
          }
          function cleanup() {
            pendingDrag = null;
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("mouseup", cleanup, true);
          }
          pendingDrag = cleanup;
          document.addEventListener("mousemove", onMove, true);
          document.addEventListener("mouseup", cleanup, true);
        }, true);
        document.addEventListener("dblclick", function(e) {
          if (!isTitlebarHit(e)) return;
          if (pendingDrag) pendingDrag();
          e.preventDefault();
          e.stopPropagation();
          fetch("http://127.0.0.1:27891/toggle-maximize", { mode: "no-cors" }).catch(function(){});
        }, true);
      }
    </script>
`;

export async function patchFrontendWindowControls(runtimeRoot) {
  const indexPath = join(runtimeRoot, "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist", "index.html");
  if (!existsSync(indexPath)) return;
  const html = await readFile(indexPath, "utf8");
  let patched = html;
  if (html.includes('id="dsh-macos-titlebar-script"')) {
    patched = html.replace(
      /\s*<style id="dsh-macos-titlebar-style">[\s\S]*?<script id="dsh-macos-titlebar-script">[\s\S]*?<\/script>\s*/,
      `\n${macosTitlebarSnippet}`,
    );
    if (patched === html) {
      console.warn("Existing macOS titlebar patch could not be replaced");
      return;
    }
  } else {
    patched = html.replace("</head>", `${macosTitlebarSnippet}  </head>`);
  }
  await writeFile(indexPath, patched, "utf8");
  console.log(`Patched macOS native titlebar drag & maximize controls: ${indexPath}`);
}

export async function patchFrontendClassStaticBlocks(runtimeRoot) {
  const assetsRoot = join(runtimeRoot, "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist", "assets");
  if (!existsSync(assetsRoot)) return;
  const assetNames = (await readdir(assetsRoot)).filter((name) => name.endsWith(".js"));

  const staticLoop = 'static{for(const i of["error","info","warn","debug"])X0.prototype[i]=function(...o){return this()[i](...o)}}';
  const staticCordis = 'static{ur.is[Symbol.toPrimitive]=()=>Symbol.for("cordis.is"),ur.prototype[ur.is]=!0}';

  for (const name of assetNames) {
    const path = join(assetsRoot, name);
    let content = await readFile(path, "utf8");
    let changed = false;

    if (content.includes(staticLoop)) {
      content = content.replace(staticLoop, "");
      const j0End = content.indexOf("};function rl(n){");
      if (j0End !== -1) {
        content = content.slice(0, j0End + 2) + 'for(const i of["error","info","warn","debug"])J0.prototype[i]=function(...o){return this()[i](...o)};' + content.slice(j0End + 2);
        changed = true;
      }
    }

    if (content.includes(staticCordis)) {
      content = content.replace(staticCordis, "");
      const urEnd = content.indexOf(";var $e=class extends ur{");
      if (urEnd !== -1) {
        content = content.slice(0, urEnd) + ';ur.is[Symbol.toPrimitive]=()=>Symbol.for("cordis.is");ur.prototype[ur.is]=!0' + content.slice(urEnd);
        changed = true;
      }
    }

    if (changed) {
      await writeFile(path, content, "utf8");
      console.log(`Patched macOS 12.7.6 WebKit class static blocks compatibility: ${path}`);
    }
  }
}

const promiseWithResolversPolyfill = `    <script>
      if (typeof Promise !== "undefined" && !Promise.withResolvers) {
        Promise.withResolvers = function() {
          var resolve, reject;
          var promise = new Promise(function(res, rej) {
            resolve = res;
            reject = rej;
          });
          return { promise: promise, resolve: resolve, reject: reject };
        };
      }
    </script>`;

export async function patchFrontendPromiseWithResolvers(runtimeRoot) {
  const indexPath = join(runtimeRoot, "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist", "index.html");
  if (!existsSync(indexPath)) return;
  const html = await readFile(indexPath, "utf8");
  if (html.includes("Promise.withResolvers")) return;

  const patched = html.replace(/<head(?:\s[^>]*)?>/i, (match) => `${match}\n${promiseWithResolversPolyfill}`);
  await writeFile(indexPath, patched, "utf8");
  console.log(`Patched macOS 12.7.6 Promise.withResolvers polyfill in index.html: ${indexPath}`);
}

export async function patchHostWebserverReadyMarkup(runtimeRoot) {
  const serverPath = join(runtimeRoot, "node_modules", "@deepseek-ai", "dsh-host-webserver", "lib", "index.js");
  if (!existsSync(serverPath)) return;
  const content = await readFile(serverPath, "utf8");
  const rawReady = 'const READY_MARKUP = "<script>(globalThis.__DSH_BOOT_READY__ ??= Promise.withResolvers()).resolve()<\\/script>";';
  const safeReady = 'const READY_MARKUP = "<script>(globalThis.__DSH_BOOT_READY__ ??= (typeof Promise !== \'undefined\' && Promise.withResolvers ? Promise.withResolvers() : (() => { var resolve, reject; var promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; })())).resolve()<\\/script>";';

  if (content.includes(rawReady)) {
    const patched = content.replace(rawReady, safeReady);
    await writeFile(serverPath, patched, "utf8");
    console.log(`Patched safe READY_MARKUP in dsh-host-webserver: ${serverPath}`);
  }
}

export async function verifyRuntimeCompatibility(runtimeRoot) {
  const modules = join(runtimeRoot, "node_modules");
  const assetsRoot = join(modules, "@deepseek-ai", "dsh-web-frontend", "dist", "assets");
  if (!existsSync(assetsRoot)) throw new Error(`Missing frontend assets: ${assetsRoot}`);
  let oldCount = 0;
  let newCount = 0;
  for (const name of await readdir(assetsRoot)) {
    if (!name.endsWith(".js")) continue;
    const content = await readFile(join(assetsRoot, name), "utf8");
    oldCount += count(content, bundleOld);
    newCount += count(content, bundleNew);
  }
  if (oldCount !== 0 || newCount !== 1) {
    throw new Error(`Invalid prebuilt frontend compatibility state: legacy=${oldCount}, compatible=${newCount}`);
  }

  const connectionPath = join(modules, "@deepseek-ai", "dsh-client-connection", "lib", "index.js");
  if (!existsSync(connectionPath)) {
    throw new Error(`Missing dsh-client-connection: ${connectionPath}`);
  }
  const connection = await readFile(connectionPath, "utf8");
  if (!connection.includes("/* dsh-desktop-loopback-auth */")) {
    throw new Error("Desktop loopback auth patch is missing from dsh-client-connection");
  }
  const loopback = connection.slice(connection.indexOf("/* dsh-desktop-loopback-auth */"));
  if (loopback.includes('"location": "/"') || loopback.includes("writeHead(303")) {
    throw new Error("Desktop loopback auth must serve index with Set-Cookie, not 303 to /");
  }
  if (!loopback.includes("res.setHeader(\"set-cookie\"") || !loopback.includes("return true;")) {
    throw new Error("Desktop loopback auth must set the session cookie and continue to index.html");
  }

  const indexPath = join(modules, "@deepseek-ai", "dsh-web-frontend", "dist", "index.html");
  if (!existsSync(indexPath)) throw new Error(`Missing frontend index: ${indexPath}`);
  const index = await readFile(indexPath, "utf8");
  if (!index.includes("dsh-macos-titlebar-script") || !index.includes("isTitlebarHit")) {
    throw new Error("macOS titlebar script is missing delayed-drag maximize handling");
  }
  if (/mousedown[\s\S]{0,400}start-drag/.test(index) && !index.includes("pendingDrag")) {
    throw new Error("macOS titlebar mousedown still starts a drag immediately and will steal dblclick");
  }
  if (!index.includes("Promise.withResolvers")) {
    throw new Error("index.html is missing Promise.withResolvers polyfill for macOS 12.7.6 WebKit");
  }

  for (const name of await readdir(assetsRoot)) {
    if (!name.endsWith(".js")) continue;
    const content = await readFile(join(assetsRoot, name), "utf8");
    if (/static\s*\{/.test(content)) {
      throw new Error(`ES2022 class static initialization block found in ${name}; incompatible with macOS 12.7.6 WebKit`);
    }
  }

  const serverPath = join(modules, "@deepseek-ai", "dsh-host-webserver", "lib", "index.js");
  if (existsSync(serverPath)) {
    const serverCode = await readFile(serverPath, "utf8");
    if (serverCode.includes("Promise.withResolvers()).resolve()")) {
      throw new Error("dsh-host-webserver READY_MARKUP directly calls Promise.withResolvers without fallback");
    }
  }
}

async function assertPackageVersion(root, name, expected) {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (manifest.name !== name || !allowed.includes(manifest.version)) {
    throw new Error(`Expected ${name}@${allowed.join(" or ")}, got ${manifest.name}@${manifest.version}. Review the compatibility patch before packaging.`);
  }
}

async function patchExactFile(path, oldText, newText, label) {
  const content = await readFile(path, "utf8");
  assertCounts(path, content, oldText, newText, 1, 0);
  const patched = content.replace(oldText, newText);
  assertCounts(path, patched, oldText, newText, 0, 1);
  await writeFile(path, patched);
  console.log(`Patched ${label}: ${path}`);
}

function assertCounts(path, content, oldText, newText, expectedOld, expectedNew) {
  const oldCount = count(content, oldText);
  const newCount = count(content, newText);
  if (oldCount !== expectedOld || newCount !== expectedNew) {
    throw new Error(`${path}: expected legacy=${expectedOld}, compatible=${expectedNew}; got legacy=${oldCount}, compatible=${newCount}`);
  }
}

function count(content, needle) {
  return content.split(needle).length - 1;
}

const loopbackAuthServe = `\t\tif (this.isAuthenticated(req)) return true;
\t\t/* dsh-desktop-loopback-auth */
\t\tconst isLoopback = req.socket?.remoteAddress === "127.0.0.1" || req.socket?.remoteAddress === "::1" || req.socket?.remoteAddress === "::ffff:127.0.0.1";
\t\tif (req.method === "GET" && url.pathname === "/" && isLoopback) {
\t\t\tconst authority = requestAuthority(req.headers) ?? "127.0.0.1";
\t\t\tconst issuedAt = Date.now();
\t\t\tconst expiresAt = issuedAt + this.maxAgeMilliseconds;
\t\t\tconst value = encodeCookie({
\t\t\t\tversion: COOKIE_PAYLOAD_VERSION,
\t\t\t\tauthority,
\t\t\t\tissuedAt,
\t\t\t\texpiresAt
\t\t\t}, this.secret);
\t\t\tres.setHeader("set-cookie", sessionCookie(cookieName(authority), value, expiresAt, Math.floor(this.maxAgeMilliseconds / 1e3)));
\t\t\treturn true;
\t\t}
\t\tthis.writeUnauthorized(req, res);
\t\treturn false;`;

const loopbackAuthRedirect = `\t\tif (this.isAuthenticated(req)) return true;
\t\t/* dsh-desktop-loopback-auth */
\t\tconst isLoopback = req.socket?.remoteAddress === "127.0.0.1" || req.socket?.remoteAddress === "::1" || req.socket?.remoteAddress === "::ffff:127.0.0.1";
\t\tif (req.method === "GET" && url.pathname === "/" && isLoopback) {
\t\t\tconst authority = requestAuthority(req.headers) ?? "127.0.0.1";
\t\t\tconst issuedAt = Date.now();
\t\t\tconst expiresAt = issuedAt + this.maxAgeMilliseconds;
\t\t\tconst value = encodeCookie({
\t\t\t\tversion: COOKIE_PAYLOAD_VERSION,
\t\t\t\tauthority,
\t\t\t\tissuedAt,
\t\t\t\texpiresAt
\t\t\t}, this.secret);
\t\t\tres.writeHead(303, {
\t\t\t\t"cache-control": "no-store",
\t\t\t\t"location": "/",
\t\t\t\t"referrer-policy": "no-referrer",
\t\t\t\t"set-cookie": sessionCookie(cookieName(authority), value, expiresAt, Math.floor(this.maxAgeMilliseconds / 1e3))
\t\t\t});
\t\t\tres.end();
\t\t\treturn false;
\t\t}
\t\tthis.writeUnauthorized(req, res);
\t\treturn false;`;

const unpatchedIndexAuth = `\t\tif (this.isAuthenticated(req)) return true;
\t\tthis.writeUnauthorized(req, res);
\t\treturn false;`;

export async function patchLocalConnectionAuth(runtimeRoot) {
  const connectionPath = join(runtimeRoot, "node_modules", "@deepseek-ai", "dsh-client-connection", "lib", "index.js");
  if (!existsSync(connectionPath)) return;
  const content = await readFile(connectionPath, "utf8");
  if (content.includes(loopbackAuthServe)) return;

  let patched = content;
  if (content.includes(loopbackAuthRedirect)) {
    patched = content.replace(loopbackAuthRedirect, loopbackAuthServe);
  } else if (content.includes(unpatchedIndexAuth)) {
    patched = content.replace(unpatchedIndexAuth, loopbackAuthServe);
  } else {
    console.warn("Target not found in dsh-client-connection to patch local loopback auth");
    return;
  }
  await writeFile(connectionPath, patched, "utf8");
  console.log(`Patched desktop loopback auto-authentication: ${connectionPath}`);
}

