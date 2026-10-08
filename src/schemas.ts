import { z } from "zod";

// ---------- Eingaben aus dem Frontend ----------

export const ProfileSchema = z.object({
  goal: z.enum(["abnehmen", "muskelaufbau", "halten", "gesund"]).default("gesund"),
  sex: z.enum(["m", "w", "d"]).optional(),
  age: z.number().int().min(10).max(110).optional(),
  heightCm: z.number().min(100).max(250).optional(),
  weightKg: z.number().min(30).max(300).optional(),
  activity: z.enum(["sitzend", "leicht", "mittel", "hoch", "sehr_hoch"]).default("leicht"),
  diet: z.enum(["omnivor", "flexitarisch", "pescetarisch", "vegetarisch", "vegan"]).default("omnivor"),
  mealsPerDay: z.number().int().min(2).max(6).default(3),
  persons: z.number().int().min(1).max(8).default(1),
  cookingTime: z.enum(["schnell", "mittel", "aufwendig"]).default("mittel"),
  budget: z.enum(["günstig", "normal", "egal"]).default("normal"),
  allergies: z.string().max(500).default(""),
  dislikes: z.string().max(500).default(""),
  preferences: z.string().max(1000).default(""),
  staples: z.string().max(1000).default(""),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PantryItemSchema = z.object({
  name: z.string().min(1).max(100),
  quantity: z.string().max(100).default(""),
});
export type PantryItem = z.infer<typeof PantryItemSchema>;

// ---------- Strukturierte Antworten von Claude ----------

const Macros = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});

const Ingredient = z.object({
  name: z.string(),
  amount: z.number().describe("Menge für alle Portionen des Rezepts"),
  unit: z.string().describe("z. B. g, ml, Stück, EL, TL, Prise"),
});

export const RecipeSchema = z.object({
  id: z.string().describe("Kurze eindeutige ID, z. B. r1, r2"),
  name: z.string(),
  description: z.string(),
  prep_minutes: z.number(),
  servings: z.number(),
  per_serving: Macros,
  ingredients: z.array(Ingredient),
  steps: z.array(z.string()),
  tags: z.array(z.string()),
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const WeekPlanSchema = z.object({
  summary: z.string().describe("2–3 Sätze zur Idee hinter dem Plan"),
  daily_target: Macros,
  days: z.array(
    z.object({
      day: z.string().describe("Montag … Sonntag"),
      meals: z.array(
        z.object({
          slot: z.string().describe("Frühstück, Mittagessen, Abendessen oder Snack"),
          recipe_id: z.string(),
          note: z.string().describe("z. B. 'Reste vom Vortag' – sonst leer"),
        }),
      ),
      totals: Macros,
    }),
  ),
  recipes: z.array(RecipeSchema),
  shopping_list: z.array(
    z.object({
      name: z.string(),
      amount: z.number(),
      unit: z.string(),
      category: z.string().describe(
        "Obst & Gemüse, Kühlregal, Fleisch & Fisch, Brot & Backwaren, Trockenwaren, Konserven, Gewürze & Öle, Tiefkühl, Getränke, Sonstiges",
      ),
      in_pantry: z.boolean().describe("true, wenn laut Vorrat bereits ausreichend vorhanden"),
      pantry_note: z.string().describe("z. B. 'teilweise vorhanden – noch 200 g kaufen' – sonst leer"),
    }),
  ),
});
export type WeekPlan = z.infer<typeof WeekPlanSchema>;

export const FridgeScanSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe("Allgemeiner deutscher Lebensmittelname, z. B. 'Paprika rot'"),
      quantity: z.string().describe("Geschätzte Menge, z. B. '2 Stück', 'ca. 500 ml', 'halb voll'"),
      category: z.string(),
      confidence: z.enum(["hoch", "mittel", "niedrig"]),
    }),
  ),
  notes: z.string().describe("Hinweise, z. B. verdeckte Bereiche oder Dinge, die bald verbraucht werden sollten"),
});
export type FridgeScan = z.infer<typeof FridgeScanSchema>;

export const ShoppingMatchSchema = z.object({
  matches: z.array(
    z.object({
      index: z.number().describe("Index des Eintrags in der Einkaufsliste"),
      status: z.enum(["vorhanden", "teilweise", "fehlt"]),
      note: z.string(),
    }),
  ),
});
export type ShoppingMatch = z.infer<typeof ShoppingMatchSchema>;

export const CookNowSchema = z.object({
  recipes: z.array(
    RecipeSchema.extend({
      uses_soon: z.array(z.string()).describe("Zutaten aus dem Vorrat, die bald verbraucht werden sollten"),
      missing_optional: z.array(z.string()).describe("Optionale Zutaten, die das Gericht verbessern würden, aber nicht nötig sind"),
    }),
  ),
});
export type CookNow = z.infer<typeof CookNowSchema>;
