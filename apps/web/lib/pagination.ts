// How many rows a page of any list holds.
//
// **This file must not carry `"use client"`, and the constant must not move
// into a file that does.** Every export of a `"use client"` module is turned
// into a client *reference* when a Server Component imports it — a function
// standing in for something the browser will resolve, not the value itself. A
// number imported that way arrives on the server as a function, and the first
// sign of it is the procedure refusing the call:
//
//     Error: Input validation failed
//     data: { limit: [Function (anonymous)] }
//
// It typechecks, because the types come from the source file rather than from
// what RSC does to it at the boundary, and the error names the procedure rather
// than the constant. See docs/architecture.md S10 (C20). The fix is simply that
// shared constants live in a plain module like this one.
//
// It lives in `lib/` rather than in a feature because both `features/post` and
// `features/report` page the same way, and because it means nothing about
// either domain — the server fetches this many rows and the browser asks for
// the same number again, and they have to agree or the seam shows as a short
// page in the middle of a list.

export const PAGE_SIZE = 10
