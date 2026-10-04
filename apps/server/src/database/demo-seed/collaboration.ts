import {
  commentReactions,
  comments,
  events,
  issueActivity,
  issueLabels,
  issueSubscribers,
  issueTemplates,
  labels,
  projectLabels,
  projectSubscribers,
} from '../schema';
import type { DemoContext } from './context';

const labelNames = [
  'Customer feedback',
  'Accessibility',
  'Launch blocker',
  'Mobile',
  'Performance',
  'Security',
  'Billing',
  'Documentation',
  'Design polish',
  'Infrastructure',
  'Needs investigation',
  'Legacy migration',
];
const colors = [
  '#2563eb',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#16a34a',
  '#9333ea',
  '#ca8a04',
  '#64748b',
  '#db2777',
  '#0d9488',
  '#ea580c',
  '#475569',
];
const discussion = [
  'The pilot customer walkthrough confirmed the proposed flow. Please keep the account summary visible while we validate the billing dependency.',
  'Could you review the acceptance criteria before our readiness meeting? The recovery path needs to preserve entered information.',
  'I reproduced the issue on a slow mobile connection. Retrying safely resolves it; I added the scenario to the release checklist.',
  'Design review is complete. The narrower layout improves scanning, and the keyboard focus order now follows the visual reading order.',
  'The sandbox vendor approved our request. We can resume the integration work without changing the launch sequence.',
  'Please confirm whether the support guide covers expired sessions. We should explain the next action without losing customer context.',
  'The latest build meets the agreed latency budget. We will keep the dashboard visible during the pilot rollout.',
  'Customer success reviewed the copy and suggested naming the action explicitly. The updated text is ready for implementation.',
  'QA checked the desktop, tablet, and mobile workflows. One follow-up remains for keyboard-only navigation in the dialog.',
  'Please review the updated release notes. I have included the known limitations and escalation contact for the pilot cohort.',
  'The dependency is now resolved. The remaining verification can run in parallel with the documentation review.',
  'We agreed to keep this change in the launch scope. The team will confirm readiness after the production rehearsal.',
];

export async function seedCollaboration(ctx: DemoContext) {
  await ctx.tx.insert(labels).values(
    labelNames.map((name, i) => ({
      id: ctx.id(`label:${i}`),
      workspaceId: ctx.workspaceId,
      name,
      color: colors[i]!,
      description: `Work related to ${name.toLowerCase()} across Northstar's portal and mobile launch.`,
      groupName: i < 6 ? 'Delivery' : 'Operations',
      archivedAt: i === 11 ? ctx.date(-4) : null,
      createdAt: ctx.date(-32),
      updatedAt: ctx.date(-2),
    })),
  );
  for (let i = 0; i < 70; i++) {
    await ctx.tx.insert(issueLabels).values({
      id: ctx.id(`issue-label:${i}`),
      workspaceId: ctx.workspaceId,
      issueId: ctx.issue(i),
      labelId: ctx.id(`label:${i % 11}`),
      createdAt: ctx.date(-15),
      updatedAt: ctx.date(-15),
    });
    await ctx.tx.insert(issueSubscribers).values({
      id: ctx.id(`issue-subscriber:${i}:0`),
      workspaceId: ctx.workspaceId,
      issueId: ctx.issue(i),
      membershipId: ctx.member(0),
      createdAt: ctx.date(-15),
      updatedAt: ctx.date(-15),
    });
  }
  for (let i = 0; i < 12; i++) {
    if (i === 10) continue;
    await ctx.tx.insert(projectLabels).values({
      id: ctx.id(`project-label:${i}`),
      workspaceId: ctx.workspaceId,
      projectId: ctx.project(i),
      labelId: ctx.id(`label:${i % 11}`),
      createdAt: ctx.date(-21),
      updatedAt: ctx.date(-21),
    });
    await ctx.tx.insert(projectSubscribers).values({
      id: ctx.id(`project-subscriber:${i}:0`),
      workspaceId: ctx.workspaceId,
      projectId: ctx.project(i),
      membershipId: ctx.member(0),
      createdAt: ctx.date(-21),
      updatedAt: ctx.date(-21),
    });
  }
  for (let i = 0; i < 40; i++) {
    const target =
      i < 24
        ? { issueId: ctx.issue(i < 12 ? 0 : i - 11) }
        : i < 30
          ? { projectId: ctx.project(i - 24) }
          : i < 34
            ? { projectUpdateId: ctx.id(`project-update:${i - 30}:0`) }
            : i < 38
              ? { initiativeId: ctx.id(`initiative:${i - 34}`) }
              : { initiativeUpdateId: ctx.id(`initiative-update:${i - 38}:1`) };
    await ctx.tx.insert(comments).values({
      id: ctx.id(`comment:${i}`),
      workspaceId: ctx.workspaceId,
      ...target,
      authorId: ctx.member(i % 6),
      body: discussion[i % discussion.length]!,
      mentionedMembershipIds: i % 4 === 1 ? [ctx.member(0)] : [],
      parentCommentId:
        i > 0 && i < 12 && i % 3 === 2 ? ctx.id(`comment:${i - 1}`) : null,
      editedAt: i === 3 ? ctx.date(-1) : null,
      revision: i === 3 ? 2 : 1,
      deletedAt: i === 11 ? ctx.date(-1) : null,
      createdAt: ctx.date(-8 + i / 6),
      updatedAt: ctx.date(-8 + i / 6),
    });
  }
  await ctx.tx.insert(commentReactions).values(
    Array.from({ length: 20 }, (_, i) => ({
      id: ctx.id(`reaction:${i}`),
      workspaceId: ctx.workspaceId,
      commentId: ctx.id(`comment:${i % 10}`),
      membershipId: ctx.member(i < 10 ? 0 : 2),
      emoji: i % 2 ? '👍' : '🎉',
      createdAt: ctx.date(-2),
      updatedAt: ctx.date(-2),
    })),
  );
  const templates = [
    'Customer-reported bug',
    'Product improvement',
    'Accessibility audit',
    'Launch readiness review',
    'Security follow-up',
    'Mobile regression',
    'Support documentation',
    'Performance investigation',
    'Retired release checklist',
  ];
  await ctx.tx.insert(issueTemplates).values(
    templates.map((name, i) => ({
      id: ctx.id(`template:${i}`),
      workspaceId: ctx.workspaceId,
      name,
      createdById: ctx.member(0),
      description: `Capture the evidence and acceptance criteria for a ${name.toLowerCase()}.`,
      titleTemplate: `${name}: describe the customer outcome`,
      bodyTemplate:
        '## Context\nDescribe the customer scenario and impact.\n\n## Evidence\nAdd reproduction steps or interview findings.\n\n## Acceptance criteria\n- The customer can complete the workflow.\n- Failure recovery and keyboard access are verified.',
      defaults: {
        priority: i === 0 ? 'HIGH' : 'MEDIUM',
        labelIds: [ctx.id(`label:${i % 11}`)],
        estimate: 3,
      },
      archivedAt: i === 8 ? ctx.date(-4) : null,
      createdAt: ctx.date(-28),
      updatedAt: ctx.date(-3),
    })),
  );
  for (let i = 0; i < 32; i++) {
    const eventId = ctx.id(`collaboration-event:${i}`);
    const action = i % 2 ? 'issue.subscribed' : 'issue.label_added';
    const changes =
      i % 2
        ? { issue_id: ctx.issue(i), membership_id: ctx.member(0) }
        : { issue_id: ctx.issue(i), label_id: ctx.id(`label:${i % 11}`) };
    await ctx.tx.insert(events).values({
      id: eventId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.member(i % 6),
      aggregateType: 'issue',
      aggregateId: ctx.issue(i),
      aggregateVersion: 1,
      eventType: action,
      schemaVersion: 1,
      payload: changes,
      occurredAt: ctx.date(-7 + i / 5),
      createdAt: ctx.date(-7 + i / 5),
    });
    await ctx.tx.insert(issueActivity).values({
      id: ctx.id(`issue-activity:${i}`),
      workspaceId: ctx.workspaceId,
      issueId: ctx.issue(i),
      actorId: ctx.member(i % 6),
      eventId,
      action,
      changes,
      createdAt: ctx.date(-7 + i / 5),
      updatedAt: ctx.date(-7 + i / 5),
    });
  }
}
