import Link from "next/link";
import { ChefHat, Flame, Sparkles, UtensilsCrossed } from "lucide-react";

import { Hero } from "@/components/home/hero";
import { SectionHeading } from "@/components/home/section-heading";
import { RecipeGrid } from "@/components/recipes/recipe-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { CATEGORIES, categoryToSlug } from "@/lib/constants";
import { getCategoryCounts, getRecipes } from "@/lib/queries";

// Content changes whenever anyone publishes, so never serve a stale shell.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Two independent slices, fetched in parallel. "Popular" and "Trending"
  // come from ONE most-liked query split in two -- fetching page 2 of a tiny
  // table hits PostgREST's range-not-satisfiable case far too easily on a
  // young site, so the split happens here instead of via a second request.
  const [latest, mostLiked, categoryCounts] = await Promise.all([
    getRecipes({ sort: "newest", perPage: 6 }),
    getRecipes({ sort: "most-liked", perPage: 6 }),
    getCategoryCounts(),
  ]);

  const hasAnyRecipes = latest.total > 0;
  const failed = latest.error !== null;

  const liked = mostLiked.recipes.filter((recipe) => recipe.likes_count > 0);
  const popularRecipes = liked.slice(0, 3);
  const trendingRecipes = liked.slice(3, 6);

  return (
    <>
      <Hero recipeCount={latest.total} />

      <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-14 sm:px-6 sm:py-16">
        {failed ? <ErrorState /> : null}

        {/* ---------------------------------------------- Latest recipes */}
        {!failed ? (
          <section aria-labelledby="latest-heading">
            <div id="latest-heading" className="reveal">
              <SectionHeading
                title="Latest recipes"
                description="Freshly added by the community."
                href={hasAnyRecipes ? "/recipes" : undefined}
              />
            </div>

            {hasAnyRecipes ? (
              <RecipeGrid recipes={latest.recipes} priorityCount={3} reveal />
            ) : (
              <EmptyState
                className="reveal"
                icon={<UtensilsCrossed className="size-6" aria-hidden="true" />}
                title="No recipes have been shared yet"
                description="This kitchen is waiting for its first dish. Be the first person to share a recipe and get things started."
                action={{ label: "Share a Recipe", href: "/upload" }}
                secondaryAction={{ label: "Create an account", href: "/register" }}
              />
            )}
          </section>
        ) : null}

        {/* --------------------------------------------- Popular recipes */}
        {!failed && hasAnyRecipes ? (
          <section aria-labelledby="popular-heading">
            <div id="popular-heading" className="reveal">
              <SectionHeading
                title="Popular recipes"
                description="The most liked dishes on the site."
                href={popularRecipes.length > 0 ? "/recipes?sort=most-liked" : undefined}
              />
            </div>

            {popularRecipes.length > 0 ? (
              <RecipeGrid recipes={popularRecipes} reveal />
            ) : (
              <EmptyState
                className="reveal"
                icon={<Sparkles className="size-6" aria-hidden="true" />}
                title="Nothing has been liked yet"
                description="Once people start liking recipes, the favourites will rise to the top and appear here."
                action={{ label: "Browse recipes", href: "/recipes" }}
              />
            )}
          </section>
        ) : null}

        {/* -------------------------------------------- Trending recipes */}
        {!failed && hasAnyRecipes ? (
          <section aria-labelledby="trending-heading">
            <div id="trending-heading" className="reveal">
              <SectionHeading
                title="Trending now"
                description="Other dishes people are enjoying."
              />
            </div>

            {trendingRecipes.length > 0 ? (
              <RecipeGrid recipes={trendingRecipes} reveal />
            ) : (
              <EmptyState
                className="reveal"
                icon={<Flame className="size-6" aria-hidden="true" />}
                title="Not enough activity yet"
                description="Trending needs a few more recipes and a few more likes before it can show anything meaningful."
                action={{ label: "Share a Recipe", href: "/upload" }}
              />
            )}
          </section>
        ) : null}

        {/* -------------------------------------------------- Categories */}
        <section aria-labelledby="categories-heading">
          <div id="categories-heading" className="reveal">
            <SectionHeading
              title="Browse by category"
              description="Find something for the meal you are planning."
              href="/categories"
            />
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CATEGORIES.map((category) => {
              const count = categoryCounts[category] ?? 0;
              return (
                <li key={category} className="reveal">
                  <Link
                    href={"/categories/" + categoryToSlug(category)}
                    className="flex h-full flex-col justify-between gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                  >
                    <span className="text-sm font-semibold">{category}</span>
                    <span className="text-xs text-muted-foreground">
                      {count === 0
                        ? "No recipes yet"
                        : count === 1
                          ? "1 recipe"
                          : count + " recipes"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* -------------------------------------------- Call to action */}
        <section className="reveal group overflow-hidden rounded-3xl border border-border bg-warm-wash px-6 py-12 text-center sm:px-12 sm:py-16">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-background text-primary shadow-sm ring-1 ring-border/60">
            <ChefHat
              className="size-6 transition-transform duration-300 group-hover:-rotate-12"
              aria-hidden="true"
            />
          </div>
          <h2 className="text-balance font-heading text-2xl font-bold sm:text-3xl">
            Got a recipe worth passing on?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Whether it is your family adobo or the pasta you make every Tuesday,
            write it down here so it does not get lost.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/upload">Share a Recipe</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/about">How this works</Link>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
