// The bare re-export, which is the default — see .claude/rules/testing.md.
//
// Node environment, `*.test.ts` only. Nothing here renders a component: the
// browser half of this app is exercised by hand and by the compiler, while
// what is worth a test is the logic that has no React in it at all. A suite
// that mocked `authClient`, `next/navigation` and the toast to render a form
// would be asserting that react-hook-form works.
export { baseConfig as default } from "@tooling/vitest-config/base"
