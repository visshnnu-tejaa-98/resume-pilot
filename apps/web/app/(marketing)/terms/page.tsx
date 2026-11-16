import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function Page() {
  return <LegalPage docId="terms" />;
}
