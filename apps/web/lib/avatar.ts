import { Style, Avatar, type StyleOptions } from '@dicebear/core';
import definition from '@dicebear/styles/glass.json' with { type: 'json' };

/**
 * Reusable pre-compiled DiceBear Glass style definition.
 * Reusing a single Style instance across avatars prevents redundant schema compilation.
 */
export const glassStyle = new Style(definition);

export type GlassAvatarOptions = StyleOptions<typeof definition>;

/**
 * Generates a random alphanumeric seed string.
 */
export function getRandomAvatarSeed(): string {
   if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
   }
   return Math.random().toString(36).substring(2, 12);
}

/**
 * Creates a DiceBear Avatar instance using the Glass style.
 *
 * @param options - Style options including seed, size, colors, etc.
 * @returns Avatar instance with .toString(), .toDataUri(), and .toJSON() methods.
 *
 * @example
 * ```ts
 * const avatar = createGlassAvatar({ seed: 'user-123' });
 * const svg = avatar.toString();
 * const dataUri = avatar.toDataUri();
 * ```
 */
export function createGlassAvatar(options?: GlassAvatarOptions): Avatar {
   return new Avatar(glassStyle, options);
}

/**
 * Generates raw SVG string for a Glass avatar.
 *
 * @param seed - Optional seed string. If omitted, a random seed is generated.
 * @param options - Additional DiceBear Glass style options.
 * @returns Raw SVG markup string (`<svg ...>...</svg>`).
 *
 * @example
 * ```ts
 * const svg = getRandomAvatarSvg('alice');
 * ```
 */
export function getRandomAvatarSvg(
   seed?: string,
   options?: Omit<GlassAvatarOptions, 'seed'>
): string {
   const avatar = new Avatar(glassStyle, {
      seed: seed ?? getRandomAvatarSeed(),
      ...options,
   });
   return avatar.toString();
}

/**
 * Generates a `data:image/svg+xml` URI for a Glass avatar.
 * Ideal for directly setting `<img src={...} />` or `<AvatarImage src={...} />`.
 *
 * @param seed - Optional seed string. If omitted, a random seed is generated.
 * @param options - Additional DiceBear Glass style options.
 * @returns A data URI string (`data:image/svg+xml;utf-8,...`).
 *
 * @example
 * ```ts
 * const avatarUrl = getRandomAvatarUrl('user@company.com');
 * <img src={avatarUrl} alt="Avatar" />
 * ```
 */
export function getRandomAvatarUrl(
   seed?: string,
   options?: Omit<GlassAvatarOptions, 'seed'>
): string {
   const avatar = new Avatar(glassStyle, {
      seed: seed ?? getRandomAvatarSeed(),
      ...options,
   });
   return avatar.toDataUri();
}

/** Alias for `getRandomAvatarUrl`. */
export const getRandomAvatarDataUri = getRandomAvatarUrl;
