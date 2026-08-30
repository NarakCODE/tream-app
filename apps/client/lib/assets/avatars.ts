import { getUserAvatarUrl, getDicebearUrl, type DicebearOptions } from "@/lib/dicebear";

export {
  getDicebearUrl,
  getGlassAvatarUrl,
  getUserAvatarUrl,
  getCompanyLogoUrl,
  getBotAvatarUrl,
  getWorkspaceIconUrl,
  getMockImageUrl,
  type DicebearStyle,
  type DicebearFormat,
  type DicebearOptions,
} from "@/lib/dicebear";

/**
 * Returns a profile photo or deterministic Dicebear glass avatar URL.
 */
export function getAvatarUrl(name?: string, options?: Omit<DicebearOptions, "seed">): string | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();

  // Custom photo overrides
  if (key === "jason duong" || key === "jason d" || key === "jd") {
    return "/avatar-profile.jpg";
  }

  // Generate deterministic Glass / Dicebear avatar
  return getUserAvatarUrl(name, options);
}
