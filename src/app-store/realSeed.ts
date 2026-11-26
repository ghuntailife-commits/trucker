// The demo build swaps this file for the agent's real sheet data (realdata/seed.json, made by scripts/real-seed.ts)
// when that file exists. It is never committed, so the repo and the tests only ever see made-up contacts.
import type { Contact, LogEvent } from '../rules/types';
import type { SaleRecord, NoSaleRecord } from '../rules/results';

export interface RealSeed { builtAt: number; goal: number; contacts: Contact[]; log: LogEvent[]; sales: SaleRecord[]; noSales: NoSaleRecord[] }
export const REAL_SEED: RealSeed | null = null;
