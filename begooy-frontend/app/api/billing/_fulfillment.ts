type SupabaseClientLike = {
  from: (table: string) => any;
};

export type PaymentForFulfillment = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string | null;
};

type FulfillmentResult =
  | { ok: true; already?: boolean }
  | { ok: false; error: string };

const FULFILLABLE_STATUSES = ["pending", "failed", "canceled"];

export async function fulfillPayment(
  supabase: SupabaseClientLike,
  payment: PaymentForFulfillment,
  refId?: string | null,
): Promise<FulfillmentResult> {
  if (payment.status === "paid") {
    return { ok: true, already: true };
  }

  const previousStatus = payment.status || "pending";
  const paidUpdate: Record<string, string | null> = { status: "paid" };
  if (refId !== undefined) paidUpdate.ref_id = refId;

  const { data: claimed, error: claimError } = await supabase
    .from("payments")
    .update(paidUpdate)
    .eq("id", payment.id)
    .in("status", FULFILLABLE_STATUSES)
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("[billing.fulfill.claim]", claimError);
    return { ok: false, error: "payment_status_update_failed" };
  }

  if (!claimed) {
    const { data: current } = await supabase
      .from("payments")
      .select("status")
      .eq("id", payment.id)
      .maybeSingle();

    if (current?.status === "paid") {
      return { ok: true, already: true };
    }

    return { ok: false, error: "payment_not_fulfillable" };
  }

  const now = new Date();
  const ends = new Date(now);
  ends.setMonth(ends.getMonth() + 1);

  const { error: subscriptionError } = await supabase.from("subscriptions").insert([
    {
      user_id: payment.user_id,
      plan_id: payment.plan_id,
      status: "active",
      started_at: now.toISOString(),
      ends_at: ends.toISOString(),
    },
  ]);

  if (subscriptionError) {
    console.error("[billing.fulfill.subscription]", subscriptionError);
    const { error: rollbackError } = await supabase
      .from("payments")
      .update({ status: previousStatus })
      .eq("id", payment.id)
      .eq("status", "paid");

    if (rollbackError) {
      console.error("[billing.fulfill.rollback]", rollbackError);
    }

    return { ok: false, error: "subscription_insert_failed" };
  }

  return { ok: true };
}
