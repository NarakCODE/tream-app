import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { authorPermission, revision, text } from './collaboration-policy';
describe('collaboration ownership and optimistic concurrency', () => {
  it('normalizes whitespace but rejects blank content', () => {
    expect(text('  hello  ')).toBe('hello');
    expect(() => text(' \n ')).toThrow(BadRequestException);
  });
  it('requires a current safe revision', () => {
    expect(() => revision(4, 4)).not.toThrow();
    for (const expected of [undefined, 3, 5, NaN, Infinity])
      expect(() => revision(4, expected)).toThrow(ConflictException);
  });
  it('author can edit their own comment', () =>
    expect(() =>
      authorPermission('author', { id: 'author', role: 'MEMBER' }, false),
    ).not.toThrow());
  it('administrators can moderate but cannot overwrite another author content', () => {
    expect(() =>
      authorPermission('author', { id: 'admin', role: 'ADMIN' }, true),
    ).not.toThrow();
    expect(() =>
      authorPermission('author', { id: 'admin', role: 'ADMIN' }, false),
    ).toThrow(ForbiddenException);
  });
  it('ordinary members cannot moderate another author', () =>
    expect(() =>
      authorPermission('author', { id: 'member', role: 'MEMBER' }, true),
    ).toThrow(ForbiddenException));
});
