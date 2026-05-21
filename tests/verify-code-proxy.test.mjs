// Regression test for api/auth/verify-code.js
//
// Bug: when the upstream ECS call (or a Vercel cold start) was slow, the
// serverless function got killed by the platform's 10s limit and returned an
// EMPTY body. The browser then threw "Unexpected end of JSON input" on
// res.json(). The hardened proxy must ALWAYS return parseable JSON, fast.
//
// Run: node --test tests/verify-code-proxy.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

// Dynamically import a FRESH copy each time so module-load-time config
// (UPSTREAM_TIMEOUT_MS) picks up the env vars set by each test.
async function loadHandler() {
  const url = new URL("../api/auth/verify-code.js", import.meta.url);
  return (await import(`${url}?t=${Date.now()}-${Math.random()}`)).default;
}

// THE REGRESSION TEST. Against the old handler (no AbortController) this
// fetch never settles, so the handler hangs forever and node --test fails
// by timeout. The hardened handler aborts at PROXY_TIMEOUT_MS and returns 504.
test("slow upstream -> 504 JSON within budget, never an empty body", async () => {
  process.env.ECS_URL = "http://fake-ecs";
  process.env.PROXY_TIMEOUT_MS = "150";

  global.fetch = (_url, opts) =>
    new Promise((_resolve, reject) => {
      opts.signal.addEventListener("abort", () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    });

  const handler = await loadHandler();
  const res = mockRes();
  await handler({ method: "POST", body: { code: "X" } }, res);

  assert.equal(res.statusCode, 504);
  assert.ok(res.body && typeof res.body.error === "string", "must return a JSON error");
  assert.ok(res.body.error.includes("timed out"));
});

test("garbage (non-JSON) upstream body -> 502 JSON, no throw", async () => {
  process.env.ECS_URL = "http://fake-ecs";
  process.env.PROXY_TIMEOUT_MS = "5000";

  global.fetch = async () => ({
    status: 200,
    text: async () => "<html>504 Gateway Timeout</html>",
  });

  const handler = await loadHandler();
  const res = mockRes();
  await handler({ method: "POST", body: { code: "X" } }, res);

  assert.equal(res.statusCode, 502);
  assert.ok(res.body.error.includes("invalid response"));
});

test("happy path -> passes upstream status + JSON through", async () => {
  process.env.ECS_URL = "http://fake-ecs";
  process.env.PROXY_TIMEOUT_MS = "5000";

  global.fetch = async () => ({
    status: 200,
    text: async () => JSON.stringify({ success: true, token: "jwt.tok.en" }),
  });

  const handler = await loadHandler();
  const res = mockRes();
  await handler({ method: "POST", body: { code: "RB-TEST-0000" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.token, "jwt.tok.en");
});

test("non-POST -> 405 JSON", async () => {
  const handler = await loadHandler();
  const res = mockRes();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
});

test("missing ECS_URL -> 500 JSON, not a crash", async () => {
  delete process.env.ECS_URL;
  const handler = await loadHandler();
  const res = mockRes();
  await handler({ method: "POST", body: { code: "X" } }, res);
  assert.equal(res.statusCode, 500);
  assert.ok(res.body.error.includes("ECS_URL"));
});
