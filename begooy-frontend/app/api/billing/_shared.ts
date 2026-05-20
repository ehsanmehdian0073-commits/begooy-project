export function isMockBillingAllowed() {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_MOCK_BILLING === "true";
}

export function isMockPayment(authority?: string | null, gateway?: string | null) {
  return Boolean(authority?.startsWith("mock-") || gateway === "mock");
}

export function subscriptionWindow() {
  const now = new Date();
  const ends = new Date(now);
  ends.setMonth(ends.getMonth() + 1);
  return {
    startedAt: now.toISOString(),
    endsAt: ends.toISOString(),
  };
}
