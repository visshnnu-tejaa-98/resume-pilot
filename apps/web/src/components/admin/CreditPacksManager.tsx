"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { fmtPaise } from "@/lib/admin-format";
import { fmtCredits } from "@/lib/format";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { ReasonDialog } from "./ReasonDialog";
import { AdminCard, AdminTable, CardHeader, EmptyRow } from "./ui";

export interface PackRow {
  id: string;
  pricePaise: number;
  credits: number;
  bonusCredits: number;
  sortOrder: number;
  active: boolean;
}

type Draft = { rupees: string; credits: string; bonus: string; sort: string };
const EMPTY: Draft = { rupees: "", credits: "", bonus: "0", sort: "0" };
const toDraft = (p: PackRow): Draft => ({ rupees: String(p.pricePaise / 100), credits: String(p.credits), bonus: String(p.bonusCredits), sort: String(p.sortOrder) });
const fromDraft = (d: Draft) => ({ pricePaise: Math.round(Number(d.rupees) * 100), credits: Number(d.credits), bonusCredits: Number(d.bonus), sortOrder: Number(d.sort) });

/**
 * Top-up packs (prd.md §2, §16.4) — add, edit, enable/disable without a
 * deploy. Active packs show on Pricing and Add money immediately. Orders
 * already created keep the credits they were created with.
 */
export function CreditPacksManager({ packs }: { packs: PackRow[] }) {
  const router = useRouter();
  const [toggle, setToggle] = useState<PackRow | null>(null);
  const [edit, setEdit] = useState<{ pack: PackRow | null; draft: Draft } | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      router.refresh();
    } catch (err) {
      throw new Error(trpcErrorMessage(err), { cause: err });
    }
  };

  const d = edit?.draft;
  const preview = d ? fromDraft(d) : null;
  const valid = !!preview && preview.pricePaise >= 100 && preview.credits > 0 && preview.bonusCredits >= 0 && Number.isInteger(preview.credits) && Number.isInteger(preview.bonusCredits);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setEdit((s) => (s ? { ...s, draft: { ...s.draft, [k]: e.target.value } } : s));

  return (
    <AdminCard className="overflow-hidden">
      <CardHeader
        title="Top-up packs"
        aside={
          <Button className="h-9 px-3.5 text-sm" onClick={() => setEdit({ pack: null, draft: EMPTY })}>
            Add pack
          </Button>
        }
      />
      <AdminTable head={["Price", "Credits", "Bonus", "Per credit", "Order", "Active", ""]} minWidth={620}>
        {packs.length === 0 ? (
          <EmptyRow cols={7}>No packs yet.</EmptyRow>
        ) : (
          packs.map((p) => (
            <tr key={p.id} className={p.active ? undefined : "text-text-2"}>
              <td className="font-semibold">{fmtPaise(p.pricePaise)}</td>
              <td className="font-mono">{fmtCredits(p.credits)}</td>
              <td className="font-mono">{p.bonusCredits ? `+${fmtCredits(p.bonusCredits)}` : "—"}</td>
              <td className="font-mono">₹{(p.pricePaise / 100 / (p.credits + p.bonusCredits)).toFixed(3)}</td>
              <td className="font-mono">{p.sortOrder}</td>
              <td>
                <Switch checked={p.active} label={`${p.active ? "Disable" : "Enable"} ${fmtPaise(p.pricePaise)} pack`} onChange={() => setToggle(p)} />
              </td>
              <td>
                <button type="button" className="text-sm font-semibold text-link" onClick={() => setEdit({ pack: p, draft: toDraft(p) })}>
                  Edit
                </button>
              </td>
            </tr>
          ))
        )}
      </AdminTable>

      <ReasonDialog
        open={!!toggle}
        onClose={() => setToggle(null)}
        title={toggle ? `${toggle.active ? "Disable" : "Enable"} the ${fmtPaise(toggle.pricePaise)} pack?` : ""}
        subtitle={toggle?.active ? "It disappears from Pricing and Add money. Payments already started still complete." : "It appears on Pricing and Add money right away."}
        confirmLabel={toggle?.active ? "Disable" : "Enable"}
        danger={toggle?.active}
        onConfirm={(reason) => run(() => trpc.admin.payments.updatePackage.mutate({ packageId: toggle!.id, active: !toggle!.active, reason }))}
      />

      <ReasonDialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.pack ? `Edit the ${fmtPaise(edit.pack.pricePaise)} pack` : "Add a top-up pack"}
        subtitle="Prices are final amounts (no GST for now). Credits + bonus is what the user receives."
        confirmLabel={edit?.pack ? "Save pack" : "Add pack"}
        onConfirm={async (reason) => {
          if (!valid || !preview) throw new Error("Enter a price of at least ₹1 and whole-number credits.");
          await run(() =>
            edit?.pack ? trpc.admin.payments.updatePackage.mutate({ packageId: edit.pack.id, ...preview, reason }) : trpc.admin.payments.createPackage.mutate({ ...preview, reason }),
          );
        }}
      >
        {d ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)">
              <Input inputMode="numeric" value={d.rupees} onChange={set("rupees")} placeholder="1000" />
            </Field>
            <Field label="Credits">
              <Input inputMode="numeric" value={d.credits} onChange={set("credits")} placeholder="20000" />
            </Field>
            <Field label="Bonus credits">
              <Input inputMode="numeric" value={d.bonus} onChange={set("bonus")} />
            </Field>
            <Field label="Sort order">
              <Input inputMode="numeric" value={d.sort} onChange={set("sort")} />
            </Field>
            {valid && preview ? (
              <span className="col-span-2 text-[13px] text-text-2">
                User gets <strong className="font-mono">{fmtCredits(preview.credits + preview.bonusCredits)}</strong> credits for {fmtPaise(preview.pricePaise)}
                {preview.bonusCredits ? ` (${((preview.bonusCredits / preview.credits) * 100).toFixed(1)}% bonus)` : ""}.
              </span>
            ) : null}
          </div>
        ) : null}
      </ReasonDialog>
    </AdminCard>
  );
}
