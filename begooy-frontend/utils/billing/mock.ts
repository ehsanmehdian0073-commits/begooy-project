export function isMockBillingAllowed() {
  return process.env.ALLOW_MOCK_BILLING === "true" && process.env.NODE_ENV !== "production";
}
