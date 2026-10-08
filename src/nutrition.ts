import type { Profile } from "./schemas.js";

export interface Targets {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  basis: string;
}

const ACTIVITY_FACTOR: Record<Profile["activity"], number> = {
  sitzend: 1.2,
  leicht: 1.375,
  mittel: 1.55,
  hoch: 1.725,
  sehr_hoch: 1.9,
};

/**
 * Grobe Tagesziele nach Mifflin-St-Jeor. Gibt null zurück, wenn Körperdaten fehlen –
 * dann plant Claude ohne feste Kalorienvorgabe ("einfach gesund").
 */
export function calculateTargets(p: Profile): Targets | null {
  if (!p.age || !p.heightCm || !p.weightKg || !p.sex) return null;

  const sexOffset = p.sex === "m" ? 5 : p.sex === "w" ? -161 : -78;
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + sexOffset;
  const tdee = bmr * ACTIVITY_FACTOR[p.activity];

  let kcal = tdee;
  let proteinPerKg = 1.0;
  let fatShare = 0.3;
  switch (p.goal) {
    case "abnehmen":
      kcal = tdee - 500;
      proteinPerKg = 1.8;
      break;
    case "muskelaufbau":
      kcal = tdee + 300;
      proteinPerKg = 1.8;
      fatShare = 0.25;
      break;
    case "halten":
      proteinPerKg = 1.2;
      break;
    case "gesund":
      proteinPerKg = 1.0;
      break;
  }
  // Untergrenze, damit niemand unter den Grundumsatz rutscht
  kcal = Math.max(kcal, bmr * 1.1);

  const protein_g = p.weightKg * proteinPerKg;
  const fat_g = (kcal * fatShare) / 9;
  const carbs_g = Math.max(0, (kcal - protein_g * 4 - fat_g * 9) / 4);

  return {
    kcal: Math.round(kcal / 10) * 10,
    protein_g: Math.round(protein_g),
    carbs_g: Math.round(carbs_g),
    fat_g: Math.round(fat_g),
    basis: `Grundumsatz ≈ ${Math.round(bmr)} kcal, Gesamtumsatz ≈ ${Math.round(tdee)} kcal`,
  };
}
