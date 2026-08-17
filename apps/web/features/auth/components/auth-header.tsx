// The centred logo, product name and cross-link that sit above both auth
// forms. Shared because the two pages differ only in which way the link
// points — duplicating it means a rename or a logo change has to be made
// twice, and one of them gets forgotten.
//
// The project name is written out literally rather than read from a config,
// so that `setup-project`'s rename script catches it along with the browser
// tab title and the OpenAPI document. See .claude/skills/setup-project/.

import { GalleryVerticalEndIcon } from "lucide-react"
import Link from "next/link"

import { FieldDescription } from "@packages/ui/components/field"

export function AuthHeader({
  prompt,
  actionHref,
  actionLabel,
}: {
  prompt: string
  actionHref: string
  actionLabel: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {/* Points at the marketing home page in a real project; `#` until there
          is one, matching the shadcn block this came from. */}
      <a href="#" className="flex flex-col items-center gap-2 font-medium">
        <div className="flex size-8 items-center justify-center rounded-md">
          <GalleryVerticalEndIcon className="size-6" />
        </div>
        <span className="sr-only">base-template</span>
      </a>

      <h1 className="text-xl font-bold">Welcome to base-template</h1>

      <FieldDescription>
        {prompt} <Link href={actionHref}>{actionLabel}</Link>
      </FieldDescription>
    </div>
  )
}
