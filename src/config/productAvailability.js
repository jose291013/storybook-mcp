function enabledFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

export function isProductEnabled(productType, env = process.env) {
  if (productType === "ebook") return true;
  if (productType === "print") return enabledFlag(env.PRINT_BOOK_ENABLED, false);
  return false;
}

export function getProductAvailability(env = process.env) {
  const printEnabled = isProductEnabled("print", env);
  return {
    ebook: { enabled: true, status: "available" },
    print: { enabled: printEnabled, status: printEnabled ? "available" : "coming_soon" },
  };
}
