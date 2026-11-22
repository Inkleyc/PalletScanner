import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FETCH_TIMEOUT_MS, fetchWithTimeout } from "../src/timed-fetch.js";

// PF-SCOPE-025: the eBay Settings card wedged on "Checking…" forever
// when a status fetch against the sleeping Render backend never
// settled — request() called fetch() with no timeout, checkStatus's
// finally never ran, loading stayed true and the card's buttons stayed
// disabled until a page refresh.
//
// These tests drive the timed fetch the settings request() now uses.
// checkStatus itself is a React component closure (not importable
// here), so the first test mirrors its exact control flow —
// setLoading(true) → try request → catch setMessage(error.message) →
// finally setLoading(false) — and asserts the two things the wedge
// prevented: loading clears and the timeout message is what renders.

const abortError = () => {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
};

// A faithful stand-in for a fetch against a backend that never
// answers: like real fetch, the promise stays pending until the
// caller's AbortSignal fires, then rejects with an AbortError.
const neverResolvingFetch = (_url, options) => new Promise((_resolve, reject) => {
  if (options?.signal?.aborted) {
    reject(abortError());
    return;
  }
  options?.signal?.addEventListener("abort", () => reject(abortError()), { once: true });
});

test("a never-resolving status fetch times out: loading clears and the timeout message renders", async () => {
  const card = { loading: false, message: "" };
  const checkStatus = async () => {
    card.loading = true; card.message = "";
    try {
      await fetchWithTimeout("https://backend.example/ebay/status", {}, 50, neverResolvingFetch);
    } catch (error) { card.message = error instanceof Error ? error.message : "Could not check eBay status."; }
    finally { card.loading = false; }
  };

  const startedAt = Date.now();
  await checkStatus();
  const elapsedMs = Date.now() - startedAt;

  assert.equal(card.loading, false);
  assert.match(card.message, /did not answer within/);
  assert.match(card.message, /waking up/);
  assert.ok(elapsedMs < 5_000, `timeout path took ${elapsedMs}ms — the fetch was not aborted`);
});

test("the timeout error is named and carries the seconds from the deadline", async () => {
  await assert.rejects(
    fetchWithTimeout("https://backend.example/ebay/status", {}, 25, neverResolvingFetch),
    (error) => {
      assert.equal(error.name, "TimeoutError");
      assert.match(error.message, /did not answer within/);
      return true;
    },
  );
});

test("a prompt response passes through untouched and receives an AbortSignal", async () => {
  const seen = [];
  const fastFetch = async (url, options) => {
    seen.push({ url, options });
    return { ok: true, status: 200 };
  };
  const response = await fetchWithTimeout("https://backend.example/ebay/status", { headers: { Authorization: "Bearer t" } }, 1_000, fastFetch);
  assert.equal(response.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].options.headers.Authorization, "Bearer t");
  assert.ok(seen[0].options.signal instanceof AbortSignal);
  assert.equal(seen[0].options.signal.aborted, false);
});

test("a non-timeout fetch failure propagates unchanged, not relabelled as a timeout", async () => {
  const networkError = new TypeError("fetch failed");
  const failingFetch = async () => { throw networkError; };
  await assert.rejects(
    fetchWithTimeout("https://backend.example/ebay/status", {}, 1_000, failingFetch),
    (error) => error === networkError,
  );
});

test("the production deadline is the recorded 20s", () => {
  assert.equal(FETCH_TIMEOUT_MS, 20_000);
});

test("the Settings card's request() is wired through the timed fetch", async () => {
  const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /import \{ fetchWithTimeout \} from "\.\/timed-fetch\.js";/);
  assert.match(appSource, /const response = await fetchWithTimeout\(`\$\{baseUrl\.trim\(\)/);
});
