import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

let poolInstance: Pool | undefined;
let dbInstance: NodePgDatabase | undefined;

/**
 * The pool is built on first query rather than at import time. `next build`
 * imports every route module to collect page data, and DATABASE_URL is not
 * set during the build on Vercel — connecting eagerly there would fail the
 * build. Every route is `force-dynamic` and handles its own query errors, so
 * a missing DATABASE_URL surfaces per request instead.
 */
export function getPool(): Pool {
  if (poolInstance) {
    return poolInstance;
  }

  const cached = globalForDb.__arenaNextJsPostgresqlPool;
  if (cached) {
    poolInstance = cached;
    return cached;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  poolInstance = new Pool({
    connectionString: databaseUrl,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = poolInstance;
  }

  return poolInstance;
}

function getDb(): NodePgDatabase {
  dbInstance ??= drizzle(getPool());
  return dbInstance;
}

function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = resolve();
      const value = Reflect.get(target, property) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
    has: (_target, property) => Reflect.has(resolve(), property),
  });
}

export const pool = lazy(getPool);
export const db = lazy(getDb);
