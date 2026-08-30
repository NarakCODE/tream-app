import { Inject, Injectable } from '@nestjs/common';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import type { AuthUser } from '../domain/auth-user';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
  type UpdateAuthUserInput,
} from './ports/auth-repository.port';

export interface UpdateProfileInput {
  fullName?: string;
  avatarUrl?: string | null;
}

@Injectable()
export class ProfileService {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly repository: AuthRepository,
  ) {}

  async findById(userId: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(userId);
    if (user === null) {
      throw new ResourceNotFoundException('User', userId);
    }
    return user;
  }

  async update(userId: string, input: UpdateProfileInput): Promise<AuthUser> {
    const update: UpdateAuthUserInput = {
      updatedAt: new Date(),
      ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
      ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
    };
    const user = await this.repository.updateUser(userId, update);
    if (user === null) {
      throw new ResourceNotFoundException('User', userId);
    }
    return user;
  }
}
