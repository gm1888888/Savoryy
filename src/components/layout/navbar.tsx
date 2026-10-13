import Link from "next/link";
import { PlusCircle } from "lucide-react";

import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUserWithProfile } from "@/lib/queries";

const PUBLIC_LINKS = [
  { href: "/", label: "Home" },
  { href: "/recipes", label: "Recipes" },
  { href: "/categories", label: "Categories" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const MEAL_PLANS_LINK = { href: "/meal-plans", label: "Meal Plans" };

const MEMBER_LINKS = [
  { href: "/upload", label: "Share a recipe" },
  { href: "/my-recipes", label: "My recipes" },
  { href: "/bookmarks", label: "Saved recipes" },
  MEAL_PLANS_LINK,
  { href: "/profile", label: "Profile" },
];

/**
 * Server component: reads the session once per request so the nav always
 * reflects real auth state rather than something cached in the browser.
 */
export async function Navbar() {
  const { user, profile } = await getCurrentUserWithProfile();

  // Meal plans are private, so the link only appears once you are logged in.
  const desktopLinks = user ? [...PUBLIC_LINKS, MEAL_PLANS_LINK] : PUBLIC_LINKS;

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {desktopLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Button asChild size="sm" className="hidden gap-1.5 sm:inline-flex">
                <Link href="/upload">
                  <PlusCircle className="size-4" aria-hidden="true" />
                  Share a recipe
                </Link>
              </Button>
              <UserMenu
                fullName={profile?.full_name ?? "Cook"}
                email={user.email ?? ""}
                avatarUrl={profile?.avatar_url ?? null}
              />
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}

          <MobileNav
            isAuthenticated={Boolean(user)}
            publicLinks={PUBLIC_LINKS}
            memberLinks={MEMBER_LINKS}
          />
        </div>
      </div>
    </header>
  );
}
