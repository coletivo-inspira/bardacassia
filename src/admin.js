import "./garcom.css";
import { authBackendReady, buildAuthProviders, getCurrentUser, signIn, signOut } from "./integrations/auth.js";
import { listProfiles, loadSiteFeatures, saveSiteFeatures, setProfileRole } from "./integrations/features.js";
import { getFeatures } from "./lib/feature-state.js";
import {
  FEATURE_SWITCHES,
  effectiveAuthProviders,
  requestModeOf,
  storedAuthProviders,
} from "./lib/features.js";
import { getMyRole } from "./integrations/profile.js";
import { authErrorMessage } from "./lib/auth-validation.js";

const SPOTIFY_CLIENT_ID = String(import.meta.env.VITE_SPOTIFY_CLIENT_ID || "").trim();
const ROLE_OPTIONS = [
  ["cliente", "Cliente"],
  ["garcom", "Garçom"],
  ["dono", "Dono"],
  ["admin", "Administrador"],
];

const $ = (selector) => document.querySelector(selector);
const els = {
  unconfigured: $("#admin-unconfigured"),
  login: $("#login-view"),
  loginStatus: $("#login-status"),
  loginButton: $("#admin-login"),
  email: $("#admin-email"),
  password: $("#admin-password"),
  denied: $("#denied-view"),
  panel: $("#panel-view"),
  logout: $("#admin-logout"),
  status: $("#admin-status"),
  groups: $("#feature-groups"),
  providersSection: $("#providers-section"),
  providers: $("#provider-switches"),
  form: $("#features-form"),
  roles: $("#role-list"),
  rolesEmpty: $("#role-empty"),
  roleStatus: $("#role-status"),
};

let draft = null;

function roleMessage(error) {
  if (error?.hint === "ultimo_admin" || /last admin/i.test(error?.message || "")) {
    return "Não dá para tirar o último administrador.";
  }
  if (error?.code === "42501" || /admin only/i.test(error?.message || "")) {
    return "Só um administrador pode alterar papéis.";
  }
  return error?.message || "Não foi possível salvar.";
}

function show(view) {
  els.unconfigured.hidden = view !== "unconfigured";
  els.login.hidden = view !== "login";
  els.denied.hidden = view !== "denied";
  els.panel.hidden = view !== "panel";
  els.logout.hidden = view === "unconfigured" || view === "login";
}

function renderSwitches() {
  const features = draft;
  const visible = FEATURE_SWITCHES.filter((item) => item.id !== "spotify" || SPOTIFY_CLIENT_ID);
  const groups = [];
  for (const item of visible) {
    const group = groups.find((entry) => entry.name === item.group);
    if (group) group.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  els.groups.replaceChildren(...groups.map((group) => {
    const block = document.createElement("section");
    const title = document.createElement("h2");
    title.className = "staff-subtitle";
    title.textContent = group.name;
    const card = document.createElement("div");
    card.className = "staff-card";
    for (const item of group.items) {
      const label = document.createElement("label");
      label.className = "staff-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.feature = item.id;
      input.checked = Boolean(features[item.id]);
      label.append(input, document.createTextNode(` ${item.label}`));
      card.append(label);
    }
    block.append(title, card);
    return block;
  }));

  const mode = requestModeOf(features);
  document.querySelectorAll('input[name="request-mode"]').forEach((input) => {
    input.checked = input.value === mode;
  });

  const build = buildAuthProviders();
  els.providersSection.hidden = build.length === 0;
  if (!build.length) return;
  const selected = new Set(effectiveAuthProviders(features, build));
  els.providers.replaceChildren(...build.map((name) => {
    const label = document.createElement("label");
    label.className = "staff-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.provider = name;
    input.checked = selected.has(name);
    const caption = name.charAt(0).toUpperCase() + name.slice(1);
    label.append(input, document.createTextNode(` ${caption}`));
    return label;
  }));
}

function readForm() {
  const next = { ...draft };
  document.querySelectorAll("[data-feature]").forEach((input) => {
    next[input.dataset.feature] = input.checked;
  });
  const mode = document.querySelector('input[name="request-mode"]:checked');
  if (mode) next.request_mode = mode.value === "remoto" ? "remoto" : "qr";
  const build = buildAuthProviders();
  if (build.length) {
    const checked = [...document.querySelectorAll("[data-provider]:checked")].map((input) => input.dataset.provider);
    next.auth_providers = storedAuthProviders(checked, build);
  }
  return next;
}

function renderRoles(rows) {
  els.roles.replaceChildren(...(rows || []).map((row) => {
    const item = document.createElement("li");
    item.className = "staff-item";
    const info = document.createElement("div");
    info.className = "staff-item-info";
    const name = document.createElement("strong");
    name.className = "staff-item-name";
    name.textContent = String(row.display_name || "").trim() || "Sem nome";
    info.append(name);
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Papel de ${name.textContent}`);
    for (const [value, label] of ROLE_OPTIONS) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = value === row.role;
      select.append(option);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "staff-button staff-ghost staff-small";
    button.textContent = "Aplicar";
    button.addEventListener("click", async () => {
      button.disabled = true;
      els.roleStatus.textContent = "Salvando papel…";
      try {
        await setProfileRole(row.id, select.value);
        els.roleStatus.textContent = "Papel atualizado.";
      } catch (error) {
        els.roleStatus.textContent = roleMessage(error);
      } finally {
        button.disabled = false;
      }
    });
    const actions = document.createElement("div");
    actions.className = "staff-item-actions";
    actions.append(select, button);
    item.append(info, actions);
    return item;
  }));
  els.rolesEmpty.hidden = Boolean(rows?.length);
}

async function loadRoles() {
  const rows = await listProfiles();
  if (!rows) {
    els.roleStatus.textContent = "Não foi possível listar as contas.";
    els.rolesEmpty.hidden = true;
    return;
  }
  renderRoles(rows);
}

async function openPanel() {
  draft = { ...getFeatures() };
  renderSwitches();
  show("panel");
  await loadRoles();
}

async function enter() {
  const user = await getCurrentUser();
  if (!user) {
    show("login");
    return;
  }
  const role = await getMyRole();
  if (role !== "admin") {
    show("denied");
    return;
  }
  await openPanel();
}

function bind() {
  els.login.addEventListener("submit", async (event) => {
    event.preventDefault();
    els.loginButton.disabled = true;
    els.loginStatus.textContent = "Entrando…";
    try {
      await signIn({ email: els.email.value, password: els.password.value, persist: true });
      els.password.value = "";
      els.loginStatus.textContent = "";
      await enter();
    } catch (error) {
      els.loginStatus.textContent = authErrorMessage(error);
    } finally {
      els.loginButton.disabled = false;
    }
  });
  els.logout.addEventListener("click", async () => {
    await signOut();
    show("login");
  });
  $("#denied-logout").addEventListener("click", async () => {
    await signOut();
    show("login");
  });
  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = els.form.querySelector('button[type="submit"]');
    button.disabled = true;
    els.status.textContent = "Salvando…";
    try {
      draft = await saveSiteFeatures(readForm());
      renderSwitches();
      els.status.textContent = "Funcionalidades salvas. Quem abrir o site agora já vê a mudança.";
    } catch (error) {
      els.status.textContent = roleMessage(error);
    } finally {
      button.disabled = false;
    }
  });
}

async function boot() {
  if (!authBackendReady) {
    show("unconfigured");
    return;
  }
  await loadSiteFeatures();
  bind();
  await enter();
}

void boot();
