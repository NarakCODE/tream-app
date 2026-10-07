import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { DatabaseTransaction } from '../../database/transaction';
import { CommandBus } from '../../common/idempotency/command-bus.service';
import type { IdempotencyReservationInput } from '../../common/idempotency/idempotency.types';
import { WorkspaceRepository } from '../iam/workspaces/application/ports/workspace.repository';
import { WorkspaceAuthorizationService } from '../iam/workspaces/application/workspace-authorization.service';
import { hasPermission } from '../iam/workspaces/domain/permissions';
import { publicUser } from '../iam/authentication/application/authentication.service';
import { OnboardingRepository } from './onboarding.repository';

type NextStep =
  | 'VERIFY_EMAIL'
  | 'CREATE_WORKSPACE'
  | 'SELECT_WORKSPACE'
  | 'CREATE_TEAM'
  | 'WAIT_FOR_TEAM'
  | 'INVITE_TEAMMATES'
  | 'DONE';
@Injectable()
export class OnboardingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: OnboardingRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly commands: CommandBus,
  ) {}
  bootstrap(userId: string) {
    return this.database.db.transaction((tx) => this.read(tx, userId), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
  }
  private async read(tx: DatabaseTransaction, userId: string) {
    const user = await this.repository.user(tx, userId);
    if (!user || user.disabledAt) throw new UnauthorizedException();
    const workspaceId = await this.workspaces.selection(tx, userId);
    const workspace = workspaceId
      ? await this.workspaces.workspace(tx, workspaceId)
      : undefined;
    const membership = workspaceId
      ? await this.workspaces.membership(tx, workspaceId, userId)
      : undefined;
    const activeWorkspace =
      workspace &&
      !workspace.deletedAt &&
      !workspace.archivedAt &&
      membership?.state === 'ACTIVE'
        ? { workspaceId: workspace.id, workspace, membership }
        : null;
    const setupReady =
      !!user.emailVerifiedAt &&
      !!activeWorkspace &&
      (await this.repository.hasTeam(tx, activeWorkspace.workspaceId));
    const completedAt =
      activeWorkspace?.membership.onboardingCompletedAt?.toISOString() ?? null;
    const completed = setupReady && completedAt !== null;
    let nextStep: NextStep;
    if (!user.emailVerifiedAt) nextStep = 'VERIFY_EMAIL';
    else if (!activeWorkspace)
      nextStep = (await this.repository.hasWorkspace(tx, userId))
        ? 'SELECT_WORKSPACE'
        : 'CREATE_WORKSPACE';
    else if (!setupReady)
      nextStep = hasPermission(activeWorkspace.membership.role, 'team.manage')
        ? 'CREATE_TEAM'
        : 'WAIT_FOR_TEAM';
    else nextStep = completed ? 'DONE' : 'INVITE_TEAMMATES';
    return {
      user: publicUser(user),
      activeWorkspace,
      onboarding: { setupReady, completed, completedAt, nextStep },
    };
  }
  async complete(identity: IdempotencyReservationInput, workspaceId: string) {
    await this.commands.execute(
      identity,
      async (tx) => {
        const { member } = await this.authorization.require(
          tx,
          identity.userId,
          workspaceId,
          'workspace.read',
        );
        await this.repository.complete(tx, member.id);
        return { membershipId: member.id };
      },
      {
        authorize: async (tx) => {
          await this.authorization.require(
            tx,
            identity.userId,
            workspaceId,
            'workspace.read',
            { lock: true },
          );
          const user = await this.repository.user(tx, identity.userId);
          if (!user || user.disabledAt || !user.emailVerifiedAt)
            throw new ForbiddenException('Verified user required.');
          if (
            (await this.repository.lockSelection(tx, identity.userId)) !==
            workspaceId
          )
            throw new ConflictException(
              'Select this workspace before completing onboarding.',
            );
          if (!(await this.repository.hasTeam(tx, workspaceId)))
            throw new ConflictException('Workspace requires a live team.');
        },
      },
    );
    return this.bootstrap(identity.userId);
  }
}
