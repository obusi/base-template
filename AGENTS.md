<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Where the Next.js docs actually are

The path in the block above is relative to the package that depends on `next`.
This is a monorepo and `next` is a dependency of `apps/web`, not of the root, so
from the repository root the docs are at:

```
apps/web/node_modules/next/dist/docs/
├── 01-app/
│   ├── 01-getting-started/
│   ├── 02-guides/            # includes upgrading/version-16.md
│   └── 03-api-reference/
├── 02-pages/
├── 03-architecture/
└── index.md
```

Read the relevant page there before writing Next.js code. Installed version: **16.2.6**.
