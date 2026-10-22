import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

const config = window.ERIKRAFT_FIREBASE_CONFIG || {};
if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
  // The existing sign-in UI already reports missing Firebase configuration.
} else {
  const auth = getAuth(getApps().length ? getApp() : initializeApp(config));
  const $ = (id) => document.getElementById(id);
  let user = null;
  let photoUrl = "";
  const style = document.createElement("style");
  style.textContent = `
  .profile-trigger{width:36px;height:36px;flex:0 0 36px;padding:0;border:1px solid #4285f4;border-radius:50%;overflow:hidden;background:#111722;display:none;place-items:center;cursor:pointer;color:#dce7fb}
  .profile-trigger img{width:100%;height:100%;object-fit:cover}.profile-trigger i{font-size:15px}
  .profile-popover{position:fixed;z-index:80;top:78px;right:18px;width:min(360px,calc(100vw - 28px));padding:22px;border:1px solid #30394b;border-radius:24px;background:#141720;box-shadow:0 22px 70px #000b;color:#f0f3fa;text-align:center}
  .profile-popover[hidden]{display:none}.profile-popover .profile-head{flex-direction:column;gap:10px;margin-bottom:18px}.profile-popover .profile-large-avatar{width:76px;height:76px}.profile-popover .profile-email{font-size:13px}.profile-popover .profile-subtitle{font-size:11px}
  .profile-head{display:flex;align-items:center;gap:13px;margin-bottom:16px}.profile-large-avatar{width:58px;height:58px;border-radius:50%;object-fit:cover;background:#202735;border:1px solid #3b465c;flex:0 0 auto}
  .profile-email{font-size:12px;overflow-wrap:anywhere;color:#d5deed}.profile-subtitle{font-size:10px;color:#9ba8bc;margin-top:4px}
  .profile-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap}.profile-action svg{width:12px;height:12px;vertical-align:-2px}.profile-action{border:1px solid #354158;background:#0e1119;color:#e8edf6;border-radius:12px;padding:10px 12px;font:600 11px 'DM Sans',sans-serif;cursor:pointer}.profile-action:hover{border-color:#4285f4}.profile-action.danger{color:#ffaaaa}.profile-status{font-size:11px;color:#aab8ce;min-height:18px;margin:12px 0 0}.profile-file{display:none}
  .profile-popover .profile-signout{margin-top:16px;width:100%;justify-content:center}.profile-popover .profile-divider{height:1px;background:#30394b;margin:18px 0 0}
  `;
  document.head.append(style);
  const trigger = document.createElement("button");
  trigger.className = "profile-trigger"; trigger.type = "button"; trigger.id = "profile-trigger";
  trigger.setAttribute("aria-label", "Abrir perfil"); trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = '<i class="fa-solid fa-user" aria-hidden="true"></i>';
  const logoutButton = $("logout");
  if (logoutButton) { logoutButton.before(trigger); logoutButton.style.display = "none"; }
  const popover = document.createElement("section");
  popover.className = "profile-popover"; popover.hidden = true; popover.setAttribute("aria-label", "Perfil da conta");
  popover.innerHTML = `
    <div class="profile-head"><img class="profile-large-avatar" alt="Foto de perfil"><div><div class="profile-email"></div><div class="profile-subtitle">Conta conectada</div></div></div>
    <div class="profile-actions"><button class="profile-action" type="button" data-profile-upload><i class="fa-solid fa-pen" aria-hidden="true"></i> Alterar foto</button><button class="profile-action danger" type="button" data-profile-delete><i class="fa-solid fa-trash" aria-hidden="true"></i> Remover foto</button><button class="profile-action" type="button" data-profile-restore title="Restaurar foto do provedor" aria-label="Restaurar foto do provedor"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M463.5 224l8.5 0c13.3 0 24-10.7 24-24l0-128c0-9.7-5.8-18.5-14.8-22.2s-19.3-1.7-26.2 5.2L413.4 96.6c-87.6-86.5-228.7-86.2-315.8 1c-87.5 87.5-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3c62.2-62.2 162.7-62.5 225.3-1L327 183c-6.9 6.9-8.9 17.2-5.2 26.2s12.5 14.8 22.2 14.8l119.5 0z"/></svg> Restaurar foto</button></div>
    <input class="profile-file" type="file" accept="image/png,image/jpeg,image/webp"><p class="profile-status" role="status" aria-live="polite"></p><div class="profile-divider"></div><button class="button secondary small profile-signout" type="button"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Sair</button>`;
  document.body.append(popover);
  const avatar = popover.querySelector(".profile-large-avatar");
  const file = popover.querySelector(".profile-file");
  const status = popover.querySelector(".profile-status");
  function setPhoto(url) {
    photoUrl = url || "";
    trigger.innerHTML = photoUrl ? "" : '<i class="fa-solid fa-user" aria-hidden="true"></i>';
    if (photoUrl) {
      const image = document.createElement("img"); image.src = photoUrl; image.alt = "";
      trigger.append(image); avatar.src = photoUrl; avatar.classList.remove("hidden");
    } else {
      avatar.removeAttribute("src"); avatar.classList.add("hidden");
    }
  }
  async function request(method = "GET", body) {
    const token = await user.getIdToken();
    const response = await fetch("/api/profile", { method, headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível atualizar o perfil.");
    return data;
  }
  async function loadPhoto() {
    const data = await request(); setPhoto(data.photo || user.photoURL || "");
  }
  trigger.addEventListener("click", () => {
    popover.hidden = !popover.hidden;
    trigger.setAttribute("aria-expanded", String(!popover.hidden));
  });
  document.addEventListener("click", (event) => {
    if (!popover.hidden && !popover.contains(event.target) && !trigger.contains(event.target)) {
      popover.hidden = true; trigger.setAttribute("aria-expanded", "false");
    }
  });
  popover.querySelector(".profile-signout").addEventListener("click", () => {
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    // Reuse the existing sign-out handler from app.js without duplicating auth logic.
    if (logoutButton) logoutButton.click();
  });
  popover.querySelector("[data-profile-upload]").addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const selected = file.files?.[0]; file.value = "";
    if (!selected) return;
    if (!["image/png","image/jpeg","image/webp"].includes(selected.type)) { status.textContent = "Use uma imagem PNG, JPEG ou WebP."; return; }
    if (selected.size > 1024 * 1024) { status.textContent = "A imagem deve ter no máximo 1 MiB."; return; }
    status.textContent = "Salvando foto…";
    try {
      const photo = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Não foi possível ler a imagem.")); reader.readAsDataURL(selected); });
      const result = await request("PUT", { photo }); setPhoto(result.photo); status.textContent = "Foto de perfil atualizada.";
    } catch (error) { status.textContent = error.message || "Falha ao salvar a foto."; }
  });
  popover.querySelector("[data-profile-restore]").addEventListener("click", () => {
    setPhoto(user?.photoURL || "");
    status.textContent = user?.photoURL ? "Foto do provedor restaurada neste site." : "O provedor não disponibilizou uma foto de perfil.";
  });
  popover.querySelector("[data-profile-delete]").addEventListener("click", async () => {
    status.textContent = "Removendo foto…";
    try { await request("DELETE"); setPhoto(""); status.textContent = "Foto removida do perfil e do MongoDB Atlas."; }
    catch (error) { status.textContent = error.message || "Falha ao remover a foto."; }
  });
  onAuthStateChanged(auth, async (nextUser) => {
    user = nextUser;
    const active = Boolean(user && (!user.providerData?.some((p) => p.providerId === "password") || user.emailVerified));
    trigger.style.display = active ? "grid" : "none";
    if (!active) { popover.hidden = true; setPhoto(""); return; }
    popover.querySelector(".profile-email").textContent = user.email || "E-mail indisponível";
    popover.querySelector(".profile-subtitle").textContent = user.displayName || "Conta conectada";
    status.textContent = "";
    try { await loadPhoto(); } catch (error) { setPhoto(user.photoURL || ""); status.textContent = error.message; }
  });
}
