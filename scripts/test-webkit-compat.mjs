import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";

const polyfill = await readFile(new URL("../src-tauri/resources/abort-signal-polyfill.js", import.meta.url), "utf8");

function monterey() {
  const context = createContext({});
  runInContext("delete Array.prototype.toSorted", context);
  runInContext(polyfill, context);
  assert.equal(runInContext("typeof Array.prototype.toSorted", context), "function");
  return context;
}

function result(context, expression) {
  return JSON.parse(runInContext(`JSON.stringify(${expression})`, context));
}

test("sorts model provider groups on Monterey without mutating the catalog", () => {
  const context = monterey();
  assert.deepEqual(result(context, `(() => {
    const groups = [
      { id: "custom-first" }, { id: "deepseek-official" },
      { id: "custom-second" }, { id: "deepseek-account" },
    ];
    const priority = { "deepseek-account": 0, "deepseek-official": 1 };
    const sorted = groups.toSorted((a, b) => (priority[a.id] ?? 2) - (priority[b.id] ?? 2));
    return { original: groups.map(group => group.id), sorted: sorted.map(group => group.id) };
  })()`), {
    original: ["custom-first", "deepseek-official", "custom-second", "deepseek-account"],
    sorted: ["deepseek-account", "deepseek-official", "custom-first", "custom-second"],
  });
});

test("uses default string ordering and returns a dense copy of sparse arrays", () => {
  const context = monterey();
  assert.deepEqual(result(context, `(() => {
    const source = [10, , 2, undefined, 1];
    const sorted = source.toSorted();
    return { values: sorted, dense: [0, 1, 2, 3, 4].every(i => i in sorted), sourceStillSparse: !(1 in source) };
  })()`), { values: [1, 10, 2, null, null], dense: true, sourceStillSparse: true });
});

test("reads array-like indices once and ignores custom iterators and array species", () => {
  const context = monterey();
  assert.deepEqual(result(context, `(() => {
    let reads = 0;
    const source = { 0: 3, 1: 1, 2: 2, get length() { reads++; return 3.9; },
      [Symbol.iterator]() { throw new Error("toSorted must not iterate the receiver"); } };
    class CustomArray extends Array {
      static get [Symbol.species]() { throw new Error("toSorted must return a plain Array"); }
    }
    const sorted = Array.prototype.toSorted.call(source, (a, b) => a - b);
    const subclassCopy = new CustomArray(3, 1, 2).toSorted();
    return { sorted, reads, plain: Object.getPrototypeOf(subclassCopy) === Array.prototype };
  })()`), { sorted: [1, 2, 3], reads: 1, plain: true });
});

test("rejects invalid comparators and receivers", () => {
  const context = monterey();
  for (const expression of [
    "[].toSorted(null)",
    "[].toSorted(1)",
    "Array.prototype.toSorted.call(null)",
    "Array.prototype.toSorted.call(undefined)",
    "Array.prototype.toSorted.call({ length: 1n })",
  ]) {
    assert.throws(() => runInContext(expression, context), { name: "TypeError" }, expression);
  }
});

test("installs a non-enumerable method once even without AbortSignal", () => {
  const context = monterey();
  runInContext("globalThis.firstToSorted = Array.prototype.toSorted", context);
  runInContext(polyfill, context);
  assert.deepEqual(result(context, `(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "toSorted");
    return { same: firstToSorted === Array.prototype.toSorted, enumerable: descriptor.enumerable,
      writable: descriptor.writable, configurable: descriptor.configurable, abortSignal: typeof AbortSignal };
  })()`), { same: true, enumerable: false, writable: true, configurable: true, abortSignal: "undefined" });
});

test("preserves the native implementation on newer engines", () => {
  const context = createContext({});
  runInContext("globalThis.nativeToSorted = Array.prototype.toSorted", context);
  assert.equal(runInContext("typeof nativeToSorted", context), "function");
  runInContext(polyfill, context);
  assert.equal(runInContext("Array.prototype.toSorted === nativeToSorted", context), true);
});
