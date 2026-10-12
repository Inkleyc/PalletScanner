const payloadTooLarge = () => {
  const error = new Error("Request body too large.");
  error.statusCode = 413;
  return error;
};

export const readRequestBody = (
  req,
  { maxBytes = 30_000_000 } = {},
) => new Promise((resolve, reject) => {
  const chunks = [];
  let receivedBytes = 0;
  let settled = false;

  const contentLength = Number(req.headers?.["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    settled = true;
    req.resume?.();
    reject(payloadTooLarge());
    return;
  }

  req.on("data", (chunk) => {
    if (settled) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > maxBytes) {
      settled = true;
      chunks.length = 0;
      req.resume?.();
      reject(payloadTooLarge());
      return;
    }
    chunks.push(buffer);
  });
  req.on("end", () => {
    if (settled) return;
    settled = true;
    resolve(Buffer.concat(chunks).toString("utf8"));
  });
  req.on("error", (error) => {
    if (settled) return;
    settled = true;
    reject(error);
  });
});
