import type { IssueItem, WorkPriority } from '@repo/schemas';
import type { Issue } from '@/mock-data/issues';
import { ranks } from '@/mock-data/issues';
import { priorities } from '@/mock-data/priorities';
import { projects } from '@/mock-data/projects';
import { status as allStatus, Status, StatusCategory } from '@/mock-data/status';
import { type User, users } from '@/mock-data/users';
import type { TeamStatus } from '@/features/teams/types';

export const priorityToMock: Record<WorkPriority, string> = {
   URGENT: 'urgent',
   HIGH: 'high',
   MEDIUM: 'medium',
   LOW: 'low',
   NO_PRIORITY: 'no-priority',
};

export const mockToPriority: Record<string, WorkPriority> = {
   'urgent': 'URGENT',
   'high': 'HIGH',
   'medium': 'MEDIUM',
   'low': 'LOW',
   'no-priority': 'NO_PRIORITY',
};

export function categoryToUiCategory(category: string): StatusCategory {
   switch (category.toUpperCase()) {
      case 'BACKLOG':
         return 'backlog';
      case 'UNSTARTED':
         return 'unstarted';
      case 'STARTED':
         return 'started';
      case 'COMPLETED':
         return 'completed';
      case 'CANCELED':
      case 'DUPLICATE':
         return 'canceled';
      default:
         return 'unstarted';
   }
}

export function resolveTeamStatusToUiStatus(
   teamStatus?: TeamStatus | null,
   rawStatusId?: string
): Status {
   if (teamStatus) {
      // 1. Try to match by exact status name (case-insensitive)
      const nameMatch = allStatus.find(
         (s) => s.name.toLowerCase() === teamStatus.name.toLowerCase()
      );
      if (nameMatch) return nameMatch;

      // 2. Try to match by category
      const uiCategory = categoryToUiCategory(teamStatus.category);
      const categoryMatch = allStatus.find((s) => s.category === uiCategory);
      if (categoryMatch) return categoryMatch;
   }

   if (rawStatusId) {
      const directMatch =
         allStatus.find((s) => s.id === rawStatusId) ??
         allStatus.find((s) => s.name.toLowerCase() === rawStatusId.toLowerCase());
      if (directMatch) return directMatch;
   }

   return allStatus.find((s) => s.id === 'to-do') ?? allStatus[0]!;
}

export function findTeamStatusIdForUiStatus(
   teamStatuses: TeamStatus[],
   uiStatus: Status | string
): string | undefined {
   if (!teamStatuses || teamStatuses.length === 0) return undefined;

   const statusName = typeof uiStatus === 'string' ? uiStatus : uiStatus.name;
   const statusId = typeof uiStatus === 'string' ? uiStatus : uiStatus.id;

   // 1. If the input is already a UUID present in teamStatuses, return it directly
   const exactIdMatch = teamStatuses.find((ts) => ts.id === statusId);
   if (exactIdMatch) return exactIdMatch.id;

   // 2. Try to match by name (case-insensitive)
   const nameMatch = teamStatuses.find(
      (ts) => ts.name.toLowerCase() === statusName.toLowerCase()
   );
   if (nameMatch) return nameMatch.id;

   // 3. Try to match by UI slug to category mapping
   const slugToCategory: Record<string, string> = {
      'to-do': 'UNSTARTED',
      'backlog': 'BACKLOG',
      'in-progress': 'STARTED',
      'technical-review': 'STARTED',
      'paused': 'STARTED',
      'done': 'COMPLETED',
      'shipped': 'COMPLETED',
      'canceled': 'CANCELED',
      'duplicate': 'DUPLICATE',
      'triage': 'BACKLOG',
      'idea': 'BACKLOG',
   };
   const targetCategory = slugToCategory[statusId];
   if (targetCategory) {
      const categoryMatch = teamStatuses.find((ts) => ts.category === targetCategory);
      if (categoryMatch) return categoryMatch.id;
   }

   return undefined;
}

const fallbackAssigneeCache = new Map<string, User>();

export function registerKnownAssignees(userList: User[]) {
   for (const u of userList) {
      fallbackAssigneeCache.set(u.id, u);
   }
}

export function getKnownAssignee(id: string): User | undefined {
   return fallbackAssigneeCache.get(id) ?? users.find((u) => u.id === id);
}

function getFallbackAssignee(assigneeId: string, teamId: string, createdAt: string): User {
   const cached = fallbackAssigneeCache.get(assigneeId);
   if (cached) return cached;
   const user: User = {
      id: assigneeId,
      name: 'Assignee',
      email: 'assignee@example.com',
      avatarUrl: '',
      status: 'online',
      role: 'Member',
      joinedDate: createdAt,
      timezone: 'UTC',
      teamIds: [teamId],
   };
   fallbackAssigneeCache.set(assigneeId, user);
   return user;
}

export type StatusLookup =
   | TeamStatus[]
   | Map<string, TeamStatus>
   | Record<string, TeamStatus>
   | undefined;

export function issueItemToUiIssue(item: IssueItem, teamStatuses?: StatusLookup | number): Issue {
   const priorityKey = priorityToMock[item.priority] ?? 'no-priority';
   const priorityObj = priorities.find((p) => p.id === priorityKey) ?? priorities[0]!;

   let teamStatus: TeamStatus | undefined;
   if (teamStatuses && typeof teamStatuses !== 'number') {
      if (teamStatuses instanceof Map) {
         teamStatus = teamStatuses.get(item.statusId);
      } else if (Array.isArray(teamStatuses)) {
         teamStatus = teamStatuses.find((ts) => ts.id === item.statusId);
      } else {
         teamStatus = teamStatuses[item.statusId];
      }
   }

   const statusObj = resolveTeamStatusToUiStatus(teamStatus, item.statusId);

   const assigneeObj = item.assigneeId
      ? (fallbackAssigneeCache.get(item.assigneeId) ??
        users.find((u) => u.id === item.assigneeId) ??
        getFallbackAssignee(item.assigneeId, item.teamId, item.createdAt))
      : null;

   const projectObj = item.projectId ? projects.find((p) => p.id === item.projectId) : undefined;

   return {
      id: item.id,
      identifier: item.identifier,
      title: item.title,
      description: item.description ?? '',
      status: statusObj,
      statusId: item.statusId,
      teamId: item.teamId,
      priority: priorityObj,
      assignee: assigneeObj,
      labels: [],
      createdAt: item.createdAt,
      cycleId: item.cycleId ?? '',
      project: projectObj,
      subissues: [],
      rank: item.sortOrder !== undefined ? String(item.sortOrder) : ranks[0]!,
      dueDate: item.dueDate ?? undefined,
      estimate: item.estimate,
      revision: item.revision,
      archivedAt: item.archivedAt,
      workspaceId: item.workspaceId,
   };
}
