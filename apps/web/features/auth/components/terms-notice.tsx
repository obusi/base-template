// The small print under both auth forms. Identical on each page, so it lives
// here rather than being copied.
//
// Both links are `#`, as they are in the shadcn block: this template ships no
// Terms or Privacy pages, and inventing routes that 404 would be worse than
// an obvious placeholder. A real project points these at its own pages — the
// wording is a legal question, not a design one.

import { FieldDescription } from "@packages/ui/components/field"

export function TermsNotice() {
  return (
    <FieldDescription className="px-6 text-center">
      By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
      and <a href="#">Privacy Policy</a>.
    </FieldDescription>
  )
}
