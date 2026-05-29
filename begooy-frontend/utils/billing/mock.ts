export function isMockBillingAllowed(env: NodeJS.ProcessEnv = process.env) {
  return env.ALLOW_MOCK_BILLING === "true" && env.NODE_ENV !== "production";
}

export function isMockPayment(authority?: string | null, gateway?: string | null) {
  return (authority || "").startsWith("mock-") || gateway === "mock";
}

export function isZarinpalSandbox(env: NodeJS.ProcessEnv = process.env) {
  return env.ZARINPAL_SANDBOX === "true";
}
