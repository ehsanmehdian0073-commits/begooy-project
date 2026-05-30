export function allowMockBilling() {
  return process.env.ALLOW_MOCK_BILLING === "true" && process.env.NODE_ENV !== "production";
}

export function isMockPayment(authority?: string | null, gateway?: string | null) {
  return Boolean((authority || "").startsWith("mock-") || gateway === "mock");
}

export function isZarinpalSandbox() {
  const raw = process.env.ZARINPAL_SANDBOX;
  if (raw == null || raw === "") {
    return process.env.NODE_ENV !== "production";
  }
  return raw === "true";
}
