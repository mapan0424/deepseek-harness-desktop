// WebKit compatibility for macOS 12.x.
// dsh web uses AbortSignal.timeout() while creating a workspace, but the
// WKWebView shipped with Monterey does not provide that static method.
(function installAbortSignalPolyfills(global) {
  "use strict";

  if (!global || typeof global.AbortController !== "function" || typeof global.AbortSignal !== "function") {
    return;
  }

  function defineStatic(name, implementation) {
    if (typeof global.AbortSignal[name] === "function") return;
    try {
      Object.defineProperty(global.AbortSignal, name, {
        configurable: true,
        writable: true,
        value: implementation,
      });
    } catch (_error) {
      global.AbortSignal[name] = implementation;
    }
  }

  function abort(controller, reason) {
    try {
      controller.abort(reason);
    } catch (_error) {
      controller.abort();
    }
  }

  defineStatic("timeout", function timeout(milliseconds) {
    var delay = Number(milliseconds);
    if (!isFinite(delay) || delay < 0) {
      throw new RangeError("AbortSignal.timeout requires a finite, non-negative delay");
    }

    var controller = new global.AbortController();
    var reason;
    try {
      reason = new global.DOMException("The operation timed out.", "TimeoutError");
    } catch (_error) {
      reason = new Error("The operation timed out.");
      reason.name = "TimeoutError";
    }
    global.setTimeout(function abortAfterTimeout() {
      abort(controller, reason);
    }, delay);
    return controller.signal;
  });

  defineStatic("any", function any(signals) {
    var list = Array.from(signals || []);
    var controller = new global.AbortController();
    var listeners = [];

    function cleanup() {
      for (var i = 0; i < listeners.length; i += 1) {
        listeners[i].signal.removeEventListener("abort", listeners[i].listener);
      }
      listeners = [];
    }

    function forward(signal) {
      cleanup();
      abort(controller, signal.reason);
    }

    for (var i = 0; i < list.length; i += 1) {
      var signal = list[i];
      if (!signal || typeof signal.addEventListener !== "function") {
        throw new TypeError("AbortSignal.any expects an iterable of AbortSignal objects");
      }
      if (signal.aborted) {
        forward(signal);
        return controller.signal;
      }
    }

    for (var j = 0; j < list.length; j += 1) {
      (function register(signal) {
        var listener = function onAbort() { forward(signal); };
        listeners.push({ signal: signal, listener: listener });
        signal.addEventListener("abort", listener, { once: true });
      })(list[j]);
    }
    return controller.signal;
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
