import { favorites, savedViews } from '../schema/view.schema';
import {
  validateDisplay,
  validateFilter,
} from '../../modules/views/domain/view-filter';
import type { DemoContext } from './context';

export async function seedViews(ctx: DemoContext) {
  const names = [
    'Launch command center',
    'Customer portal delivery',
    'Mobile readiness',
    'Platform improvements',
    'Design follow-up',
    'Quality checklist',
    'Customer success queue',
    'Growth experiments',
    'All launch projects',
    'Project portfolio board',
    'Delivery roadmap',
    'Archived planning perspective',
  ];
  for (let i = 0; i < names.length; i++) {
    const resource = i < 8 ? 'ISSUES' : 'PROJECTS';
    const filters = validateFilter(resource, {
      version: 1,
      sort: i % 2 ? 'UPDATED_DESC' : 'CREATED_DESC',
      ...(i > 0 && i < 8 ? { teamId: ctx.team(i) } : {}),
    });
    const display = validateDisplay(resource, {
      layout: i % 2 ? 'board' : 'list',
      groupBy: i % 2 ? 'status' : 'none',
    });
    await ctx.tx.insert(savedViews).values({
      id: ctx.id(`view:${i}`),
      workspaceId: ctx.workspaceId,
      name: names[i]!,
      description:
        'A shared Northstar perspective for coordinating the portal and mobile launch.',
      ownerId: ctx.member(0),
      resource,
      visibility: i % 3 === 0 ? 'PRIVATE' : 'WORKSPACE',
      filters: { ...filters },
      display: { ...display },
      archivedAt: i === 11 ? ctx.date(-3) : null,
      createdAt: ctx.date(-24 + i),
      updatedAt: ctx.date(-i % 4),
    });
  }
  const targets = [
    { issueId: ctx.issue(0) },
    { issueId: ctx.issue(1) },
    { projectId: ctx.project(0) },
    { projectId: ctx.project(1) },
    { teamId: ctx.team(0) },
    { teamId: ctx.team(1) },
    { initiativeId: ctx.id('initiative:0') },
    { initiativeId: ctx.id('initiative:1') },
    { viewId: ctx.id('view:0') },
    { viewId: ctx.id('view:1') },
  ];
  await ctx.tx.insert(favorites).values(
    targets.map((target, i) => ({
      id: ctx.id(`favorite:${i}`),
      workspaceId: ctx.workspaceId,
      membershipId: ctx.member(0),
      ...target,
      position: i,
      createdAt: ctx.date(-10 + i),
      updatedAt: ctx.now,
    })),
  );
}
