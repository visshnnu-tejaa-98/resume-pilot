import { describe, expect, it } from "vitest";
import { createContext } from "./context";
import { appRouter } from "./router";

describe("appRouter", () => {
  const caller = appRouter.createCaller(createContext());

  it("health returns ok", async () => {
    const result = await caller.health();
    expect(result.status).toBe("ok");
  });

  it("ping echoes input and includes a credits estimate from @resume-pilot/credits", async () => {
    const result = await caller.ping({ message: "hello" });
    expect(result.echo).toBe("hello");
    expect(result.estimate).toEqual({ action: "ping", estimatedCredits: 0 });
  });

  it("ping rejects an empty message via @resume-pilot/validators", async () => {
    await expect(caller.ping({ message: "" })).rejects.toThrow();
  });
});
