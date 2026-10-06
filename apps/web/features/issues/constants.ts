import type { IssueLifecycle, WorkPriority } from '@repo/schemas';

export const MY_ISSUES_TABS = ['all', 'assigned', 'created', 'subscribed', 'activity'] as const;
export type MyIssuesTab = (typeof MY_ISSUES_TABS)[number];

export const MY_ISSUES_TAB_ITEMS: { label: string; value: MyIssuesTab }[] = [
   { label: 'All', value: 'all' },
   { label: 'Assigned', value: 'assigned' },
   { label: 'Created', value: 'created' },
   { label: 'Subscribed', value: 'subscribed' },
   { label: 'Activity', value: 'activity' },
];

export const ISSUE_LIFECYCLES: IssueLifecycle[] = ['active', 'archived', 'deleted'];
export const WORK_PRIORITIES: WorkPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NO_PRIORITY'];
