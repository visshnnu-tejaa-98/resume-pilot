/** First human-readable message from a Clerk API error. */
export function clerkErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
    const first = errors?.[0];
    if (first) return first.longMessage ?? first.message ?? "Something went wrong.";
  }
  return "Something went wrong. Please try again.";
}
