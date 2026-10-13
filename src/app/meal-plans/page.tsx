import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { MealPlanManager } from "@/components/meal-plans/meal-plan-manager";
import {
  MEAL_PLAN_COLUMNS,
  toMealPlan,
  type MealPlan,
  type RecipeOption,
} from "@/lib/meal-plans";
import { getCurrentUser } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Meal plans",
  description: "The meals you have planned, by day.",
};

export default async function MealPlansPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fmeal-plans");

  const supabase = await createClient();
  const db = supabase as unknown as SupabaseClient;

  const [plansRes, bookmarksRes, ownRes] = await Promise.all([
    db
      .from("meal_plans")
      .select(MEAL_PLAN_COLUMNS)
      .eq("user_id", user.id)
      .order("planned_date", { ascending: true }),
    db
      .from("bookmarks")
      .select("recipes ( id, title )")
      .eq("user_id", user.id),
    db.from("recipes").select("id, title").eq("user_id", user.id),
  ]);

  if (plansRes.error) {
    console.error("[meal_plans] load failed:", plansRes.error.message);
  }

  const plans: MealPlan[] = (plansRes.data ?? []).map(toMealPlan);

  // Recipe picker: everything you bookmarked plus everything you wrote,
  // de-duplicated and sorted by title.
  const options = new Map<string, RecipeOption>();
  for (const row of (bookmarksRes.data ?? []) as unknown as {
    recipes: RecipeOption | RecipeOption[] | null;
  }[]) {
    const recipe = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
    if (recipe) options.set(recipe.id, { id: recipe.id, title: recipe.title });
  }
  for (const recipe of (ownRes.data ?? []) as unknown as RecipeOption[]) {
    options.set(recipe.id, { id: recipe.id, title: recipe.title });
  }
  const recipeOptions = [...options.values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <MealPlanManager plans={plans} recipeOptions={recipeOptions} />
    </div>
  );
}