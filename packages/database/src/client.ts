import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * One connection pool per process. `apps/web` and `apps/worker` each
 * call this once at startup; nothing here depends on either app, so
 * this package stays a plain library.
 */
export function createDatabase(connectionString: string): Database {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}
