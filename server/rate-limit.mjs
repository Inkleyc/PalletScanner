export const createSlidingWindowRateLimiter = ({
  limit,
  windowMs = 60_000,
  message = "Too many requests. Wait a minute and try again.",
  now = () => Date.now(),
}) => {
  const requestTimesByKey = new Map();

  return (key) => {
    const currentTime = now();
    const windowStart = currentTime - windowMs;
    const recent = (requestTimesByKey.get(key) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    );
    if (recent.length >= limit) {
      const error = new Error(message);
      error.statusCode = 429;
      throw error;
    }
    recent.push(currentTime);
    requestTimesByKey.set(key, recent);
  };
};
