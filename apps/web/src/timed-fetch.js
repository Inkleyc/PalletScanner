// PF-SCOPE-025: fetch with an abort deadline.
//
// The eBay Settings card wedged on "Checking…" forever when a request
// against Render's sleeping free tier never settled: the card's
// request() helper called fetch() with no timeout, so loading never
// cleared and the card's buttons stayed disabled until a page refresh
// (observed 2026-11-12 and repeatedly during PF-SCOPE-004, including a
// ~90s hang in PF-SCOPE-024's acceptance check on 2026-11-21).
//
// The deadline is 20s. A warm backend answers these calls in a few
// seconds at most, so 20s is generous headroom for a real response;
// Render's cold start is ~50s, so no deadline short enough to feel
// responsive would let the first click on a sleeping backend succeed
// anyway. The point is not to outwait the cold start — it is that the
// click now lands on a retryable timeout error (loading clears, the
// card's message line explains, Check status stays enabled) instead of
// a permanent spinner, and the retry reaches the backend while it is
// waking or awake.
export const FETCH_TIMEOUT_MS = 20_000;

export const fetchWithTimeout = async (url, options = {}, timeoutMs = FETCH_TIMEOUT_MS, fetchImpl = globalThis.fetch) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      const timeoutError = new Error(
        `The backend did not answer within ${Math.round(timeoutMs / 1000)} seconds. It may still be waking up — wait a moment and try again.`,
      );
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
