import { z } from "zod";

/**
 * Placeholder schema to prove the package is wired up end to end.
 * Real schemas (resume 2.0, JD analysis, ATS, credits) land in
 * tasks/todo/m4-schema-extraction and friends.
 */
export const pingInputSchema = z.object({
  message: z.string().min(1).max(200),
});

export type PingInput = z.infer<typeof pingInputSchema>;

export * from "./pricing";

export * from "./wallet";

export * from "./codes";
