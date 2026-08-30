"use client"

import React, { useState } from "react"
import {
  getDicebearUrl,
  type DicebearStyle,
  type DicebearFormat,
} from "@/lib/dicebear"
import { cn } from "@/lib/utils"

export interface DicebearAvatarProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "style"> {
  /** Seed string for deterministic avatar (e.g., username, email, ID) */
  seed?: string
  /** Dicebear avatar style (defaults to 'glass') */
  avatarStyle?: DicebearStyle
  /** Output format (defaults to 'svg') */
  format?: DicebearFormat
  /** Pixel dimension (sets both width & height) */
  size?: number
  /** Border radius percentage (0-50) */
  radius?: number
  /** Background colors array or hex string without # */
  backgroundColor?: string[] | string
  /** Background type ('solid' | 'gradientLinear') */
  backgroundType?: "solid" | "gradientLinear"
  /** Fallback initials / text if image fails or before loading */
  fallbackText?: string
  /** Standard CSS style object */
  cssStyle?: React.CSSProperties
  /** Extra Dicebear query parameters */
  extraParams?: Record<string, string | number | boolean | undefined>
}

/**
 * Reusable Dicebear Avatar & Image Mockup Component
 *
 * Example:
 * ```tsx
 * <DicebearAvatar seed="Alex" avatarStyle="glass" size={40} className="rounded-full" />
 * ```
 */
export function DicebearAvatar({
  seed = "default",
  avatarStyle = "glass",
  format = "svg",
  size = 40,
  radius = 50,
  backgroundColor,
  backgroundType,
  fallbackText,
  className,
  alt = "avatar",
  extraParams,
  src: customSrc,
  cssStyle,
  onError,
  ...props
}: DicebearAvatarProps) {
  const [hasError, setHasError] = useState(false)

  const dicebearUrl =
    customSrc ||
    getDicebearUrl({
      seed,
      style: avatarStyle,
      format,
      size,
      radius,
      backgroundColor,
      backgroundType,
      extraParams,
    })

  if (hasError && fallbackText) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground font-medium text-xs rounded-full select-none",
          className
        )}
        style={{ width: size, height: size, ...cssStyle }}
      >
        {fallbackText.slice(0, 2).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={dicebearUrl}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        setHasError(true)
        onError?.(e)
      }}
      className={cn("shrink-0 object-cover", className)}
      style={{
        width: size,
        height: size,
        ...cssStyle,
      }}
      {...props}
    />
  )
}
