import { Order, Recipe } from './types.ts';

export interface IngredientDeduction {
  inventoryItemId: string;
  ingredientName: string;
  quantityToDeduct: number;
  unit: string;
}

export function computeRecipeDeductions(
  order: Pick<Order, 'items' | 'inventoryDeducted'>,
  recipes: Recipe[],
): IngredientDeduction[] {
  if (order.inventoryDeducted) {
    return [];
  }

  const recipeByProduct = new Map(recipes.map((r) => [r.productId, r]));
  const aggregated = new Map<string, IngredientDeduction>();

  for (const item of order.items) {
    const recipe = recipeByProduct.get(item.productId);
    if (!recipe) continue;

    for (const ing of recipe.ingredients) {
      const delta = ing.quantityRequired * item.quantity;
      if (delta <= 0) continue;
      const existing = aggregated.get(ing.inventoryItemId);
      if (existing) {
        existing.quantityToDeduct = Math.round((existing.quantityToDeduct + delta) * 1000) / 1000;
      } else {
        aggregated.set(ing.inventoryItemId, {
          inventoryItemId: ing.inventoryItemId,
          ingredientName: ing.ingredientName,
          quantityToDeduct: Math.round(delta * 1000) / 1000,
          unit: ing.unit,
        });
      }
    }
  }

  return Array.from(aggregated.values());
}
