import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureUserSynced } from "@/server/ensure-user";
import { ReviewEditor } from "./ReviewEditor";

/** "Resume Information" review screen — prd.md §5.3 step 7. Data loads client-side over tRPC (owner-checked there). */
export default async function ReviewPage({ params }: { params: Promise<{ resumeId: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  await ensureUserSynced(userId);
  const { resumeId } = await params;
  return <ReviewEditor resumeId={resumeId} />;
}
