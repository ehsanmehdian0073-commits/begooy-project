// app/layout.js
import "./globals.css";
import { Vazirmatn } from "next/font/google";

const vazir = Vazirmatn({
  subsets: ["arabic", "latin"],   // هم فارسی، هم لاتین
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

export const metadata = {
  title: "Begooy",
  description: "اومنی‌اینباکس هوشمند با LLM + RAG",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl">
      <body
        className={`${vazir.className} antialiased bg-[var(--bg)] text-[var(--ink)]`}
      >
        {children}
      </body>
    </html>
  );
}
