/*
 * Shared meal-plan types and helpers. No server-only imports, so it is safe to
 * use from both server actions and client components.
 */

export const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export type MealPlanRecipe = {
  id: string;
  title: string;
  category: string;
  image_url: string | null;
};

export type MealPlan = {
  id: string;
  recipe_id: string;
  planned_date: string; // "YYYY-MM-DD"
  meal_type: MealType;
  recipe: MealPlanRecipe | null;
};

export type RecipeOption = {
  id: string;
  title: string;
};

export type MealPlanInput = {
  recipeId: string;
  plannedDate: string;
  mealType: MealType;
};

export function isMealType(value: unknown): value is MealType {
  return (
    typeof value === "string" &&
    (MEAL_TYPES as readonly string[]).includes(value)
  );
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Today as YYYY-MM-DD in the browser's local time zone. */
export function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

/** "Sunday, October 11" -- parsed as a local date so it never shifts a day. */
export function formatPlanDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}