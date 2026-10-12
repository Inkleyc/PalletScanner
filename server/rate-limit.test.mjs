import assert from "node:assert/strict";
import test from "node:test";

import { createSlidingWindowRateLimiter } from "./rate-limit.mjs";

test("limits each user independently inside the window", () => {
  let currentTime = 10_000;
  const enforce = createSlidingWindowRateLimiter({ limit: 2, windowMs: 1_000, now: () => currentTime });
  enforce("seller-a");
  enforce("seller-a");
  enforce("seller-b");
  assert.throws(() => enforce("seller-a"), (error) => error.statusCode === 429);
});

test("allows requests again after the window expires", () => {
  let currentTime = 10_000;
  const enforce = createSlidingWindowRateLimiter({ limit: 1, windowMs: 1_000, now: () => currentTime });
  enforce("seller-a");
  currentTime += 1_001;
  assert.doesNotThrow(() => enforce("seller-a"));
});
