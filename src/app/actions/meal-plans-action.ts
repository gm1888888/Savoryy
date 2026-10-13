"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isMealType,
  isValidDateString,
  MEAL_PLAN_COLUMNS,
  toMealPlan,
  type MealPlan,
  type MealPlanInput,
} from "@/lib/meal-plans";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation";

export type MealPlanResult = {
  ok: boolean;
  message?: string;
  /** The saved row, so the page can update without refetching. */
  plan?: MealPlan;
};

/*
 * meal_plans is not in database.types.ts, so the client is widened to an
 * untyped one here. The RLS policies in supabase/schema.sql are the real
 * guard; the user_id filters below just make the intent explicit.
 */
async function getDb(): Promise<{
  db: SupabaseClient;
  userId: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { db: supabase as unknown as SupabaseClient, userId: user?.id ?? null };
}

function validate(input: MealPlanInput): string | null {
  if (!uuidSchema.safeParse(input.recipeId).success) {
    return "Please choose a recipe.";
  }
  if (!isValidDateString(input.plannedDate)) {
    return "Please choose a valid date.";
  }
  if (!isMealType(input.mealType)) {
    return "Please choose breakfast, lunch or dinner.";
  }
  return null;
}

export async function addMealPlanAction(
  input: MealPlanInput,
): Promise<MealPlanResult> {
  const problem = validate(input);
  if (problem) return { ok: false, message: problem };

  const { db, userId } = await getDb();
  if (!userId) return { ok: false, message: "Please log in to plan meals." };

  const { data, error } = await db
    .from("meal_plans")
    .insert({
      user_id: userId,
      recipe_id: input.recipeId,
      planned_date: input.plannedDate,
      meal_type: input.mealType,
    })
    .select(MEAL_PLAN_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[meal_plans] insert failed:", error?.message);
    // 23503 = the recipe no longer exists.
    return {
      ok: false,
      message:
        error?.code === "23503"
          ? "That recipe no longer exists."
          : "Could not add this meal. Please try again.",
    };
  }

  revalidatePath("/meal-plans");
  return { ok: true, plan: toMealPlan(data) };
}

export async function updateMealPlanAction(
  planId: string,
  input: MealPlanInput,
): Promise<MealPlanResult> {
  if (!uuidSchema.safeParse(planId).success) {
    return { ok: false, message: "That meal plan does not exist." };
  }
  const problem = validate(input);
  if (problem) return { ok: false, message: problem };

  const { db, userId } = await getDb();
  if (!userId) return { ok: false, message: "Please log in first." };

  const { data, error } = await db
    .from("meal_plans")
    .update({
      recipe_id: input.recipeId,
      planned_date: input.plannedDate,
      meal_type: input.mealType,
    })
    .eq("id", planId)
    .eq("user_id", userId)
    .select(MEAL_PLAN_COLUMNS);

  if (error) {
    console.error("[meal_plans] update failed:", error.message);
    return {
      ok: false,
      message:
        error.code === "23503"
          ? "That recipe no longer exists."
          : "Could not save your changes. Please try again.",
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "That meal plan no longer exists." };
  }

  revalidatePath("/meal-plans");
  return { ok: true, plan: toMealPlan(data[0]) };
}

export async function removeMealPlanAction(
  planId: string,
): Promise<MealPlanResult> {
  if (!uuidSchema.safeParse(planId).success) {
    return { ok: false, message: "That meal plan does not exist." };
  }

  const { db, userId } = await getDb();
  if (!userId) return { ok: false, message: "Please log in first." };

  const { error } = await db
    .from("meal_plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", userId);

  if (error) {
    console.error("[meal_plans] delete failed:", error.message);
    return { ok: false, message: "Could not remove this meal. Please try again." };
  }

  revalidatePath("/meal-plans");
  return { ok: true };
}