import { EventContractRegistry } from './event-contract-registry';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
describe('EventContractRegistry', () => {
  const registry = new EventContractRegistry();
  it('keeps file and attachment facts minimal and validates quarantine reasons', () => {
    expect(() =>
      registry.validate('file.ready', 1, 'file', { file_id: 'f1' }),
    ).not.toThrow();
    expect(() =>
      registry.validate('file.quarantined', 1, 'file', {
        file_id: 'f1',
        reason: 'INFECTED',
      }),
    ).not.toThrow();
    expect(() =>
      registry.validate('file.quarantined', 1, 'file', {
        file_id: 'f1',
        reason: 'raw scanner output',
      }),
    ).toThrow();
    expect(() =>
      registry.validate('file.ready', 1, 'file', {
        file_id: 'f1',
        storage_key: 'private/key',
      }),
    ).toThrow();
    expect(() =>
      registry.validate('attachment.created', 1, 'attachment', {
        attachment_id: 'a1',
        file_id: 'f1',
        target_type: 'comment',
        target_id: 'c1',
      }),
    ).not.toThrow();
    expect(() =>
      registry.validate('attachment.created', 1, 'attachment', {
        attachment_id: 'a1',
        file_id: 'f1',
        target_type: 'document',
        target_id: 'd1',
      }),
    ).toThrow();
  });
  it('versions issue ordering fields without changing the published v1 payload', () => {
    const payload = { issue_id: 'i1', changed_fields: ['sort_order'] };
    expect(() =>
      registry.validate('issue.updated', 1, 'issue', payload),
    ).toThrow();
    expect(() =>
      registry.validate('issue.updated', 2, 'issue', payload),
    ).not.toThrow();
  });
  it('preserves issue-comment v1 while validating typed planning-comment v2', () => {
    expect(() =>
      registry.validate('comment.created', 1, 'issue_comment', {
        comment_id: 'c1',
        issue_id: 'i1',
      }),
    ).not.toThrow();
    const payload = {
      comment_id: 'c1',
      target_type: 'project',
      target_id: 'p1',
      parent_comment_id: null,
      revision: 1,
    };
    expect(() =>
      registry.validate('comment.created', 2, 'comment', payload),
    ).not.toThrow();
    expect(() =>
      registry.validate('comment.created', 1, 'comment', payload),
    ).toThrow();
    expect(() =>
      registry.validate('comment.created', 2, 'comment', {
        ...payload,
        body: 'private content',
      }),
    ).toThrow();
    expect(() =>
      registry.validate('comment.created', 3, 'comment', payload),
    ).toThrow();
  });
  it.each([
    [
      'project.archived',
      'project',
      { project_id: 'project1', archived_at: '2026-10-02T00:00:00.000Z' },
    ],
    [
      'project.deleted',
      'project',
      { project_id: 'project1', deleted_at: '2026-10-02T00:00:00.000Z' },
    ],
    ['project.restored', 'project', { project_id: 'project1' }],
    [
      'project.team_added',
      'project',
      { project_id: 'project1', team_id: 'team1' },
    ],
    [
      'project.team_removed',
      'project',
      { project_id: 'project1', team_id: 'team1' },
    ],
    [
      'project.member_added',
      'project',
      { project_id: 'project1', membership_id: 'member1' },
    ],
    [
      'project.member_removed',
      'project',
      { project_id: 'project1', membership_id: 'member1' },
    ],
    [
      'project.milestone_created',
      'project',
      { project_id: 'project1', milestone_id: 'milestone1' },
    ],
    [
      'project.milestone_updated',
      'project',
      { project_id: 'project1', milestone_id: 'milestone1' },
    ],
    [
      'project.milestone_deleted',
      'project',
      { project_id: 'project1', milestone_id: 'milestone1' },
    ],
    [
      'project.milestones_reordered',
      'project',
      { project_id: 'project1', milestone_ids: ['milestone1', 'milestone2'] },
    ],
    [
      'project.update_published',
      'project',
      { project_id: 'project1', update_id: 'update1', health: 'ON_TRACK' },
    ],
    ['project_status.created', 'workspace', { status_id: 'status1' }],
    ['project_status.updated', 'workspace', { status_id: 'status1' }],
    ['project_status.default_changed', 'workspace', { status_id: 'status1' }],
    [
      'project_status.reordered',
      'workspace',
      { status_ids: ['status1', 'status2'] },
    ],
    [
      'project_status.retired',
      'workspace',
      { status_id: 'status1', replacement_status_id: null },
    ],
  ] as [string, string, Record<string, unknown>][])(
    'validates %s and forbids uncontracted content',
    (type, aggregate, payload) => {
      expect(() =>
        registry.validate(type, 1, aggregate, payload),
      ).not.toThrow();
      expect(() =>
        registry.validate(type, 1, aggregate, { ...payload, token: 'secret' }),
      ).toThrow();
      const incomplete = { ...payload };
      delete incomplete[Object.keys(incomplete)[0]!];
      expect(() => registry.validate(type, 1, aggregate, incomplete)).toThrow();
    },
  );
  it.each([
    [
      'project.archived',
      'project',
      { project_id: 'project1', archived_at: 'yesterday' },
    ],
    ['project_status.created', 'project', { status_id: 'status1' }],
    ['project_status.reordered', 'workspace', { status_ids: ['same', 'same'] }],
    [
      'project.milestones_reordered',
      'project',
      { project_id: 'project1', milestone_ids: [] },
    ],
    [
      'project.update_published',
      'project',
      { project_id: 'project1', update_id: 'update1', health: 'HEALTHY' },
    ],
    [
      'project.updated',
      'project',
      { project_id: 'project1', changed_fields: ['leadMembershipId'] },
    ],
  ] as [string, string, Record<string, unknown>][])(
    'rejects malformed %s payloads',
    (type, aggregate, payload) => {
      expect(() => registry.validate(type, 1, aggregate, payload)).toThrow();
    },
  );
  it('keeps existing project event contracts compatible and documents runtime contracts exactly', () => {
    registry.validate('project.created', 1, 'project', {
      project_id: 'project1',
      status_id: 'status1',
      team_ids: ['team1'],
    });
    registry.validate('project.updated', 1, 'project', {
      project_id: 'project1',
      changed_fields: ['name', 'summary', 'lead_membership_id'],
    });
    for (const file of ['catalog.json', 'event-v1.schema.json']) {
      expect(
        JSON.parse(readFileSync(join(__dirname, 'contracts', file), 'utf8')),
      ).toEqual(
        JSON.parse(
          readFileSync(
            join(__dirname, '../../../../../../docs/database/events', file),
            'utf8',
          ),
        ),
      );
    }
  });
  it('validates team workflow facts and rejects unversioned field names', () => {
    expect(() =>
      registry.validate('team.settings_updated', 1, 'team', {
        team_id: 'team1',
        changed_fields: ['cycle_duration_weeks'],
      }),
    ).not.toThrow();
    expect(() =>
      registry.validate('team.settings_updated', 1, 'team', {
        team_id: 'team1',
        changed_fields: ['cycleDurationWeeks'],
      }),
    ).toThrow();
    expect(() =>
      registry.validate('issue_status.retired', 1, 'team', {
        team_id: 'team1',
        status_id: 'status1',
        replacement_status_id: null,
      }),
    ).not.toThrow();
    expect(() =>
      registry.validate('team.member_added', 1, 'team', {
        team_id: 'team1',
        membership_id: 'member1',
        role: 'OWNER',
      }),
    ).toThrow();
  });
  it('validates published v1 and membership contracts', () => {
    expect(() =>
      registry.validate('workspace.created', 1, 'workspace', {
        workspace_id: 'ws1',
        owner_membership_id: 'mem1',
      }),
    ).not.toThrow();
    expect(() =>
      registry.validate('membership.updated', 1, 'membership', {
        workspace_id: 'ws1',
        membership_id: 'mem1',
        role: 'ADMIN',
      }),
    ).not.toThrow();
  });
  it.each([
    [
      'workspace.created',
      2,
      'workspace',
      { workspace_id: 'ws1', owner_membership_id: 'mem1' },
    ],
    [
      'workspace.created',
      1,
      'issue',
      { workspace_id: 'ws1', owner_membership_id: 'mem1' },
    ],
    [
      'workspace.created',
      1,
      'workspace',
      { workspace_id: 'ws1', owner_membership_id: 'mem1', token: 'secret' },
    ],
    ['workspace.created', 1, 'workspace', { workspace_id: 'ws1' }],
  ])(
    'rejects unknown versions, wrong aggregate, secrets and incomplete payloads',
    (type, version, aggregate, payload) => {
      expect(() =>
        registry.validate(
          type,
          version,
          aggregate,
          payload as Record<string, unknown>,
        ),
      ).toThrow();
    },
  );
});
