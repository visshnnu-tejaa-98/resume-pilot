import { TextLink } from "@/components/ui/Button";

/** Admin-only pointer to the setting that fixes a failure (e.g. an AI token limit). */
export function AdminHint({ hint }: { hint: string }) {
  return (
    <span className="mt-2 block rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-text-2">
      <strong className="text-text">Admin:</strong> {hint}{" "}
      <TextLink href="/admin/pricing" className="font-semibold">
        Open pricing settings
      </TextLink>
    </span>
  );
}
