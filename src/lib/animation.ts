/**
 * Animation constants — single source of truth for all UI transitions
 *
 * Usage:
 *   import { ANIMATION } from "../lib/animation";
 *   className={`transition-all duration-[${ANIMATION.normal}ms]`}
 */

export const ANIMATION = {
  fast: 120,
  normal: 180,
  slow: 250,
  ease: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/** Tailwind class for standard transitions */
export const TRANSITION = "transition-all";
export const TRANSITION_EASE = `duration-[${ANIMATION.normal}ms] ${ANIMATION.ease}`;

/** Row flash keyframes — injected once into <style> */
export function injectRowFlashStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("asg-row-flash")) return;
  const style = document.createElement("style");
  style.id = "asg-row-flash";
  style.textContent = `
    @keyframes rowFlash {
      0%   { background-color: rgba(34, 197, 94, 0.15); }
      100% { background-color: transparent; }
    }
    .asg-row-flash {
      animation: rowFlash 600ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
  `;
  document.head.appendChild(style);
}
