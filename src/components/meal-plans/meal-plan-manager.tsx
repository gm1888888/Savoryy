"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { CalendarDays, Pencil, PlusCircle, Trash2, X } from "lucide-react";

import {
  addMealPlanAction,
  removeMealPlanAction,
  updateMealPlanAction,
} from "@/app/actions/meal-plans-action";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  formatPlanDate,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  todayString,
  type MealPlan,
  type MealType,
  type RecipeOption,
} from "@/lib/meal-plans";

type Props = {
  plans: MealPlan[];
  recipeOptions: RecipeOption[];
};

/** Breakfast, then lunch, then dinner within a day. */
const MEAL_ORDER: Record<MealType, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
};

const MEAL_BADGE: Record<MealType, string> = {
  breakfast: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  lunch: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  dinner: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
};

type FormState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; plan: MealPlan };

// "Today" comes from the browser so it follows the user's time zone, not the
// server's. The server snapshot is null, so nothing counts as past until the
// page has hydrated.
const subscribeNoop = () => () => {};
const getToday = () => todayString();
const getServerToday = () => null;

export function MealPlanManager({ plans: initialPlans, recipeOptions }: Props) {
  // Edits are applied to this local copy, so the page never has to refetch.
  const [plans, setPlans] = useState(initialPlans);
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const today = useSyncExternalStore(subscribeNoop, getToday, getServerToday);

  const { visible, pastCount } = useMemo(() => {
    const sorted = [...plans].sort(
      (a, b) =>
        a.planned_date.localeCompare(b.planned_date) ||
        MEAL_ORDER[a.meal_type] - MEAL_ORDER[b.meal_type],
    );
    const isPast = (p: MealPlan) => today !== null && p.planned_date < today;
    const past = sorted.filter(isPast);
    const shown = showPast ? sorted : sorted.filter((p) => !isPast(p));

    const groups = new Map<string, MealPlan[]>();
    for (const plan of shown) {
      const list = groups.get(plan.planned_date) ?? [];
      list.push(plan);
      groups.set(plan.planned_date, list);
    }
    return { visible: [...groups.entries()], pastCount: past.length };
  }, [plans, showPast, today]);

  function handleRemove(planId: string) {
    setNotice(null);
    startTransition(async () => {
      const result = await removeMealPlanAction(planId);
      if (!result.ok) {
        setNotice(result.message ?? "Could not remove this meal.");
        return;
      }
      setConfirmingId(null);
      setPlans((current) => current.filter((p) => p.id !== planId));
    });
  }

  function handleSaved(saved: MealPlan) {
    setForm({ mode: "closed" });
    setPlans((current) =>
      current.some((p) => p.id === saved.id)
        ? current.map((p) => (p.id === saved.id ? saved : p))
        : [...current, saved],
    );
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Meal plans
          </h1>
          <p className="mt-2 text-muted-foreground">
            {plans.length === 0
              ? "Plan what you will cook, day by day. Private to you."
              : plans.length === 1
                ? "1 meal planned."
                : plans.length + " meals planned."}
          </p>
        </div>
        <Button
          onClick={() => setForm({ mode: "add" })}
          className="gap-1.5"
        >
          <PlusCircle className="size-4" aria-hidden="true" />
          Plan a meal
        </Button>
      </header>

      {notice ? (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {notice}
        </p>
      ) : null}

      {pastCount > 0 ? (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {showPast
              ? "Hide past meals"
              : "Show " +
                pastCount +
                " past " +
                (pastCount === 1 ? "meal" : "meals")}
          </button>
        </div>
      ) : null}

      {plans.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-6" aria-hidden="true" />}
          title="Nothing planned yet"
          description="Pick a recipe, a day and a meal, and it will show up here."
          action={{ label: "Explore Recipes", href: "/recipes" }}
        />
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          No upcoming meals. Plan one, or show your past meals above.
        </p>
      ) : (
        <div className="space-y-8">
          {visible.map(([date, dayPlans]) => {
            const isToday = today === date;
            const isPast = today !== null && date < today;
            return (
              <section key={date} aria-labelledby={"day-" + date}>
                <h2
                  id={"day-" + date}
                  className={
                    "mb-3 flex items-center gap-2 font-heading text-lg font-semibold " +
                    (isPast ? "text-muted-foreground" : "")
                  }
                >
                  {formatPlanDate(date)}
                  {isToday ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      Today
                    </span>
                  ) : null}
                </h2>
                <ul className="space-y-3">
                  {dayPlans.map((plan) => (
                    <li
                      key={plan.id}
                      className={
                        "flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-3 sm:p-4 " +
                        (isPast ? "opacity-70" : "")
                      }
                    >
                      {plan.recipe?.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={plan.recipe.image_url}
                          alt=""
                          className="size-16 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="size-16 shrink-0 rounded-lg bg-muted"
                        />
                      )}

                      <div className="min-w-0 flex-1">
                        <span
                          className={
                            "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium " +
                            MEAL_BADGE[plan.meal_type]
                          }
                        >
                          {MEAL_TYPE_LABELS[plan.meal_type]}
                        </span>
                        {plan.recipe ? (
                          <Link
                            href={"/recipes/" + plan.recipe.id}
                            className="mt-1 block truncate font-medium hover:text-primary"
                          >
                            {plan.recipe.title}
                          </Link>
                        ) : (
                          <p className="mt-1 text-muted-foreground">
                            Recipe unavailable
                          </p>
                        )}
                      </div>

                      {confirmingId === plan.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            Remove?
                          </span>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isPending}
                            onClick={() => handleRemove(plan.id)}
                          >
                            {isPending ? "Removing..." : "Yes, remove"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5"
                            onClick={() => {
                              setNotice(null);
                              setForm({ mode: "edit", plan });
                            }}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            onClick={() => {
                              setNotice(null);
                              setConfirmingId(plan.id);
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            Remove
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {form.mode !== "closed" ? (
        <MealPlanDialog
          // Remount per plan so the fields always start from the right values.
          key={form.mode === "edit" ? form.plan.id : "new"}
          plan={form.mode === "edit" ? form.plan : null}
          recipeOptions={recipeOptions}
          onClose={() => setForm({ mode: "closed" })}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */

type DialogProps = {
  plan: MealPlan | null;
  recipeOptions: RecipeOption[];
  onClose: () => void;
  onSaved: (plan: MealPlan) => void;
};

const FIELD_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function MealPlanDialog({ plan, recipeOptions, onClose, onSaved }: DialogProps) {
  const isEdit = plan !== null;

  // When editing, keep the current recipe selectable even if it is no longer
  // bookmarked (otherwise the select would silently switch to another recipe).
  const options = useMemo(() => {
    if (!plan || !plan.recipe) return recipeOptions;
    if (recipeOptions.some((r) => r.id === plan.recipe_id)) return recipeOptions;
    return [
      { id: plan.recipe_id, title: plan.recipe.title },
      ...recipeOptions,
    ];
  }, [plan, recipeOptions]);

  const [recipeId, setRecipeId] = useState(plan?.recipe_id ?? "");
  const [plannedDate, setPlannedDate] = useState(
    plan?.planned_date ?? todayString(),
  );
  const [mealType, setMealType] = useState<MealType>(
    plan?.meal_type ?? "dinner",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!recipeId) {
      setError("Please choose a recipe.");
      return;
    }

    const input = { recipeId, plannedDate, mealType };
    startTransition(async () => {
      const result = plan
        ? await updateMealPlanAction(plan.id, input)
        : await addMealPlanAction(input);
      if (!result.ok || !result.plan) {
        setError(result.message ?? "Something went wrong.");
        return;
      }
      onSaved(result.plan);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-plan-dialog-title"
        className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2
            id="meal-plan-dialog-title"
            className="font-heading text-xl font-semibold"
          >
            {isEdit ? "Edit meal" : "Plan a meal"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {options.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You have no recipes to plan yet. Save a recipe or share one of
              your own, then come back.
            </p>
            <Button asChild>
              <Link href="/recipes">Explore Recipes</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="meal-recipe"
                className="mb-1.5 block text-sm font-medium"
              >
                Recipe
              </label>
              <select
                id="meal-recipe"
                value={recipeId}
                onChange={(e) => setRecipeId(e.target.value)}
                className={FIELD_CLASS}
                required
              >
                <option value="" disabled>
                  Choose a recipe...
                </option>
                {options.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Your saved recipes and the ones you shared.
              </p>
            </div>

            <div>
              <label
                htmlFor="meal-date"
                className="mb-1.5 block text-sm font-medium"
              >
                Date
              </label>
              <input
                id="meal-date"
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                className={FIELD_CLASS}
                required
              />
            </div>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Meal</legend>
              <div className="grid grid-cols-3 gap-2">
                {MEAL_TYPES.map((type) => (
                  <label
                    key={type}
                    className={
                      "cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring " +
                      (mealType === type
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input text-muted-foreground hover:bg-accent")
                    }
                  >
                    <input
                      type="radio"
                      name="meal-type"
                      value={type}
                      checked={mealType === type}
                      onChange={() => setMealType(type)}
                      className="sr-only"
                    />
                    {MEAL_TYPE_LABELS[type]}
                  </label>
                ))}
              </div>
            </fieldset>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Saving..."
                  : isEdit
                    ? "Save changes"
                    : "Add to plan"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}