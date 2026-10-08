import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTargets } from "./nutrition.js";
import { ProfileSchema } from "./schemas.js";

test("ohne Körperdaten gibt es keine Kalorienvorgabe", () => {
  assert.equal(calculateTargets(ProfileSchema.parse({})), null);
});

test("Abnehmen liegt unter, Muskelaufbau über dem Erhaltungsbedarf", () => {
  const base = { sex: "m", age: 30, heightCm: 180, weightKg: 80, activity: "mittel" } as const;
  const halten = calculateTargets(ProfileSchema.parse({ ...base, goal: "halten" }))!;
  const ab = calculateTargets(ProfileSchema.parse({ ...base, goal: "abnehmen" }))!;
  const auf = calculateTargets(ProfileSchema.parse({ ...base, goal: "muskelaufbau" }))!;
  // BMR = 800 + 1125 - 150 + 5 = 1780; TDEE = 1780 * 1.55 = 2759
  assert.equal(halten.kcal, 2760);
  assert.ok(ab.kcal < halten.kcal && auf.kcal > halten.kcal);
  assert.equal(ab.protein_g, 144);
});

test("Kalorien fallen nie unter 110 % des Grundumsatzes", () => {
  const t = calculateTargets(
    ProfileSchema.parse({ sex: "w", age: 70, heightCm: 150, weightKg: 45, activity: "sitzend", goal: "abnehmen" }),
  )!;
  const bmr = 10 * 45 + 6.25 * 150 - 5 * 70 - 161;
  assert.ok(t.kcal >= Math.round((bmr * 1.1) / 10) * 10);
});
