// ---------- Speicher (lokal im Browser) ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* z. B. privater Modus – App läuft trotzdem */
    }
  },
};

const state = {
  profile: store.get("profile", {}),
  pantry: store.get("pantry", []),
  plan: store.get("plan", null),
  shopping: store.get("shopping", []),
  cook: store.get("cook", null),
};
const save = (key) => store.set(key, state[key]);

// ---------- Hilfsfunktionen ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace(".", ","));
const macros = (m) =>
  m ? `${Math.round(m.kcal)} kcal · ${Math.round(m.protein_g)} g P · ${Math.round(m.carbs_g)} g KH · ${Math.round(m.fat_g)} g F` : "";

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2500);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

function loading(el, text) {
  el.innerHTML = `<div class="card loading"><div class="spinner"></div><div>${esc(text)}</div></div>`;
}
function showError(el, err) {
  el.innerHTML = `<div class="card error">⚠️ ${esc(err.message || err)}</div>`;
}

// ---------- Tabs ----------
function showTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${name}`));
  store.set("tab", name);
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ---------- Profil ----------
const profileForm = $("#profile-form");
const NUMBER_FIELDS = ["age", "heightCm", "weightKg", "mealsPerDay", "persons"];

function readProfile() {
  const fd = new FormData(profileForm);
  const p = {};
  for (const [k, v] of fd.entries()) {
    if (v === "") continue;
    p[k] = NUMBER_FIELDS.includes(k) ? Number(v) : v;
  }
  return p;
}
function fillProfile() {
  for (const [k, v] of Object.entries(state.profile)) {
    const el = profileForm.elements.namedItem(k);
    if (el) el.value = v;
  }
}
async function updateTargets() {
  try {
    const { targets } = await api("/api/targets", { profile: readProfile() });
    $("#targets").textContent = targets
      ? `Tagesziel: ca. ${targets.kcal} kcal · ${targets.protein_g} g Protein · ${targets.carbs_g} g Kohlenhydrate · ${targets.fat_g} g Fett`
      : "";
  } catch {
    $("#targets").textContent = "";
  }
}
function profileHint() {
  const p = state.profile;
  const goals = { gesund: "gesund & lecker", abnehmen: "Abnehmen", muskelaufbau: "Muskelaufbau", halten: "Gewicht halten" };
  $("#plan-profile-hint").innerHTML = Object.keys(p).length
    ? `Ziel: <b>${esc(goals[p.goal] || "gesund & lecker")}</b> · ${esc(p.diet || "omnivor")} · ${esc(p.mealsPerDay || 3)} Mahlzeiten · ${esc(p.persons || 1)} Pers.`
    : `Tipp: Lege zuerst dein <button class="link" data-goto="profile">Profil</button> an – oder leg einfach los.`;
}
profileForm.addEventListener("input", () => {
  clearTimeout(updateTargets.t);
  updateTargets.t = setTimeout(updateTargets, 300);
});
profileForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.profile = readProfile();
  save("profile");
  profileHint();
  toast("Profil gespeichert");
});
document.addEventListener("click", (e) => {
  const goto = e.target.closest("[data-goto]");
  if (goto) showTab(goto.dataset.goto);
});

// ---------- Rezepte ----------
function recipeHtml(r) {
  const extra = [];
  if (r.uses_soon?.length) extra.push(`<p>♻️ <b>Verwertet:</b> ${esc(r.uses_soon.join(", "))}</p>`);
  if (r.missing_optional?.length) extra.push(`<p class="muted">Optional (falls da): ${esc(r.missing_optional.join(", "))}</p>`);
  return `
    <h2>${esc(r.name)}</h2>
    <p>${esc(r.description)}</p>
    <p class="macros">⏱ ${esc(r.prep_minutes)} Min. · 🍽 ${esc(r.servings)} Portion(en)<br>Pro Portion: ${macros(r.per_serving)}</p>
    ${extra.join("")}
    <h3>Zutaten</h3>
    <ul>${r.ingredients.map((i) => `<li>${esc(fmt(i.amount))} ${esc(i.unit)} ${esc(i.name)}</li>`).join("")}</ul>
    <h3>Zubereitung</h3>
    <ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <div class="tags">${(r.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`;
}
function openRecipe(r) {
  $("#recipe-body").innerHTML = recipeHtml(r);
  $("#recipe-dialog").showModal();
}

// ---------- Wochenplan ----------
function renderPlan() {
  const out = $("#plan-output");
  const plan = state.plan;
  if (!plan) {
    out.innerHTML = "";
    return;
  }
  const byId = Object.fromEntries(plan.recipes.map((r) => [r.id, r]));
  out.innerHTML = `
    <div class="card">
      <h2>Deine Woche</h2>
      <p>${esc(plan.summary)}</p>
      <p class="targets">Ziel pro Tag: ${macros(plan.daily_target)}</p>
    </div>
    <div class="days">
      ${plan.days
        .map(
          (d) => `
        <div class="card day">
          <h3>${esc(d.day)} <span class="macros">${macros(d.totals)}</span></h3>
          ${d.meals
            .map((m) => {
              const r = byId[m.recipe_id];
              return `<div class="meal">
                <div class="slot">${esc(m.slot)}</div>
                <div>
                  ${r ? `<button class="link" data-recipe="${esc(r.id)}">${esc(r.name)}</button>` : esc(m.recipe_id)}
                  ${r ? `<div class="macros">⏱ ${esc(r.prep_minutes)} Min. · ${macros(r.per_serving)}</div>` : ""}
                  ${m.note ? `<div class="note">${esc(m.note)}</div>` : ""}
                </div>
              </div>`;
            })
            .join("")}
        </div>`,
        )
        .join("")}
    </div>`;
  out.querySelectorAll("[data-recipe]").forEach((b) => b.addEventListener("click", () => openRecipe(byId[b.dataset.recipe])));
}

$("#btn-plan").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  loading($("#plan-output"), "Dein Wochenplan wird erstellt … das dauert meist 1–3 Minuten.");
  try {
    const plan = await api("/api/plan", {
      profile: state.profile,
      pantry: $("#plan-use-pantry").checked ? state.pantry : [],
      wishes: $("#plan-wishes").value,
    });
    state.plan = plan;
    state.shopping = plan.shopping_list.map((s) => ({
      ...s,
      status: s.in_pantry ? "vorhanden" : s.pantry_note ? "teilweise" : "fehlt",
      note: s.pantry_note,
      checked: false,
    }));
    save("plan");
    save("shopping");
    renderPlan();
    renderShopping();
    toast("Plan & Einkaufsliste fertig");
  } catch (err) {
    showError($("#plan-output"), err);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Einkaufsliste ----------
const CATEGORY_ORDER = [
  "Obst & Gemüse", "Brot & Backwaren", "Kühlregal", "Fleisch & Fisch", "Tiefkühl",
  "Trockenwaren", "Konserven", "Gewürze & Öle", "Getränke", "Sonstiges",
];

function renderShopping() {
  const out = $("#shopping-output");
  if (!state.shopping.length) {
    out.innerHTML = `<div class="card muted">Noch keine Einkaufsliste – erstelle zuerst einen <button class="link" data-goto="plan">Wochenplan</button>.</div>`;
    return;
  }
  const hideHave = $("#hide-have").checked;
  const groups = new Map();
  state.shopping.forEach((item, idx) => {
    if (hideHave && item.status === "vorhanden") return;
    const cat = item.category || "Sonstiges";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push({ item, idx });
  });
  const cats = [...groups.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const toBuy = state.shopping.filter((s) => s.status !== "vorhanden" && !s.checked).length;
  const have = state.shopping.filter((s) => s.status === "vorhanden").length;

  out.innerHTML =
    `<p class="muted">Noch ${toBuy} Artikel zu kaufen · ${have} bereits zu Hause</p>` +
    cats
      .map(
        (cat) => `
      <div class="card shop-cat">
        <h3>${esc(cat)}</h3>
        ${groups
          .get(cat)
          .map(({ item, idx }) => {
            const cls = [item.status === "vorhanden" ? "have" : "", item.checked ? "checked" : ""].join(" ");
            const badge =
              item.status === "vorhanden"
                ? `<span class="badge have">zu Hause</span>`
                : item.status === "teilweise"
                  ? `<span class="badge partial">teilweise da</span>`
                  : "";
            return `<label class="shop-item ${cls}">
              <input type="checkbox" data-idx="${idx}" ${item.checked ? "checked" : ""} />
              <span class="what">${esc(item.name)}${badge}${item.note ? `<span class="pnote">${esc(item.note)}</span>` : ""}</span>
              <span class="amount">${esc(fmt(item.amount))} ${esc(item.unit)}</span>
            </label>`;
          })
          .join("")}
      </div>`,
      )
      .join("");

  out.querySelectorAll("input[data-idx]").forEach((cb) =>
    cb.addEventListener("change", () => {
      state.shopping[cb.dataset.idx].checked = cb.checked;
      save("shopping");
      renderShopping();
    }),
  );
}
$("#hide-have").addEventListener("change", () => {
  store.set("hideHave", $("#hide-have").checked);
  renderShopping();
});

async function matchWithPantry({ quiet = false } = {}) {
  if (!state.shopping.length) {
    if (!quiet) toast("Keine Einkaufsliste vorhanden");
    return;
  }
  if (!state.pantry.length) {
    if (!quiet) toast("Dein Vorrat ist leer");
    return;
  }
  const btn = $("#btn-match");
  btn.disabled = true;
  btn.textContent = "⏳ Gleiche ab …";
  try {
    const { matches } = await api("/api/shopping/match", {
      shoppingList: state.shopping.map(({ name, amount, unit }) => ({ name, amount, unit })),
      pantry: state.pantry,
    });
    for (const m of matches) {
      const item = state.shopping[m.index];
      if (!item) continue;
      item.status = m.status;
      item.note = m.status === "fehlt" ? "" : m.note;
    }
    save("shopping");
    renderShopping();
    toast("Einkaufsliste mit Vorrat abgeglichen");
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 Mit Vorrat abgleichen";
  }
}
$("#btn-match").addEventListener("click", () => matchWithPantry());

$("#btn-copy-list").addEventListener("click", async () => {
  const lines = state.shopping
    .filter((s) => s.status !== "vorhanden" && !s.checked)
    .map((s) => `☐ ${s.name} – ${fmt(s.amount)} ${s.unit}${s.note ? ` (${s.note})` : ""}`);
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    toast("Liste kopiert");
  } catch {
    toast("Kopieren nicht möglich");
  }
});

// ---------- Vorrat ----------
function renderPantry() {
  $("#pantry-count").textContent = state.pantry.length ? `(${state.pantry.length})` : "";
  $("#pantry-list").innerHTML = state.pantry.length
    ? state.pantry
        .map(
          (p, i) =>
            `<li><span>${esc(p.name)} ${p.quantity ? `<span class="muted small">${esc(p.quantity)}</span>` : ""}</span>
             <button class="x" data-del="${i}" aria-label="Entfernen">✕</button></li>`,
        )
        .join("")
    : `<li class="muted">Noch nichts im Vorrat. Scanne deinen Kühlschrank oder trage Lebensmittel ein.</li>`;
  $("#pantry-list")
    .querySelectorAll("[data-del]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        state.pantry.splice(Number(b.dataset.del), 1);
        save("pantry");
        renderPantry();
      }),
    );
}
function addToPantry(items) {
  for (const it of items) {
    const existing = state.pantry.find((p) => p.name.toLowerCase() === it.name.toLowerCase());
    if (existing) existing.quantity = it.quantity || existing.quantity;
    else state.pantry.push({ name: it.name, quantity: it.quantity || "" });
  }
  save("pantry");
  renderPantry();
}
$("#pantry-add").addEventListener("submit", (e) => {
  e.preventDefault();
  addToPantry([{ name: $("#pantry-name").value.trim(), quantity: $("#pantry-qty").value.trim() }]);
  $("#pantry-name").value = "";
  $("#pantry-qty").value = "";
  $("#pantry-name").focus();
});
$("#btn-clear-pantry").addEventListener("click", () => {
  if (!confirm("Gesamten Vorrat löschen?")) return;
  state.pantry = [];
  save("pantry");
  renderPantry();
});

// ---------- Kühlschrank-Scan ----------
let photos = [];

// Bilder verkleinern: spart Upload-Zeit; mehr als ~1568 px Kantenlänge bringt der KI nichts.
function downscale(file, maxEdge = 1568) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve({ dataUrl, mediaType: "image/jpeg", data: dataUrl.split(",")[1] });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} konnte nicht gelesen werden`));
    };
    img.src = url;
  });
}

$("#fridge-files").addEventListener("change", async (e) => {
  const files = [...e.target.files].slice(0, 5);
  try {
    photos = await Promise.all(files.map((f) => downscale(f)));
  } catch (err) {
    toast(err.message);
    photos = [];
  }
  $("#fridge-previews").innerHTML = photos.map((p) => `<img src="${p.dataUrl}" alt="Foto" />`).join("");
  $("#btn-scan").disabled = photos.length === 0;
});

$("#btn-scan").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const out = $("#scan-output");
  btn.disabled = true;
  loading(out, "Erkenne Lebensmittel …");
  try {
    const scan = await api("/api/fridge", { images: photos.map(({ mediaType, data }) => ({ mediaType, data })) });
    renderScan(scan);
  } catch (err) {
    showError(out, err);
  } finally {
    btn.disabled = false;
  }
});

function renderScan(scan) {
  const out = $("#scan-output");
  if (!scan.items.length) {
    out.innerHTML = `<div class="card">Keine Lebensmittel erkannt. ${esc(scan.notes)}</div>`;
    return;
  }
  out.innerHTML = `
    <div class="card">
      <h3>Erkannt (${scan.items.length})</h3>
      ${scan.notes ? `<p class="muted small">${esc(scan.notes)}</p>` : ""}
      <div id="scan-items">
        ${scan.items
          .map(
            (it, i) => `<div class="scan-item">
              <input type="checkbox" data-i="${i}" ${it.confidence === "niedrig" ? "" : "checked"} />
              <input value="${esc(it.name)}" data-name="${i}" />
              <input value="${esc(it.quantity)}" data-qty="${i}" class="qty" />
              ${it.confidence === "niedrig" ? `<span class="badge low">unsicher</span>` : ""}
            </div>`,
          )
          .join("")}
      </div>
      <label class="inline"><input type="checkbox" id="scan-replace" /> Bisherigen Vorrat ersetzen</label>
      <button class="primary" id="btn-scan-apply">✅ In Vorrat übernehmen</button>
    </div>`;
  $("#btn-scan-apply").addEventListener("click", async () => {
    const chosen = [...out.querySelectorAll("input[data-i]")]
      .filter((cb) => cb.checked)
      .map((cb) => ({
        name: out.querySelector(`[data-name="${cb.dataset.i}"]`).value.trim(),
        quantity: out.querySelector(`[data-qty="${cb.dataset.i}"]`).value.trim(),
      }))
      .filter((it) => it.name);
    if ($("#scan-replace").checked) state.pantry = [];
    addToPantry(chosen);
    out.innerHTML = "";
    toast(`${chosen.length} Lebensmittel übernommen`);
    if (state.shopping.length) await matchWithPantry({ quiet: true });
  });
}

// ---------- Jetzt kochen ----------
function renderCook() {
  const out = $("#cook-output");
  if (!state.cook) {
    out.innerHTML = "";
    return;
  }
  out.innerHTML = state.cook.recipes
    .map(
      (r, i) => `<div class="card recipe-card" data-cook="${i}">
        <h3>${esc(r.name)}</h3>
        <p>${esc(r.description)}</p>
        <p class="macros">⏱ ${esc(r.prep_minutes)} Min. · ${macros(r.per_serving)}</p>
        ${r.uses_soon?.length ? `<p class="small">♻️ Verwertet: ${esc(r.uses_soon.join(", "))}</p>` : ""}
        <button class="link">Rezept ansehen →</button>
      </div>`,
    )
    .join("");
  out.querySelectorAll("[data-cook]").forEach((c) =>
    c.addEventListener("click", () => openRecipe(state.cook.recipes[c.dataset.cook])),
  );
}

$("#btn-cook").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const out = $("#cook-output");
  if (!state.pantry.length) {
    out.innerHTML = `<div class="card">Dein Vorrat ist leer – <button class="link" data-goto="fridge">scanne zuerst deinen Kühlschrank</button>.</div>`;
    return;
  }
  btn.disabled = true;
  loading(out, "Suche Rezepte, die du ohne Einkaufen kochen kannst …");
  try {
    state.cook = await api("/api/cook-now", {
      profile: state.profile,
      pantry: state.pantry,
      count: Number($("#cook-count").value),
      mealType: $("#cook-type").value,
      wishes: $("#cook-wishes").value,
    });
    save("cook");
    renderCook();
  } catch (err) {
    showError(out, err);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Start ----------
fillProfile();
updateTargets();
profileHint();
$("#hide-have").checked = store.get("hideHave", false);
renderPlan();
renderShopping();
renderPantry();
renderCook();
showTab(store.get("tab", "plan"));
