import { tasks } from '../schema/task.schema';
import type { DemoContext } from './context';

const taskTitles = [
  'Review portal pilot success criteria',
  'Schedule mobile preview with operations',
  'Share accessibility audit results',
  'Prepare onboarding workshop agenda',
  'Confirm procurement timeline',
  'Follow up on security questionnaire',
  'Gather feedback from support managers',
  'Present launch adoption dashboard',
  'Send mobile rollout proposal',
  'Agree pilot customer interview schedule',
  'Review SSO deployment requirements',
  'Coordinate migration readiness meeting',
  'Confirm executive sponsor for phased customer portal rollout across regional operations and mobile field teams',
  'Finalize success metrics and reporting cadence',
  'Close pilot feedback loop',
  'Retire superseded discovery notes',
];

export async function seedTasks(ctx: DemoContext) {
  await ctx.tx.insert(tasks).values(
    taskTitles.map((title, i) => ({
      id: ctx.id(`crm-task:${i}`),
      workspaceId: ctx.workspaceId,
      contactId: ctx.id(`contact:${i}`),
      dealId: ctx.id(`deal:${i % 12}`),
      assigneeId: i === 4 ? null : ctx.member(i % 6),
      title,
      status: (['TODO', 'IN_PROGRESS', 'DONE'] as const)[i % 3],
      dueDate: ctx.date(i < 2 ? -2 : 2 + i),
      createdAt: ctx.date(-20 + i),
      updatedAt: ctx.date(-i % 4),
      deletedAt: i === 15 ? ctx.date(-1) : null,
    })),
  );
}
