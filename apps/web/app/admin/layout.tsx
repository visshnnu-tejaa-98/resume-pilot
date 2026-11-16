import { adminBadges } from "@resume-pilot/services";
import type { Metadata } from "next";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Resume Pilot" },
  robots: { index: false, follow: false },
};

/** Admin shell. Every page also calls requireAdmin() itself (cached per request). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, fullName } = await requireAdmin();
  const badges = await adminBadges(getDb());
  const env = process.env.APP_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development");
  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <AdminTopBar name={fullName ?? user.email} env={env} />
      <div className="flex flex-1">
        <AdminSidebar badges={badges} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
