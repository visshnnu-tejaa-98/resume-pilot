"use client";

import type { PricingConfigInput } from "@resume-pilot/validators";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { aiTypeLabel } from "@/lib/admin-format";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { ReasonDialog } from "./ReasonDialog";
import { AdminCard, AdminTable } from "./ui";

interface PricingEditorProps {
  version: number;
  config: PricingConfigInput;
  /** Average AI cost per successful action over 14 days, in paise. */
  avgCostPaise: Record<string, number>;
}

/**
 * Formula inputs for a new pricing version (prd.md §3.3). Model prices
 * and per-action budgets are carried over unchanged; editing those needs
 * provider price data and stays a deliberate, separate change.
 */
export function PricingEditor({ version, config, avgCostPaise }: PricingEditorProps) {
  const router = useRouter();
  const [markup, setMarkup] = useState(config.markupMultiplier);
  const [rate, setRate] = useState(String(config.usdToInrRate));
  const [creditValue, setCreditValue] = useState(String(config.creditValueInr));
  const [minimum, setMinimum] = useState(String(config.minimumCreditsPerAction));
  const [open, setOpen] = useState(false);

  const cv = Number(creditValue) || config.creditValueInr;
  const min = Number(minimum) || 0;
  const changed =
    markup !== config.markupMultiplier ||
    Number(rate) !== config.usdToInrRate ||
    cv !== config.creditValueInr ||
    min !== config.minimumCreditsPerAction;

  const preview = (["generation", "ats_scoring", "jd_analysis"] as const).map((a) => {
    const costInr = (avgCostPaise[a] ?? 0) / 100;
    const credits = Math.max(min, Math.ceil((costInr * markup) / cv));
    return { action: a, costInr, credits, inr: credits * cv, has: (avgCostPaise[a] ?? 0) > 0 };
  });

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        <AdminCard className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 font-display text-lg font-bold">Formula</h2>
            <Button className="h-10 px-4 text-sm" disabled={!changed} onClick={() => setOpen(true)}>
              Save as v{version + 1}
            </Button>
          </div>
          <code className="rounded-lg bg-surface-2 px-3.5 py-3 font-mono text-[13px]">
            credits = max( minimum, ceil( AI cost (₹) × markup ÷ credit value (₹{cv.toFixed(2)}) ) )
          </code>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            <span className="flex justify-between">
              Markup <span className="font-mono text-accent-text">{markup.toFixed(1)}×</span>
            </span>
            <input type="range" min={1} max={10} step={0.5} value={markup} onChange={(e) => setMarkup(Number(e.target.value))} className="accent-[var(--rp-accent)]" />
            <span className="text-xs font-normal text-text-2">Covers Razorpay fees, GST, hosting and margin.</span>
          </label>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }}>
            <Field label="USD → INR rate">
              <Input type="number" step="0.0001" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Credit value (₹)">
              <Input type="number" step="0.0001" min={0} value={creditValue} onChange={(e) => setCreditValue(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Minimum credits per action">
              <Input type="number" min={0} value={minimum} onChange={(e) => setMinimum(e.target.value)} className="font-mono" />
            </Field>
          </div>
        </AdminCard>

        <AdminCard className="overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="m-0 font-display text-lg font-bold">Per-action limits</h2>
          </div>
          <AdminTable head={["Action", "Model", "Prompt overhead", "Max output tokens"]} minWidth={560}>
            {Object.entries(config.actionSettings).map(([a, s]) => (
              <tr key={a}>
                <td className="font-semibold">{aiTypeLabel(a)}</td>
                <td className="font-mono text-[13px]">{s.model}</td>
                <td className="font-mono">{s.promptOverheadTokens.toLocaleString("en-IN")}</td>
                <td className="font-mono">{s.maxOutputTokens.toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </AdminTable>
          <div className="border-t border-border px-5 py-3 text-[13px] text-text-2">
            Model prices per 1M tokens (input / output, USD):{" "}
            {Object.entries(config.modelPrices)
              .map(([m, p]) => `${m} ${p.inputPerMillionUsd} / ${p.outputPerMillionUsd}`)
              .join(" · ")}
          </div>
        </AdminCard>
      </div>

      <aside className="flex flex-[1_1_280px] flex-col gap-3 rounded-xl bg-hero p-5 text-on-hero md:sticky md:top-24">
        <strong className="font-display text-lg">What users would pay</strong>
        <span className="text-[13px] text-on-hero-3">Using the last 14 days&apos; average AI cost per action</span>
        {preview.map((p) => (
          <div key={p.action} className="flex flex-col gap-1 border-t border-hero-line pt-3">
            <div className="flex justify-between text-sm">
              <span>{aiTypeLabel(p.action)}</span>
              <span className="font-mono text-on-hero-3">{p.has ? `AI cost ₹${p.costInr.toFixed(2)}` : "no data"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-lg font-semibold text-hero-accent">{p.credits.toLocaleString("en-IN")} cr</span>
              <span className="font-mono text-[13px] text-on-hero-2">
                = ₹{p.inr.toFixed(2)}
                {p.has ? ` · ${Math.round((1 - p.costInr / p.inr) * 100)}% margin` : ""}
              </span>
            </div>
          </div>
        ))}
        <span className={cn("text-xs leading-normal text-on-hero-3")}>
          Changes apply only to new actions after you save. Users always see the estimate before they confirm.
        </span>
      </aside>

      <ReasonDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Save pricing v${version + 1}?`}
        subtitle={`Markup ${markup.toFixed(1)}× · ₹${cv} per credit · minimum ${min}`}
        confirmLabel={`Save as v${version + 1}`}
        onConfirm={async (reason) => {
          try {
            await trpc.admin.pricing.createVersion.mutate({
              reason,
              config: { ...config, markupMultiplier: markup, usdToInrRate: Number(rate), creditValueInr: cv, minimumCreditsPerAction: min },
            });
            router.refresh();
          } catch (err) {
            throw new Error(trpcErrorMessage(err), { cause: err });
          }
        }}
      />
    </div>
  );
}
