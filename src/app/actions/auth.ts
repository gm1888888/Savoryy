"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { loginSchema, registerSchema, fieldErrors } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export type AuthState = {
  errors?: Record<string, string>;
  message?: string | null;
};

/**
 * Resolves the site origin for email confirmation links.
 *
 * The `x-forwarded-host` fallback only runs in development. Trusting a
 * request header for a production confirmation-email link is a real risk
 * (an attacker-influenced Host header could redirect the one-time code to
 * an off-site page) -- production must set NEXT_PUBLIC_SITE_URL explicitly.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/[/]+$/, "");

  if (process.env.NODE_ENV === "production") {
    // Fail loudly rather than silently trust an unvalidated header in prod.
    console.error(
      "[auth] NEXT_PUBLIC_SITE_URL is not set in production. " +
        "Falling back to localhost -- confirmation links will be broken. " +
        "Set NEXT_PUBLIC_SITE_URL in your deployment environment.",
    );
    return "http://localhost:3000";
  }

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return host ? proto + "://" + host : "http://localhost:3000";
}

/** Maps a raw Supabase Auth error into a message safe to show a visitor. */
function friendlyAuthError(message: string): string {
  if (message.toLowerCase().includes("already registered")) {
    return "That email is already registered. Try logging in instead.";
  }
  if (
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("security purposes")
  ) {
    return "Too many confirmation emails were sent just now. Please wait a minute and try again.";
  }
  if (message.toLowerCase().includes("password")) {
    // Supabase's own password-strength messages are already user-safe.
    return message;
  }
  console.error("[auth] signUp failed:", message);
  return "We could not create your account right now. Please try again.";
}

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the handle_new_user() trigger to populate profiles.full_name.
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: origin + "/auth/callback",
    },
  });

  if (error) {
    return { message: friendlyAuthError(error.message) };
  }

  // An email that is already registered and confirmed (including accounts
  // made with Google) does not error: Supabase returns a fake user with no
  // identities and sends no email. Without this check the visitor would be
  // told to wait for a confirmation email that never comes.
  if (data.user && data.user.identities?.length === 0) {
    return { message: friendlyAuthError("already registered") };
  }

  // With email confirmation enabled Supabase returns a user but no session.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  redirect("/verify-email?email=" + encodeURIComponent(parsed.data.email));
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Supabase deliberately returns the same message for a wrong password and
    // an unknown email, so the form cannot be used to enumerate accounts.
    const message =
      error.message === "Email not confirmed"
        ? "Please confirm your email address first. Check your inbox for the link."
        : "That email and password combination is not correct.";
    return { message };
  }

  // safeNextPath rejects protocol-relative values like "//evil.com" that
  // pass a naive startsWith("/") check but browsers resolve as off-site.
  const next = safeNextPath(formData.get("next"));

  revalidatePath("/", "layout");
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
