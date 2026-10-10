// App-wide deployment configuration.
import { APP_MODE, DEMO_DATA_ALLOWED } from "./env";

export { APP_MODE };

// Driven by the mode contract (src/env.ts) — no longer a hand-edited literal, so
// a production build cannot ship with the demo banner/ fake data by forgetting to
// flip this flag.
export const DEMO_MODE = DEMO_DATA_ALLOWED;

export const APP_NAME = "Wellness with Writingale EMR";

// Support contact shown in every section footer. Placeholders until the
// foundation supplies real details; overridable per deployment via env.
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL ?? "support@example.org";
export const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE ?? "+234 800 000 0000";
