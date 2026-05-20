// Stratos Notes — panel de notas con permisos para asesores y papelera para admin.
// Sirve un SPA estático (HTML + JS) que habla con Supabase usando RLS + RPCs.
// Sin login propio: usa Supabase Auth con las mismas credenciales del CRM.
//
// Deploy:  supabase functions deploy stratos-notes --no-verify-jwt
// URL:     https://<ref>.functions.supabase.co/stratos-notes

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL =
  Deno.env.get("SB_URL") ??
  Deno.env.get("SUPABASE_URL") ??
  "https://glulgyhkrqpykxmujodb.supabase.co";

const SUPABASE_ANON_KEY =
  Deno.env.get("SB_ANON_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "sb_publishable_dQ19pluaoFjTCr8HNYVRmg_ToJvBL0q";

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<title>Stratos · Notas</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='80' font-size='80'>🗒️</text></svg>" />
<script src="https://cdn.tailwindcss.com"></script>
<style type="text/tailwindcss">
  body { -webkit-tap-highlight-color: transparent; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .scroll-shadow { background:
    linear-gradient(#fff 30%, rgba(255,255,255,0)) 0 0 / 100% 24px no-repeat,
    linear-gradient(rgba(255,255,255,0), #fff 70%) 0 100% / 100% 24px no-repeat,
    radial-gradient(farthest-side at 50% 0, rgba(0,0,0,.08), rgba(0,0,0,0)) 0 0 / 100% 12px no-repeat,
    radial-gradient(farthest-side at 50% 100%, rgba(0,0,0,.08), rgba(0,0,0,0)) 0 100% / 100% 12px no-repeat;
    background-attachment: local, local, scroll, scroll;
  }
  .chip { @apply inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium; }
  .btn  { @apply inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none; }
  .btn-primary { @apply btn bg-emerald-600 text-white hover:bg-emerald-700; }
  .btn-ghost   { @apply btn text-slate-700 hover:bg-slate-100; }
  .btn-danger  { @apply btn text-rose-700 hover:bg-rose-50; }
  .input { @apply w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100; }
  .label { @apply block text-xs font-medium text-slate-600 mb-1; }
  .card  { @apply rounded-xl border border-slate-200 bg-white shadow-sm; }
  .ring-soft { box-shadow: 0 1px 2px rgba(16,24,40,.05); }
  details > summary { list-style: none; cursor: pointer; }
  details > summary::-webkit-details-marker { display: none; }
  .nota-bubble { background: #0f172a; color: #e2e8f0; border-radius: 14px; padding: 12px 14px; }
  .nota-meta { color: #94a3b8; font-size: 11px; margin-top: 6px; }
</style>
</head>
<body class="bg-slate-50 text-slate-900">

<div id="app" class="min-h-dvh"></div>

<template id="tpl-login">
  <div class="min-h-dvh grid place-items-center p-4">
    <div class="card w-full max-w-sm p-6">
      <div class="text-center mb-5">
        <div class="text-3xl">🗒️</div>
        <h1 class="text-xl font-semibold mt-1">Stratos · Notas</h1>
        <p class="text-sm text-slate-500">Inicia sesión con tu correo del CRM.</p>
      </div>
      <form id="loginForm" class="space-y-3">
        <div>
          <label class="label" for="email">Correo</label>
          <input id="email" type="email" autocomplete="email" required class="input" />
        </div>
        <div>
          <label class="label" for="password">Contraseña</label>
          <input id="password" type="password" autocomplete="current-password" required class="input" />
        </div>
        <button class="btn-primary w-full" type="submit">Entrar</button>
        <p id="loginError" class="text-sm text-rose-600 hidden"></p>
      </form>
    </div>
  </div>
</template>

<template id="tpl-app">
  <header class="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200">
    <div class="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
      <button id="navBack" class="btn-ghost hidden" aria-label="Atrás">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <h1 id="navTitle" class="font-semibold text-base truncate">Mis leads</h1>
      <div class="ml-auto flex items-center gap-2">
        <button id="navPapelera" class="btn-ghost hidden" title="Papelera (admin)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="hidden sm:inline">Papelera</span>
        </button>
        <div id="navUser" class="text-xs text-slate-500"></div>
        <button id="navLogout" class="btn-ghost" title="Salir">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 12H3m0 0l4-4m-4 4l4 4M9 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  </header>
  <main id="view" class="mx-auto max-w-3xl px-4 py-4"></main>
</template>

<template id="tpl-leads">
  <div>
    <div class="mb-3">
      <input id="searchLead" class="input" placeholder="Buscar por nombre, teléfono o correo…" />
    </div>
    <div id="leadsList" class="space-y-2"></div>
  </div>
</template>

<template id="tpl-lead">
  <div class="space-y-4">
    <section class="card p-4">
      <div class="flex items-start gap-3">
        <div class="size-10 rounded-full bg-slate-900 text-white grid place-items-center font-semibold" id="leadInitial">·</div>
        <div class="min-w-0 flex-1">
          <h2 id="leadName" class="font-semibold text-base truncate"></h2>
          <p id="leadMeta" class="text-xs text-slate-500"></p>
        </div>
        <span id="leadStage" class="chip bg-slate-100 text-slate-700"></span>
      </div>
      <div id="leadExtras" class="mt-3 text-xs text-slate-600 grid grid-cols-2 gap-2"></div>
    </section>

    <section>
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold text-sm">Cronograma de notas</h3>
        <button id="addNote" class="btn-primary text-xs px-2 py-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          Agregar nota
        </button>
      </div>
      <div id="notesTimeline" class="space-y-2"></div>
    </section>
  </div>
</template>

<template id="tpl-papelera">
  <div>
    <p class="text-xs text-slate-500 mb-3">Notas eliminadas en los últimos meses. Sólo visible para admin/super_admin/ceo/director. Restaurar las devuelve al cronograma del lead.</p>
    <div id="papeleraList" class="space-y-2"></div>
  </div>
</template>

<!-- Modal helpers -->
<div id="modalRoot" class="fixed inset-0 z-50 hidden">
  <div class="absolute inset-0 bg-slate-900/40" data-dismiss></div>
  <div class="absolute inset-x-0 bottom-0 sm:inset-0 sm:grid sm:place-items-center p-3">
    <div id="modalCard" class="card w-full max-w-md p-4 sm:p-5"></div>
  </div>
</div>

<div id="toast" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 hidden">
  <div class="rounded-full bg-slate-900 text-white px-4 py-2 text-sm shadow-lg"></div>
</div>

<script type="module">
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = "__SUPABASE_URL__";
const SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "stratos-notes-auth" }
});

const ADMIN_ROLES = new Set(["super_admin", "admin", "ceo", "director"]);

const state = {
  user: null,
  profile: null,
  route: { name: "leads", leadId: null },
  leads: [],
  currentLead: null,
  notes: [],
  papelera: [],
};

// ---------- helpers ----------
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};
const initials = (s) => (s || "·").trim().split(/\\s+/).slice(0,2).map(w => w[0]?.toUpperCase() ?? "").join("") || "·";
const isAdmin = () => state.profile && ADMIN_ROLES.has(state.profile.role);

function toast(msg, kind = "ok") {
  const t = $("#toast");
  const inner = t.firstElementChild;
  inner.textContent = msg;
  inner.className = "rounded-full px-4 py-2 text-sm shadow-lg " + (kind === "err" ? "bg-rose-600 text-white" : "bg-slate-900 text-white");
  t.classList.remove("hidden");
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.add("hidden"), 2400);
}

function openModal(node) {
  const root = $("#modalRoot");
  const card = $("#modalCard");
  card.innerHTML = "";
  card.appendChild(node);
  root.classList.remove("hidden");
  root.querySelectorAll("[data-dismiss]").forEach(b => b.addEventListener("click", closeModal, { once: true }));
}
function closeModal() { $("#modalRoot").classList.add("hidden"); }

// ---------- auth ----------
async function loadSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  state.user = session.user;
  const { data: prof } = await sb.from("profiles").select("id, name, role, organization_id, view_all_leads").eq("id", session.user.id).maybeSingle();
  state.profile = prof;
  return session;
}

async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function logout() {
  await sb.auth.signOut();
  state.user = state.profile = null;
  render();
}

// ---------- data ----------
async function fetchLeads(query = "") {
  let q = sb.from("leads")
    .select("id, name, phone, email, stage, asesor_name, last_activity, hot, score, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (query.trim()) {
    const safe = query.replace(/[%_]/g, m => "\\\\" + m);
    q = q.or(\`name.ilike.%\${safe}%,phone.ilike.%\${safe}%,email.ilike.%\${safe}%\`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function fetchLead(id) {
  const { data, error } = await sb.from("leads")
    .select("id, name, phone, email, stage, project, campaign, presupuesto, budget, asesor_name, asesor_id, notas, score, hot, days_inactive, fecha_ingreso, created_at, updated_at")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchNotes(leadId) {
  const { data, error } = await sb.from("expediente_items")
    .select("id, lead_id, asesor_id, tipo, titulo, descripcion, metadata, created_at, updated_at, deleted_at")
    .eq("lead_id", leadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function addNote({ leadId, titulo, descripcion }) {
  const payload = {
    lead_id: leadId,
    asesor_id: state.user.id,
    tipo: "nota",
    titulo: titulo?.trim() || "Nota",
    descripcion: descripcion?.trim() || null,
    metadata: { source: "stratos-notes-ui" },
  };
  const { error } = await sb.from("expediente_items").insert(payload);
  if (error) throw error;
}

async function updateNote({ id, titulo, descripcion }) {
  const patch = {};
  if (typeof titulo === "string")      patch.titulo = titulo.trim() || "Nota";
  if (typeof descripcion === "string") patch.descripcion = descripcion.trim() || null;
  const { error } = await sb.from("expediente_items").update(patch).eq("id", id);
  if (error) throw error;
}

async function softDeleteNote(id, reason) {
  const { data, error } = await sb.rpc("soft_delete_expediente_item", { p_item_id: id, p_reason: reason ?? null });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "no se pudo eliminar");
}

async function restoreNote(id) {
  const { data, error } = await sb.rpc("restore_expediente_item", { p_item_id: id });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "no se pudo restaurar");
}

async function fetchPapelera(leadId = null) {
  const { data, error } = await sb.rpc("list_deleted_expediente_items", { p_lead_id: leadId });
  if (error) throw error;
  return data ?? [];
}

// ---------- views ----------
function mountApp() {
  const root = $("#app");
  root.innerHTML = "";
  root.appendChild($("#tpl-app").content.cloneNode(true));

  $("#navLogout").addEventListener("click", logout);
  $("#navBack").addEventListener("click", () => navigate({ name: "leads" }));
  $("#navPapelera").addEventListener("click", () => navigate({ name: "papelera" }));

  if (isAdmin()) $("#navPapelera").classList.remove("hidden");
  $("#navUser").textContent = state.profile?.name ? \`\${state.profile.name} · \${state.profile.role}\` : "";
}

function navigate(route) {
  state.route = route;
  render();
}

function renderLeadsList() {
  $("#navTitle").textContent = "Mis leads";
  $("#navBack").classList.add("hidden");
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild($("#tpl-leads").content.cloneNode(true));

  const search = $("#searchLead");
  const list   = $("#leadsList");
  const renderRows = (rows) => {
    list.innerHTML = "";
    if (!rows.length) {
      list.appendChild(el(\`<div class="text-sm text-slate-500 p-6 text-center">Sin leads visibles.</div>\`));
      return;
    }
    rows.forEach(r => {
      const card = el(\`
        <button class="w-full text-left card p-3 hover:bg-slate-50 active:bg-slate-100 transition">
          <div class="flex items-center gap-3">
            <div class="size-9 rounded-full bg-slate-900 text-white grid place-items-center text-xs font-semibold">\${initials(r.name)}</div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-medium truncate">\${escapeHtml(r.name || "(sin nombre)")}</span>
                \${r.hot ? '<span class="chip bg-rose-100 text-rose-700">🔥</span>' : ""}
              </div>
              <div class="text-xs text-slate-500 truncate">\${escapeHtml(r.phone || "")} \${r.email ? "· " + escapeHtml(r.email) : ""}</div>
            </div>
            <div class="text-right shrink-0">
              <div class="chip bg-slate-100 text-slate-700">\${escapeHtml(r.stage || "")}</div>
              <div class="text-[10px] text-slate-400 mt-1">\${escapeHtml(r.asesor_name || "")}</div>
            </div>
          </div>
        </button>\`);
      card.addEventListener("click", () => navigate({ name: "lead", leadId: r.id }));
      list.appendChild(card);
    });
  };

  renderRows(state.leads);

  let to;
  search.addEventListener("input", (e) => {
    clearTimeout(to);
    const q = e.target.value;
    to = setTimeout(async () => {
      try {
        const rows = await fetchLeads(q);
        state.leads = rows;
        renderRows(rows);
      } catch (e) { toast(e.message, "err"); }
    }, 200);
  });
}

async function renderLeadDetail(leadId) {
  $("#navTitle").textContent = "Lead";
  $("#navBack").classList.remove("hidden");
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild($("#tpl-lead").content.cloneNode(true));

  try {
    const [lead, notes] = await Promise.all([fetchLead(leadId), fetchNotes(leadId)]);
    state.currentLead = lead;
    state.notes = notes;
    if (!lead) { view.innerHTML = '<p class="text-sm text-slate-500">Lead no encontrado o sin acceso.</p>'; return; }

    $("#leadInitial").textContent = initials(lead.name);
    $("#leadName").textContent    = lead.name || "(sin nombre)";
    $("#leadMeta").textContent    = [lead.phone, lead.email].filter(Boolean).join(" · ");
    $("#leadStage").textContent   = lead.stage || "";
    const extras = $("#leadExtras");
    extras.innerHTML = "";
    const addExtra = (k, v) => { if (v == null || v === "") return; extras.appendChild(el(\`<div><div class="text-[10px] uppercase tracking-wide text-slate-400">\${escapeHtml(k)}</div><div class="truncate">\${escapeHtml(String(v))}</div></div>\`)); };
    addExtra("Asesor", lead.asesor_name);
    addExtra("Proyecto", lead.project);
    addExtra("Campaña", lead.campaign);
    addExtra("Presupuesto", lead.budget || (lead.presupuesto ? lead.presupuesto.toLocaleString("es-MX") : ""));
    addExtra("Score", lead.score);
    addExtra("Ingreso", fmtDate(lead.fecha_ingreso || lead.created_at));

    $("#addNote").addEventListener("click", () => openAddNoteModal(leadId));
    renderNotes();
  } catch (e) {
    toast(e.message, "err");
  }
}

function renderNotes() {
  const tl = $("#notesTimeline");
  tl.innerHTML = "";
  if (!state.notes.length) {
    tl.appendChild(el(\`<div class="text-sm text-slate-500 p-4 text-center">Sin notas todavía. Agrega la primera.</div>\`));
    return;
  }
  state.notes.forEach(n => {
    const myItem = n.asesor_id === state.user.id;
    const tipoChip = {
      "nota": "bg-emerald-100 text-emerald-700",
      "nota_ia": "bg-violet-100 text-violet-700",
      "historial_chat": "bg-sky-100 text-sky-700",
      "texto": "bg-amber-100 text-amber-700",
      "system": "bg-slate-100 text-slate-700",
    }[n.tipo] || "bg-slate-100 text-slate-700";
    const node = el(\`
      <article class="card p-3">
        <div class="flex items-center gap-2 mb-2">
          <span class="chip \${tipoChip}">\${escapeHtml(n.tipo)}</span>
          <span class="text-xs font-semibold truncate">\${escapeHtml(n.titulo || "Nota")}</span>
          <span class="ml-auto text-[11px] text-slate-400 shrink-0">\${fmtDate(n.created_at)}</span>
        </div>
        <p class="text-sm whitespace-pre-wrap break-words">\${escapeHtml(n.descripcion || "")}</p>
        <div class="mt-2 flex gap-2 justify-end">
          <button data-act="edit"   class="btn-ghost text-xs">Editar</button>
          <button data-act="delete" class="btn-danger text-xs">Eliminar</button>
        </div>
      </article>\`);
    node.querySelector('[data-act="edit"]').addEventListener("click", () => openEditNoteModal(n));
    node.querySelector('[data-act="delete"]').addEventListener("click", () => openDeleteNoteModal(n));
    tl.appendChild(node);
  });
}

function openAddNoteModal(leadId) {
  const node = el(\`
    <div>
      <h3 class="font-semibold mb-3">Nueva nota</h3>
      <div class="space-y-3">
        <div><label class="label">Título (opcional)</label><input id="mTitle" class="input" placeholder="Ej. Llamada de seguimiento" /></div>
        <div><label class="label">Contenido</label><textarea id="mDesc" rows="5" class="input" placeholder="Detalle de la nota…"></textarea></div>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-ghost" data-dismiss>Cancelar</button>
        <button id="mSave" class="btn-primary">Guardar</button>
      </div>
    </div>\`);
  openModal(node);
  $("#mDesc", node).focus();
  $("#mSave", node).addEventListener("click", async () => {
    const titulo = $("#mTitle", node).value;
    const desc   = $("#mDesc",  node).value;
    if (!desc.trim()) { toast("Escribe el contenido", "err"); return; }
    try {
      await addNote({ leadId, titulo, descripcion: desc });
      state.notes = await fetchNotes(leadId);
      renderNotes();
      toast("Nota agregada");
      closeModal();
    } catch (e) { toast(e.message, "err"); }
  });
}

function openEditNoteModal(n) {
  const node = el(\`
    <div>
      <h3 class="font-semibold mb-3">Editar nota</h3>
      <div class="space-y-3">
        <div><label class="label">Título</label><input id="mTitle" class="input" /></div>
        <div><label class="label">Contenido</label><textarea id="mDesc" rows="5" class="input"></textarea></div>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-ghost" data-dismiss>Cancelar</button>
        <button id="mSave" class="btn-primary">Guardar cambios</button>
      </div>
    </div>\`);
  openModal(node);
  $("#mTitle", node).value = n.titulo || "";
  $("#mDesc",  node).value = n.descripcion || "";
  $("#mDesc",  node).focus();
  $("#mSave", node).addEventListener("click", async () => {
    try {
      await updateNote({ id: n.id, titulo: $("#mTitle", node).value, descripcion: $("#mDesc", node).value });
      state.notes = await fetchNotes(state.route.leadId);
      renderNotes();
      toast("Cambios guardados");
      closeModal();
    } catch (e) { toast(e.message, "err"); }
  });
}

function openDeleteNoteModal(n) {
  const node = el(\`
    <div>
      <h3 class="font-semibold mb-1">Eliminar nota</h3>
      <p class="text-sm text-slate-500 mb-3">La nota queda en la papelera y puede recuperarse. Anota el motivo para que quede en el registro.</p>
      <div class="card p-2 bg-slate-50 text-sm mb-3">
        <div class="font-medium truncate">\${escapeHtml(n.titulo || "Nota")}</div>
        <div class="text-xs text-slate-500 line-clamp-3">\${escapeHtml(n.descripcion || "")}</div>
      </div>
      <label class="label">Motivo (opcional)</label>
      <input id="mReason" class="input" placeholder="Ej. instrucción ya cumplida" />
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-ghost" data-dismiss>Cancelar</button>
        <button id="mDel" class="btn-danger bg-rose-600 text-white hover:bg-rose-700">Eliminar</button>
      </div>
    </div>\`);
  openModal(node);
  $("#mReason", node).focus();
  $("#mDel", node).addEventListener("click", async () => {
    try {
      await softDeleteNote(n.id, $("#mReason", node).value);
      state.notes = await fetchNotes(state.route.leadId);
      renderNotes();
      toast("Nota eliminada (recuperable)");
      closeModal();
    } catch (e) { toast(e.message, "err"); }
  });
}

async function renderPapelera() {
  $("#navTitle").textContent = "Papelera (admin)";
  $("#navBack").classList.remove("hidden");
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild($("#tpl-papelera").content.cloneNode(true));
  const list = $("#papeleraList");
  list.innerHTML = '<div class="text-sm text-slate-500 p-4">Cargando…</div>';
  try {
    const rows = await fetchPapelera();
    state.papelera = rows;
    list.innerHTML = "";
    if (!rows.length) { list.appendChild(el(\`<div class="text-sm text-slate-500 p-4 text-center">No hay notas en la papelera.</div>\`)); return; }
    rows.forEach(r => {
      const node = el(\`
        <article class="card p-3">
          <div class="flex items-center gap-2 mb-1">
            <span class="chip bg-slate-100 text-slate-700">\${escapeHtml(r.tipo)}</span>
            <span class="text-xs font-semibold truncate">\${escapeHtml(r.titulo || "Nota")}</span>
            <span class="ml-auto text-[11px] text-slate-400 shrink-0">\${fmtDate(r.deleted_at)}</span>
          </div>
          <p class="text-sm whitespace-pre-wrap break-words text-slate-700">\${escapeHtml(r.descripcion || "")}</p>
          <div class="mt-2 text-[11px] text-slate-500">
            Eliminada por <span class="font-medium">\${escapeHtml(r.deleted_by_name || "—")}</span>
            \${r.deleted_reason ? " · motivo: " + escapeHtml(r.deleted_reason) : ""}
          </div>
          <div class="mt-2 flex justify-end gap-2">
            <button data-act="open-lead" class="btn-ghost text-xs">Ver lead</button>
            <button data-act="restore"   class="btn-primary text-xs">Restaurar</button>
          </div>
        </article>\`);
      node.querySelector('[data-act="open-lead"]').addEventListener("click", () => navigate({ name: "lead", leadId: r.lead_id }));
      node.querySelector('[data-act="restore"]').addEventListener("click", async () => {
        try { await restoreNote(r.id); toast("Nota restaurada"); state.papelera = await fetchPapelera(); renderPapelera(); }
        catch (e) { toast(e.message, "err"); }
      });
      list.appendChild(node);
    });
  } catch (e) {
    list.innerHTML = \`<div class="text-sm text-rose-600 p-4">No se pudo cargar la papelera: \${escapeHtml(e.message)}</div>\`;
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;" }[c]));
}

// ---------- main ----------
async function render() {
  if (!state.user) {
    const root = $("#app");
    root.innerHTML = "";
    root.appendChild($("#tpl-login").content.cloneNode(true));
    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("#loginError").classList.add("hidden");
      try {
        await login($("#email").value, $("#password").value);
        await loadSession();
        await refreshLeads();
        render();
      } catch (err) {
        const m = $("#loginError");
        m.textContent = err.message || "No se pudo iniciar sesión";
        m.classList.remove("hidden");
      }
    });
    return;
  }
  mountApp();
  if (state.route.name === "papelera") {
    renderPapelera();
  } else if (state.route.name === "lead" && state.route.leadId) {
    renderLeadDetail(state.route.leadId);
  } else {
    renderLeadsList();
  }
}

async function refreshLeads() {
  try { state.leads = await fetchLeads(""); } catch (e) { console.error(e); state.leads = []; }
}

(async () => {
  try {
    const session = await loadSession();
    if (session) await refreshLeads();
  } catch (e) { console.error(e); }
  render();
})();

sb.auth.onAuthStateChange(async (_evt, session) => {
  if (session?.user && (!state.user || state.user.id !== session.user.id)) {
    state.user = session.user;
    const { data: prof } = await sb.from("profiles").select("id, name, role, organization_id, view_all_leads").eq("id", session.user.id).maybeSingle();
    state.profile = prof;
    await refreshLeads();
    render();
  } else if (!session) {
    state.user = state.profile = null;
    render();
  }
});
</script>
</body>
</html>`;

Deno.serve((req) => {
  const url = new URL(req.url);

  // Salud
  if (url.pathname.endsWith("/health")) {
    return new Response("ok", { headers: { "content-type": "text/plain" } });
  }

  // CORS preflight (no debería usarse, la app vive en el mismo origen)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
        "access-control-allow-methods": "GET, POST, OPTIONS",
      },
    });
  }

  const body = html
    .replace(/__SUPABASE_URL__/g, SUPABASE_URL)
    .replace(/__SUPABASE_ANON_KEY__/g, SUPABASE_ANON_KEY);

  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "SAMEORIGIN",
      "referrer-policy": "no-referrer",
    },
  });
});
