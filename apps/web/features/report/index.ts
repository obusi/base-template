// Public surface of this feature. Anything imported from outside
// `features/report` — an `app/` route or another feature — goes through here
// rather than reaching past it at an internal file.

export { ReportPage } from "./report-page"
export { AdminReportsPage } from "./admin-reports-page"

// The navbar links here rather than building the href itself: the link has to
// carry the page it was clicked from, and that parameter's name belongs to
// this feature.
export { ReportLink } from "./components/report-link"
