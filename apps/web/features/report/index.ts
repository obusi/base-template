// Public surface of this feature. Anything imported from outside
// `features/report` — an `app/` route or another feature — goes through here
// rather than reaching past it at an internal file.
//
// Note that the two pages below reach `lib/session.ts`, which is marked
// `server-only`. That makes this barrel importable from Server Components
// only: `components/nav-bar.tsx` takes `ReportMenuItem` from here and hands it
// to `UserMenu`, rather than `UserMenu` importing it directly.

export { ReportPage } from "./report-page"
export { AdminReportsPage } from "./admin-reports-page"
export { ReportMenuItem } from "./components/report-menu-item"
