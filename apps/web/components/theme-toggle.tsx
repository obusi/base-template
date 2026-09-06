"use client"

// The two shapes the theme control takes, kept in one file because they are
// one concept: the list of themes, their icons, and their order are shared,
// and splitting the file would leave them drifting apart.
//
// Which shape is used depends on where there is room. `ThemeToggle` is a
// single icon that cycles, for the navbar's signed-out right side where
// "Sign in" and "Sign up" already sit. `ThemeToggleGroup` is the same three
// choices laid out at once, for the account menu, which has the width for it.
// A signed-in navbar shows neither — the control moved into the menu.
//
// Lives in components/ rather than in a feature: it belongs to no domain, and
// two unrelated places render it — components/nav-bar.tsx and
// features/auth's UserMenu. See .claude/rules/apps-web-structure.md.

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

import { Button } from "@packages/ui/components/button"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@packages/ui/components/toggle-group"

// The order the single-icon button cycles through. "system" is in the list
// rather than dropped for a two-state button because it is the default the
// provider starts on: a control that cannot return to it would strand anyone
// who touched the button once.
const THEMES = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const

/**
 * Whether the browser has taken over from the server-rendered HTML.
 *
 * `next-themes` reads localStorage inside its initial `useState`, so the theme
 * is known on the client's very first render and unknowable on the server's —
 * rendering an icon from it directly is a hydration mismatch. Both components
 * below reserve the space and draw nothing until this flips, which costs one
 * frame and never shows a state that turns out to be wrong.
 *
 * `useSyncExternalStore` rather than the `useState` + `useEffect` pair the
 * same idea is usually written as: it is React's own way to say "the server
 * renders this differently", and setting state from an effect is what the
 * `react-hooks/set-state-in-effect` lint rule exists to stop. Nothing is
 * subscribed to, so the subscribe callback never fires.
 */
const neverChanges = () => () => {}

function useMounted() {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false
  )
}

/** One icon, cycling light → dark → system. For a bar with no room to spare. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  const index = THEMES.findIndex((entry) => entry.value === theme)
  const current = mounted && index !== -1 ? THEMES[index] : undefined
  // The `?? THEMES[0]` is for the type checker rather than for the runtime:
  // indexing by a computed number widens to `| undefined`, and the tuple's
  // first entry is the value the modulo already guarantees when index is -1.
  const next = THEMES[(index + 1) % THEMES.length] ?? THEMES[0]

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={!current}
      aria-label={
        current ? `Theme: ${current.label}. Switch to ${next.label}.` : "Theme"
      }
      onClick={() => setTheme(next.value)}
    >
      {current && <current.Icon />}
    </Button>
  )
}

/** All three choices at once. For a menu, where the width exists. */
export function ThemeToggleGroup() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      aria-label="Theme"
      value={mounted && theme ? [theme] : []}
      onValueChange={(value) => {
        // Base UI hands back the pressed values as an array, and pressing the
        // already-pressed item empties it. Ignoring that is what keeps the
        // group from reaching a state where no theme is selected.
        const [selected] = value

        if (selected) {
          setTheme(selected)
        }
      }}
    >
      {THEMES.map(({ value, label, Icon }) => (
        <ToggleGroupItem key={value} value={value} size="sm" aria-label={label}>
          <Icon />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
