export interface Team {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string | null;
  timezone: string;
  cycleDurationWeeks: number;
  cycleStartDay: number;
  cycleCooldownDays: number;
  upcomingCyclesCount: number;
  cyclesEnabled: boolean;
  nextIssueNumber: number;
  createdAt: Date;
  updatedAt: Date;
  retiredAt: Date | null;
}

export interface TeamMembership {
  id: string;
  teamId: string;
  membershipId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMemberDetails {
  id: string;
  teamId: string;
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  createdAt: Date;
}

export const DEFAULT_TEAM_STATUSES = [
  {
    name: 'Backlog',
    category: 'BACKLOG' as const,
    position: 0,
    isDefault: true,
  },
  {
    name: 'Todo',
    category: 'UNSTARTED' as const,
    position: 1,
    isDefault: false,
  },
  {
    name: 'In Progress',
    category: 'STARTED' as const,
    position: 2,
    isDefault: false,
  },
  {
    name: 'Done',
    category: 'COMPLETED' as const,
    position: 3,
    isDefault: false,
  },
  {
    name: 'Canceled',
    category: 'CANCELED' as const,
    position: 4,
    isDefault: false,
  },
  {
    name: 'Duplicate',
    category: 'DUPLICATE' as const,
    position: 5,
    isDefault: false,
  },
] as const;

export const normalizeTeamKey = (key: string): string =>
  key.trim().toUpperCase();
