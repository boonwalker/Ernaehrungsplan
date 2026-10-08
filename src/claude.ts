import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { calculateTargets } from "./nutrition.js";
import {
  CookNowSchema,
  FridgeScanSchema,
  ShoppingMatchSchema,
  WeekPlanSchema,
  type CookNow,
  type FridgeScan,
  type PantryItem,
  type Profile,
  type ShoppingMatch,
  type WeekPlan,
} from "./schemas.js";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

const client = new Anthropic();

export class ClaudeError extends Error {}

type Effort = "low" | "medium" | "high";

async function ask<S extends z.ZodType>(
  schema: S,
  opts: {
    system: string;
    content: Anthropic.Beta.BetaContentBlockParam[];
    effort: Effort;
    maxTokens: number;
  },
): Promise<z.infer<S>> {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens,
    // Lehnt ein Sicherheitsfilter ab, springt serverseitig automatisch ein Ersatzmodell ein.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort, format: betaZodOutputFormat(schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new ClaudeError("Die Anfrage wurde abgelehnt. Bitte formuliere sie anders.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new ClaudeError("Die Antwort war zu lang und wurde abgeschnitten. Bitte versuche es erneut.");
  }
  if (message.parsed_output == null) {
    throw new ClaudeError("Die Antwort konnte nicht gelesen werden. Bitte versuche es erneut.");
  }
  return message.parsed_output as z.infer<S>;
}

const BASE_SYSTEM = `Du bist eine erfahrene Ernährungsberaterin und Köchin.
Du planst gesunde, abwechslungsreiche und wirklich leckere Gerichte mit Zutaten, die man in einem
normalen deutschen Supermarkt bekommt. Antworte immer auf Deutsch.
Nährwerte sind realistische Schätzungen. Halte Allergien und Abneigungen strikt ein.`;

const GOAL_TEXT: Record<Profile["goal"], string> = {
  abnehmen: "Gewicht reduzieren (Kaloriendefizit, viel Protein, sättigend, ballaststoffreich)",
  muskelaufbau: "Muskelaufbau (leichter Kalorienüberschuss, viel Protein, gute Kohlenhydratquellen rund ums Training)",
  halten: "Gewicht halten, ausgewogen essen",
  gesund: "Einfach gesund und lecker essen, ohne strenge Kalorienvorgabe",
};

function describeProfile(p: Profile): string {
  const targets = calculateTargets(p);
  const lines = [
    `Ziel: ${GOAL_TEXT[p.goal]}`,
    targets
      ? `Tagesziel pro Person: ca. ${targets.kcal} kcal, ${targets.protein_g} g Protein, ${targets.carbs_g} g Kohlenhydrate, ${targets.fat_g} g Fett (${targets.basis})`
      : "Keine Körperdaten angegeben – plane ausgewogene, normale Portionen (ca. 2000 kcal/Tag als Orientierung).",
    `Ernährungsform: ${p.diet}`,
    `Mahlzeiten pro Tag: ${p.mealsPerDay}`,
    `Personen im Haushalt: ${p.persons}`,
    `Kochzeit: ${{ schnell: "möglichst schnell (≤ 20 Min.)", mittel: "normal (≤ 40 Min.)", aufwendig: "darf auch mal aufwendiger sein" }[p.cookingTime]}`,
    `Budget: ${p.budget}`,
  ];
  if (p.allergies.trim()) lines.push(`Allergien/Unverträglichkeiten (STRIKT meiden): ${p.allergies}`);
  if (p.dislikes.trim()) lines.push(`Mag nicht: ${p.dislikes}`);
  if (p.preferences.trim()) lines.push(`Vorlieben/Wünsche: ${p.preferences}`);
  return lines.join("\n");
}

function describePantry(pantry: PantryItem[]): string {
  if (pantry.length === 0) return "(keine Angaben)";
  return pantry.map((i) => `- ${i.name}${i.quantity ? ` (${i.quantity})` : ""}`).join("\n");
}

function describeStaples(p: Profile): string {
  return p.staples.trim() || "Salz, Pfeffer, Öl, Essig, Zucker, Mehl, gängige getrocknete Gewürze";
}

export async function generateWeekPlan(
  profile: Profile,
  pantry: PantryItem[],
  wishes: string,
): Promise<WeekPlan> {
  const text = `Erstelle einen Ernährungsplan für eine Woche (Montag bis Sonntag).

## Profil
${describeProfile(profile)}

## Bereits vorhandene Lebensmittel (bevorzugt verwerten!)
${describePantry(pantry)}

## Basisvorrat (immer im Haus, nicht auf die Einkaufsliste)
${describeStaples(profile)}
${wishes.trim() ? `\n## Besondere Wünsche für diese Woche\n${wishes}\n` : ""}
## Regeln
- Jeder Tag hat genau ${profile.mealsPerDay} Mahlzeiten.
- Rezepte dürfen wiederverwendet werden (Meal-Prep, Reste vom Vortag), um Aufwand und Lebensmittelverschwendung zu sparen – dann in "note" vermerken.
- Rezeptmengen (servings, ingredients) sind für ${profile.persons} Person(en) pro Mahlzeit gerechnet; bei Meal-Prep entsprechend mehr Portionen.
- per_serving und totals gelten pro Person.
- Die Einkaufsliste fasst ALLE Zutaten der Woche zusammen (gleiche Zutaten addiert, sinnvolle Einheiten).
- Basisvorrat gehört nicht auf die Einkaufsliste.
- Zutaten, die im Vorrat sind, stehen trotzdem auf der Liste, aber mit in_pantry=true (bzw. pantry_note, falls nur teilweise vorhanden).`;

  return ask(WeekPlanSchema, {
    system: BASE_SYSTEM,
    content: [{ type: "text", text }],
    effort: "medium",
    maxTokens: 64000,
  });
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export function isImageType(t: string): t is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(t);
}

export async function scanFridge(images: { mediaType: ImageType; data: string }[]): Promise<FridgeScan> {
  return ask(FridgeScanSchema, {
    system: BASE_SYSTEM,
    content: [
      ...images.map((img) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
      })),
      {
        type: "text",
        text: `Das ${images.length > 1 ? "sind Fotos" : "ist ein Foto"} von meinem Kühlschrank / Vorrat.
Liste alle erkennbaren Lebensmittel auf, mit geschätzter Menge. Fasse gleiche Produkte zusammen.
Nenne Produkte allgemein (z. B. "Joghurt natur" statt Markenname). Rate nicht bei völlig verdeckten
Dingen; bei unsicherer Erkennung confidence "niedrig" setzen.`,
      },
    ],
    effort: "medium",
    maxTokens: 16000,
  });
}

export async function matchShoppingList(
  shoppingList: { name: string; amount: number; unit: string }[],
  pantry: PantryItem[],
): Promise<ShoppingMatch> {
  const list = shoppingList.map((s, i) => `${i}: ${s.name} – ${s.amount} ${s.unit}`).join("\n");
  return ask(ShoppingMatchSchema, {
    system: BASE_SYSTEM,
    content: [
      {
        type: "text",
        text: `Gleiche die Einkaufsliste mit meinem Vorrat ab.

## Einkaufsliste (Index: Artikel – Menge)
${list}

## Vorrat
${describePantry(pantry)}

Gib für JEDEN Index der Einkaufsliste einen Eintrag zurück:
- "vorhanden": Vorrat deckt den Bedarf (ungefähr) ab
- "teilweise": etwas da, aber zu wenig – in note schreiben, wie viel noch gekauft werden muss
- "fehlt": nicht im Vorrat
Achte auf Synonyme (z. B. "Hähnchenbrust" ≈ "Hähnchenfilet", "Lauchzwiebeln" ≈ "Frühlingszwiebeln").`,
      },
    ],
    effort: "low",
    maxTokens: 16000,
  });
}

export async function cookNow(
  profile: Profile,
  pantry: PantryItem[],
  opts: { count: number; mealType: string; wishes: string },
): Promise<CookNow> {
  return ask(CookNowSchema, {
    system: BASE_SYSTEM,
    content: [
      {
        type: "text",
        text: `Ich möchte jetzt kochen, OHNE einkaufen zu gehen.
Schlage ${opts.count} unterschiedliche Gerichte${opts.mealType ? ` (${opts.mealType})` : ""} vor, die ich NUR mit
meinem Vorrat und dem Basisvorrat zubereiten kann.

## Vorrat
${describePantry(pantry)}

## Basisvorrat
${describeStaples(profile)}

## Profil
${describeProfile(profile)}
${opts.wishes.trim() ? `\n## Wünsche\n${opts.wishes}\n` : ""}
## Regeln
- Jede Zutat in "ingredients" muss im Vorrat oder Basisvorrat stehen. Keine Ausnahmen.
- Mengen dürfen den Vorrat nicht übersteigen.
- Verderbliches (frisches Gemüse, Milchprodukte, Fleisch) bevorzugt verwerten und in uses_soon nennen.
- servings = ${profile.persons}.
- Optionale Extras, die man nicht hat, nur in missing_optional erwähnen.`,
      },
    ],
    effort: "medium",
    maxTokens: 32000,
  });
}
