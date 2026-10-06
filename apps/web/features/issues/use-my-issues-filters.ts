'use client';

import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import type { IssueLifecycle, WorkPriority } from '@repo/schemas';
import {
   ISSUE_LIFECYCLES,
   MY_ISSUES_TABS,
   MY_ISSUES_TAB_ITEMS,
   type MyIssuesTab,
   WORK_PRIORITIES,
} from './constants';

export { MY_ISSUES_TABS, MY_ISSUES_TAB_ITEMS, type MyIssuesTab };

export function useMyIssuesFilters() {
   const [tab, setTab] = useQueryState(
      'tab',
      parseAsStringLiteral(MY_ISSUES_TABS)
   );

   const [lifecycle, setLifecycle] = useQueryState(
      'lifecycle',
      parseAsStringLiteral(ISSUE_LIFECYCLES)
   );

   const [priority, setPriority] = useQueryState('priority', parseAsStringLiteral(WORK_PRIORITIES));

   const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));

   return {
      tab: tab ?? undefined,
      setTab: (t: MyIssuesTab | null | undefined) => setTab(t === 'all' ? null : (t ?? null)),
      lifecycle: lifecycle ?? undefined,
      setLifecycle: (l: IssueLifecycle | null | undefined) => setLifecycle(l ?? null),
      priority: priority ?? undefined,
      setPriority: (p: WorkPriority | undefined) => setPriority(p ?? null),
      searchQuery,
      setSearchQuery,
   };
}
