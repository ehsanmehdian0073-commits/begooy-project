type BillingDb = any;

type FulfillPaymentArgs = {
  paymentId: string;
  userId: string;
  planId: string;
  refId?: string | null;
  allowedStatuses?: string[];
};

type FulfillPaymentResult =
  | { ok: true; alreadyPaid?: boolean; subscriptionCreated?: boolean }
  | { ok: false; error: string; detail?: string };

function subscriptionWindow(now = new Date()) {
  const ends = new Date(now);
  ends.setMonth(ends.getMonth() + 1);

  return {
    started_at: now.toISOString(),
    ends_at: ends.toISOString(),
  };
}

export async function ensureActiveSubscription(
  db: BillingDb,
  userId: string,
  planId: string
): Promise<FulfillPaymentResult> {
  const now = Date.now();
  const { data: existing, error: findErr } = await db
    .from("subscriptions")
    .select("id, ends_at")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .eq("status", "active")
    .limit(20);

  if (findErr) {
    return { ok: false, error: "subscription_lookup_failed", detail: findErr.message };
  }

  const hasCurrentSubscription = (existing ?? []).some((row: any) => {
    if (!row.ends_at) return true;
    const endsAt = new Date(row.ends_at).getTime();
    return Number.isFinite(endsAt) && endsAt > now;
  });

  if (hasCurrentSubscription) {
    return { ok: true, alreadyPaid: true, subscriptionCreated: false };
  }

  const { error: insertErr } = await db.from("subscriptions").insert({
    user_id: userId,
    plan_id: planId,
    status: "active",
    ...subscriptionWindow(),
  });

  if (insertErr) {
    return { ok: false, error: "subscription_insert_failed", detail: insertErr.message };
  }

  return { ok: true, subscriptionCreated: true };
}

export async function fulfillPaidPayment(
  db: BillingDb,
  {
    paymentId,
    userId,
    planId,
    refId = null,
    allowedStatuses = ["pending"],
  }: FulfillPaymentArgs
): Promise<FulfillPaymentResult> {
  const { data: updated, error: updateErr } = await db
    .from("payments")
    .update({ status: "paid", ref_id: refId })
    .eq("id", paymentId)
    .in("status", allowedStatuses)
    .select("id, user_id, plan_id, status")
    .maybeSingle();

  if (updateErr) {
    return { ok: false, error: "payment_update_failed", detail: updateErr.message };
  }

  if (!updated) {
    const { data: current, error: currentErr } = await db
      .from("payments")
      .select("id, user_id, plan_id, status")
      .eq("id", paymentId)
      .maybeSingle();

    if (currentErr || !current) {
      return {
        ok: false,
        error: "payment_state_unknown",
        detail: currentErr?.message,
      };
    }

    if (current.status !== "paid") {
      return { ok: false, error: "payment_not_payable" };
    }

    const ensured = await ensureActiveSubscription(
      db,
      current.user_id ?? userId,
      current.plan_id ?? planId
    );
    if (!ensured.ok) return ensured;

    return { ok: true, alreadyPaid: true, subscriptionCreated: ensured.subscriptionCreated };
  }

  const ensured = await ensureActiveSubscription(
    db,
    updated.user_id ?? userId,
    updated.plan_id ?? planId
  );
  if (!ensured.ok) return ensured;

  return { ok: true, subscriptionCreated: ensured.subscriptionCreated };
}
