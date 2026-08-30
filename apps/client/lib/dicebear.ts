/**
 * Dicebear Avatar & Image Mockup Generator
 * Supports all Dicebear v10.x / v9.x styles, formats, and situational presets.
 * 
 * Base endpoint: https://api.dicebear.com/10.x/{style}/{format}
 * Example: https://api.dicebear.com/10.x/glass/svg?seed=Felix
 */

export type DicebearStyle =
  // Abstract & Modern
  | "glass"
  | "shapes"
  | "rings"
  | "identicon"
  | "icons"
  // Human & Character Avatars
  | "adventurer"
  | "adventurer-neutral"
  | "avataaars"
  | "avataaars-neutral"
  | "big-ears"
  | "big-ears-neutral"
  | "big-smile"
  | "croodles"
  | "croodles-neutral"
  | "dylan"
  | "lorelei"
  | "lorelei-neutral"
  | "micah"
  | "miniavs"
  | "notionists"
  | "notionists-neutral"
  | "open-peeps"
  | "personas"
  | "pixel-art"
  | "pixel-art-neutral"
  | "thumbs"
  // Bots & AI Agents
  | "bottts"
  | "bottts-neutral"
  // Initials & Emojis
  | "initials"
  | "fun-emoji";

export type DicebearFormat = "svg" | "png" | "jpg" | "webp" | "avif";

export type BackgroundType = "solid" | "gradientLinear";

export interface DicebearOptions {
  /** Seed string for deterministic generation (e.g. username, email, ID) */
  seed?: string;
  /** Dicebear style (defaults to 'glass') */
  style?: DicebearStyle;
  /** Output format (defaults to 'svg') */
  format?: DicebearFormat;
  /** Pixel size (width/height) */
  size?: number;
  /** Border radius percentage (0 to 50 for full circle) */
  radius?: number;
  /** Scaling of the avatar within canvas (0 to 200) */
  scale?: number;
  /** Flip image horizontally */
  flip?: boolean;
  /** Rotate in degrees (0 to 360) */
  rotate?: number;
  /** Background color hexes (without #, e.g. ["b6e3f4", "c0aede"]) */
  backgroundColor?: string[] | string;
  /** Background type */
  backgroundType?: BackgroundType;
  /** Background gradient rotation */
  backgroundRotation?: number[];
  /** Additional style-specific query parameters */
  extraParams?: Record<string, string | number | boolean | undefined>;
}

const DEFAULT_API_VERSION = "10.x";
const DICEBEAR_BASE_URL = "https://api.dicebear.com";

/**
 * Generate a Dicebear avatar URL with full customization options.
 */
export function getDicebearUrl(options: DicebearOptions = {}): string {
  const {
    seed = "default",
    style = "glass",
    format = "svg",
    size,
    radius,
    scale,
    flip,
    rotate,
    backgroundColor,
    backgroundType,
    backgroundRotation,
    extraParams,
  } = options;

  const url = new URL(
    `/${DEFAULT_API_VERSION}/${style}/${format}`,
    DICEBEAR_BASE_URL
  );

  const params = url.searchParams;

  if (seed) params.set("seed", seed.trim());
  if (size !== undefined && size > 0) params.set("size", size.toString());
  if (radius !== undefined) params.set("radius", radius.toString());
  if (scale !== undefined) params.set("scale", scale.toString());
  if (flip !== undefined) params.set("flip", flip.toString());
  if (rotate !== undefined) params.set("rotate", rotate.toString());

  if (backgroundColor) {
    const bgList = Array.isArray(backgroundColor)
      ? backgroundColor.map((c) => c.replace(/^#/, "")).join(",")
      : backgroundColor.replace(/^#/, "");
    if (bgList) params.set("backgroundColor", bgList);
  }

  if (backgroundType) params.set("backgroundType", backgroundType);
  if (backgroundRotation && backgroundRotation.length > 0) {
    params.set("backgroundRotation", backgroundRotation.join(","));
  }

  if (extraParams) {
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v !== undefined) params.set(k, String(v));
    });
  }

  return url.toString();
}

/**
 * Specifically generates the Glass style avatar URL (https://api.dicebear.com/10.x/glass/svg)
 */
export function getGlassAvatarUrl(
  seed: string = "glass",
  options: Omit<DicebearOptions, "style" | "seed"> = {}
): string {
  return getDicebearUrl({
    ...options,
    seed,
    style: "glass",
    format: options.format ?? "svg",
  });
}

/**
 * Generates person / user profile avatar (supports glass, avataaars, lorelei, etc.)
 */
export function getUserAvatarUrl(
  nameOrEmail?: string,
  options: Omit<DicebearOptions, "seed"> = {}
): string {
  const seed = nameOrEmail?.trim().toLowerCase() || "user";
  return getDicebearUrl({
    style: "glass",
    radius: 50,
    ...options,
    seed,
  });
}

/**
 * Generates company / client brand logo placeholder (uses shapes / initials / icons)
 */
export function getCompanyLogoUrl(
  companyNameOrDomain?: string,
  options: Omit<DicebearOptions, "seed"> = {}
): string {
  const seed = companyNameOrDomain?.trim().toLowerCase() || "company";
  return getDicebearUrl({
    style: "shapes",
    radius: 20,
    ...options,
    seed,
  });
}

/**
 * Generates AI Agent / Bot / Integration avatar (uses bottts)
 */
export function getBotAvatarUrl(
  botNameOrId?: string,
  options: Omit<DicebearOptions, "seed"> = {}
): string {
  const seed = botNameOrId?.trim().toLowerCase() || "bot";
  return getDicebearUrl({
    style: "bottts",
    radius: 50,
    ...options,
    seed,
  });
}

/**
 * Generates Workspace / Project abstract icon (uses glass / rings / shapes)
 */
export function getWorkspaceIconUrl(
  workspaceName?: string,
  options: Omit<DicebearOptions, "seed"> = {}
): string {
  const seed = workspaceName?.trim().toLowerCase() || "workspace";
  return getDicebearUrl({
    style: "glass",
    radius: 24,
    ...options,
    seed,
  });
}

/**
 * Universal Mock Image URL helper covering all situational presets
 */
export function getMockImageUrl(
  type: "user" | "glass" | "company" | "bot" | "workspace" | "custom",
  seed?: string,
  options?: DicebearOptions
): string {
  switch (type) {
    case "user":
      return getUserAvatarUrl(seed, options);
    case "glass":
      return getGlassAvatarUrl(seed, options);
    case "company":
      return getCompanyLogoUrl(seed, options);
    case "bot":
      return getBotAvatarUrl(seed, options);
    case "workspace":
      return getWorkspaceIconUrl(seed, options);
    case "custom":
    default:
      return getDicebearUrl({ ...options, seed });
  }
}
