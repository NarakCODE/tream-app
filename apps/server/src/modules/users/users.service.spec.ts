import { ResourceConflictException } from '../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../common/exceptions/resource-not-found.exception';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    service = new UsersService();
  });

  it('creates and lists users using pagination metadata inputs', () => {
    service.create({ email: 'ada@example.com', name: 'Ada Lovelace' });
    const page = service.findAll({
      page: 1,
      limit: 20,
      sortOrder: SortOrder.Desc,
    });

    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    });
  });

  it('rejects duplicate email addresses', () => {
    service.create({ email: 'ada@example.com', name: 'Ada Lovelace' });

    expect(() =>
      service.create({ email: 'ada@example.com', name: 'Another Ada' }),
    ).toThrow(ResourceConflictException);
  });

  it('reports missing users through a typed exception', () => {
    expect(() => service.findOne('usr_missing')).toThrow(
      ResourceNotFoundException,
    );
  });

  it('updates supplied properties without clearing omitted properties', () => {
    const created = service.create({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    });
    const updated = service.update(created.id, { name: 'Ada Byron' });

    expect(updated).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Byron',
    });
  });
});
