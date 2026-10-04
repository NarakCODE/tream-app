import type { ReactNode } from "react";

export interface SplashScreenProps {
  brand?: ReactNode;
  label?: string;
  className?: string;
}

/** Presentational startup status. Import @repo/ui/splash-screen.css in the app. */
export function SplashScreen({
  brand,
  label = "Loading…",
  className,
}: SplashScreenProps) {
  return (
    <div
      className={["repo-splash-screen", className].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className="repo-splash-screen__content">
        {brand ? (
          <div className="repo-splash-screen__brand">{brand}</div>
        ) : null}
        <span className="repo-splash-screen__indicator" aria-hidden="true" />
        <span className="repo-splash-screen__label">{label}</span>
      </div>
    </div>
  );
}
