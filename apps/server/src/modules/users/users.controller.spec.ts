import { Test, type TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService],
    }).compile();
    controller = module.get<UsersController>(UsersController);
  });

  it('maps a service entity to an HTTP response DTO', () => {
    const response = controller.create({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    });

    expect(response).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    });
    expect(response.id).toMatch(/^usr_/);
  });
});
