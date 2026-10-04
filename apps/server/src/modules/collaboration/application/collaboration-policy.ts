import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
export const text = (value: string) => {
  const result = value.trim();
  if (!result) throw new BadRequestException('Text must not be blank.');
  return result;
};
export const revision = (actual: number, expected: number | undefined) => {
  if (!Number.isSafeInteger(expected) || expected !== actual)
    throw new ConflictException(
      'Revision conflict. Fetch the current resource and retry.',
    );
};
export const authorPermission = (
  authorId: string,
  member: { id: string; role: string },
  moderation: boolean,
) => {
  if (
    authorId !== member.id &&
    !(moderation && ['OWNER', 'ADMIN'].includes(member.role))
  )
    throw new ForbiddenException('Comment permission denied.');
};
export type Target = {
  targetType:
    'issue' | 'project' | 'project_update' | 'initiative' | 'initiative_update';
  targetId: string;
};
