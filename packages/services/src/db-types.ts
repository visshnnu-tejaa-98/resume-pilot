import type { Database } from "@resume-pilot/database";

/** A Drizzle transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything that can run queries: the database or an open transaction. */
export type Queryable = Database | Tx;
