export const VIEW_RESOURCES = ['ISSUES', 'PROJECTS'] as const;
export type ViewResource = (typeof VIEW_RESOURCES)[number];
export const VIEW_SORTS = [
  'CREATED_DESC',
  'UPDATED_DESC',
  'TITLE_ASC',
] as const;
export type ViewSort = (typeof VIEW_SORTS)[number];
export interface ViewFilter {
  version: 1;
  teamId?: string;
  projectId?: string;
  statusId?: string;
  statusCategory?: string;
  assigneeId?: string;
  labelId?: string;
  text?: string;
  sort: ViewSort;
}
export interface ViewDisplay {
  layout: 'list' | 'board';
  groupBy: 'none' | 'status' | 'team' | 'assignee';
}
export class ViewFilterError extends Error {}
const fields = [
  'version',
  'teamId',
  'projectId',
  'statusId',
  'statusCategory',
  'assigneeId',
  'labelId',
  'text',
  'sort',
];
const issueCategories = [
  'BACKLOG',
  'UNSTARTED',
  'STARTED',
  'COMPLETED',
  'CANCELED',
  'DUPLICATE',
];
const projectCategories = [
  'PLANNED',
  'STARTED',
  'PAUSED',
  'COMPLETED',
  'CANCELED',
];
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ViewFilterError('View configuration must be an object.');
  return value as Record<string, unknown>;
}
export function validateFilter(
  resource: ViewResource,
  value: unknown,
): ViewFilter {
  if (!VIEW_RESOURCES.includes(resource))
    throw new ViewFilterError('Unsupported view resource.');
  const data = object(value);
  if (
    Object.keys(data).some((key) => !fields.includes(key)) ||
    data.version !== 1
  )
    throw new ViewFilterError('Use the supported version 1 filter grammar.');
  const result: ViewFilter = { version: 1, sort: 'CREATED_DESC' };
  for (const key of [
    'teamId',
    'projectId',
    'statusId',
    'assigneeId',
    'labelId',
  ] as const)
    if (data[key] !== undefined) {
      if (
        typeof data[key] !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(data[key])
      )
        throw new ViewFilterError(
          'Filter references must be opaque identifiers.',
        );
      if (resource === 'PROJECTS' && ['projectId', 'assigneeId'].includes(key))
        throw new ViewFilterError('This filter is not supported for projects.');
      result[key] = data[key];
    }
  if (data.statusCategory !== undefined) {
    const categories =
      resource === 'ISSUES' ? issueCategories : projectCategories;
    if (
      typeof data.statusCategory !== 'string' ||
      !categories.includes(data.statusCategory)
    )
      throw new ViewFilterError('Unsupported status category.');
    result.statusCategory = data.statusCategory;
  }
  if (data.text !== undefined) {
    if (
      typeof data.text !== 'string' ||
      data.text.length > 100 ||
      [...data.text].some((char) => char.charCodeAt(0) < 32)
    )
      throw new ViewFilterError(
        'Filter text must be at most 100 characters without controls.',
      );
    result.text = data.text.trim();
  }
  if (data.sort !== undefined) {
    if (!VIEW_SORTS.includes(data.sort as ViewSort))
      throw new ViewFilterError('Unsupported view sort.');
    result.sort = data.sort as ViewSort;
  }
  return result;
}
export function validateDisplay(
  resource: ViewResource,
  value: unknown,
): ViewDisplay {
  const data = object(value);
  if (Object.keys(data).some((key) => !['layout', 'groupBy'].includes(key)))
    throw new ViewFilterError('Unsupported view display option.');
  const layout = data.layout ?? 'list';
  const groupBy = data.groupBy ?? 'none';
  if (
    !['list', 'board'].includes(layout as string) ||
    !['none', 'status', 'team', 'assignee'].includes(groupBy as string) ||
    (resource === 'PROJECTS' && groupBy === 'assignee')
  )
    throw new ViewFilterError('Unsupported view display option.');
  return {
    layout: layout as ViewDisplay['layout'],
    groupBy: groupBy as ViewDisplay['groupBy'],
  };
}
export function canManageView(
  role: string,
  memberId: string,
  ownerId: string,
  visibility: string,
) {
  return (
    memberId === ownerId ||
    (visibility === 'WORKSPACE' && ['OWNER', 'ADMIN'].includes(role))
  );
}
