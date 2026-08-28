// The pages that belong to whoever is signed in rather than to either side of
// the product: their profile, and reporting a problem. No role guard, on
// purpose — an admin who cannot read their own profile locks out
// `requireAdminRole`, which reads it, and an admin who cannot report a bug is
// the wrong outcome for the person most likely to find one.
//
// The procedures behind these pages carry plain `requireAuth` for the same
// reason. This layout exists to say that the omission is deliberate.
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
