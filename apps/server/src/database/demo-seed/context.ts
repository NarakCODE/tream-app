import { createHash } from 'node:crypto';
import type { DatabaseTransaction } from '../transaction';

export interface DemoContext {
  tx: DatabaseTransaction;
  namespace: string;
  workspaceId: string;
  now: Date;
  id(key: string): string;
  date(days: number): Date;
  user(index: number): string;
  member(index: number): string;
  team(index: number): string;
  project(index: number): string;
  issue(index: number): string;
  cycle(teamIndex: number, index: number): string;
}

export function createDemoContext(
  tx: DatabaseTransaction,
  namespace: string,
  workspaceId: string,
  now: Date,
): DemoContext {
  const id = (key: string) => {
    const hex = createHash('sha256')
      .update(`${namespace}:${key}`)
      .digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  return {
    tx,
    namespace,
    workspaceId,
    now,
    id,
    date: (days) => new Date(now.getTime() + days * 86_400_000),
    user: (i) => id(`user:${i}`),
    member: (i) => id(`member:${i}`),
    team: (i) => id(`team:${i}`),
    project: (i) => id(`project:${i}`),
    issue: (i) => id(`issue:${i}`),
    cycle: (teamIndex, i) => id(`cycle:${teamIndex}:${i}`),
  };
}
