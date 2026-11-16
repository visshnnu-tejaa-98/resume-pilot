import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { UploadIcon } from "@/components/ui/icons";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { cn } from "@/lib/cn";
import { templates } from "@/content/marketing";

/*
 * Static illustrations for /how-it-works. They look like the real
 * controls but are decorative: inputs are read-only and nothing submits.
 */

export function DropzoneMock() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border-2 border-dashed border-border-strong bg-surface px-7 py-11 text-center">
      <UploadIcon size={40} className="text-link" />
      <strong className="text-[17px]">
        Drop your resume here, or <span className="text-link">browse</span>
      </strong>
      <span className="text-sm text-text-2">.pdf · .docx · .tex · .png · .jpg</span>
    </div>
  );
}

function MockCard({ children }: { children: ReactNode }) {
  return (
    <Card radius="lg" shadow aria-hidden="true" className="flex flex-col gap-3 p-6">
      {children}
    </Card>
  );
}

export function ReviewMock() {
  return (
    <MockCard>
      <div className="flex items-center justify-between">
        <strong className="text-[15px]">Work experience · Globex</strong>
        <Chip tone="warn" pill className="px-[9px] py-[3px] text-xs font-semibold">
          1 field to check
        </Chip>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Designation" size="sm">
          <Input fieldSize="sm" readOnly tabIndex={-1} defaultValue="Software Engineer" />
        </Field>
        <Field label="Start date" size="sm">
          <Input fieldSize="sm" readOnly tabIndex={-1} defaultValue="2021" className="border-2 border-warn-line bg-warn-bg" />
          <span className="text-xs font-medium text-warn">Only the year was found. Add the month?</span>
        </Field>
      </div>
    </MockCard>
  );
}

export function JobMock() {
  return (
    <MockCard>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company" size="sm">
          <Input fieldSize="sm" readOnly tabIndex={-1} defaultValue="Acme Corp" />
        </Field>
        <Field label="Job title" size="sm">
          <Input fieldSize="sm" readOnly tabIndex={-1} defaultValue="Frontend Engineer" />
        </Field>
      </div>
      <Field label="Job description" size="sm">
        <Textarea
          fieldSize="sm"
          rows={4}
          readOnly
          tabIndex={-1}
          className="resize-none"
          defaultValue="We're hiring a Frontend Engineer with 4+ years of React and TypeScript to build our design system…"
        />
      </Field>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[13px] font-medium text-text-2">12,480 / 30,000</span>
        <span className="flex h-10 items-center rounded-md bg-accent px-[18px] text-[15px] font-bold text-on-accent">Proceed</span>
      </div>
    </MockCard>
  );
}

export function ConfirmMock() {
  return (
    <div aria-hidden="true" className="flex justify-center rounded-[14px] bg-scrim p-7">
      <div className="flex w-full max-w-[420px] flex-col rounded-xl border border-border bg-surface shadow-modal">
        <div className="flex flex-col gap-1 px-[22px] pt-[18px]">
          <strong className="font-display text-[19px]">Generate tailored resume?</strong>
          <span className="text-[13px] text-text-2">Acme Corp · Frontend Engineer</span>
        </div>
        <div className="flex flex-col gap-2 px-[22px] py-4 text-sm">
          <div className="flex justify-between">
            <span>Estimate</span>
            <span className="font-mono font-semibold">up to 640</span>
          </div>
          <div className="flex justify-between text-text-2">
            <span>Balance after</span>
            <span className="font-mono">10,500 → 9,860</span>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border px-[22px] py-3.5">
          <span className="flex h-10 items-center px-3.5 text-sm font-semibold text-link">Cancel</span>
          <span className="flex h-10 items-center rounded-md bg-accent px-4 text-sm font-bold text-on-accent">Confirm and generate</span>
        </div>
      </div>
    </div>
  );
}

export function ScoreMock() {
  return (
    <div
      className="grid gap-3.5"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
    >
      <Card className="flex flex-col items-center gap-2 p-5">
        <ScoreRing score={82} size={104} />
        <span className="text-[13px] text-text-2">Estimated ATS score</span>
      </Card>
      <Card className="flex flex-col gap-2.5 p-5">
        <span className="text-[13px] font-semibold">Templates</span>
        {templates.map((tp, i) => (
          <span
            key={tp.name}
            className={cn(
              "flex justify-between rounded-md border px-2.5 py-1.5 text-sm",
              i === 0 ? "border-accent bg-accent-tint" : "border-border",
            )}
          >
            <span>{tp.name}</span>
            <span className="text-xs text-text-2">{tp.tag}</span>
          </span>
        ))}
      </Card>
    </div>
  );
}
