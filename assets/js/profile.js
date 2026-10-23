import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

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
      profileUpdateFailed:"Não foi possível atualizar o perfil.",
      deleteAccount:"Excluir conta",deleteAccountTitle:"Excluir sua conta permanentemente?",deleteAccountWarning:"Esta ação é permanente. Sua conta de autenticação também será excluída.",deleteAccountPhoto:"Fotos de perfil personalizadas",deleteAccountHistory:"Histórico de conversas e de gerações de imagens, vídeos e áudios",deleteAccountData:"Todos os registros associados à sua conta no MongoDB Atlas",deleteAccountConfirmLabel:"Digite DELETE para confirmar",deleteAccountConfirmPlaceholder:"Digite DELETE",deleteAccountCancel:"Cancelar",deleteAccountAction:"Excluir minha conta",deletingAccount:"Excluindo conta e dados…",deleteAccountFailed:"Não foi possível excluir a conta. Tente novamente.",deleteAccountRecentLogin:"Por segurança, saia e entre novamente na conta antes de excluí-la.",deleteAccountConfirmRequired:"Digite DELETE exatamente como mostrado para confirmar."
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
      profileUpdateFailed:"Could not update the profile.",
      deleteAccount:"Delete account",deleteAccountTitle:"Permanently delete your account?",deleteAccountWarning:"This action is permanent. Your authentication account will also be deleted.",deleteAccountPhoto:"Custom profile photos",deleteAccountHistory:"Conversation history and image, video, and audio generation history",deleteAccountData:"All records associated with your account in MongoDB Atlas",deleteAccountConfirmLabel:"Type DELETE to confirm",deleteAccountConfirmPlaceholder:"Type DELETE",deleteAccountCancel:"Cancel",deleteAccountAction:"Delete my account",deletingAccount:"Deleting account and data…",deleteAccountFailed:"Could not delete the account. Please try again.",deleteAccountRecentLogin:"For security, sign out and sign in again before deleting your account.",deleteAccountConfirmRequired:"Type DELETE exactly as shown to confirm."
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
  .profile-popover .profile-delete-account{margin-top:10px;width:100%;justify-content:center;border-color:#7f303b;color:#ff777f;background:#211116}
  .profile-delete-modal{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:16px;overflow-y:auto}
  .profile-delete-modal[hidden]{display:none}
  .profile-delete-backdrop{position:fixed;inset:0;background:rgba(2,4,9,.82);backdrop-filter:blur(9px)}
  .profile-delete-card{position:relative;z-index:1;width:min(100%,480px);max-height:calc(100dvh - 32px);overflow:auto;padding:clamp(20px,5vw,30px);border:1px solid #62303a;border-radius:22px;background:linear-gradient(145deg,#1b171d,#101219 72%);box-shadow:0 28px 100px #000c;color:#f2f3f8;text-align:left}
  .profile-delete-icon{display:block;width:48px;height:44px;margin-bottom:17px;color:#ff394f}
  .profile-delete-card h2{margin:0 36px 12px 0;font:700 clamp(20px,5vw,25px)/1.2 'DM Sans',sans-serif;letter-spacing:-.7px}
  .profile-delete-card p{font:12px/1.7 'DM Sans',sans-serif;color:#c0c5d1;margin:10px 0}
  .profile-delete-card ul{margin:13px 0;padding-left:20px;color:#f0dce0;font:12px/1.7 'DM Sans',sans-serif}
  .profile-delete-card li+li{margin-top:6px}
  .profile-delete-confirm-label{display:block;margin-top:18px;font:600 12px/1.5 'DM Sans',sans-serif;color:#f2f3f8}
  .profile-delete-confirm-input{display:block;width:100%;min-height:45px;margin-top:8px;padding:11px 12px;border:1px solid #5b3540;border-radius:10px;background:#0b0d13;color:#fff;font:12px 'DM Sans',sans-serif}
  .profile-delete-confirm-input:focus-visible{outline:2px solid #ff596b;outline-offset:3px}
  .profile-delete-error{min-height:18px;color:#ff818b!important}
  .profile-delete-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
  .profile-delete-actions button{min-height:44px;padding:10px 12px;border:1px solid #394153;border-radius:10px;background:#11151e;color:#e8edf6;font:700 12px 'DM Sans',sans-serif;cursor:pointer}
  .profile-delete-actions .is-danger{border-color:#ff394f;background:#e3263d;color:white}
  .profile-delete-actions .is-danger:disabled{opacity:.4;cursor:not-allowed}
  .profile-delete-actions button:focus-visible{outline:2px solid #ff7582;outline-offset:3px}
  @media(max-width:480px){.profile-delete-modal{padding:10px;align-items:end}.profile-delete-card{width:100%;max-height:calc(100dvh - 20px);border-radius:20px;padding:22px 18px}.profile-delete-actions{grid-template-columns:1fr}.profile-delete-icon{width:43px;height:39px;margin-bottom:13px}.profile-delete-card ul{padding-left:18px}}
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
    <input class="profile-file" type="file" accept="image/png,image/jpeg,image/webp"><p class="profile-status" role="status" aria-live="polite"></p><div class="profile-divider"></div><button class="button secondary small profile-signout" type="button"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> <span data-profile-i18n="signOut">Sair</span></button>
    <button class="profile-action danger profile-delete-account" type="button" data-profile-delete-account><i class="fa-solid fa-trash" aria-hidden="true"></i> <span data-profile-i18n="deleteAccount">Excluir conta</span></button>`;
  document.body.append(popover);
  const deleteModal = document.createElement("div");
  deleteModal.className = "profile-delete-modal";
  deleteModal.hidden = true;
  deleteModal.innerHTML = `
    <button class="profile-delete-backdrop" type="button" data-delete-cancel aria-label="Close confirmation"></button>
    <section class="profile-delete-card" role="alertdialog" aria-modal="true" aria-labelledby="profile-delete-title" aria-describedby="profile-delete-warning">
      <svg class="profile-delete-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" role="img" aria-label="Warning"><path fill="currentColor" d="M569.5 440.3L327.4 35.7c-18.4-30.7-60.4-30.7-78.8 0L6.5 440.3C-12 471.1 9.2 512 46.8 512h482.4c37.6 0 58.8-40.9 40.3-71.7zM288 176c17.7 0 32 14.3 32 32l-5.4 112c-.8 16.7-14.6 30-31.3 30s-30.5-13.3-31.3-30L256 208c0-17.7 14.3-32 32-32zm0 224a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg>
      <button class="profile-close" type="button" data-delete-cancel data-profile-i18n="closeProfile" aria-label="Fechar" title="Fechar"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3l105.4 105.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256l105.3-105.4z"/></svg></button>
      <h2 id="profile-delete-title" data-profile-i18n="deleteAccountTitle">Excluir sua conta permanentemente?</h2>
      <p id="profile-delete-warning" data-profile-i18n="deleteAccountWarning">Esta ação é permanente. Sua conta de autenticação também será excluída.</p>
      <ul><li data-profile-i18n="deleteAccountPhoto">Fotos de perfil personalizadas</li><li data-profile-i18n="deleteAccountHistory">Histórico de conversas e de gerações de imagens, vídeos e áudios</li><li data-profile-i18n="deleteAccountData">Todos os registros associados à sua conta no MongoDB Atlas</li></ul>
      <label class="profile-delete-confirm-label" for="profile-delete-confirm" data-profile-i18n="deleteAccountConfirmLabel">Digite DELETE para confirmar</label>
      <input id="profile-delete-confirm" class="profile-delete-confirm-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" data-profile-placeholder="deleteAccountConfirmPlaceholder" placeholder="Digite DELETE">
      <p class="profile-delete-error" data-profile-delete-error role="alert" aria-live="assertive"></p>
      <div class="profile-delete-actions"><button type="button" data-delete-cancel data-profile-i18n="deleteAccountCancel">Cancelar</button><button type="button" class="is-danger" data-delete-confirm disabled data-profile-i18n="deleteAccountAction">Excluir minha conta</button></div>
    </section>`;
  document.body.append(deleteModal);
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
    document.querySelectorAll("[data-profile-i18n]").forEach((element) => {
      if (element.closest(".profile-popover, .profile-delete-modal")) element.textContent = profileText(element.dataset.profileI18n);
    });
    deleteModal.querySelectorAll("[data-profile-placeholder]").forEach((element) => {
      element.setAttribute("placeholder", profileText(element.dataset.profilePlaceholder));
    });
    deleteModal.querySelector("svg[role='img']")?.setAttribute("aria-label", profileText("deleteAccountTitle"));
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
    if (event.key === "Escape" && !deleteModal.hidden) return;
    if (event.key === "Escape" && !popover.hidden) {
      closePopover();
      trigger.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!deleteModal.hidden) return;
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
  const deleteAccountButton = popover.querySelector("[data-profile-delete-account]");
  const deleteConfirmInput = deleteModal.querySelector("#profile-delete-confirm");
  const deleteConfirmButton = deleteModal.querySelector("[data-delete-confirm]");
  const deleteError = deleteModal.querySelector("[data-profile-delete-error]");
  function closeDeleteModal() {
    deleteModal.hidden = true;
    deleteConfirmInput.value = "";
    deleteConfirmButton.disabled = true;
    deleteError.textContent = "";
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    deleteAccountButton.focus();
  }
  function openDeleteModal() {
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    deleteModal.hidden = false;
    deleteConfirmInput.value = "";
    deleteConfirmButton.disabled = true;
    deleteError.textContent = "";
    requestAnimationFrame(() => deleteConfirmInput.focus());
  }
  deleteAccountButton.addEventListener("click", openDeleteModal);
  deleteModal.querySelectorAll("[data-delete-cancel]").forEach((button) => button.addEventListener("click", closeDeleteModal));
  deleteConfirmInput.addEventListener("input", () => {
    deleteConfirmButton.disabled = deleteConfirmInput.value.trim() !== "DELETE";
    deleteError.textContent = "";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !deleteModal.hidden) closeDeleteModal();
  });
  deleteConfirmButton.addEventListener("click", async () => {
    if (deleteConfirmInput.value.trim() !== "DELETE") {
      deleteError.textContent = profileText("deleteAccountConfirmRequired");
      return;
    }
    deleteConfirmButton.disabled = true;
    deleteConfirmInput.disabled = true;
    deleteError.textContent = profileText("deletingAccount");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/account", { method: "DELETE", headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && data.code === "RECENT_LOGIN_REQUIRED") throw new Error(profileText("deleteAccountRecentLogin"));
        throw new Error(profileText("deleteAccountFailed"));
      }
      deleteModal.hidden = true;
      popover.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      deleteError.textContent = error.message || profileText("deleteAccountFailed");
      deleteConfirmButton.disabled = deleteConfirmInput.value.trim() !== "DELETE";
      deleteConfirmInput.disabled = false;
    }
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
    if (!active) { popover.hidden = true; deleteModal.hidden = true; trigger.setAttribute("aria-expanded", "false"); setPhoto(""); return; }
    popover.querySelector(".profile-email").textContent = user.email || profileText("emailUnavailable");
    popover.querySelector(".profile-subtitle").textContent = user.displayName || profileText("connectedAccount");
    status.textContent = ""; delete status.dataset.profileMessage;
    try { await loadPhoto(); } catch (error) { setPhoto(user.photoURL || ""); status.textContent = error.message; }
  });
}
