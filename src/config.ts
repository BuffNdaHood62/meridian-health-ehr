// App-wide deployment configuration.
// ponytail: single source of truth for build-mode flags. Flip DEMO_MODE to
// false (and wire a real backend per Documentation.md) before any production
// go-live. The demo banner reads this so the artifact is never mistaken for a
// live EHR.
export const DEMO_MODE = true;

export const APP_NAME = "Wellness with Writingale EMR";
