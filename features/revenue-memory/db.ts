import { Pool } from "pg";

let pool: Pool | null = null;

export function getRevenueMemoryPool(): Pool {
  const connectionString = process.env.COCKROACH_DATABASE_URL;
  if (!connectionString) {
    throw new Error("COCKROACH_DATABASE_URL is required for revenue memory tools");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: Number(process.env.COCKROACH_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return pool;
}

export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
