import type { Metadata } from "next";
import { Suspense } from "react";
import { AppMain } from "@/components/app/PageHeader";
import { SettingsView } from "@/components/settings/SettingsView";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

/** design/screens/Settings.dc.html */
export default async function SettingsPage() {
  await requireAppUser();
  return (
    <AppMain width="md" className="gap-6">
      <Suspense>
        <SettingsView />
      </Suspense>
    </AppMain>
  );
}
