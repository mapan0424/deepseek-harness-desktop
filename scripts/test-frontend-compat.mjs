import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { patchFrontendClassStaticBlocks, verifyFrontendSyntax } from "./patch-runtime-compat.mjs";

async function fixture(t, source) {
  const root = await mkdtemp(join(tmpdir(), "dsh-frontend-compat-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const assets = join(root, "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist", "assets");
  await mkdir(assets, { recursive: true });
  const path = join(assets, "index-fixture.js");
  await writeFile(path, source);
  return { root, path };
}

function evaluate(source) {
  const context = {};
  runInNewContext(source, context, { timeout: 1000 });
  return JSON.parse(JSON.stringify(context.result));
}

test("preserves named class scope and following comma-separated declarations", async (t) => {
  const source = `
    var Context=class cr {
      static is=()=>false;
      static{cr.is[Symbol.toPrimitive]=()=>Symbol.for("cordis.is"),cr.prototype[cr.is]=!0}
      braces(){return "{not a class boundary}"}
    },V1=class l5 extends Context {static inherited=!!l5.prototype[l5.is]},tail=42;
    globalThis.result={inherited:V1.inherited,tagged:!!new Context()[Context.is],tail,inner:typeof cr};
  `;
  const { root, path } = await fixture(t, source);
  await patchFrontendClassStaticBlocks(root);
  const patched = await readFile(path, "utf8");
  await verifyFrontendSyntax(root);
  assert.doesNotMatch(patched, /static\s*\{/);
  assert.deepEqual(evaluate(patched), evaluate(source));
  assert.deepEqual(evaluate(patched), { inherited: true, tagged: true, tail: 42, inner: "undefined" });
});

test("preserves logger methods, private fields and static initialization order", async (t) => {
  const source = `
    var order=[];
    var Logger=class RenamedLogger {
      static #value=3;
      static {order.push(this.#value)}
      static value=4;
      static {order.push(this.value)}
      static {for(const key of ["error","info","warn","debug"])RenamedLogger.prototype[key]=function(...args){return this()[key](...args)}}
    },after=order.push("after");
    globalThis.result={order,after,method:Logger.prototype.info.call(()=>({info:(...args)=>args.join(" ")}),"hello","world")};
  `;
  const { root, path } = await fixture(t, source);
  await patchFrontendClassStaticBlocks(root);
  const patched = await readFile(path, "utf8");
  await verifyFrontendSyntax(root);
  assert.doesNotMatch(patched, /static\s*\{/);
  assert.deepEqual(evaluate(patched), evaluate(source));
});

test("preserves ESM exports and does not bundle or resolve imports", async (t) => {
  const source = 'import {value} from "./vendor-fixture.js"; export class Example {static {this.value=value}}';
  const { root, path } = await fixture(t, source);
  await patchFrontendClassStaticBlocks(root);
  await verifyFrontendSyntax(root);
  const patched = await readFile(path, "utf8");
  assert.match(patched, /from[\s]*["']\.\/vendor-fixture\.js["']/);
  assert.match(patched, /export/);
  assert.doesNotMatch(patched, /static\s*\{/);
});

test("rejects the released semicolon-comma corruption before packaging", async (t) => {
  const { root } = await fixture(t, 'var Context=class cr{};Context.tag=true;,V1=class l5{};');
  await assert.rejects(verifyFrontendSyntax(root), /Invalid frontend JavaScript.*Unexpected token ','/);
});

test("transpilation rejects invalid input without overwriting the asset", async (t) => {
  const source = 'var Context=class cr{};,V1=class l5{};';
  const { root, path } = await fixture(t, source);
  await assert.rejects(patchFrontendClassStaticBlocks(root));
  assert.equal(await readFile(path, "utf8"), source);
});
