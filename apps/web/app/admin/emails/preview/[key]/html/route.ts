import { EMAIL_PREVIEWS } from "@resume-pilot/emails";
import { render } from "@react-email/render";
import { requireAdmin } from "@/server/admin";

/**
 * Raw HTML of one template rendered with sample props, for the admin
 * preview iframe. Admin-only (requireAdmin 404s everyone else); sample
 * data only, no user data is ever rendered here.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  await requireAdmin();
  const { key } = await params;
  const preview = EMAIL_PREVIEWS.find((p) => p.key === key);
  if (!preview) return new Response("Not found", { status: 404 });
  const dark = new URL(req.url).searchParams.get("dark") === "1";
  const html = await render(preview.render(dark));
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // Rendered inside our own iframe only.
      "x-frame-options": "SAMEORIGIN",
      "content-security-policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https:; frame-ancestors 'self'",
    },
  });
}
