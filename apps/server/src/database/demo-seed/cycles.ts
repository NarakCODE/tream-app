import { cycles } from '../schema/work-management.schema';
import type { DemoContext } from './context';

export async function seedCycles(ctx: DemoContext): Promise<void> {
  for (let t = 0; t < 8; t++) {
    await ctx.tx.insert(cycles).values(
      Array.from({ length: 4 }, (_, i) => ({
        id: ctx.cycle(t, i),
        teamId: ctx.team(t),
        workspaceId: ctx.workspaceId,
        number: i + 1,
        name: [
          'Foundation & discovery',
          'Customer pilot',
          'Launch hardening',
          'Superseded release plan',
        ][i]!,
        startsAt: ctx.date(-21 + i * 14),
        endsAt: ctx.date(-7 + i * 14),
        startedAt: i < 2 ? ctx.date(-21 + i * 14) : null,
        createdAt: ctx.date(-35),
        updatedAt: ctx.now,
        // Terminal states are set after historical issues are inserted, as in the real lifecycle.
      })),
    );
  }
}
