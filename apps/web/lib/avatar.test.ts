import { describe, expect, it } from 'vitest';
import {
   createGlassAvatar,
   glassStyle,
   getRandomAvatarDataUri,
   getRandomAvatarSeed,
   getRandomAvatarSvg,
   getRandomAvatarUrl,
} from './avatar';
import { Avatar, Style } from '@dicebear/core';

describe('avatar utils', () => {
   it('initializes glassStyle as a Style instance', () => {
      expect(glassStyle).toBeInstanceOf(Style);
   });

   it('generates a non-empty random seed', () => {
      const seed1 = getRandomAvatarSeed();
      const seed2 = getRandomAvatarSeed();
      expect(seed1).toBeTruthy();
      expect(seed2).toBeTruthy();
      expect(seed1).not.toBe(seed2);
   });

   it('creates Avatar instance with glass style', () => {
      const avatar = createGlassAvatar({ seed: 'test-seed' });
      expect(avatar).toBeInstanceOf(Avatar);

      const svg = avatar.toString();
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
   });

   it('produces deterministic SVG for the same seed', () => {
      const svg1 = getRandomAvatarSvg('consistent-user-id');
      const svg2 = getRandomAvatarSvg('consistent-user-id');
      expect(svg1).toBe(svg2);
   });

   it('produces different SVG for different seeds', () => {
      const svg1 = getRandomAvatarSvg('user-a');
      const svg2 = getRandomAvatarSvg('user-b');
      expect(svg1).not.toBe(svg2);
   });

   it('generates valid data URI formatted string', () => {
      const dataUri = getRandomAvatarUrl('user-123');
      expect(dataUri.startsWith('data:image/svg+xml')).toBe(true);
      expect(dataUri).toContain('%3Csvg');
      expect(getRandomAvatarDataUri('user-123')).toBe(dataUri);
   });

   it('generates SVG and data URI without explicit seed', () => {
      const svg = getRandomAvatarSvg();
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');

      const dataUri = getRandomAvatarUrl();
      expect(dataUri.startsWith('data:image/svg+xml')).toBe(true);
   });
});
