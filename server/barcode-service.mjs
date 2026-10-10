const firstText = (...values) =>
  values.find((value) => typeof value === "string" && value.trim())?.trim();

const normalizeFactsProduct = (product) => {
  const title = firstText(product?.product_name, product?.product_name_en);
  if (!title) throw new Error("No product found.");
  return {
    title,
    description: firstText(product.generic_name, product.generic_name_en),
    brand: firstText(product.brands),
    category: firstText(product.categories, product.categories_old),
    images: [product.image_front_url, product.image_url].filter(Boolean),
  };
};

const fetchBarcodeSource = async (url, normalize) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Lookup failed (${response.status}).`);
  return normalize(await response.json());
};

export const lookupBarcode = async (rawBarcode) => {
  const barcode = String(rawBarcode ?? "").trim().replace(/[^0-9A-Za-z]/g, "");
  if (!barcode) {
    const error = new Error("A barcode is required.");
    error.statusCode = 400;
    throw error;
  }
  const attempts = [
    fetchBarcodeSource(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      (payload) => {
        if (!Array.isArray(payload.items) || !payload.items[0]) throw new Error("No product found.");
        return payload.items[0];
      },
    ),
    fetchBarcodeSource(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?product_type=all&fields=product_name,product_name_en,generic_name,generic_name_en,brands,categories,categories_old,image_front_url,image_url`,
      (payload) => normalizeFactsProduct(payload.product),
    ),
    fetchBarcodeSource(
      `https://gtinhub.com/api/v1/product/${encodeURIComponent(barcode)}`,
      (payload) => {
        if (!payload.found || !payload.product?.name) throw new Error("No product found.");
        return {
          title: payload.product.name,
          description: firstText(payload.product.description),
          brand: firstText(payload.product.brand),
          category: firstText(payload.product.category),
          images: [payload.product.image_url].filter(Boolean),
        };
      },
    ),
  ];
  try {
    return await Promise.any(attempts);
  } catch {
    const error = new Error("No product information was found for that barcode.");
    error.statusCode = 404;
    throw error;
  }
};
