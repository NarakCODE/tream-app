import {
  dynamicDatabases,
  dynamicFields,
  dynamicFieldType,
  dynamicRecords,
} from '../schema/dynamic-data.schema';
import type { DemoContext } from './context';

const names = [
  'Pilot customer research',
  'Launch readiness checklist',
  'Mobile device lab',
  'Customer feedback library',
  'Partner enablement',
  'Security review register',
  'Launch budget',
  'Content production',
];
const options = ['planned', 'active', 'complete'];

/** These tables are migrated, but the dynamic-data HTTP module is not mounted. */
export async function seedDynamicData(ctx: DemoContext) {
  await ctx.tx.insert(dynamicDatabases).values(
    names.map((name, i) => ({
      id: ctx.id(`database:${i}`),
      workspaceId: ctx.workspaceId,
      name,
      icon: [
        'users',
        'check-square',
        'smartphone',
        'message-square',
        'handshake',
        'shield',
        'wallet',
        'file-text',
      ][i],
      description: `Northstar ${name.toLowerCase()} supporting the customer portal and mobile launch.`,
      createdAt: ctx.date(-35 + i),
      updatedAt: ctx.now,
    })),
  );
  for (let database = 0; database < names.length; database++) {
    const relationDatabase = (database + 1) % names.length;
    const fields = dynamicFieldType.enumValues.map((type, index) => ({
      id: ctx.id(`field:${database}:${index}`),
      databaseId: ctx.id(`database:${database}`),
      name: {
        TEXT: 'Title',
        LONG_TEXT: 'Research notes',
        NUMBER: 'Effort points',
        CURRENCY: 'Budget',
        BOOLEAN: 'Approved',
        DATE: 'Due date',
        DATETIME: 'Next review',
        EMAIL: 'Contact email',
        PHONE: 'Contact phone',
        URL: 'Reference',
        SELECT: 'Priority',
        MULTI_SELECT: 'Channels',
        STATUS: 'Progress',
        USER: 'Owner',
        RELATION: 'Related work',
        CREATED_AT: 'Created',
        UPDATED_AT: 'Updated',
      }[type],
      key: type.toLowerCase(),
      type,
      isRequired: type === 'TEXT',
      config:
        type === 'CURRENCY'
          ? { currency: 'USD', precision: 2 }
          : type === 'RELATION'
            ? {
                databaseId: ctx.id(`database:${relationDatabase}`),
                multiple: true,
              }
            : type === 'SELECT'
              ? { options: ['High', 'Medium', 'Low'] }
              : type === 'MULTI_SELECT'
                ? { options: ['Portal', 'Mobile', 'Support'] }
                : type === 'STATUS'
                  ? {
                      options: options.map((key) => ({
                        id: key,
                        label: key.charAt(0).toUpperCase() + key.slice(1),
                      })),
                    }
                  : type === 'NUMBER'
                    ? { min: 0, max: 100 }
                    : {},
      createdAt: ctx.date(-30),
      updatedAt: ctx.now,
    }));
    await ctx.tx.insert(dynamicFields).values(fields);
    await ctx.tx.insert(dynamicRecords).values(
      Array.from({ length: 12 }, (_, i) => ({
        id: ctx.id(`record:${database}:${i}`),
        databaseId: ctx.id(`database:${database}`),
        workspaceId: ctx.workspaceId,
        createdBy: ctx.user(i % 6),
        values: {
          text: `${['Portal accessibility', 'Mobile onboarding', 'Account provisioning', 'Customer migration', 'Support handoff', 'Usage reporting', 'Device compatibility', 'Security assurance', 'Partner training', 'Launch messaging', 'Release coordination', 'Customer retention'][i]} — ${names[database]}`,
          long_text:
            'Capture the acceptance evidence, customer feedback, and next decision needed before the Northstar launch review.',
          number: 2 + (i % 5) * 3,
          currency: 500 + database * 100 + i * 75,
          boolean: i % 3 === 0,
          date: ctx
            .date(i < 2 ? -2 : 5 + i)
            .toISOString()
            .slice(0, 10),
          datetime: ctx.date(i + 1).toISOString(),
          email: `launch.contact.${i}@northstar.example`,
          phone: `+1202555${String(200 + i).padStart(4, '0')}`,
          url: `https://northstar.example/launch/${i + 1}`,
          select: ['High', 'Medium', 'Low'][i % 3],
          multi_select: i % 2 ? ['Portal', 'Support'] : ['Mobile'],
          status: options[i % 3],
          user: i === 4 ? null : ctx.user(i % 6),
          relation: [ctx.id(`record:${relationDatabase}:${i}`)],
          created_at: ctx.date(-20 + i).toISOString(),
          updated_at: ctx.date(-i % 3).toISOString(),
        },
        createdAt: ctx.date(-20 + i),
        updatedAt: ctx.date(-i % 3),
        deletedAt: i === 11 ? ctx.date(-1) : null,
      })),
    );
  }
}
