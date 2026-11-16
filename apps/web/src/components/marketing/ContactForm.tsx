"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { CheckIcon } from "@/components/ui/icons";
import { contactSchema, type ContactInput } from "@/lib/contact-schema";
import { contactTopics } from "@/content/marketing";

interface ContactFormProps {
  /**
   * Delivers the message. There's no support-inbox endpoint yet, so the
   * page doesn't pass one and the form reports that honestly instead of
   * pretending to send.
   */
  onSubmit?: (values: ContactInput) => Promise<void>;
}

/** "Send a message" card on /contact. */
export function ContactForm({ onSubmit }: ContactFormProps) {
  const [status, setStatus] = useState<"idle" | "sent" | "unavailable" | "error">("idle");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", topic: contactTopics[0], message: "", paymentId: "" },
  });

  const submit = handleSubmit(async (values) => {
    if (!onSubmit) {
      setStatus("unavailable");
      return;
    }
    try {
      await onSubmit(values);
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  });

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-[18px] rounded-2xl border border-border bg-surface p-8 shadow-card max-sm:p-5"
    >
      <h2 className="m-0 font-display text-[22px] font-bold">Send a message</h2>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
        <Field label="Name" error={errors.name?.message}>
          <Input autoComplete="name" invalid={!!errors.name} {...register("name")} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" placeholder="you@example.com" invalid={!!errors.email} {...register("email")} />
        </Field>
      </div>
      <Field label="Topic">
        <Select {...register("topic")}>
          {contactTopics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </Field>
      <Field label="Message" error={errors.message?.message}>
        <Textarea rows={6} className="resize-y" invalid={!!errors.message} {...register("message")} />
      </Field>
      <Field label="Payment ID" hint="(optional)" error={errors.paymentId?.message}>
        <Input placeholder="pay_" className="font-mono font-medium" invalid={!!errors.paymentId} {...register("paymentId")} />
      </Field>
      <Button type="submit" size="lg" disabled={isSubmitting} className="h-12">
        {isSubmitting ? "Sending…" : "Send message"}
      </Button>
      {status === "sent" ? (
        <Callout tone="good" role="status" icon={<CheckIcon size={20} />}>
          Thanks — your message is on its way. We&apos;ll reply by email.
        </Callout>
      ) : null}
      {status === "unavailable" || status === "error" ? (
        <Callout tone="warn" role="alert">
          We couldn&apos;t send this from the form right now. Please email us directly instead.
        </Callout>
      ) : null}
      <span className="text-[13px] text-text-2">We use your email only to reply to this message.</span>
    </form>
  );
}
