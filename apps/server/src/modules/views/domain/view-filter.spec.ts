import { canManageView, validateDisplay, validateFilter } from './view-filter';
describe('versioned saved view grammar', () => {
  it('normalizes supported version1 filters and bounded fixed sorts', () =>
    expect(
      validateFilter('ISSUES', {
        version: 1,
        teamId: 'team_1',
        statusCategory: 'STARTED',
        text: ' hello ',
        sort: 'TITLE_ASC',
      }),
    ).toEqual({
      version: 1,
      teamId: 'team_1',
      statusCategory: 'STARTED',
      text: 'hello',
      sort: 'TITLE_ASC',
    }));
  it.each([
    null,
    [],
    {},
    { version: 2 },
    { version: 1, where: 'DROP TABLE issues' },
    { version: 1, sort: 'random()' },
    { version: 1, teamId: { sql: 'true' } },
    { version: 1, projectId: "x' OR 1=1 --" },
    { version: 1, text: 'x'.repeat(101) },
    { version: 1, statusCategory: 'ACTIVE' },
    { version: 1, filters: { $ne: null } },
  ])('rejects unknown or executable grammar %j', (filter) =>
    expect(() => validateFilter('ISSUES', filter)).toThrow(),
  );
  it('rejects issue-only filter fields for project queries', () => {
    expect(() =>
      validateFilter('PROJECTS', { version: 1, assigneeId: 'member_1' }),
    ).toThrow();
    expect(() =>
      validateFilter('PROJECTS', { version: 1, projectId: 'project_1' }),
    ).toThrow();
    expect(
      validateFilter('PROJECTS', { version: 1, statusCategory: 'PAUSED' }).sort,
    ).toBe('CREATED_DESC');
  });
  it('validates display options and prevents unsupported layouts/groupings', () => {
    expect(validateDisplay('ISSUES', {})).toEqual({
      layout: 'list',
      groupBy: 'none',
    });
    expect(
      validateDisplay('ISSUES', { layout: 'board', groupBy: 'assignee' }),
    ).toEqual({ layout: 'board', groupBy: 'assignee' });
    expect(() =>
      validateDisplay('PROJECTS', { groupBy: 'assignee' }),
    ).toThrow();
    expect(() => validateDisplay('ISSUES', { css: 'url(secret)' })).toThrow();
  });
  it('keeps private views owner-only and shared views managed by owner or administrator', () => {
    expect(canManageView('ADMIN', 'other', 'owner', 'PRIVATE')).toBe(false);
    expect(canManageView('ADMIN', 'other', 'owner', 'WORKSPACE')).toBe(true);
    expect(canManageView('MEMBER', 'owner', 'owner', 'PRIVATE')).toBe(true);
    expect(canManageView('MEMBER', 'other', 'owner', 'WORKSPACE')).toBe(false);
  });
});
