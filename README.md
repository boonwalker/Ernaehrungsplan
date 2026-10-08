# 🥗 Ernährungsplaner

KI-gestützte Web-App, die dir Wochen-Ernährungspläne mit gesunden, leckeren Rezepten und einer
passenden Einkaufsliste erstellt – auf Wunsch abgestimmt auf deine Fitnessziele. Mit einem Foto
deines Kühlschranks erkennt sie, was du schon zu Hause hast.

## Funktionen

| Bereich | Was passiert |
|---|---|
| 👤 **Profil** | Ziel (Abnehmen, Muskelaufbau, Halten oder einfach gesund essen), optionale Körperdaten, Ernährungsform, Allergien, Vorlieben, Haushaltsgröße, Kochzeit, Budget. Aus den Körperdaten berechnet die App Tagesziele für Kalorien und Makros (Mifflin-St-Jeor). |
| 📅 **Wochenplan** | 7 Tage mit Frühstück/Mittag/Abend (+ Snacks), Rezepte mit Zutaten, Schritten und Nährwerten. Meal-Prep und Reste werden bewusst eingeplant. |
| 🛒 **Einkaufsliste** | Alle Zutaten der Woche zusammengefasst und nach Supermarkt-Bereichen sortiert. Was du schon hast, ist als **„zu Hause“** oder **„teilweise da“** (mit Restmenge) markiert. Abhaken, ausblenden, kopieren. |
| 🧊 **Kühlschrank-Scan** | Foto(s) hochladen oder direkt mit dem Handy aufnehmen → die KI erkennt Lebensmittel und Mengen. Du prüfst die Liste und übernimmst sie in deinen Vorrat; eine vorhandene Einkaufsliste wird automatisch abgeglichen. |
| 🍳 **Jetzt kochen** | Rezeptvorschläge, die **nur** mit deinem Vorrat (+ Basisvorrat wie Salz, Öl, Gewürze) funktionieren – verderbliche Lebensmittel werden bevorzugt verwertet. |

Profil, Vorrat, Plan und Einkaufsliste werden lokal im Browser gespeichert.

## Zwei Varianten

- **Claude-Artifact (ohne API-Schlüssel):** `artifact/ernaehrungsplaner.html` läuft als Seite in Claude
  und fragt Claude über das Konto der Person, die sie öffnet. Daten werden privat im Claude-Konto gespeichert.
  Veröffentlicht unter <https://claude.ai/artifact/TbriwMUSPNzmRP6dTGHmMt>.
- **Eigener Server (mit API-Schlüssel):** die Node-App unten.

## Starten (Server-Variante)

Voraussetzungen: Node.js ≥ 22 und ein API-Schlüssel von <https://console.anthropic.com/>.

```bash
npm install
cp .env.example .env      # ANTHROPIC_API_KEY eintragen
npm start                 # → http://localhost:3000
```

Am Handy nutzen: Rechner und Handy im selben WLAN, dann `http://<IP-des-Rechners>:3000` öffnen.
(Für die Kamera-Aufnahme direkt im Browser ist auf manchen Geräten HTTPS nötig – das Auswählen
eines Fotos aus der Galerie funktioniert immer.)

## Technik

- **Backend:** Node.js + Express + TypeScript (`src/`), ausgeführt mit `tsx`
- **KI:** Claude über das offizielle `@anthropic-ai/sdk` – Bilderkennung für den Kühlschrank,
  strukturierte JSON-Ausgaben (Zod-Schemas in `src/schemas.ts`) für Pläne, Listen und Rezepte.
  Modell per `CLAUDE_MODEL` überschreibbar (Standard: `claude-opus-5-5`).
- **Frontend:** reines HTML/CSS/JS ohne Build-Schritt (`public/`), mobil optimiert, Dark Mode

| Endpoint | Zweck |
|---|---|
| `POST /api/targets` | Kalorien-/Makroziele aus dem Profil |
| `POST /api/plan` | Wochenplan + Einkaufsliste |
| `POST /api/fridge` | Lebensmittel auf Fotos erkennen |
| `POST /api/shopping/match` | Einkaufsliste mit Vorrat abgleichen |
| `POST /api/cook-now` | Rezepte nur aus dem Vorrat |

```bash
npm run typecheck   # TypeScript prüfen
npm test            # Unit-Tests (Kalorienberechnung)
npm run dev         # Server mit Auto-Reload
```

> Hinweis: Die Nährwerte sind Schätzungen und ersetzen keine medizinische oder
> ernährungstherapeutische Beratung.
