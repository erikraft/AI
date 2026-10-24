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
      freePlan:"Plano Gratuito",
      profilePhotoAlt:"Foto de perfil", profileAvatarEmpty:"Avatar sem foto de perfil", connectedAccount:"Conta conectada", emailUnavailable:"E-mail indisponível", copyAddress:"Copiar o endereço", emailCopied:"Endereço copiado!", emailCopyFailed:"Não foi possível copiar o endereço.",
      changePhoto:"Alterar foto", removePhoto:"Remover foto", restoreProviderPhoto:"Restaurar foto do provedor", signOut:"Sair",
      invalidImageType:"Use uma imagem PNG, JPEG ou WebP.", imageTooLarge:"A imagem deve ter no máximo 1 MiB.",
      savingPhoto:"Salvando foto…", photoUpdated:"Foto de perfil atualizada.", readImageFailed:"Não foi possível ler a imagem.",
      savePhotoFailed:"Falha ao salvar a foto.", restoringProviderPhoto:"Restaurando foto do provedor…",
      providerPhotoRestored:"Foto do provedor restaurada neste site.", providerPhotoMissing:"O provedor não disponibilizou uma foto de perfil.",
      restorePhotoFailed:"Falha ao restaurar a foto.", removingPhoto:"Removendo foto…",
      photoRemoved:"Foto removida. O avatar ficará sem foto até você restaurá-la.", removePhotoFailed:"Falha ao remover a foto.",
      profileUpdateFailed:"Não foi possível atualizar o perfil.",
      deleteAccount:"Excluir conta",deleteAccountWarningIcon:"Alerta de exclusão de conta",deleteAccountTitle:"Excluir sua conta permanentemente?",deleteAccountWarning:"A exclusão é permanente: remove sua conta do Firebase Authentication, o histórico e os registros associados no MongoDB Atlas e sua cota individual de geração no Firestore. Os prompts e entradas enviados ao Hugging Face para inferência não são apagados por esta ação nos sistemas do provedor.",deleteAccountListIntro:"Os seguintes dados serão excluídos permanentemente:",deleteAccountPhotoProviderNote:"A foto original do provedor depende do método de login utilizado (por exemplo, Google ou GitHub). Esta ação remove fotos personalizadas e registros do perfil no ErikrafT AI, mas não exclui a foto nem os dados mantidos na sua conta do provedor.",deleteAccountPhoto:"Fotos de perfil personalizadas e registros associados à conta",deleteAccountHistory:"Conversas com a IA, prompts, respostas e histórico de geração de imagens, vídeos e áudios",deleteAccountMcp:"Configurações de servidores MCP personalizados e tokens OAuth criptografados",deleteAccountData:"Registros vinculados ao seu UID no MongoDB Atlas e a cota individual de geração no Firestore",deleteAccountProviderNote:"O Hugging Face fornece a infraestrutura de inferência. O ErikrafT AI não controla nem consegue excluir por esta ação eventuais registros mantidos pelo provedor conforme suas próprias políticas.",deleteAccountProviderLink:"Ler a Política de Privacidade do Hugging Face",deleteAccountProviderTermsLink:"Ler os Termos de Serviço do Hugging Face",deleteAccountFirebaseNote:"O login e o cadastro são gerenciados pelo Firebase Authentication.",deleteAccountFirebaseLink:"Saiba mais sobre o Firebase Authentication",deleteAccountFirebasePrivacy:"Política de Privacidade do Firebase",deleteAccountConfirmLabel:"Digite DELETE para confirmar",deleteAccountConfirmPlaceholder:"Digite DELETE",deleteAccountCancel:"Cancelar",deleteAccountAction:"Excluir minha conta",deletingAccount:"Excluindo conta e dados…",deleteAccountFailed:"Não foi possível excluir a conta. Tente novamente.",deleteAccountRecentLogin:"Por segurança, saia e entre novamente na conta antes de excluí-la.",deleteAccountConfirmRequired:"Digite DELETE exatamente como mostrado para confirmar."
    },
    en: {
      openProfile:"Open profile", accountProfile:"Account profile", closeProfile:"Close profile",
      freePlan:"Free Plan",
      profilePhotoAlt:"Profile photo", profileAvatarEmpty:"Profile avatar without a photo", connectedAccount:"Connected account", emailUnavailable:"Email unavailable", copyAddress:"Copy address", emailCopied:"Email address copied!", emailCopyFailed:"Could not copy the email address.",
      changePhoto:"Change photo", removePhoto:"Remove photo", restoreProviderPhoto:"Restore provider photo", signOut:"Sign out",
      invalidImageType:"Choose a PNG, JPEG, or WebP image.", imageTooLarge:"The image must be 1 MiB or smaller.",
      savingPhoto:"Saving photo…", photoUpdated:"Profile photo updated.", readImageFailed:"Could not read the image.",
      savePhotoFailed:"Could not save the photo.", restoringProviderPhoto:"Restoring provider photo…",
      providerPhotoRestored:"Provider photo restored on this site.", providerPhotoMissing:"The provider did not supply a profile photo.",
      restorePhotoFailed:"Could not restore the photo.", removingPhoto:"Removing photo…",
      photoRemoved:"Photo removed. Your avatar will stay blank until you restore a photo.", removePhotoFailed:"Could not remove the photo.",
      profileUpdateFailed:"Could not update the profile.",
      deleteAccount:"Delete account",deleteAccountWarningIcon:"Account deletion warning",deleteAccountTitle:"Permanently delete your account?",deleteAccountWarning:"Deletion is permanent: it removes your Firebase Authentication account, your history and associated MongoDB Atlas records, and your individual generation quota in Firestore. Prompts and inputs sent to Hugging Face for inference are not deleted from the provider’s systems by this action.",deleteAccountListIntro:"The following data will be permanently deleted:",deleteAccountPhotoProviderNote:"The original provider photo depends on the sign-in method used (for example, Google or GitHub). This action removes custom photos and profile records from ErikrafT AI, but does not delete the photo or data stored in your provider account.",deleteAccountPhoto:"Custom profile photos and account-associated records",deleteAccountHistory:"AI conversations, prompts, responses, and image, video, and audio generation history",deleteAccountMcp:"Custom MCP server configurations and encrypted OAuth tokens",deleteAccountData:"Records linked to your UID in MongoDB Atlas and your individual generation quota in Firestore",deleteAccountProviderNote:"Hugging Face provides the inference infrastructure. ErikrafT AI does not control or delete any provider-side records through this action; those are subject to the provider’s own policies.",deleteAccountProviderLink:"Read Hugging Face’s Privacy Policy",deleteAccountProviderTermsLink:"Read Hugging Face’s Terms of Service",deleteAccountFirebaseNote:"Sign-in and account registration are handled by Firebase Authentication.",deleteAccountFirebaseLink:"Learn about Firebase Authentication",deleteAccountFirebasePrivacy:"Firebase Privacy and Security",deleteAccountConfirmLabel:"Type DELETE to confirm",deleteAccountConfirmPlaceholder:"Type DELETE",deleteAccountCancel:"Cancel",deleteAccountAction:"Delete my account",deletingAccount:"Deleting account and data…",deleteAccountFailed:"Could not delete the account. Please try again.",deleteAccountRecentLogin:"For security, sign out and sign in again before deleting your account.",deleteAccountConfirmRequired:"Type DELETE exactly as shown to confirm."
    }
  };
  const profileText = (key) => profileTranslations[document.documentElement.lang === "en" ? "en" : "pt-BR"][key] || key;
  let user = null;
  let photoUrl = "";
  const style = document.createElement("style");
  style.textContent = `
  .profile-trigger{position:relative;isolation:isolate;width:36px;height:36px;flex:0 0 36px;padding:0;border:0;border-radius:50%;overflow:visible;background:#111722;display:none;place-items:center;cursor:pointer;color:#dce7fb;outline:none}
  .profile-trigger::before,.profile-large-avatar::before{content:"";position:absolute;z-index:2;inset:-6px;padding:2px;border-radius:50%;background:linear-gradient(110deg,#a78bfa 0%,#e9d5ff 18%,#8b5cf6 36%,#d8b4fe 52%,#7c3aed 70%,#c4b5fd 86%,#a78bfa 100%);background-size:300% 100%;animation:jarvis-purple-gradient 18s ease-in-out infinite;pointer-events:none;mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);mask-composite:exclude;-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor}
  .profile-trigger img{position:relative;z-index:1;width:100%;height:100%;border-radius:50%;object-fit:cover}.profile-trigger i{position:relative;z-index:1;font-size:15px}
  .profile-trigger:focus-visible{outline:2px solid #d8b4fe;outline-offset:9px}
  .profile-trigger:focus:not(:focus-visible){outline:none}
  .profile-popover{position:fixed;z-index:1000;top:78px;right:18px;width:min(360px,calc(100vw - 28px));max-height:calc(100dvh - 96px);overflow:auto;padding:22px;border:1px solid #30394b;border-radius:24px;background:#141720;box-shadow:0 22px 70px #000b;color:#f0f3fa;text-align:center}
  .profile-popover[hidden]{display:none}.profile-close{position:absolute;top:10px;right:10px;display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid #354158;border-radius:10px;background:#0e1119;color:#e8edf6;cursor:pointer}.profile-close:hover{border-color:#4285f4;background:#1b2230}.profile-close:focus-visible{outline:2px solid #9dc2ff;outline-offset:3px}.profile-close svg{width:14px;height:14px;display:block}.profile-popover .profile-head{flex-direction:column;gap:10px;margin-bottom:18px}.profile-popover .profile-large-avatar{width:76px;height:76px}.profile-popover .profile-large-avatar>i{font-size:30px}.profile-popover .profile-email{font-size:13px}.profile-popover .profile-subtitle{font-size:11px}
  .profile-plan-badge{display:inline-flex;align-items:center;justify-content:center;margin-top:9px;padding:5px 10px;border:1px solid rgba(196,181,253,.48);border-radius:999px;background:linear-gradient(110deg,#7c3aed 0%,#a78bfa 18%,#e9d5ff 36%,#8b5cf6 52%,#d8b4fe 70%,#7c3aed 86%,#a78bfa 100%);background-size:300% 100%;animation:jarvis-purple-gradient 18s ease-in-out infinite;color:#fff;font:600 10px/1.2 "DM Sans",sans-serif;letter-spacing:.02em;box-shadow:0 2px 12px rgba(124,58,237,.16)}
  @media(prefers-reduced-motion:reduce){.hero-jarvis,.profile-trigger::before,.profile-large-avatar::before,.profile-plan-badge{animation:none!important;background-position:50% 50%!important}}
  .profile-head{display:flex;align-items:center;gap:13px;margin-bottom:16px}.profile-large-avatar{position:relative;isolation:isolate;display:grid;place-items:center;width:58px;height:58px;border-radius:50%;overflow:visible;background:#111722;border:0;flex:0 0 auto;color:#dce7fb}.profile-large-avatar>i{position:relative;z-index:1;font-size:23px}.profile-large-avatar>img{position:absolute;z-index:1;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover}.profile-large-avatar.is-empty>img{display:none}
  .profile-email{position:relative;display:inline-block;max-width:100%;padding:2px 0;border:0;background:transparent;color:#d5deed;font:inherit;font-size:12px;line-height:1.5;overflow-wrap:anywhere;text-align:inherit;cursor:pointer;text-decoration:underline;text-decoration-color:transparent;text-underline-offset:3px;transition:text-decoration-color .16s ease}.profile-email:hover,.profile-email:focus-visible{color:#fff;text-decoration-color:#9dc2ff}.profile-email:focus-visible{outline:2px solid #9dc2ff;outline-offset:3px;border-radius:3px}.profile-email-tooltip{position:absolute;z-index:2;left:50%;bottom:calc(100% + 9px);transform:translate(-50%,4px);width:max-content;max-width:min(240px,calc(100vw - 48px));padding:7px 10px;border:1px solid #39445a;border-radius:8px;background:#202634;color:#f0f3fa;font:500 11px/1.35 "DM Sans",sans-serif;box-shadow:0 8px 24px #0007;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .14s ease,transform .14s ease,visibility .14s ease}.profile-email-tooltip:after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:#39445a}.profile-email:hover .profile-email-tooltip,.profile-email:focus-visible .profile-email-tooltip,.profile-email.is-tooltip-visible .profile-email-tooltip{opacity:1;visibility:visible;transform:translate(-50%,0)}.profile-email:active{transform:scale(.99)}.profile-subtitle{font-size:10px;color:#9ba8bc;margin-top:4px}
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
  .profile-delete-provider-note{padding:12px;border:1px solid #34445f;border-radius:10px;background:#111722}.profile-delete-provider-note a{color:#a9c9ff;text-underline-offset:3px}
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
    <div class="profile-head"><div class="profile-large-avatar is-empty" role="img" aria-label="Foto de perfil"><i class="fa-solid fa-user" aria-hidden="true"></i><img alt="" hidden></div><div><button class="profile-email" type="button" aria-describedby="profile-email-tooltip"><span class="profile-email-value"></span><span id="profile-email-tooltip" class="profile-email-tooltip" role="tooltip" aria-hidden="true">Copiar o endereço</span></button><div class="profile-subtitle">Conta conectada</div><span class="profile-plan-badge" data-profile-i18n="freePlan">Plano Gratuito</span></div></div>
    <div class="profile-actions"><button class="profile-action" type="button" data-profile-upload><i class="fa-solid fa-pen" aria-hidden="true"></i> <span data-profile-i18n="changePhoto">Alterar foto</span></button><button class="profile-action danger" type="button" data-profile-delete><i class="fa-solid fa-trash" aria-hidden="true"></i> <span data-profile-i18n="removePhoto">Remover foto</span></button><button class="profile-action" type="button" data-profile-restore title="Restaurar foto do provedor" aria-label="Restaurar foto do provedor"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M463.5 224l8.5 0c13.3 0 24-10.7 24-24l0-128c0-9.7-5.8-18.5-14.8-22.2s-19.3-1.7-26.2 5.2L413.4 96.6c-87.6-86.5-228.7-86.2-315.8 1c-87.5 87.5-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3c62.2-62.2 162.7-62.5 225.3-1L327 183c-6.9 6.9-8.9 17.2-5.2 26.2s12.5 14.8 22.2 14.8l119.5 0z"/></svg> <span data-profile-i18n="restoreProviderPhoto">Restaurar foto</span></button></div>
    <input class="profile-file" type="file" accept="image/png,image/jpeg,image/webp"><p class="profile-status" role="status" aria-live="polite"></p><div class="profile-divider"></div><button class="button secondary small profile-signout" type="button"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> <span data-profile-i18n="signOut">Sair</span></button>
    <button class="profile-action danger profile-delete-account" type="button" data-profile-delete-account><i class="fa-solid fa-trash" aria-hidden="true"></i> <span data-profile-i18n="deleteAccount">Excluir conta</span></button>`;
  document.body.append(popover);
  const deleteModal = document.createElement("div");
  deleteModal.className = "profile-delete-modal";
  deleteModal.hidden = true;
  deleteModal.innerHTML = `
    <div class="profile-delete-backdrop" data-delete-cancel aria-hidden="true"></div>
    <section class="profile-delete-card" role="alertdialog" aria-modal="true" aria-labelledby="profile-delete-title" aria-describedby="profile-delete-warning">
      <svg class="profile-delete-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" role="img" aria-label="Warning"><path fill="currentColor" d="M569.5 440.3L327.4 35.7c-18.4-30.7-60.4-30.7-78.8 0L6.5 440.3C-12 471.1 9.2 512 46.8 512h482.4c37.6 0 58.8-40.9 40.3-71.7zM288 176c17.7 0 32 14.3 32 32l-5.4 112c-.8 16.7-14.6 30-31.3 30s-30.5-13.3-31.3-30L256 208c0-17.7 14.3-32 32-32zm0 224a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg>
      <button class="profile-close" type="button" data-delete-cancel aria-label="Fechar" title="Fechar"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3l105.4 105.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256l105.3-105.4z"/></svg></button>
      <h2 id="profile-delete-title" data-profile-i18n="deleteAccountTitle">Excluir sua conta permanentemente?</h2>
      <p id="profile-delete-warning" data-profile-i18n="deleteAccountWarning">A exclusão é permanente e remove a conta e os dados associados nos sistemas do ErikrafT AI.</p>
      <p data-profile-i18n="deleteAccountListIntro">Os seguintes dados serão excluídos permanentemente:</p><p data-profile-i18n="deleteAccountPhotoProviderNote">A foto original do provedor depende do método de login utilizado. Esta ação não exclui a foto nem os dados mantidos na sua conta do provedor.</p><ul><li data-profile-i18n="deleteAccountPhoto">Fotos de perfil personalizadas e registros associados à conta</li><li data-profile-i18n="deleteAccountHistory">Conversas com a IA, prompts, respostas e histórico de geração de imagens, vídeos e áudios</li><li data-profile-i18n="deleteAccountMcp">Configurações de servidores MCP personalizados e tokens OAuth criptografados</li><li data-profile-i18n="deleteAccountData">Registros vinculados à sua conta no MongoDB Atlas e sua cota no Firestore</li></ul>
      <p class="profile-delete-provider-note"><span data-profile-i18n="deleteAccountProviderNote">O Hugging Face fornece a infraestrutura de inferência e os registros sob seu controle não são apagados por esta ação.</span> <a href="https://huggingface.co/privacy" target="_blank" rel="noopener noreferrer" data-profile-i18n="deleteAccountProviderLink">Ler a Política de Privacidade do Hugging Face</a> · <a href="https://huggingface.co/terms-of-service" target="_blank" rel="noopener noreferrer" data-profile-i18n="deleteAccountProviderTermsLink">Ler os Termos de Serviço do Hugging Face</a>.</p><p class="profile-delete-provider-note"><span data-profile-i18n="deleteAccountFirebaseNote">O login e o cadastro são gerenciados pelo Firebase Authentication.</span> <a href="https://firebase.google.com/docs/auth" target="_blank" rel="noopener noreferrer" data-profile-i18n="deleteAccountFirebaseLink">Saiba mais sobre o Firebase Authentication</a> · <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" data-profile-i18n="deleteAccountFirebasePrivacy">Política de Privacidade do Firebase</a>.</p>
      <label class="profile-delete-confirm-label" for="profile-delete-confirm" data-profile-i18n="deleteAccountConfirmLabel">Digite DELETE para confirmar</label>
      <input id="profile-delete-confirm" class="profile-delete-confirm-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" data-profile-placeholder="deleteAccountConfirmPlaceholder" placeholder="Digite DELETE">
      <p class="profile-delete-error" data-profile-delete-error role="alert" aria-live="assertive"></p>
      <div class="profile-delete-actions"><button type="button" data-delete-cancel data-profile-i18n="deleteAccountCancel">Cancelar</button><button type="button" class="is-danger" data-delete-confirm disabled data-profile-i18n="deleteAccountAction">Excluir minha conta</button></div>
    </section>`;
  document.body.append(deleteModal);
  const avatar = popover.querySelector(".profile-large-avatar");
  const file = popover.querySelector(".profile-file");
  const status = popover.querySelector(".profile-status");
  const emailButton = popover.querySelector(".profile-email");
  const emailValue = popover.querySelector(".profile-email-value");
  const emailTooltip = popover.querySelector(".profile-email-tooltip");
  function updateProfileLanguage() {
    trigger.setAttribute("aria-label", profileText("openProfile"));
    popover.setAttribute("aria-label", profileText("accountProfile"));
    avatar.setAttribute("aria-label", profileText(avatar.classList.contains("is-empty") ? "profileAvatarEmpty" : "profilePhotoAlt"));
    emailTooltip.textContent = profileText("copyAddress");
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
    deleteModal.querySelector("svg[role='img']")?.setAttribute("aria-label", profileText("deleteAccountWarningIcon"));
    const modalClose = deleteModal.querySelector(".profile-delete-card .profile-close");
    modalClose.setAttribute("aria-label", profileText("closeProfile"));
    modalClose.title = profileText("closeProfile");
    popover.querySelector(".profile-subtitle").textContent = user?.displayName || profileText("connectedAccount");
    if (status.dataset.profileMessage) status.textContent = profileText(status.dataset.profileMessage);
  }
  document.addEventListener("erikraft-language-change", updateProfileLanguage);
  updateProfileLanguage();
  async function copyProfileEmail() {
    const email = user?.email;
    if (!email) return;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(email);
      } else {
        const temporary = document.createElement("textarea");
        temporary.value = email;
        temporary.setAttribute("readonly", "");
        temporary.style.position = "fixed";
        temporary.style.opacity = "0";
        document.body.append(temporary);
        temporary.select();
        const copied = document.execCommand("copy");
        temporary.remove();
        if (!copied) throw new Error("Clipboard copy failed");
      }
      emailTooltip.textContent = profileText("emailCopied");
    } catch {
      emailTooltip.textContent = profileText("emailCopyFailed");
    }
    emailButton.classList.add("is-tooltip-visible");
    emailTooltip.setAttribute("aria-hidden", "false");
    window.setTimeout(() => {
      emailTooltip.textContent = profileText("copyAddress");
      emailButton.classList.remove("is-tooltip-visible");
      emailTooltip.setAttribute("aria-hidden", "true");
    }, 1800);
  }
  emailButton.addEventListener("click", copyProfileEmail);
  emailButton.addEventListener("mouseenter", () => { emailButton.classList.add("is-tooltip-visible"); emailTooltip.setAttribute("aria-hidden", "false"); });
  emailButton.addEventListener("mouseleave", () => { emailButton.classList.remove("is-tooltip-visible"); emailTooltip.setAttribute("aria-hidden", "true"); emailTooltip.textContent = profileText("copyAddress"); });
  emailButton.addEventListener("focus", () => { emailButton.classList.add("is-tooltip-visible"); emailTooltip.setAttribute("aria-hidden", "false"); });
  emailButton.addEventListener("blur", () => { emailButton.classList.remove("is-tooltip-visible"); emailTooltip.setAttribute("aria-hidden", "true"); emailTooltip.textContent = profileText("copyAddress"); });
  function setProfileStatus(key) {
    status.dataset.profileMessage = key;
    status.textContent = profileText(key);
  }
  function setPhoto(url) {
    photoUrl = url || "";
    trigger.innerHTML = photoUrl ? "" : '<i class="fa-solid fa-user" aria-hidden="true"></i>';
    const avatarImage = avatar.querySelector("img");
    if (photoUrl) {
      const image = document.createElement("img"); image.src = photoUrl; image.alt = "";
      trigger.append(image);
      avatarImage.src = photoUrl;
      avatarImage.hidden = false;
      avatar.classList.remove("is-empty");
      avatar.setAttribute("aria-label", profileText("profilePhotoAlt"));
    } else {
      avatarImage.removeAttribute("src");
      avatarImage.hidden = true;
      avatar.classList.add("is-empty");
      avatar.setAttribute("aria-label", profileText("profileAvatarEmpty"));
    }
  }
  async function request(method = "GET", body) {
    const token = await user.getIdToken();
    const response = await fetch("/api/profile", { method, headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || profileText("profileUpdateFailed"));
    return data;
  }
  function providerPhotoFromUser(currentUser) {
    return currentUser?.providerData?.find((provider) => provider.providerId !== "password" && provider.photoURL)?.photoURL
      || currentUser?.photoURL
      || "";
  }
  async function loadPhoto() {
    const data = await request();
    setPhoto(data.photoDisabled ? "" : (data.photo || providerPhotoFromUser(user)));
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
      const providerPhoto = user?.providerData?.find((provider) => provider.providerId !== "password" && provider.photoURL)?.photoURL
        || user?.photoURL
        || "";
      const restoredPhoto = result.photo || providerPhoto;
      setPhoto(restoredPhoto);
      setProfileStatus(restoredPhoto ? "providerPhotoRestored" : "providerPhotoMissing");
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
    emailValue.textContent = user.email || profileText("emailUnavailable");
    emailButton.disabled = !user.email;
    emailButton.setAttribute("aria-label", user.email ? `${profileText("copyAddress")}: ${user.email}` : profileText("emailUnavailable"));
    popover.querySelector(".profile-subtitle").textContent = user.displayName || profileText("connectedAccount");
    status.textContent = ""; delete status.dataset.profileMessage;
    try { await loadPhoto(); } catch (error) { setPhoto(""); status.textContent = error.message; }
  });
}
