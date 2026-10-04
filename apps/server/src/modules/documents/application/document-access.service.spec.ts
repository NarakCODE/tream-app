import { ForbiddenException, ConflictException } from '@nestjs/common';
import { DocumentAccessService } from './document-access.service';
import type { WorkspaceAuthorizationService } from '../../iam/workspaces/application/workspace-authorization.service';
import type { TeamAccessService } from '../../teams/application/team-access.service';
import type { ProjectAccessService } from '../../projects/application/project-access.service';
import type { InitiativeAccessService } from '../../initiatives/application/initiative-access.service';
import type { DatabaseTransaction } from '../../../database/transaction';
function fixture(role = 'MEMBER') {
  const workspace = {
    require: jest.fn().mockResolvedValue({ member: { id: 'member', role } }),
  };
  const teams = { require: jest.fn().mockResolvedValue({ team: {} }) };
  const projects = {
    require: jest.fn().mockResolvedValue({ project: { archivedAt: null } }),
  };
  const initiatives = {
    require: jest.fn().mockResolvedValue({ initiative: { archivedAt: null } }),
  };
  const service = new DocumentAccessService(
    workspace as unknown as WorkspaceAuthorizationService,
    teams as unknown as TeamAccessService,
    projects as unknown as ProjectAccessService,
    initiatives as unknown as InitiativeAccessService,
  );
  return {
    service,
    teams,
    projects,
    initiatives,
    tx: {} as DatabaseTransaction,
  };
}
describe('DocumentAccessService typed owner privacy', () => {
  it('never exposes team documents to guests even with an explicit share', async () => {
    const { service, teams, tx } = fixture('GUEST');
    await expect(
      service.owner(tx, 'user', 'workspace', {
        ownerType: 'team',
        ownerId: 'team',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(teams.require).not.toHaveBeenCalled();
  });
  it('delegates initiative owner checks to full project ancestry access', async () => {
    const { service, initiatives, projects, tx } = fixture();
    await service.owner(tx, 'user', 'workspace', {
      ownerType: 'initiative',
      ownerId: 'initiative',
    });
    expect(initiatives.require).toHaveBeenCalledWith(
      tx,
      'user',
      'workspace',
      'initiative',
      'read',
      false,
    );
    expect(projects.require).not.toHaveBeenCalled();
  });
  it('denies writes to an archived project owner', async () => {
    const { service, projects, tx } = fixture();
    projects.require.mockResolvedValue({ project: { archivedAt: new Date() } });
    await expect(
      service.owner(
        tx,
        'user',
        'workspace',
        { ownerType: 'project', ownerId: 'project' },
        true,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('requires owner management authority when requested', async () => {
    const { service, teams, tx } = fixture();
    await service.owner(
      tx,
      'user',
      'workspace',
      { ownerType: 'team', ownerId: 'team' },
      true,
      true,
      true,
    );
    expect(teams.require).toHaveBeenCalledWith(
      tx,
      'user',
      'workspace',
      'team',
      'manage',
      true,
      false,
    );
  });
});
