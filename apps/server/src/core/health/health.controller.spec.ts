import { Test, type TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let checkReadiness: jest.Mock;

  beforeEach(async () => {
    checkReadiness = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseService,
          useValue: { checkReadiness },
        },
      ],
    }).compile();
    controller = module.get<HealthController>(HealthController);
  });

  it('reports readiness when PostgreSQL responds', async () => {
    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ready',
    });
  });

  it('returns an unwrapped liveness response', () => {
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });

  it('fails readiness without exposing database details and keeps liveness available', async () => {
    checkReadiness.mockRejectedValue(new Error('private database credentials'));
    await expect(controller.getReadiness()).rejects.toThrow(
      new ServiceUnavailableException('Database is unavailable.'),
    );
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });
});
