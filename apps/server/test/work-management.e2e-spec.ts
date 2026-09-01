import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import {
  configureApplication,
  createFastifyAdapter,
} from '../src/application.factory';
import { IdempotencyRepository } from '../src/common/idempotency/idempotency.repository';
import { AUTH_REPOSITORY } from '../src/modules/iam/application/ports/auth-repository.port';
import { MAGIC_LINK_SENDER } from '../src/modules/iam/application/ports/magic-link-sender.port';
import { WORKSPACE_REPOSITORY } from '../src/modules/iam/application/ports/workspace-repository.port';
import { CYCLES_REPOSITORY } from '../src/modules/work-management/application/ports/cycles-repository.port';
import { ISSUES_REPOSITORY } from '../src/modules/work-management/application/ports/issues-repository.port';
import { PROJECTS_REPOSITORY } from '../src/modules/work-management/application/ports/projects-repository.port';
import { TEAMS_REPOSITORY } from '../src/modules/work-management/application/ports/teams-repository.port';
import { InMemoryAuthRepository } from './helpers/in-memory-auth.repository';
import { InMemoryCyclesRepository } from './helpers/in-memory-cycles.repository';
import {
  idempotentBearer,
  InMemoryIdempotencyRepository,
} from './helpers/in-memory-idempotency.repository';
import { InMemoryIssuesRepository } from './helpers/in-memory-issues.repository';
import { InMemoryProjectsRepository } from './helpers/in-memory-projects.repository';
import { InMemoryTeamsRepository } from './helpers/in-memory-teams.repository';
import { InMemoryWorkspaceRepository } from './helpers/in-memory-workspace.repository';
import { RecordingMagicLinkSender } from './helpers/recording-magic-link.sender';

interface Envelope<T> {
  data: T;
}

interface CursorEnvelope<T> {
  data: T[];
  meta: {
    cursor: string | null;
    nextCursor: string | null;
    hasNext: boolean;
    limit: number;
    total: number;
  };
}

interface Session {
  user: { id: string; email: string };
  accessToken: string;
}

interface TeamResponse {
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
  createdAt: string;
  updatedAt: string;
  retiredAt: string | null;
}

interface IssueStatusResponse {
  id: string;
  teamId: string;
  name: string;
  category: string;
  position: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TeamMemberDetailsResponse {
  id: string;
  teamId: string;
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  createdAt: string;
}

interface ProjectResponse {
  id: string;
  workspaceId: string;
  name: string;
  summary: string | null;
  description: string | null;
  status: string;
  priority: string;
  leadId: string | null;
  startDate: string | null;
  targetDate: string | null;
  teams: TeamResponse[];
  progress: {
    totalIssues: number;
    completedIssues: number;
    percent: number;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface IssueResponse {
  id: string;
  workspaceId: string;
  teamId: string;
  number: number;
  identifier: string;
  title: string;
  description: string | null;
  statusId: string;
  status: IssueStatusResponse;
  priority: string;
  assigneeId: string | null;
  projectId: string | null;
  cycleId: string | null;
  dueDate: string | null;
  estimate: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface CycleResponse {
  id: string;
  teamId: string;
  number: number;
  name: string;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
  progress: {
    totalIssues: number;
    completedIssues: number;
    percent: number;
  };
  createdAt: string;
  updatedAt: string;
}

describe('Work Management API (e2e)', () => {
  let app: NestFastifyApplication;
  let auth: InMemoryAuthRepository;
  let workspaces: InMemoryWorkspaceRepository;
  let teamsRepo: InMemoryTeamsRepository;
  let projectsRepo: InMemoryProjectsRepository;
  let issuesRepo: InMemoryIssuesRepository;
  let cyclesRepo: InMemoryCyclesRepository;
  let idempotency: InMemoryIdempotencyRepository;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.JWT_ACCESS_SECRET =
      'test-access-secret-that-is-at-least-32-characters';

    auth = new InMemoryAuthRepository();
    workspaces = new InMemoryWorkspaceRepository(auth);
    teamsRepo = new InMemoryTeamsRepository(workspaces, auth);
    projectsRepo = new InMemoryProjectsRepository(workspaces, teamsRepo);
    cyclesRepo = new InMemoryCyclesRepository(workspaces, teamsRepo);
    issuesRepo = new InMemoryIssuesRepository(
      workspaces,
      teamsRepo,
      projectsRepo,
      cyclesRepo,
    );
    teamsRepo.setCyclesRepository(cyclesRepo);
    projectsRepo.setIssuesRepository(issuesRepo);
    cyclesRepo.setIssuesRepository(issuesRepo);
    idempotency = new InMemoryIdempotencyRepository();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(auth)
      .overrideProvider(WORKSPACE_REPOSITORY)
      .useValue(workspaces)
      .overrideProvider(TEAMS_REPOSITORY)
      .useValue(teamsRepo)
      .overrideProvider(PROJECTS_REPOSITORY)
      .useValue(projectsRepo)
      .overrideProvider(ISSUES_REPOSITORY)
      .useValue(issuesRepo)
      .overrideProvider(CYCLES_REPOSITORY)
      .useValue(cyclesRepo)
      .overrideProvider(IdempotencyRepository)
      .useValue(idempotency)
      .overrideProvider(MAGIC_LINK_SENDER)
      .useValue(new RecordingMagicLinkSender())
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(),
      { bufferLogs: true },
    );
    await configureApplication(app);
  });

  beforeEach(() => {
    auth.reset();
    workspaces.reset();
    teamsRepo.reset();
    projectsRepo.reset();
    issuesRepo.reset();
    cyclesRepo.reset();
    idempotency.reset();
  });

  afterAll(async () => app.close());

  const bearer = (session: Session) => ({
    ...idempotentBearer(session.accessToken),
  });

  const signUp = async (email: string): Promise<Session> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        email,
        fullName: email.split('@')[0],
        password: 'a secure passphrase',
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<Session>>().data;
  };

  const createWorkspace = async (session: Session, slug: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: bearer(session),
      payload: { name: slug, slug },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<{ id: string }>>().data;
  };

  const addMember = async (
    owner: Session,
    workspaceId: string,
    member: Session,
    role: 'MEMBER' | 'GUEST',
  ) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/members`,
      headers: bearer(owner),
      payload: { email: member.user.email, role },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Envelope<{ id: string }>>().data;
  };

  describe('Teams API', () => {
    it('creates a team with key normalization, default statuses, and supports list, patch, retire, restore', async () => {
      const owner = await signUp('owner@example.com');
      const workspace = await createWorkspace(owner, 'acme-corp');

      // Create team with lowercase key
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/teams`,
        headers: bearer(owner),
        payload: {
          name: 'Engineering',
          key: 'eng',
          description: 'Core product engineers',
          cyclesEnabled: true,
          cycleDurationWeeks: 2,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const team = createRes.json<Envelope<TeamResponse>>().data;
      expect(team.id).toMatch(/^tem_[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(team.key).toBe('ENG');
      expect(team.cyclesEnabled).toBe(true);

      // Verify default workflow statuses are populated
      const statusRes = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${team.id}/issue-statuses`,
        headers: bearer(owner),
      });
      expect(statusRes.statusCode).toBe(200);
      const statuses = statusRes.json<Envelope<IssueStatusResponse[]>>().data;
      expect(statuses.length).toBe(6);
      const categories = statuses.map((s) => s.category);
      expect(categories).toEqual(
        expect.arrayContaining([
          'BACKLOG',
          'UNSTARTED',
          'STARTED',
          'COMPLETED',
          'CANCELED',
        ]),
      );

      // Duplicate team key in workspace rejected
      const duplicateRes = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/teams`,
        headers: bearer(owner),
        payload: {
          name: 'Engineers 2',
          key: 'ENG',
        },
      });
      expect(duplicateRes.statusCode).toBe(409);

      // List teams in workspace
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspace.id}/teams`,
        headers: bearer(owner),
      });
      expect(listRes.statusCode).toBe(200);
      const list = listRes.json<CursorEnvelope<TeamResponse>>();
      expect(list.data).toHaveLength(1);
      expect(list.meta.total).toBe(1);

      // Get team by ID
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${team.id}`,
        headers: bearer(owner),
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json<Envelope<TeamResponse>>().data.id).toBe(team.id);

      // Update team
      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/teams/${team.id}`,
        headers: bearer(owner),
        payload: { name: 'Core Engineering' },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json<Envelope<TeamResponse>>().data.name).toBe(
        'Core Engineering',
      );

      // Retire team
      const retireRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/teams/${team.id}`,
        headers: bearer(owner),
      });
      expect(retireRes.statusCode).toBe(204);

      // Active list excludes retired by default
      const listAfterRetire = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspace.id}/teams`,
        headers: bearer(owner),
      });
      expect(
        listAfterRetire.json<CursorEnvelope<TeamResponse>>().data,
      ).toHaveLength(0);

      // Restore team
      const restoreRes = await app.inject({
        method: 'POST',
        url: `/api/v1/teams/${team.id}/restore`,
        headers: bearer(owner),
      });
      expect(restoreRes.statusCode).toBe(200);
      expect(
        restoreRes.json<Envelope<TeamResponse>>().data.retiredAt,
      ).toBeNull();
    });

    it('manages team memberships and members list', async () => {
      const owner = await signUp('owner@example.com');
      const member = await signUp('member@example.com');
      const workspace = await createWorkspace(owner, 'acme-corp-members');
      const memberMembership = await addMember(
        owner,
        workspace.id,
        member,
        'MEMBER',
      );

      const teamRes = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/teams`,
        headers: bearer(owner),
        payload: { name: 'Design', key: 'DES' },
      });
      const team = teamRes.json<Envelope<TeamResponse>>().data;

      // Creator is automatic team member
      const initialMembers = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${team.id}/members`,
        headers: bearer(owner),
      });
      expect(initialMembers.statusCode).toBe(200);
      expect(
        initialMembers.json<Envelope<TeamMemberDetailsResponse[]>>().data,
      ).toHaveLength(1);

      // Add member to team
      const addRes = await app.inject({
        method: 'POST',
        url: `/api/v1/teams/${team.id}/members`,
        headers: bearer(owner),
        payload: { memberId: memberMembership.id },
      });
      expect(addRes.statusCode).toBe(201);

      // List members has 2
      const updatedMembers = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${team.id}/members`,
        headers: bearer(member),
      });
      expect(
        updatedMembers.json<Envelope<TeamMemberDetailsResponse[]>>().data,
      ).toHaveLength(2);

      // Remove member
      const removeRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/teams/${team.id}/members/${memberMembership.id}`,
        headers: bearer(owner),
      });
      expect(removeRes.statusCode).toBe(204);
    });
  });

  describe('Projects API', () => {
    it('creates cross-team projects and manages lifecycle, teams, and progress', async () => {
      const owner = await signUp('owner@example.com');
      const workspace = await createWorkspace(owner, 'acme-projects');

      const team1Res = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/teams`,
        headers: bearer(owner),
        payload: { name: 'Backend', key: 'BE' },
      });
      const team1 = team1Res.json<Envelope<TeamResponse>>().data;

      const team2Res = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/teams`,
        headers: bearer(owner),
        payload: { name: 'Frontend', key: 'FE' },
      });
      const team2 = team2Res.json<Envelope<TeamResponse>>().data;

      // Create project linked to team1
      const createProjRes = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/projects`,
        headers: bearer(owner),
        payload: {
          name: 'Mobile App V2',
          summary: 'Redesign native experience',
          status: 'PLANNED',
          priority: 'HIGH',
          teamIds: [team1.id],
        },
      });
      expect(createProjRes.statusCode).toBe(201);
      const project = createProjRes.json<Envelope<ProjectResponse>>().data;
      expect(project.id).toMatch(/^prj_[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(project.teams).toHaveLength(1);
      expect(project.progress.percent).toBe(0);

      // Associate team2 as well
      const addTeamRes = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/teams`,
        headers: bearer(owner),
        payload: { teamId: team2.id },
      });
      expect(addTeamRes.statusCode).toBe(201);

      // Verify project details has both teams
      const getProjRes = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${project.id}`,
        headers: bearer(owner),
      });
      expect(
        getProjRes.json<Envelope<ProjectResponse>>().data.teams,
      ).toHaveLength(2);

      // Update project
      const patchProjRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/projects/${project.id}`,
        headers: bearer(owner),
        payload: { status: 'STARTED' },
      });
      expect(patchProjRes.statusCode).toBe(200);
      expect(patchProjRes.json<Envelope<ProjectResponse>>().data.status).toBe(
        'STARTED',
      );

      // Filter projects by team
      const listProjRes = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspace.id}/projects?teamId=${team2.id}`,
        headers: bearer(owner),
      });
      expect(
        listProjRes.json<CursorEnvelope<ProjectResponse>>().data,
      ).toHaveLength(1);

      // Delete project
      const delProjRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/${project.id}`,
        headers: bearer(owner),
      });
      expect(delProjRes.statusCode).toBe(204);
    });
  });

  describe('Issues & Cycles API', () => {
    it('allocates sequential issue identifiers, filters across workspace/teams, and performs cycle rollover', async () => {
      const owner = await signUp('owner@example.com');
      const member = await signUp('member@example.com');
      const workspace = await createWorkspace(owner, 'acme-issues-team');
      const memberMembership = await addMember(
        owner,
        workspace.id,
        member,
        'MEMBER',
      );

      // Create team with cycles enabled
      const teamRes = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/teams`,
        headers: bearer(owner),
        payload: {
          name: 'Platform',
          key: 'PLAT',
          cyclesEnabled: true,
          cycleDurationWeeks: 2,
        },
      });
      const team = teamRes.json<Envelope<TeamResponse>>().data;

      // Statuses
      const statusesRes = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${team.id}/issue-statuses`,
        headers: bearer(owner),
      });
      const statuses = statusesRes.json<Envelope<IssueStatusResponse[]>>().data;
      const unstartedStatus = statuses.find((s) => s.category === 'UNSTARTED');
      const startedStatus = statuses.find((s) => s.category === 'STARTED');
      const completedStatus = statuses.find((s) => s.category === 'COMPLETED');
      expect(unstartedStatus).toBeDefined();
      expect(startedStatus).toBeDefined();
      expect(completedStatus).toBeDefined();

      // Check auto-generated cycles
      const cyclesRes = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${team.id}/cycles`,
        headers: bearer(owner),
      });
      expect(cyclesRes.statusCode).toBe(200);
      const cyclesList = cyclesRes.json<Envelope<CycleResponse[]>>().data;
      expect(cyclesList.length).toBeGreaterThanOrEqual(1);
      const cycle1 = cyclesList[0]!;

      // Create Issue 1 (completed in cycle 1)
      const issue1Res = await app.inject({
        method: 'POST',
        url: `/api/v1/teams/${team.id}/issues`,
        headers: bearer(owner),
        payload: {
          title: 'Implement DB migration runner',
          statusId: completedStatus!.id,
          priority: 'HIGH',
          cycleId: cycle1.id,
          assigneeId: memberMembership.id,
          estimate: 3,
        },
      });
      expect(issue1Res.statusCode).toBe(201);
      const issue1 = issue1Res.json<Envelope<IssueResponse>>().data;
      expect(issue1.number).toBe(1);
      expect(issue1.identifier).toBe('PLAT-1');
      expect(issue1.status.category).toBe('COMPLETED');

      // Create Issue 2 (in progress / started in cycle 1)
      const issue2Res = await app.inject({
        method: 'POST',
        url: `/api/v1/teams/${team.id}/issues`,
        headers: bearer(member),
        payload: {
          title: 'Add Redis cache layer',
          statusId: startedStatus!.id,
          priority: 'URGENT',
          cycleId: cycle1.id,
        },
      });
      expect(issue2Res.statusCode).toBe(201);
      const issue2 = issue2Res.json<Envelope<IssueResponse>>().data;
      expect(issue2.number).toBe(2);
      expect(issue2.identifier).toBe('PLAT-2');

      // Create Issue 3 (todo / unstarted in cycle 1)
      const issue3Res = await app.inject({
        method: 'POST',
        url: `/api/v1/teams/${team.id}/issues`,
        headers: bearer(member),
        payload: {
          title: 'Refactor telemetry metrics',
          statusId: unstartedStatus!.id,
          cycleId: cycle1.id,
        },
      });
      expect(issue3Res.statusCode).toBe(201);
      const issue3 = issue3Res.json<Envelope<IssueResponse>>().data;
      expect(issue3.number).toBe(3);
      expect(issue3.identifier).toBe('PLAT-3');

      // Verify Cycle 1 progress (1 of 3 completed = 33%)
      const cycle1Details = await app.inject({
        method: 'GET',
        url: `/api/v1/cycles/${cycle1.id}`,
        headers: bearer(owner),
      });
      expect(
        cycle1Details.json<Envelope<CycleResponse>>().data.progress,
      ).toMatchObject({
        totalIssues: 3,
        completedIssues: 1,
        percent: 33,
      });

      // Complete Cycle 1 -> causes rollover of Issue 2 and Issue 3 to Cycle 2!
      const completeRes = await app.inject({
        method: 'POST',
        url: `/api/v1/cycles/${cycle1.id}/complete`,
        headers: bearer(owner),
      });
      expect(completeRes.statusCode).toBe(200);

      // Verify Cycle 2 exists and holds rolled over issues
      const updatedCycles = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${team.id}/cycles`,
        headers: bearer(owner),
      });
      const cycle2 = updatedCycles
        .json<Envelope<CycleResponse[]>>()
        .data.find((c) => c.number === 2)!;
      expect(cycle2).toBeDefined();

      // Check Issue 1 stayed in Cycle 1
      const getIssue1 = await app.inject({
        method: 'GET',
        url: `/api/v1/issues/${issue1.id}`,
        headers: bearer(owner),
      });
      expect(getIssue1.json<Envelope<IssueResponse>>().data.cycleId).toBe(
        cycle1.id,
      );

      // Check Issue 2 rolled over to Cycle 2
      const getIssue2 = await app.inject({
        method: 'GET',
        url: `/api/v1/issues/${issue2.id}`,
        headers: bearer(owner),
      });
      expect(getIssue2.json<Envelope<IssueResponse>>().data.cycleId).toBe(
        cycle2.id,
      );

      // Check Issue 3 rolled over to Cycle 2
      const getIssue3 = await app.inject({
        method: 'GET',
        url: `/api/v1/issues/${issue3.id}`,
        headers: bearer(owner),
      });
      expect(getIssue3.json<Envelope<IssueResponse>>().data.cycleId).toBe(
        cycle2.id,
      );

      // Cross-team workspace issue listing
      const wsIssues = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspace.id}/issues?priority=URGENT`,
        headers: bearer(owner),
      });
      expect(wsIssues.statusCode).toBe(200);
      expect(wsIssues.json<CursorEnvelope<IssueResponse>>().data).toHaveLength(
        1,
      );
      expect(
        wsIssues.json<CursorEnvelope<IssueResponse>>().data[0]!.identifier,
      ).toBe('PLAT-2');
    });

    it('enforces RBAC for guests and workspace isolation', async () => {
      const owner = await signUp('owner@example.com');
      const guest = await signUp('guest@example.com');
      const outsider = await signUp('outsider@example.com');
      const workspace = await createWorkspace(owner, 'acme-rbac');
      await addMember(owner, workspace.id, guest, 'GUEST');

      const teamRes = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/teams`,
        headers: bearer(owner),
        payload: { name: 'Security', key: 'SEC' },
      });
      const team = teamRes.json<Envelope<TeamResponse>>().data;

      // Guest can read team
      const guestReadTeam = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${team.id}`,
        headers: bearer(guest),
      });
      expect(guestReadTeam.statusCode).toBe(200);

      // Guest cannot create issue under team
      const guestCreateIssue = await app.inject({
        method: 'POST',
        url: `/api/v1/teams/${team.id}/issues`,
        headers: bearer(guest),
        payload: { title: 'Unauthorized issue' },
      });
      expect(guestCreateIssue.statusCode).toBe(403);

      // Guest cannot create project
      const guestCreateProj = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspace.id}/projects`,
        headers: bearer(guest),
        payload: { name: 'Unauthorized project' },
      });
      expect(guestCreateProj.statusCode).toBe(403);

      // Outsider cannot access team, gets non-disclosing 403
      const outsiderTeam = await app.inject({
        method: 'GET',
        url: `/api/v1/teams/${team.id}`,
        headers: bearer(outsider),
      });
      expect(outsiderTeam.statusCode).toBe(403);
    });
  });
});
