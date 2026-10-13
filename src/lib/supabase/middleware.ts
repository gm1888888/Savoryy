import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { timeoutFetch } from "@/lib/supabase/fetch";

/** Routes that require an authenticated user. */
const PROTECTED_PREFIXES = ["/upload", "/my-recipes", "/bookmarks", "/profile", "/meal-plans"];

/** Routes an already-authenticated user should not see. */
const AUTH_ONLY_PREFIXES = ["/login", "/register"];

/**
 * How long one login lasts before the visitor has to log in again.
 * Defaults to 7 days. SESSION_MAX_AGE_SECONDS overrides it (mainly so the
 * cut-off can be tested without waiting a week).
 *
 * Supabase itself would keep refreshing the session indefinitely, and its own
 * "time-box sessions" setting is a paid-plan feature, so the cap is enforced
 * here: the first request after login stamps the time in a cookie, and any
 * later request older than the limit signs the visitor out.
 */
const SESSION_MAX_AGE_SECONDS =
  Number(process.env.SESSION_MAX_AGE_SECONDS) > 0
    ? Number(process.env.SESSION_MAX_AGE_SECONDS)
    : 7 * 24 * 60 * 60;

const LOGIN_AT_COOKIE = "savory-login-at";

/** The stamp itself must outlive the cap, or an expired login could reset it. */
const LOGIN_AT_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/**
 * Refreshes the Supabase session on every request and guards protected routes.
 *
 * The response object returned here MUST be the same one whose cookies were
 * written by `setAll`, otherwise refreshed tokens are dropped and users appear
 * randomly logged out.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { fetch: timeoutFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must never be cached by a CDN,
        // or one user's session could be served to another.
        for (const [key, headerValue] of Object.entries(headers ?? {})) {
          response.headers.set(key, headerValue);
        }
      },
    },
  });

  // Must run before any redirect so a token refresh is written to `response`.
  const {
    data: { user: authenticatedUser },
  } = await supabase.auth.getUser();
  let user = authenticatedUser;

  // --- 7-day login cap ---------------------------------------------------
  const nowSeconds = Math.floor(Date.now() / 1000);
  const stampRaw = request.cookies.get(LOGIN_AT_COOKIE)?.value;
  const loginAt = Number(stampRaw);
  const hasStamp = Number.isFinite(loginAt) && loginAt > 0;
  let sessionExpired = false;

  if (user && hasStamp && nowSeconds - loginAt > SESSION_MAX_AGE_SECONDS) {
    // "local" ends only this browser's session, not the user's other devices.
    await supabase.auth.signOut({ scope: "local" });
    user = null;
    sessionExpired = true;
  }

  // `response` may have been replaced by setAll above, so this must come last.
  if (user && !hasStamp) {
    response.cookies.set(LOGIN_AT_COOKIE, String(nowSeconds), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: LOGIN_AT_COOKIE_MAX_AGE,
    });
  } else if (!user && stampRaw !== undefined) {
    // Logged out (or just expired): clear it so the next login starts a
    // fresh 7 days instead of inheriting the old stamp.
    response.cookies.delete(LOGIN_AT_COOKIE);
  }

  const { pathname, search } = request.nextUrl;

  if (!user && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search =
      `?next=${encodeURIComponent(pathname + search)}` +
      (sessionExpired ? "&expired=1" : "");
    const redirect = NextResponse.redirect(redirectUrl);
    // Carry over any refreshed auth cookies onto the redirect response.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  if (user && AUTH_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    const redirect = NextResponse.redirect(redirectUrl);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}
