import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

const config = window.ERIKRAFT_FIREBASE_CONFIG || {};
if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
  // The existing sign-in UI already reports missing Firebase configuration.
} else {
  const auth = getAuth(getApps().length ? getApp() : initializeApp(config));
  const $ = (id) => document.getElementById(id);
  const profileTranslations = {
    "pt-BR": {
      openProfile:"Abrir perfil", accountProfile:"Perfil da conta", closeProfile:"Fechar perfil",
      profilePhotoAlt:"Foto de perfil", connectedAccount:"Conta conectada", emailUnavailable:"E-mail indisponível",
      changePhoto:"Alterar foto", removePhoto:"Remover foto", restoreProviderPhoto:"Restaurar foto do provedor", signOut:"Sair",
      invalidImageType:"Use uma imagem PNG, JPEG ou WebP.", imageTooLarge:"A imagem deve ter no máximo 1 MiB.",
      savingPhoto:"Salvando foto…", photoUpdated:"Foto de perfil atualizada.", readImageFailed:"Não foi possível ler a imagem.",
      savePhotoFailed:"Falha ao salvar a foto.", restoringProviderPhoto:"Restaurando foto do provedor…",
      providerPhotoRestored:"Foto do provedor restaurada neste site.", providerPhotoMissing:"O provedor não disponibilizou uma foto de perfil.",
      restorePhotoFailed:"Falha ao restaurar a foto.", removingPhoto:"Removendo foto…",
      photoRemoved:"Foto removida. O avatar ficará sem foto até você restaurá-la.", removePhotoFailed:"Falha ao remover a foto.",
      profileUpdateFailed:"Não foi possível atualizar o perfil."
    },
    en: {
      openProfile:"Open profile", accountProfile:"Account profile", closeProfile:"Close profile",
      profilePhotoAlt:"Profile photo", connectedAccount:"Connected account", emailUnavailable:"Email unavailable",
      changePhoto:"Change photo", removePhoto:"Remove photo", restoreProviderPhoto:"Restore provider photo", signOut:"Sign out",
      invalidImageType:"Choose a PNG, JPEG, or WebP image.", imageTooLarge:"The image must be 1 MiB or smaller.",
      savingPhoto:"Saving photo…", photoUpdated:"Profile photo updated.", readImageFailed:"Could not read the image.",
      savePhotoFailed:"Could not save the photo.", restoringProviderPhoto:"Restoring provider photo…",
      providerPhotoRestored:"Provider photo restored on this site.", providerPhotoMissing:"The provider did not supply a profile photo.",
      restorePhotoFailed:"Could not restore the photo.", removingPhoto:"Removing photo…",
      photoRemoved:"Photo removed. Your avatar will stay blank until you restore a photo.", removePhotoFailed:"Could not remove the photo.",
      profileUpdateFailed:"Could not update the profile."
    }
  };
  const profileText = (key) => profileTranslations[document.documentElement.lang === "en" ? "en" : "pt-BR"][key] || key;
  let user = null;
  let photoUrl = "";
  const style = document.createElement("style");
  style.textContent = `
  .profile-trigger{width:36px;height:36px;flex:0 0 36px;padding:0;border:1px solid #4285f4;border-radius:50%;overflow:hidden;background:#111722;display:none;place-items:center;cursor:pointer;color:#dce7fb}
  .profile-trigger img{width:100%;height:100%;object-fit:cover}.profile-trigger i{font-size:15px}
  .profile-popover{position:fixed;z-index:1000;top:78px;right:18px;width:min(360px,calc(100vw - 28px));max-height:calc(100dvh - 96px);overflow:auto;padding:22px;border:1px solid #30394b;border-radius:24px;background:#141720;box-shadow:0 22px 70px #000b;color:#f0f3fa;text-align:center}
  .profile-popover[hidden]{display:none}.profile-close{position:absolute;top:10px;right:10px;display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid #354158;border-radius:10px;background:#0e1119;color:#e8edf6;cursor:pointer}.profile-close:hover{border-color:#4285f4;background:#1b2230}.profile-close:focus-visible{outline:2px solid #9dc2ff;outline-offset:3px}.profile-close svg{width:14px;height:14px;display:block}.profile-popover .profile-head{flex-direction:column;gap:10px;margin-bottom:18px}.profile-popover .profile-large-avatar{width:76px;height:76px}.profile-popover .profile-email{font-size:13px}.profile-popover .profile-subtitle{font-size:11px}
  .profile-head{display:flex;align-items:center;gap:13px;margin-bottom:16px}.profile-large-avatar{width:58px;height:58px;border-radius:50%;object-fit:cover;background:#202735;border:1px solid #3b465c;flex:0 0 auto}
  .profile-email{font-size:12px;overflow-wrap:anywhere;color:#d5deed}.profile-subtitle{font-size:10px;color:#9ba8bc;margin-top:4px}
  .profile-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap}.profile-action svg{width:12px;height:12px;vertical-align:-2px}.profile-action{border:1px solid #354158;background:#0e1119;color:#e8edf6;border-radius:12px;padding:10px 12px;font:600 11px 'DM Sans',sans-serif;cursor:pointer}.profile-action:hover{border-color:#4285f4}.profile-action.danger{color:#ffaaaa}.profile-status{font-size:11px;color:#aab8ce;min-height:18px;margin:12px 0 0}.profile-file{display:none}
  .profile-popover .profile-signout{margin-top:16px;width:100%;justify-content:center}.profile-popover .profile-divider{height:1px;background:#30394b;margin:18px 0 0}
  `;
  document.head.append(style);
  const trigger = document.createElement("button");
  trigger.className = "profile-trigger"; trigger.type = "button"; trigger.id = "profile-trigger";
  trigger.setAttribute("aria-label", profileText("openProfile")); trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = '<i class="fa-solid fa-user" aria-hidden="true"></i>';
  const logoutButton = $("logout");
  if (logoutButton) { logoutButton.before(trigger); logoutButton.style.display = "none"; }
  const popover = document.createElement("section");
  popover.className = "profile-popover"; popover.hidden = true; popover.setAttribute("aria-label", profileText("accountProfile"));
  popover.innerHTML = `
    <button class="profile-close" type="button" data-profile-close aria-label="Fechar perfil" title="Fechar perfil"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3l105.4 105.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256l105.3-105.4z"/></svg></button>
    <div class="profile-head"><img class="profile-large-avatar" alt="Foto de perfil"><div><div class="profile-email"></div><div class="profile-subtitle">Conta conectada</div></div></div>
    <div class="profile-actions"><button class="profile-action" type="button" data-profile-upload><i class="fa-solid fa-pen" aria-hidden="true"></i> <span data-profile-i18n="changePhoto">Alterar foto</span></button><button class="profile-action danger" type="button" data-profile-delete><i class="fa-solid fa-trash" aria-hidden="true"></i> <span data-profile-i18n="removePhoto">Remover foto</span></button><button class="profile-action" type="button" data-profile-restore title="Restaurar foto do provedor" aria-label="Restaurar foto do provedor"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M463.5 224l8.5 0c13.3 0 24-10.7 24-24l0-128c0-9.7-5.8-18.5-14.8-22.2s-19.3-1.7-26.2 5.2L413.4 96.6c-87.6-86.5-228.7-86.2-315.8 1c-87.5 87.5-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3c62.2-62.2 162.7-62.5 225.3-1L327 183c-6.9 6.9-8.9 17.2-5.2 26.2s12.5 14.8 22.2 14.8l119.5 0z"/></svg> <span data-profile-i18n="restoreProviderPhoto">Restaurar foto</span></button></div>
    <input class="profile-file" type="file" accept="image/png,image/jpeg,image/webp"><p class="profile-status" role="status" aria-live="polite"></p><div class="profile-divider"></div><button class="button secondary small profile-signout" type="button"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> <span data-profile-i18n="signOut">Sair</span></button>`;
  document.body.append(popover);
  const avatar = popover.querySelector(".profile-large-avatar");
  const file = popover.querySelector(".profile-file");
  const status = popover.querySelector(".profile-status");
  function updateProfileLanguage() {
    trigger.setAttribute("aria-label", profileText("openProfile"));
    popover.setAttribute("aria-label", profileText("accountProfile"));
    avatar.alt = profileText("profilePhotoAlt");
    const close = popover.querySelector("[data-profile-close]");
    close.setAttribute("aria-label", profileText("closeProfile"));
    close.title = profileText("closeProfile");
    const restore = popover.querySelector("[data-profile-restore]");
    restore.setAttribute("aria-label", profileText("restoreProviderPhoto"));
    restore.title = profileText("restoreProviderPhoto");
    popover.querySelectorAll("[data-profile-i18n]").forEach((element) => {
      element.textContent = profileText(element.dataset.profileI18n);
    });
    popover.querySelector(".profile-subtitle").textContent = user?.displayName || profileText("connectedAccount");
    if (status.dataset.profileMessage) status.textContent = profileText(status.dataset.profileMessage);
  }
  document.addEventListener("erikraft-language-change", updateProfileLanguage);
  updateProfileLanguage();
  function setProfileStatus(key) {
    status.dataset.profileMessage = key;
    status.textContent = profileText(key);
  }
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
    if (!response.ok) throw new Error(data.error || profileText("profileUpdateFailed"));
    return data;
  }
  async function loadPhoto() {
    const data = await request(); setPhoto(data.photoDisabled ? "" : (data.photo || user.photoURL || ""));
  }
  function closePopover() {
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
  trigger.addEventListener("click", () => {
    popover.hidden = !popover.hidden;
    trigger.setAttribute("aria-expanded", String(!popover.hidden));
    if (!popover.hidden) popover.querySelector("[data-profile-close]")?.focus();
  });
  popover.querySelector("[data-profile-close]").addEventListener("click", () => {
    closePopover();
    trigger.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popover.hidden) {
      closePopover();
      trigger.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!popover.hidden && !popover.contains(event.target) && !trigger.contains(event.target)) {
      closePopover();
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
    if (!["image/png","image/jpeg","image/webp"].includes(selected.type)) { setProfileStatus("invalidImageType"); return; }
    if (selected.size > 1024 * 1024) { setProfileStatus("imageTooLarge"); return; }
    setProfileStatus("savingPhoto");
    try {
      const photo = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error(profileText("readImageFailed"))); reader.readAsDataURL(selected); });
      const result = await request("PUT", { photo }); setPhoto(result.photo); setProfileStatus("photoUpdated");
    } catch (error) { delete status.dataset.profileMessage; status.textContent = error.message || profileText("savePhotoFailed"); }
  });
  popover.querySelector("[data-profile-restore]").addEventListener("click", async () => {
    setProfileStatus("restoringProviderPhoto");
    try {
      const result = await request("PUT", { restoreProviderPhoto: true });
      setPhoto(result.photo || user?.photoURL || "");
      setProfileStatus(user?.photoURL ? "providerPhotoRestored" : "providerPhotoMissing");
    } catch (error) { delete status.dataset.profileMessage; status.textContent = error.message || profileText("restorePhotoFailed"); }
  });
  popover.querySelector("[data-profile-delete]").addEventListener("click", async () => {
    setProfileStatus("removingPhoto");
    try { await request("DELETE"); setPhoto(""); setProfileStatus("photoRemoved"); }
    catch (error) { delete status.dataset.profileMessage; status.textContent = error.message || profileText("removePhotoFailed"); }
  });
  onAuthStateChanged(auth, async (nextUser) => {
    user = nextUser;
    const active = Boolean(user && (!user.providerData?.some((p) => p.providerId === "password") || user.emailVerified));
    trigger.style.display = active ? "grid" : "none";
    if (!active) { popover.hidden = true; setPhoto(""); return; }
    popover.querySelector(".profile-email").textContent = user.email || profileText("emailUnavailable");
    popover.querySelector(".profile-subtitle").textContent = user.displayName || profileText("connectedAccount");
    status.textContent = ""; delete status.dataset.profileMessage;
    try { await loadPhoto(); } catch (error) { setPhoto(user.photoURL || ""); status.textContent = error.message; }
  });
}
