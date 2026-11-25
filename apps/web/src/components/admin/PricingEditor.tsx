"use client";

import { pricingConfigInputSchema, type ActionSettings, type ModelPrices, type PricingConfigInput } from "@resume-pilot/validators";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
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
 * Inputs for a new pricing version (prd.md §3.3): the credit formula,
 * the model each paid action uses with its token budgets, and per-model
 * provider prices. Every action's model must have a price row — the same
 * rule `pricingConfigInputSchema` enforces on the server.
 */
export function PricingEditor({ version, config, avgCostPaise }: PricingEditorProps) {
  const router = useRouter();
  const [markup, setMarkup] = useState(config.markupMultiplier);
  const [rate, setRate] = useState(String(config.usdToInrRate));
  const [creditValue, setCreditValue] = useState(String(config.creditValueInr));
  const [minimum, setMinimum] = useState(String(config.minimumCreditsPerAction));
  const [open, setOpen] = useState(false);
  const [prices, setPrices] = useState<ModelPrices>(config.modelPrices);
  const [actions, setActions] = useState<ActionSettings>(config.actionSettings);
  const [newModel, setNewModel] = useState({ name: "", input: "", output: "" });

  const cv = Number(creditValue) || config.creditValueInr;
  const min = Number(minimum) || 0;
  const changed =
    markup !== config.markupMultiplier ||
    Number(rate) !== config.usdToInrRate ||
    cv !== config.creditValueInr ||
    min !== config.minimumCreditsPerAction ||
    JSON.stringify(prices) !== JSON.stringify(config.modelPrices) ||
    JSON.stringify(actions) !== JSON.stringify(config.actionSettings);

  const nextConfig: PricingConfigInput = {
    ...config,
    modelPrices: prices,
    actionSettings: actions,
    markupMultiplier: markup,
    usdToInrRate: Number(rate),
    creditValueInr: cv,
    minimumCreditsPerAction: min,
  };
  const parsed = pricingConfigInputSchema.safeParse(nextConfig);
  const invalidMsg = parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid config");
  const usedModels = new Set(Object.values(actions).map((a) => a.model));

  const setAction = (a: keyof ActionSettings, patch: Partial<ActionSettings[keyof ActionSettings]>) =>
    setActions((prev) => ({ ...prev, [a]: { ...prev[a], ...patch } }));
  const setPrice = (m: string, patch: Partial<ModelPrices[string]>) =>
    setPrices((prev) => ({ ...prev, [m]: { ...prev[m]!, ...patch } }));
  const addModel = () => {
    const name = newModel.name.trim();
    if (!name || name in prices) return;
    setPrices((prev) => ({ ...prev, [name]: { inputPerMillionUsd: Number(newModel.input) || 0, outputPerMillionUsd: Number(newModel.output) || 0 } }));
    setNewModel({ name: "", input: "", output: "" });
  };
  const removeModel = (m: string) =>
    setPrices((prev) => {
      const { [m]: _removed, ...rest } = prev;
      return rest;
    });

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
            <Button className="h-10 px-4 text-sm" disabled={!changed || !!invalidMsg} onClick={() => setOpen(true)}>
              Save as v{version + 1}
            </Button>
          </div>
          <code className="rounded-lg bg-surface-2 px-3.5 py-3 font-mono text-[13px]">
            credits = max( minimum, ceil( AI cost (₹) × markup ÷ credit value (₹{cv.toFixed(2)}) ) )
          </code>
          {changed && invalidMsg ? (
            <span role="alert" className="text-xs font-medium text-crit">
              {invalidMsg}
            </span>
          ) : null}
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
          <AdminTable head={["Action", "Model", "Prompt overhead", "Max output tokens"]} minWidth={640}>
            {(Object.keys(actions) as (keyof ActionSettings)[]).map((a) => (
              <tr key={a}>
                <td className="font-semibold">{aiTypeLabel(a)}</td>
                <td>
                  <Select fieldSize="sm" aria-label={`${aiTypeLabel(a)} model`} value={actions[a].model} onChange={(e) => setAction(a, { model: e.target.value })} className="font-mono text-[13px]">
                    {Object.keys(prices).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    {actions[a].model in prices ? null : <option value={actions[a].model}>{actions[a].model} (no price)</option>}
                  </Select>
                </td>
                <td>
                  <Input fieldSize="sm" type="number" min={0} aria-label={`${aiTypeLabel(a)} prompt overhead`} value={actions[a].promptOverheadTokens} onChange={(e) => setAction(a, { promptOverheadTokens: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} className="font-mono" />
                </td>
                <td>
                  <Input fieldSize="sm" type="number" min={1} aria-label={`${aiTypeLabel(a)} max output tokens`} value={actions[a].maxOutputTokens} onChange={(e) => setAction(a, { maxOutputTokens: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} className="font-mono" />
                </td>
              </tr>
            ))}
          </AdminTable>
        </AdminCard>

        <AdminCard className="overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="m-0 font-display text-lg font-bold">Model prices</h2>
            <span className="text-[13px] text-text-2">USD per 1M tokens — copy from the provider&apos;s pricing page. These drive estimates and captured cost.</span>
          </div>
          <AdminTable head={["Model", "Input", "Cached input", "Output", ""]} minWidth={640}>
            {Object.entries(prices).map(([m, p]) => (
              <tr key={m}>
                <td className="font-mono text-[13px] font-semibold">{m}</td>
                <td>
                  <Input fieldSize="sm" type="number" step="0.001" min={0} aria-label={`${m} input price`} value={p.inputPerMillionUsd} onChange={(e) => setPrice(m, { inputPerMillionUsd: Number(e.target.value) || 0 })} className="font-mono" />
                </td>
                <td>
                  <Input fieldSize="sm" type="number" step="0.001" min={0} placeholder="= input" aria-label={`${m} cached input price`} value={p.cachedInputPerMillionUsd ?? ""} onChange={(e) => setPrice(m, { cachedInputPerMillionUsd: e.target.value === "" ? undefined : Number(e.target.value) || 0 })} className="font-mono" />
                </td>
                <td>
                  <Input fieldSize="sm" type="number" step="0.001" min={0} aria-label={`${m} output price`} value={p.outputPerMillionUsd} onChange={(e) => setPrice(m, { outputPerMillionUsd: Number(e.target.value) || 0 })} className="font-mono" />
                </td>
                <td className="text-right">
                  <Button variant="ghost" className="h-9 px-2 text-sm" disabled={usedModels.has(m)} title={usedModels.has(m) ? "In use by an action" : undefined} onClick={() => removeModel(m)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <Input fieldSize="sm" placeholder="e.g. gpt-5-mini" aria-label="New model name" value={newModel.name} onChange={(e) => setNewModel((n) => ({ ...n, name: e.target.value }))} className="font-mono" />
              </td>
              <td>
                <Input fieldSize="sm" type="number" step="0.001" min={0} placeholder="0.25" aria-label="New model input price" value={newModel.input} onChange={(e) => setNewModel((n) => ({ ...n, input: e.target.value }))} className="font-mono" />
              </td>
              <td />
              <td>
                <Input fieldSize="sm" type="number" step="0.001" min={0} placeholder="2.00" aria-label="New model output price" value={newModel.output} onChange={(e) => setNewModel((n) => ({ ...n, output: e.target.value }))} className="font-mono" />
              </td>
              <td className="text-right">
                <Button variant="outline" className="h-9 px-3 text-sm" disabled={!newModel.name.trim() || newModel.name.trim() in prices} onClick={addModel}>
                  Add model
                </Button>
              </td>
            </tr>
          </AdminTable>
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
        subtitle={`Markup ${markup.toFixed(1)}× · ₹${cv} per credit · minimum ${min} · models: ${[...usedModels].join(", ")}`}
        confirmLabel={`Save as v${version + 1}`}
        onConfirm={async (reason) => {
          try {
            await trpc.admin.pricing.createVersion.mutate({
              reason,
              config: nextConfig,
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
