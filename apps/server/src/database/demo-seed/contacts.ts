import { contacts } from '../schema/contact.schema';
import { companyNames } from './companies';
import type { DemoContext } from './context';

const contactNames = [
  'Maya Chen',
  'Oliver Brooks',
  'Amara Okafor',
  'Lucas Martin',
  'Sofia Patel',
  'Ethan Wilson',
  'Zoe Garcia',
  'Noah Kim',
  'Isabella Rossi',
  'Leo Anderson',
  'Ava Nguyen',
  'Daniel Silva',
  'Chloe Bennett',
  'Samir Hassan',
  'Grace Evans',
  'Theo Johnson',
];

export async function seedContacts(ctx: DemoContext) {
  await ctx.tx.insert(contacts).values(
    contactNames.map((name, i) => ({
      id: ctx.id(`contact:${i}`),
      workspaceId: ctx.workspaceId,
      companyId: ctx.id(`company:${i % 12}`),
      firstName: name.split(' ')[0],
      lastName: name.split(' ')[1],
      email: `${name.toLowerCase().replaceAll(' ', '.')}@${companyNames[i % 12]!.toLowerCase().replaceAll(' ', '-')}.example`,
      phone: `+1202555${String(100 + i).padStart(4, '0')}`,
      status: 'LEAD' as const,
      attributes: {
        title: [
          'Operations Director',
          'Product Lead',
          'Customer Experience Manager',
          'IT Director',
        ][i % 4],
        source: i % 2 ? 'Launch webinar' : 'Customer referral',
        interests: ['Customer portal', 'Mobile app'],
        accountOwnerId: ctx.member(i % 6),
      },
      createdAt: ctx.date(-32 + i),
      updatedAt: ctx.date(-i % 4),
    })),
  );
}
