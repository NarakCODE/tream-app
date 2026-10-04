import { companies } from '../schema/company.schema';
import type { DemoContext } from './context';

export const companyNames = [
  'Cedar Health',
  'Harbor Logistics',
  'Summit Learning',
  'Juniper Retail',
  'Atlas Finance',
  'Willow Hospitality',
  'Beacon Energy',
  'Oakridge Manufacturing',
  'Riverbend Media',
  'Meridian Travel',
  'Pinecrest Foods',
  'Lighthouse Studio',
];

export async function seedCompanies(ctx: DemoContext) {
  await ctx.tx.insert(companies).values(
    companyNames.map((name, i) => ({
      id: ctx.id(`company:${i}`),
      workspaceId: ctx.workspaceId,
      name,
      domain: `${name.toLowerCase().replaceAll(' ', '-')}.example`,
      industry: [
        'Healthcare',
        'Logistics',
        'Education',
        'Retail',
        'Financial services',
        'Hospitality',
      ][i % 6],
      createdAt: ctx.date(-45 + i),
      updatedAt: ctx.date(-i % 5),
    })),
  );
}
