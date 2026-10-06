'use client';

import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import type { IssueLifecycle, WorkPriority } from '@repo/schemas';
import { ISSUE_LIFECYCLES, WORK_PRIORITIES } from './constants';

export function useIssueFilters() {
   const [lifecycle, setLifecycle] = useQueryState(
      'lifecycle',
      parseAsStringLiteral(ISSUE_LIFECYCLES)
   );

   const [priority, setPriority] = useQueryState('priority', parseAsStringLiteral(WORK_PRIORITIES));

   const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));

   return {
      lifecycle: lifecycle ?? undefined,
      setLifecycle: (l: IssueLifecycle | null | undefined) => setLifecycle(l ?? null),
      priority: priority ?? undefined,
      setPriority: (p: WorkPriority | undefined) => setPriority(p ?? null),
      searchQuery,
      setSearchQuery,
   };
}
