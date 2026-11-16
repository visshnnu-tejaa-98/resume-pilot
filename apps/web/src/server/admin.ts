import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireAppUser } from "@/server/session";

/**
 * Server-side admin gate for /admin pages. Role comes from our DB, never
 * from the client. Non-admins get a 404 rather than 403 so the admin
 * area isn't discoverable. Mutations are separately gated by
 * `adminProcedure` in tRPC.
 */
export const requireAdmin = cache(async () => {
  const session = await requireAppUser();
  if (session.user.role !== "admin" || session.user.status !== "active") notFound();
  return session;
});
