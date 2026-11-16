"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { fmtDateTime, maskEmail } from "@/lib/admin-format";
import { fmtCredits, fmtDate } from "@/lib/format";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { ReasonDialog } from "./ReasonDialog";
import { AdminCard, AdminTable, CardHeader, EmptyRow } from "./ui";

export interface CouponRow {
  id: string;
  code: string;
  credits: number;
  maxRedemptions: number | null;
  expiresAt: Date | null;
  active: boolean;
  redemptions: number;
}

export interface FlaggedRow {
  redemptionId: string;
  refereeEmail: string;
  code: string;
  flagReason: string | null;
  createdAt: Date;
}

/** Coupon table + create form + flagged-referral review (all audited server-side). */
export function CouponsManager({ coupons, flagged }: { coupons: CouponRow[]; flagged: FlaggedRow[] }) {
  const router = useRouter();
  const [toggle, setToggle] = useState<CouponRow | null>(null);
  const [review, setReview] = useState<{ row: FlaggedRow; decision: "approve" | "reject" } | null>(null);
  const [form, setForm] = useState({ code: "", credits: "500", max: "", expires: "" });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const wrap = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      router.refresh();
    } catch (err) {
      throw new Error(trpcErrorMessage(err), { cause: err });
    }
  };

  async function create(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateMsg(null);
    try {
      await trpc.admin.codes.createCoupon.mutate({
        code: form.code.trim(),
        credits: Number(form.credits),
        maxRedemptions: form.max ? Number(form.max) : null,
        expiresAt: form.expires ? new Date(`${form.expires}T23:59:59`) : null,
      });
      setForm({ code: "", credits: "500", max: "", expires: "" });
      setCreateMsg({ ok: true, text: "Coupon created." });
      router.refresh();
    } catch (err) {
      setCreateMsg({ ok: false, text: trpcErrorMessage(err) });
    } finally {
      setCreating(false);
    }
  }

  const expired = (c: CouponRow) => !!c.expiresAt && +new Date(c.expiresAt) < Date.now();

  return (
    <>
      <div className="flex flex-wrap items-start gap-5">
        <AdminCard className="min-w-0 flex-[999_1_560px] overflow-hidden">
          <CardHeader title="Coupons" />
          <AdminTable head={["Code", "Credits", "Redemptions", "Expires", "Active"]} minWidth={620}>
            {coupons.length === 0 ? (
              <EmptyRow cols={5}>No coupons yet.</EmptyRow>
            ) : (
              coupons.map((c) => {
                const ratio = c.maxRedemptions ? c.redemptions / c.maxRedemptions : 0;
                return (
                  <tr key={c.id}>
                    <td className="font-mono font-semibold tracking-[0.04em]">{c.code}</td>
                    <td className="font-mono">{fmtCredits(c.credits)}</td>
                    <td>
                      <div className="flex min-w-[140px] flex-col gap-1">
                        <span className="font-mono text-[13px]">
                          {c.redemptions.toLocaleString("en-IN")}
                          {c.maxRedemptions ? ` / ${c.maxRedemptions.toLocaleString("en-IN")}` : " · no limit"}
                        </span>
                        {c.maxRedemptions ? (
                          <div className="h-1.5 rounded-full bg-surface-2">
                            <div className={cn("h-1.5 rounded-full", ratio >= 0.8 ? "bg-warn" : "bg-link")} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className={cn("whitespace-nowrap", expired(c) ? "text-crit" : "text-text-2")}>
                      {c.expiresAt ? (expired(c) ? "Expired" : fmtDate(c.expiresAt)) : "Never"}
                    </td>
                    <td>
                      <Switch checked={c.active} label={`${c.active ? "Disable" : "Enable"} ${c.code}`} onChange={() => setToggle(c)} />
                    </td>
                  </tr>
                );
              })
            )}
          </AdminTable>
        </AdminCard>

        <form onSubmit={create} aria-label="Create coupon" className="flex flex-[1_1_280px] flex-col gap-3.5 rounded-xl border border-border bg-surface p-5">
          <h2 className="m-0 font-display text-lg font-bold">New coupon</h2>
          <Field label="Code">
            <Input
              required
              placeholder="DIWALI26"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="font-mono font-semibold tracking-[0.06em]"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Credits">
              <Input type="number" min={1} required value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} className="font-mono" />
            </Field>
            <Field label="Max uses">
              <Input type="number" min={1} placeholder="No limit" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} className="font-mono" />
            </Field>
          </div>
          <Field label="Expires" hint="(optional)">
            <Input type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} />
          </Field>
          <span className="text-xs text-text-2">Codes are case-insensitive. Each account can use one code ever.</span>
          {createMsg ? (
            <span role="status" className={cn("text-sm", createMsg.ok ? "text-good" : "text-crit")}>
              {createMsg.text}
            </span>
          ) : null}
          <Button type="submit" className="h-11" disabled={creating || !form.code.trim()}>
            {creating ? "Creating…" : "Create coupon"}
          </Button>
        </form>
      </div>

      <AdminCard className="overflow-hidden">
        <CardHeader
          title={
            <>
              Flagged referrals{" "}
              {flagged.length ? <span className="ml-1 rounded-full bg-warn-bg px-2.5 py-0.5 font-sans text-xs font-semibold text-warn">{flagged.length} to review</span> : null}
            </>
          }
        />
        <AdminTable head={["Referral code", "New account", "Signal", "When", "Decision"]} minWidth={760}>
          {flagged.length === 0 ? (
            <EmptyRow cols={5}>Nothing to review.</EmptyRow>
          ) : (
            flagged.map((f) => (
              <tr key={f.redemptionId}>
                <td className="font-mono font-semibold">{f.code}</td>
                <td>{maskEmail(f.refereeEmail)}</td>
                <td className="text-[13px] text-text-2">{f.flagReason ?? "—"}</td>
                <td className="font-mono text-[13px] whitespace-nowrap text-text-2">{fmtDateTime(f.createdAt)}</td>
                <td>
                  <div className="flex gap-3 font-semibold">
                    <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-good" onClick={() => setReview({ row: f, decision: "approve" })}>
                      Approve
                    </button>
                    <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-crit" onClick={() => setReview({ row: f, decision: "reject" })}>
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </AdminTable>
      </AdminCard>

      <ReasonDialog
        open={!!toggle}
        onClose={() => setToggle(null)}
        title={toggle?.active ? `Disable ${toggle.code}?` : `Enable ${toggle?.code}?`}
        subtitle={toggle?.active ? "New redemptions stop immediately. Past redemptions are kept." : "The code can be redeemed again."}
        confirmLabel={toggle?.active ? "Disable coupon" : "Enable coupon"}
        danger={toggle?.active}
        onConfirm={(reason) => wrap(() => trpc.admin.codes.updateCoupon.mutate({ couponId: toggle!.id, active: !toggle!.active, reason }))}
      />
      <ReasonDialog
        open={!!review}
        onClose={() => setReview(null)}
        title={review?.decision === "approve" ? "Approve referral?" : "Reject referral?"}
        subtitle={review ? `${review.row.code} → ${maskEmail(review.row.refereeEmail)}` : undefined}
        confirmLabel={review?.decision === "approve" ? "Approve and pay referrer" : "Reject"}
        danger={review?.decision === "reject"}
        onConfirm={(reason) => wrap(() => trpc.admin.codes.reviewReferral.mutate({ redemptionId: review!.row.redemptionId, decision: review!.decision, reason }))}
      />
    </>
  );
}
