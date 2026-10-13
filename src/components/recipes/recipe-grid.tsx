import type { RecipeWithAuthor } from "@/lib/database.types";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { cn } from "@/lib/utils";

type RecipeGridProps = {
  recipes: RecipeWithAuthor[];
  className?: string;
  /** Number of cards given image priority, for above-the-fold LCP. */
  priorityCount?: number;
  /** Fade each card in as it scrolls into view. */
  reveal?: boolean;
};

export function RecipeGrid({
  recipes,
  className,
  priorityCount = 0,
  reveal = false,
}: RecipeGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {recipes.map((recipe, index) => (
        // The wrapper carries the animation so it can't fight the card's own
        // hover transform.
        <div key={recipe.id} className={cn("grid", reveal && "reveal")}>
          <RecipeCard recipe={recipe} priority={index < priorityCount} />
        </div>
      ))}
    </div>
  );
}
