import { dealContacts, deals } from '../schema/deal.schema';
import { companyNames } from './companies';
import type { DemoContext } from './context';

export async function seedDeals(ctx: DemoContext) {
  await ctx.tx.insert(deals).values(
    companyNames.map((name, i) => ({
      id: ctx.id(`deal:${i}`),
      workspaceId: ctx.workspaceId,
      companyId: ctx.id(`company:${i}`),
      title: `${name} — ${i % 2 ? 'mobile field team rollout' : 'customer portal pilot'}`,
      amount: String(12000 + i * 3750),
      currency: i % 4 === 0 ? 'EUR' : 'USD',
      stage: 'DISCOVERY' as const,
      closeDate: ctx.date(i < 2 ? -3 + i : 5 + i * 3),
      createdAt: ctx.date(-28 + i),
      updatedAt: ctx.date(-i % 3),
    })),
  );
  await ctx.tx.insert(dealContacts).values(
    Array.from({ length: 16 }, (_, i) => ({
      workspaceId: ctx.workspaceId,
      dealId: ctx.id(`deal:${i % 12}`),
      contactId: ctx.id(`contact:${i}`),
      createdAt: ctx.date(-16 + i),
    })),
  );
}
