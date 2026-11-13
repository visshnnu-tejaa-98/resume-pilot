import { createDatabase, type Database } from "@resume-pilot/database";

let instance: Database | undefined;

/** One connection pool per server process. */
export function getDb(): Database {
  if (!instance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    instance = createDatabase(connectionString);
  }
  return instance;
}
