// lib/session.js
export function getSessionId() {
  if (typeof window === "undefined") return null; // در SSR چیزی برنگردان
  let sid = localStorage.getItem("begooy_sid");
  if (!sid) {
    // یک UUID واقعی تولید می‌کنیم؛ بدون هیچ پیشوندی
    sid = crypto.randomUUID();
    localStorage.setItem("begooy_sid", sid);
  }
  return sid;  // مثل "341898ce-23c3-4d44-adb3-79c3c8d1e464"
}
