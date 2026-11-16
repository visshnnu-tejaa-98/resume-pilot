import { z } from "zod";
import { contactTopics } from "@/content/marketing";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.email("Enter a valid email address"),
  topic: z.enum(contactTopics),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(5000),
  paymentId: z
    .string()
    .trim()
    .refine((v) => v === "" || /^pay_[A-Za-z0-9]+$/.test(v), "Razorpay payment IDs start with pay_"),
});

export type ContactInput = z.infer<typeof contactSchema>;
