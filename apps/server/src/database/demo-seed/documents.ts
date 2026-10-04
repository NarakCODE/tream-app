import { documents } from '../schema';
import type { DemoContext } from './context';

const titles = [
  'Portal launch brief',
  'Customer interview synthesis',
  'Mobile offline behavior',
  'Accessibility acceptance checklist',
  'Payment reconciliation runbook',
  'Support handover guide',
  'Launch communications plan',
  'API error handling conventions',
  'Design critique notes',
  'Release readiness checklist',
  'Partner integration guide',
  'Security review decisions',
  'Customer onboarding measurement plan',
  'Incident response rehearsal',
  'Retired reporting migration notes',
  'Superseded launch draft',
];

export async function seedDocuments(ctx: DemoContext) {
  await ctx.tx.insert(documents).values(
    titles.map((title, i) => ({
      id: ctx.id(`document:${i}`),
      workspaceId: ctx.workspaceId,
      title,
      authorId: ctx.member(i % 6),
      projectId: i % 3 === 0 ? ctx.project(i % 12) : null,
      teamId: i % 3 === 1 ? ctx.team(i % 8) : null,
      initiativeId: i % 3 === 2 ? ctx.id(`initiative:${i % 6}`) : null,
      body: `# ${title}\n\n## Purpose\nNorthstar is preparing a customer portal and mobile companion launch. This document records the decisions and acceptance criteria agreed by product, engineering, and customer success.\n\n## Customer outcome\nA customer can find their account, understand their next action, and complete it confidently on desktop or mobile. Failed requests preserve entered information and explain how to retry.\n\n## Delivery checklist\n- Validate the workflow with three pilot customers.\n- Confirm keyboard navigation, accessible labels, and narrow-screen behavior.\n- Review failure recovery and monitoring with the platform team.\n- Publish support guidance before the release checkpoint.\n\n## Decisions\nWe will release to the pilot cohort first, monitor completion rates and support volume for 48 hours, then expand access. Billing approval is a launch gate; content and accessibility work can continue in parallel.\n\n## Follow-up\nThe owner will share a progress update at the next weekly readiness review. Open questions are tracked as issues in the linked delivery plan.`,
      archivedAt: i === 14 ? ctx.date(-3) : null,
      deletedAt: i === 15 ? ctx.date(-1) : null,
      revision: (i % 4) + 1,
      createdAt: ctx.date(-24 + i),
      updatedAt: ctx.date(-i / 4),
    })),
  );
}
