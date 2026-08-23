import type { Metadata } from "next";
import "@razorpay/blade/fonts.css";
import "./globals.css";
import { AppProviders } from "../lib/AppProviders";

export const metadata: Metadata = {
  title: "RecoverAI — Agentic Payment Recovery",
  description:
    "Agentic payment recovery & revenue intelligence: AI proposes, a deterministic policy engine validates, humans stay in the loop, and every decision is hash-chain audited.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
