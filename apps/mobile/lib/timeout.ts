// Bounded waits for the capture flows. A lookup or analysis that can hang
// forever traps the user on a spinner with no recovery path; racing it
// against a timer lets the existing fallback-draft / fallback-prompt paths
// take over. The in-flight request is abandoned, not cancelled — callers
// treat the timeout exactly like any other lookup failure.

export const BARCODE_LOOKUP_TIMEOUT_MS = 15_000;

export const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  // Promise.race subscribes to both promises, so a late settle of the
  // abandoned promise is consumed here and never surfaces as unhandled.
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
};
