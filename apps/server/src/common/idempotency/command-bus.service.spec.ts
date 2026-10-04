import { CommandBus } from './command-bus.service';
import { ResourceConflictException } from '../exceptions/resource-conflict.exception';
const input = {
  userId: 'u1',
  method: 'POST',
  route: '/workspaces/w1',
  key: 'b2ea160a-9baf-4de9-b8ff-f511e6e29754',
  requestHash: 'hash',
};
describe('CommandBus', () => {
  it.each([
    { code: '23514', constraint: 'm05_team_admin' },
    { code: '23514', constraint: 'm06_project_teams' },
    { code: '23505', constraint: 'teams_workspace_key_permanent_idx' },
  ])('maps commit-time team conflicts without leaking SQL', async (cause) => {
    const failure = Object.assign(new Error('private SQL detail'), { cause });
    const bus = new CommandBus({
      db: { transaction: jest.fn().mockRejectedValue(failure) },
    } as never);
    await expect(bus.execute(input, jest.fn())).rejects.toBeInstanceOf(
      ResourceConflictException,
    );
    await expect(bus.execute(input, jest.fn())).rejects.not.toThrow(
      'private SQL detail',
    );
  });
  it('preserves unrelated database failures', async () => {
    const failure = { code: '23505', constraint: 'unrelated_unique_idx' };
    const bus = new CommandBus({
      db: { transaction: jest.fn().mockRejectedValue(failure) },
    } as never);
    await expect(bus.execute(input, jest.fn())).rejects.toBe(failure);
  });
  function setup(existing?: Record<string, unknown>) {
    const insert = jest
      .fn()
      .mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
    const tx = {
      execute: jest.fn().mockResolvedValue(undefined),
      delete: jest
        .fn()
        .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      select: jest.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(existing ? [existing] : []),
          }),
        }),
      }),
      insert,
    };
    const transaction = jest.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    );
    return {
      bus: new CommandBus({ db: { transaction } } as never),
      tx,
      transaction,
    };
  }
  it('stores successful response inside the business transaction', async () => {
    const { bus, tx } = setup();
    const handler = jest.fn((actual) => {
      expect(actual).toBe(tx);
      return Promise.resolve({ id: 'created' });
    });
    await expect(bus.execute(input, handler)).resolves.toEqual({
      id: 'created',
    });
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });
  it('rechecks authorization even for replay and never executes mutation again', async () => {
    const { bus, tx } = setup({
      requestHash: 'hash',
      status: 'COMPLETED',
      responseBody: { id: 'existing' },
    });
    const handler = jest.fn();
    const authorize = jest.fn(() => Promise.resolve());
    await expect(bus.execute(input, handler, { authorize })).resolves.toEqual({
      id: 'existing',
    });
    expect(authorize).toHaveBeenCalledWith(tx);
    expect(handler).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
  it('rejects different payload for the same identity', async () => {
    const { bus } = setup({ requestHash: 'other', status: 'COMPLETED' });
    const handler = jest.fn();
    await expect(bus.execute(input, handler)).rejects.toBeInstanceOf(
      ResourceConflictException,
    );
    expect(handler).not.toHaveBeenCalled();
  });
  it('propagates mutation failures without inserting replay state', async () => {
    const { bus, tx } = setup();
    await expect(
      bus.execute(input, () => Promise.reject(new Error('injected failure'))),
    ).rejects.toThrow('injected failure');
    expect(tx.insert).not.toHaveBeenCalled();
  });
  it('denies revoked authorization before looking up replay state', async () => {
    const { bus, tx } = setup({ requestHash: 'hash', status: 'COMPLETED' });
    await expect(
      bus.execute(input, jest.fn(), {
        authorize: () => Promise.reject(new Error('forbidden')),
      }),
    ).rejects.toThrow('forbidden');
    expect(tx.select).not.toHaveBeenCalled();
  });
});
