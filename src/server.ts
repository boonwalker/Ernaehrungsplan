import Anthropic from "@anthropic-ai/sdk";
import express, { type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ClaudeError, cookNow, generateWeekPlan, isImageType, matchShoppingList, scanFridge } from "./claude.js";
import { calculateTargets } from "./nutrition.js";
import { PantryItemSchema, ProfileSchema } from "./schemas.js";

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

type Handler = (req: Request, res: Response) => Promise<void>;
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

const Pantry = z.array(PantryItemSchema).max(300).default([]);

app.post(
  "/api/targets",
  route(async (req, res) => {
    res.json({ targets: calculateTargets(ProfileSchema.parse(req.body.profile ?? {})) });
  }),
);

app.post(
  "/api/plan",
  route(async (req, res) => {
    const body = z
      .object({ profile: ProfileSchema, pantry: Pantry, wishes: z.string().max(1000).default("") })
      .parse(req.body);
    res.json(await generateWeekPlan(body.profile, body.pantry, body.wishes));
  }),
);

app.post(
  "/api/fridge",
  route(async (req, res) => {
    const body = z
      .object({
        images: z
          .array(z.object({ mediaType: z.string(), data: z.string().min(1) }))
          .min(1)
          .max(5),
      })
      .parse(req.body);
    const images = body.images.map((img) => {
      if (!isImageType(img.mediaType)) throw new ClaudeError(`Bildformat ${img.mediaType} wird nicht unterstützt.`);
      return { mediaType: img.mediaType, data: img.data };
    });
    res.json(await scanFridge(images));
  }),
);

app.post(
  "/api/shopping/match",
  route(async (req, res) => {
    const body = z
      .object({
        shoppingList: z
          .array(z.object({ name: z.string(), amount: z.number(), unit: z.string() }))
          .min(1)
          .max(300),
        pantry: Pantry,
      })
      .parse(req.body);
    res.json(await matchShoppingList(body.shoppingList, body.pantry));
  }),
);

app.post(
  "/api/cook-now",
  route(async (req, res) => {
    const body = z
      .object({
        profile: ProfileSchema,
        pantry: Pantry,
        count: z.number().int().min(1).max(6).default(3),
        mealType: z.string().max(50).default(""),
        wishes: z.string().max(500).default(""),
      })
      .parse(req.body);
    if (body.pantry.length === 0) throw new ClaudeError("Dein Vorrat ist leer – scanne zuerst deinen Kühlschrank.");
    res.json(await cookNow(body.profile, body.pantry, body));
  }),
);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "Ungültige Eingabe", details: err.issues });
  } else if (err instanceof ClaudeError) {
    res.status(422).json({ error: err.message });
  } else if (err instanceof Anthropic.AuthenticationError) {
    res.status(500).json({ error: "API-Schlüssel ungültig oder nicht gesetzt (ANTHROPIC_API_KEY)." });
  } else if (err instanceof Anthropic.RateLimitError) {
    res.status(429).json({ error: "Zu viele Anfragen – bitte kurz warten und erneut versuchen." });
  } else if (err instanceof Anthropic.APIError) {
    console.error(err);
    res.status(502).json({ error: `Fehler bei der KI-Anfrage (${err.status ?? "Netzwerk"}).` });
  } else if (err instanceof Anthropic.AnthropicError) {
    console.error(err.message);
    res.status(500).json({ error: "Keine Verbindung zur KI – ist ANTHROPIC_API_KEY in der .env gesetzt?" });
  } else {
    console.error(err);
    res.status(500).json({ error: "Unerwarteter Fehler." });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`🥗 Ernährungsplaner läuft auf http://localhost:${port}`));
