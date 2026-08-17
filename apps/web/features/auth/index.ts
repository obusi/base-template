// Public surface of this feature. Anything imported from outside
// `features/auth` — an `app/` route or another feature — goes through here
// rather than reaching past it at an internal file.

export { SignInPage } from "./signin-page"
export { SignUpPage } from "./signup-page"
export { ForgotPasswordPage } from "./forgot-password-page"
export { ResetPasswordPage } from "./reset-password-page"
export { SignOutButton } from "./components/sign-out-button"

// How the rest of the app links to sign-in and gets the person back
// afterwards. Building the query string by hand elsewhere would spread the
// parameter's name across the codebase and skip the check on the way back.
export { authPath } from "./redirect"
