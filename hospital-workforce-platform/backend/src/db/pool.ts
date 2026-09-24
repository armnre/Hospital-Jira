import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import type { Config } from "../config/env";

// DATE columns are returned as 'YYYY-MM-DD' strings (no timezone shifting); NUMERIC as numbers.
types.setTypeParser(1082, (v: string) => v);
types.setTypeParser(1700, (v: string) => Number.parseFloat(v));

/** Anything that can run a query: the pool or a transaction client. */
export interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<R extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}

export function createPool(config: Pick<Config, "databaseUrl">, max = 10): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max,
    // All date arithmetic ("today") is done in UTC — identical to the backend rules engine.
    options: "-c timezone=UTC",
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
}

export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
