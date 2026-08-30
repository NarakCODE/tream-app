import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { PaginatedResult } from '../../common/interfaces/api-response.interface';
import { ResourceConflictException } from '../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../common/exceptions/resource-not-found.exception';
import { SortOrder } from '../../common/enums/sort-order.enum';
import type { CreateUserDto } from './dto/create-user.dto';
import type { QueryUsersDto } from './dto/query-users.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  private readonly users = new Map<string, User>();

  create(input: CreateUserDto): User {
    this.assertEmailAvailable(input.email);
    const now = new Date();
    const user: User = {
      id: `usr_${ulid()}`,
      email: input.email,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  findAll(query: QueryUsersDto): PaginatedResult<User> {
    const search = query.search?.trim().toLowerCase();
    const matching = [...this.users.values()].filter((user) =>
      search === undefined
        ? true
        : `${user.name} ${user.email}`.toLowerCase().includes(search),
    );
    const sorted = this.sort(matching, query);
    const start = (query.page - 1) * query.limit;

    return {
      items: sorted.slice(start, start + query.limit),
      page: query.page,
      limit: query.limit,
      total: sorted.length,
    };
  }

  findOne(id: string): User {
    const user = this.users.get(id);
    if (user === undefined) {
      throw new ResourceNotFoundException('User', id);
    }
    return user;
  }

  update(id: string, input: UpdateUserDto): User {
    const user = this.findOne(id);
    if (input.email !== undefined && input.email !== user.email) {
      this.assertEmailAvailable(input.email, id);
    }

    const updated: User = {
      ...user,
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.name === undefined ? {} : { name: input.name }),
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return updated;
  }

  remove(id: string): void {
    this.findOne(id);
    this.users.delete(id);
  }

  private assertEmailAvailable(email: string, excludedUserId?: string): void {
    const existingUser = [...this.users.values()].find(
      (user) => user.email === email && user.id !== excludedUserId,
    );
    if (existingUser !== undefined) {
      throw new ResourceConflictException(
        `A user with email '${email}' already exists.`,
        {
          field: 'email',
        },
      );
    }
  }

  private sort(users: User[], query: QueryUsersDto): User[] {
    const field = query.sortBy ?? 'createdAt';
    const direction = query.sortOrder === SortOrder.Asc ? 1 : -1;

    return users.toSorted((left, right) => {
      const leftValue =
        field === 'createdAt' ? left.createdAt.getTime() : left[field];
      const rightValue =
        field === 'createdAt' ? right.createdAt.getTime() : right[field];
      return leftValue < rightValue
        ? -direction
        : leftValue > rightValue
          ? direction
          : 0;
    });
  }
}
