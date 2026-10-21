import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, GithubAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

const firebaseConfig = window.ERIKRAFT_FIREBASE_CONFIG || {};
const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
const $ = (id) => document.getElementById(id);
let auth = null;
let currentUser = null;
let imageUrl = "";
let videoUrl = "";
let resultType = "image";
const COSMOS_MODEL = "DuoNeural/Cosmos3-Nano-Abliterated";
const QWEN_MODEL = "0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF";
const MODEL_AVAILABILITY = { cosmosVideo: false, qwenText: false };

function canUseStudio(user) {
  const hasPasswordProvider = Boolean(user?.providerData?.some(({ providerId }) => providerId === "password"));
  return Boolean(user && (!hasPasswordProvider || user.emailVerified));
}

function updateStudioAccess(user) {
  const authenticated = canUseStudio(user);
  const generator = $("generator-form");
  const resultPanel = $("result-panel");
  const loginPanel = $("studio-login-panel");
  generator.classList.toggle("hidden", !authenticated);
  generator.setAttribute("aria-hidden", String(!authenticated));
  generator.inert = !authenticated;
  resultPanel.classList.toggle("hidden", !authenticated);
  resultPanel.setAttribute("aria-hidden", String(!authenticated));
  resultPanel.inert = !authenticated;
  loginPanel.classList.toggle("hidden", authenticated);
  if (!authenticated) {
    imageUrl = "";
    $("generated-image").removeAttribute("src");
    $("generated-image").classList.add("hidden");
    $("generated-video").classList.add("hidden");
    $("generated-video").removeAttribute("src");
    $("generated-text").classList.add("hidden");
    $("generated-text").textContent = "";
    videoUrl = "";
    imageUrl = "";
    resultType = "image";
    $("empty-result").classList.remove("hidden");
    $("loading-result").classList.add("hidden");
    $("download").disabled = true;
    $("result-status").textContent = languageText("ready_status");
    $("result-status").className = "result-status";
  } else {
    $("studio-auth-error").textContent = "";
    $("auth-modal").classList.add("hidden");
  }
}

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  onAuthStateChanged(auth, (user) => {
    currentUser = canUseStudio(user) ? user : null;
    $("account-label").textContent = user ? (user.displayName || user.email || "Conectado") : "Visitante";
    $("login-open").classList.toggle("hidden", Boolean(currentUser));
    $("logout").classList.toggle("hidden", !user);
    updateStudioAccess(currentUser);
    if (user && !currentUser) {
      $("studio-auth-error").textContent = languageText("email_verification_required");
    }
  });
} else {
  $("account-label").textContent = "Visitante";
  $("login-open").classList.remove("hidden");
}

$("login-open").addEventListener("click", () => $("auth-modal").classList.remove("hidden"));
document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", () => $("auth-modal").classList.add("hidden")));
$("logout").addEventListener("click", async () => { if (auth) await signOut(auth); });
function authErrorText(error) {
  const keyByCode = {
    "auth/unauthorized-domain": "auth_domain_error",
    "auth/invalid-email": "invalid_email",
    "auth/email-already-in-use": "email_already_in_use",
    "auth/weak-password": "weak_password",
    "auth/invalid-credential": "invalid_credentials",
    "auth/user-not-found": "invalid_credentials",
    "auth/wrong-password": "invalid_credentials",
    "auth/missing-password": "password_required",
    "auth/too-many-requests": "too_many_requests",
    "auth/network-request-failed": "network_error",
    "auth/operation-not-allowed": "email_provider_disabled"
  };
  return languageText(keyByCode[error?.code] || "auth_failed");
}

async function emailAuth(mode, emailId, passwordId, errorTarget) {
  $(errorTarget).textContent = "";
  if (auth) auth.languageCode = document.documentElement.lang === "en" ? "en" : "pt-BR";
  const email = $(emailId).value.trim();
  const password = $(passwordId)?.value || "";

  if (!auth) {
    $(errorTarget).textContent = languageText("auth_unavailable");
    return;
  }
  if (!email) {
    $(errorTarget).textContent = languageText("email_required");
    $(emailId).focus();
    return;
  }
  if (mode !== "reset" && !password) {
    $(errorTarget).textContent = languageText("password_required");
    $(passwordId).focus();
    return;
  }
  if (mode === "create" && password.length < 6) {
    $(errorTarget).textContent = languageText("weak_password");
    $(passwordId).focus();
    return;
  }

  const buttons = [...document.querySelectorAll(".email-auth-form button")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    if (mode === "create") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(credential.user);
      await signOut(auth);
      $(errorTarget).textContent = languageText("verification_email_sent");
      return;
    } else if (mode === "reset") {
      await sendPasswordResetEmail(auth, email);
      $(errorTarget).textContent = languageText("reset_email_sent");
      return;
    } else {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user);
        await signOut(auth);
        $(errorTarget).textContent = languageText("email_verification_required");
        return;
      }
    }
  } catch (error) {
    console.error("Firebase email authentication failed:", error?.code || error?.message || error);
    if (mode === "reset" && error?.code === "auth/user-not-found") {
      $(errorTarget).textContent = languageText("reset_email_sent");
    } else if (mode === "reset") {
      $(errorTarget).textContent = error?.code ? authErrorText(error) : languageText("reset_email_failed");
    } else {
      $(errorTarget).textContent = authErrorText(error);
    }
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function login(provider, errorTarget = "auth-error") {
  $("auth-error").textContent = "";
  $("studio-auth-error").textContent = "";
  if (!auth) {
    $(errorTarget).textContent = languageText("auth_unavailable");
    return;
  }
  try { await signInWithPopup(auth, provider); }
  catch (error) {
    const message = authErrorText(error);
    $(errorTarget).textContent = message;
  }
}
$("studio-email-auth-form").addEventListener("submit", (event) => {
  event.preventDefault();
  emailAuth("signin", "studio-email", "studio-password", "studio-auth-error");
});
$("studio-email-create").addEventListener("click", () => emailAuth("create", "studio-email", "studio-password", "studio-auth-error"));
$("studio-email-reset").addEventListener("click", () => emailAuth("reset", "studio-email", "studio-password", "studio-auth-error"));
$("modal-email-auth-form").addEventListener("submit", (event) => {
  event.preventDefault();
  emailAuth("signin", "modal-email", "modal-password", "auth-error");
});
$("modal-email-create").addEventListener("click", () => emailAuth("create", "modal-email", "modal-password", "auth-error"));
$("modal-email-reset").addEventListener("click", () => emailAuth("reset", "modal-email", "modal-password", "auth-error"));

$("google-login").addEventListener("click", () => login(new GoogleAuthProvider()));
$("github-login").addEventListener("click", () => login(new GithubAuthProvider()));
$("studio-google-login").addEventListener("click", () => login(new GoogleAuthProvider(), "studio-auth-error"));
$("studio-github-login").addEventListener("click", () => login(new GithubAuthProvider(), "studio-auth-error"));

const promptInput = $("prompt");
const modelSelect = $("model-select");
const QWYTHOS_MODEL = "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated";

function selectedTask(model = modelSelect.value) {
  if (model === QWYTHOS_MODEL) return "image-edit";
  if (model === COSMOS_MODEL) return "video";
  if (model === QWEN_MODEL) return "text";
  return "image";
}

function modelButtonLabel(model = modelSelect.value) {
  const english = document.documentElement.lang === "en";
  const task = selectedTask(model);
  if (task === "image-edit") return languageText("qwythos_image_button");
  if (task === "video") return english ? "Generate short video" : "Gerar vídeo curto";
  if (task === "text") return english ? "Ask Qwen" : "Perguntar ao Qwen";
  return languageText("generate");
}

function updateModelSelection() {
  const model = modelSelect.value;
  const task = selectedTask(model);
  const english = document.documentElement.lang === "en";
  const isQwythos = task === "image-edit";
  const isCosmos = task === "video";
  const isQwen = task === "text";
  $("selected-model-label").textContent = model;
  const labels = {
    [FLUX_MODEL]: english ? FLUX_MODEL + " — text-to-image" : FLUX_MODEL + " — texto → imagem",
    [QWYTHOS_MODEL]: english ? QWYTHOS_MODEL + " — image → text → image" : QWYTHOS_MODEL + " — imagem → texto → imagem",
    [COSMOS_MODEL]: english ? COSMOS_MODEL + " — text-to-video (experimental)" : COSMOS_MODEL + " — texto → vídeo (experimental)",
    [QWEN_MODEL]: english ? QWEN_MODEL + " — text assistant (experimental)" : QWEN_MODEL + " — assistente de texto (experimental)"
  };
  for (const option of modelSelect.options) if (labels[option.value]) option.textContent = labels[option.value];
  $("image-options-row").classList.toggle("hidden", isCosmos || isQwen);
  
  $("qwythos-image-input").classList.toggle("hidden", !isQwythos);
  $("generate").querySelector("span").textContent = modelButtonLabel(model);
  $("model-task-badge").textContent = isCosmos ? "TEXT → VIDEO" : isQwen ? "TEXT → TEXT" : isQwythos ? "IMAGE → TEXT → IMAGE" : "TEXT → IMAGE";
  $("model-help").textContent = isQwythos
    ? languageText("qwythos_help")
    : isCosmos
      ? (english ? "Cosmos3 Nano generates a short video from text. The Space limits the first attempt to 16 frames at 256×256 and checks VRAM/disk before loading." : "Cosmos3 Nano cria um vídeo curto a partir do texto. O Space limita a tentativa a 16 quadros em 256×256 e verifica VRAM/disco antes de carregar.")
      : isQwen
        ? (english ? "Qwen3.8 is a third-party 27B text model. It uses a low-memory GGUF quantization on CPU only to avoid GPU OOM; responses can be slow and quality is reduced." : "Qwen3.8 é um modelo de texto de terceiros com 27B parâmetros. Usa uma quantização GGUF de menor memória somente na CPU para evitar falta de VRAM; respostas podem ser lentas e a qualidade é reduzida.")
        : languageText("model_help");
  const enabled = isCosmos ? MODEL_AVAILABILITY.cosmosVideo : isQwen ? MODEL_AVAILABILITY.qwenText : true;
  $("model-runtime-pill").textContent = isCosmos
    ? (enabled ? (english ? "Experimental · hardware checks enabled" : "Experimental · verificações de hardware ativadas") : (english ? "Locked · GPU/disk validation required" : "Bloqueado · validação de GPU/disco exigida"))
    : isQwen
      ? (enabled ? (english ? "Experimental · CPU/RAM checks enabled" : "Experimental · verificações CPU/RAM ativadas") : (english ? "Locked · CPU/RAM/disk validation required" : "Bloqueado · validação CPU/RAM/disco exigida"))
      : (english ? "Available · provider limits apply" : "Disponível · sujeito aos limites do provedor");
  $("model-runtime-notice").textContent = isCosmos
    ? (english
        ? (enabled ? "The Space checks available VRAM and cache disk before loading. Successful inference is not guaranteed." : "Blocked to reduce GPU/disk failures. Enabling requires explicit Vercel and Space flags, ≥48 GiB total / ≥40 GiB free VRAM and ~36 GiB disk for a cold download.")
        : (enabled ? "O Space verifica VRAM e disco de cache antes de carregar. A inferência ainda não é garantida." : "Bloqueado para reduzir falhas de GPU/disco. A ativação exige flags no Vercel e Space, ≥48 GiB de VRAM total / ≥40 GiB livre e cerca de 36 GiB em disco no primeiro download."))
    : isQwen
      ? (english
          ? (enabled ? "CPU-only (no GPU offload): needs ~12 GiB free RAM and ~11 GiB free disk on cold download. The small quantization reduces quality." : "Blocked until CPU runtime is installed and both flags are enabled. Requires ~12 GiB free RAM and ~11 GiB free disk.")
          : (enabled ? "Somente CPU (sem GPU): requer ~12 GiB de RAM livre e ~11 GiB em disco no primeiro download. A quantização pequena reduz a qualidade." : "Bloqueado até instalar runtime CPU e habilitar as duas flags. Exige cerca de 12 GiB de RAM livre e 11 GiB em disco.")
        )
      : isQwythos
      ? languageText("qwythos_runtime_notice")
      : languageText("model_runtime_notice");
  $("result-title").textContent = isCosmos ? (english ? "Your video" : "Seu vídeo") : isQwen ? (english ? "Qwen response" : "Resposta do Qwen") : languageText("result_title");
  $("download").classList.toggle("hidden", isQwen);
  $("download").disabled = true;
  $("generated-image").classList.add("hidden");
  
  $("generated-video").classList.add("hidden");
  $("generated-text").classList.add("hidden");
  $("generated-text").textContent = "";
  $("qwythos-result-text").classList.add("hidden");
  $("empty-result").classList.remove("hidden");
  $("result-status").textContent = languageText("ready_status");
  $("result-status").className = "result-status";
}
modelSelect.addEventListener("change", updateModelSelection);

async function loadModelAvailability() {
  try {
    const response = await fetch("/api/models", { cache: "no-store" });
    if (!response.ok) throw new Error("model availability not provided");
    const data = await response.json();
    MODEL_AVAILABILITY.cosmosVideo = data?.models?.[COSMOS_MODEL] === true;
    MODEL_AVAILABILITY.qwenText = data?.models?.[QWEN_MODEL] === true;
  } catch {
    MODEL_AVAILABILITY.cosmosVideo = false;
    MODEL_AVAILABILITY.qwenText = false;
  }
  const cosmosOption = [...modelSelect.options].find((o) => o.value === COSMOS_MODEL);
  const qwenOption = [...modelSelect.options].find((o) => o.value === QWEN_MODEL);
  if (cosmosOption) cosmosOption.disabled = !MODEL_AVAILABILITY.cosmosVideo;
  if (qwenOption) qwenOption.disabled = !MODEL_AVAILABILITY.qwenText;
  updateModelSelection();
}
void loadModelAvailability();
const MAX_REFERENCE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_REFERENCE_DATA_BYTES = 3 * 1024 * 1024;
const referenceImageInput = $("reference-image");
const referenceImagePreview = $("reference-image-preview");
const referenceImageClear = $("reference-image-clear");
const referenceImageStatus = $("reference-image-status");
let referenceImageDataUrl = "";
let referenceImageSelectionVersion = 0;

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error(languageText("reference_image_read_error")));
    reader.onerror = () => reject(new Error(languageText("reference_image_read_error")));
    reader.readAsDataURL(blob);
  });
}

async function loadSelectedImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { image: bitmap, cleanup: () => bitmap.close?.() };
    } catch {
      // Fall back to the browser Image decoder for other supported formats.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(languageText("reference_image_unsupported")));
      element.src = objectUrl;
    });
    return { image, cleanup: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function normalizeImageForInference(file) {
  if (!file) throw new Error(languageText("reference_image_type"));
  if (file.size > MAX_REFERENCE_FILE_BYTES) throw new Error(languageText("reference_image_too_large"));
  const { image, cleanup } = await loadSelectedImage(file);
  try {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error(languageText("reference_image_unsupported"));
    const initialScale = Math.min(1, 2048 / Math.max(sourceWidth, sourceHeight));
    let width = Math.max(1, Math.round(sourceWidth * initialScale));
    let height = Math.max(1, Math.round(sourceHeight * initialScale));
    let quality = 0.9;
    let blob = null;
    const canvas = document.createElement("canvas");
    for (let attempt = 0; attempt < 12; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error(languageText("reference_image_unsupported"));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error(languageText("reference_image_unsupported"));
      if (blob.size <= MAX_REFERENCE_DATA_BYTES) break;
      if (quality > 0.61) quality = Math.max(0.6, quality - 0.1);
      else if (Math.max(width, height) > 640) {
        width = Math.max(1, Math.round(width * 0.8));
        height = Math.max(1, Math.round(height * 0.8));
        quality = 0.82;
      } else throw new Error(languageText("reference_image_too_large"));
    }
    if (!blob || blob.size > MAX_REFERENCE_DATA_BYTES) throw new Error(languageText("reference_image_too_large"));
    return await readBlobAsDataUrl(blob);
  } finally {
    cleanup();
  }
}

function clearSelectedReferenceImage() {
  referenceImageSelectionVersion += 1;
  referenceImageDataUrl = "";
  referenceImageInput.value = "";
  referenceImagePreview.removeAttribute("src");
  referenceImagePreview.classList.add("hidden");
  referenceImageClear.classList.add("hidden");
  referenceImageStatus.textContent = languageText("reference_image_status");
  $("reference-image-error").textContent = "";
}

referenceImageInput.addEventListener("change", async () => {
  const version = ++referenceImageSelectionVersion;
  const file = referenceImageInput.files?.[0];
  referenceImageDataUrl = "";
  referenceImagePreview.removeAttribute("src");
  referenceImagePreview.classList.add("hidden");
  referenceImageClear.classList.add("hidden");
  $("reference-image-error").textContent = "";
  if (!file) {
    referenceImageStatus.textContent = languageText("reference_image_status");
    return;
  }
  referenceImageStatus.textContent = languageText("reference_image_processing");
  try {
    const normalizedDataUrl = await normalizeImageForInference(file);
    if (version !== referenceImageSelectionVersion) return;
    referenceImageDataUrl = normalizedDataUrl;
    referenceImagePreview.src = normalizedDataUrl;
    referenceImagePreview.classList.remove("hidden");
    referenceImageClear.classList.remove("hidden");
    referenceImageStatus.textContent = languageText("reference_image_added");
  } catch (error) {
    if (version !== referenceImageSelectionVersion) return;
    referenceImageInput.value = "";
    referenceImageStatus.textContent = languageText("reference_image_status");
    $("reference-image-error").textContent = error?.message || languageText("reference_image_read_error");
  }
});
referenceImageClear.addEventListener("click", clearSelectedReferenceImage);
promptInput.addEventListener("input", () => $("char-count").textContent = promptInput.value.length + " / 1500");
promptInput.addEventListener("input", () => $("char-count").textContent = promptInput.value.length + " / 1500");
$("generator-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) {
    updateStudioAccess(null);
    $("studio-auth-error").textContent = languageText("auth_required_error");
    return;
  }
  const prompt = promptInput.value.trim();
  if (!prompt) return;
  const dimensions = { square: [768,768], landscape: [1024,768], portrait: [768,1024] }[$("aspect").value];
  const button = $("generate");
  button.disabled = true;
  button.querySelector("span").textContent = languageText("generating");
  $("empty-result").classList.add("hidden");
  $("generated-image").classList.add("hidden");
  
  $("loading-result").classList.remove("hidden");
  $("result-status").className = "result-status";
  $("result-status").textContent = languageText("validating");
  try {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + await currentUser.getIdToken() };
    const isQwythos = modelSelect.value === QWYTHOS_MODEL;
    const referenceImage = isQwythos ? referenceImageDataUrl : null;
    if (isQwythos && !referenceImage) throw new Error(languageText("reference_image_required"));
    $("loading-message").textContent = isQwythos ? languageText("reference_image_uploading") : languageText("loading_desc");
    const response = await fetch("/api/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, model: modelSelect.value, width: dimensions[0], height: dimensions[1], steps: Number($("quality").value), language: document.documentElement.lang, ...(referenceImage ? { referenceImage } : {}) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || languageText("generation_http_error") + " (" + response.status + ").");
    if (data.type === "text") {
      const answer = typeof data.text === "string" ? data.text.trim() : "";
      if (!answer) throw new Error(languageText("provider_image_missing"));
      resultType = "text"; imageUrl = ""; videoUrl = "";
      $("loading-result").classList.add("hidden");
      $("empty-result").classList.add("hidden");
      $("generated-image").classList.add("hidden");
      
      $("generated-video").classList.add("hidden");
      $("generated-text").textContent = answer;
      $("generated-text").classList.remove("hidden");
      $("download").classList.add("hidden");
      $("result-status").textContent = document.documentElement.lang === "en" ? "Qwen response ready." : "Resposta do Qwen pronta.";
      $("result-status").className = "result-status status-success";
      return;
    }
    if (data.type === "video") {
      videoUrl = typeof data.videoUrl === "string" ? data.videoUrl : "";
      if (!videoUrl) throw new Error(document.documentElement.lang === "en" ? "The Space did not return a video URL." : "O Space não retornou a URL de um vídeo.");
      resultType = "video"; imageUrl = "";
      const video = $("generated-video");
      video.onloadeddata = () => {
        $("loading-result").classList.add("hidden"); $("empty-result").classList.add("hidden");
        video.classList.remove("hidden"); $("download").disabled = false;
        $("result-status").textContent = document.documentElement.lang === "en" ? "Video ready." : "Vídeo pronto.";
        $("result-status").className = "result-status status-success";
      };
      video.onerror = () => {
        $("loading-result").classList.add("hidden"); $("empty-result").classList.remove("hidden");
        $("result-status").textContent = document.documentElement.lang === "en" ? "The temporary video could not be loaded." : "Não foi possível carregar o vídeo temporário.";
        $("result-status").className = "result-status status-error";
      };
      video.src = videoUrl; video.load(); return;
    }
    imageUrl = data.imageUrl || "";
    resultType = "image"; videoUrl = "";
    if (!imageUrl) throw new Error(languageText("provider_image_missing"));
    const img = $("generated-image");
    img.onload = () => { $("loading-result").classList.add("hidden"); img.classList.remove("hidden"); $("download").disabled = false; $("download").classList.remove("hidden"); $("empty-result").classList.add("hidden"); $("result-status").textContent = languageText("image_ready"); $("result-status").className = "result-status status-success"; };
    img.onerror = () => { $("loading-result").classList.add("hidden"); $("empty-result").classList.remove("hidden"); $("result-status").textContent = languageText("image_load_error"); $("result-status").className = "result-status status-error"; };
    img.src = imageUrl;
  } catch (error) {
    $("loading-result").classList.add("hidden");
    $("empty-result").classList.remove("hidden");
    $("result-status").textContent = error.message || languageText("generation_error");
    $("result-status").className = "result-status status-error";
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = modelButtonLabel(modelSelect.value);
  }
});
$("download").addEventListener("click", async () => {
  const mediaUrl = resultType === "video" ? videoUrl : imageUrl;
  if (!mediaUrl || resultType === "text") return;
  try {
    const response = await fetch(mediaUrl);
    if (!response.ok) throw new Error("Download failed.");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = resultType === "video" ? "erikraft-ai-video.mp4" : "erikraft-ai-image.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    console.error("Download failed:", error);
    window.open(mediaUrl, "_blank", "noopener,noreferrer");
  }
});


// Language selector: remember the choice and fall back to the browser language.
const translations = {
  "pt-BR": {
    nav_studio:"Studio",nav_how:"Como funciona",nav_donate:"Doar",hero_eyebrow:"AI IMAGE STUDIO · OPEN SOURCE",hero_title:"Transforme suas<br><span>ideias em imagens.</span>",hero_lead:"Crie imagens a partir da sua imaginação. Escreva um prompt único, ajuste as opções e gere sua arte com FLUX.",meta_prompt:"Prompt personalizado",meta_login:"Conta gratuita",meta_limits:"Limites contra abuso",studio_eyebrow:"SEU ESPAÇO CRIATIVO",studio_title:'Image studio<span class="accent">.</span>',studio_intro:"Descreva a imagem com suas próprias palavras. Não existe prompt predefinido.",prompt_label:"Seu prompt",prompt_placeholder:"Ex.: Uma estação de trem futurista no meio de uma floresta, luz azul cinematográfica, neblina suave, composição detalhada...",prompt_help:"Descreva o assunto, o ambiente, a luz e o estilo.",model_label:"Modelo / função",model_help:"FLUX faz texto para imagem. No fluxo experimental Imagem → texto → imagem, Qwythos analisa a imagem enviada junto com as instruções; FLUX renderiza a imagem final.",qwythos_help:"Fluxo experimental Imagem → texto → imagem: envie uma imagem de referência e descreva as alterações desejadas. A imagem é enviada ao Qwythos para interpretação; o FLUX gera a imagem final a partir do prompt resultante.",qwythos_runtime_notice:"Qwythos interpreta a imagem e as instruções em uma etapa separada; depois, o FLUX renderiza a imagem final. A compatibilidade e as cotas do Space se aplicam.",model_runtime_notice:"Cosmos e Qwen ficam bloqueados até confirmar memória, espaço em disco e backend compatível.",qwythos_image_button:"Gerar imagem (imagem → texto → imagem)",reference_image_label:"Imagem de referência (obrigatória neste modo)",reference_image_help:"Envie qualquer imagem em um formato compatível com seu navegador (arquivo original de até 12 MB) e descreva a alteração desejada. Ela será convertida para JPEG e enviada ao Qwythos; o FLUX renderiza a imagem final.",reference_image_required:"Envie uma imagem de referência para usar o fluxo Imagem → texto → imagem.",reference_image_too_large:"A imagem original deve ter no máximo 12 MB; a versão preparada para envio é limitada a 3 MB.",reference_image_type:"Selecione um arquivo de imagem compatível com seu navegador.",reference_image_read_error:"Não foi possível ler a imagem selecionada.",reference_image_clear:"Remover imagem",reference_image_status:"Nenhuma imagem selecionada.",reference_image_processing:"Preparando imagem para envio…",reference_image_added:"Imagem preparada e pronta para ser enviada ao Qwythos.",reference_image_unsupported:"O navegador não conseguiu abrir ou converter este arquivo de imagem. Tente outro formato.",reference_image_uploading:"Convertendo e enviando a imagem e as instruções para o Qwythos…",aspect_label:"Proporção",quality_label:"Etapas de geração",notice_limits:"Entre com Google, GitHub ou e-mail e senha para gerar imagens. Limite de até 5 gerações por hora por conta; a disponibilidade do provedor pode variar.",generate_button:"Gerar imagem",responsible_note:"Ao gerar, você concorda em usar o serviço de forma responsável.",result_eyebrow:"RESULTADO",result_title:"Sua criação",empty_title:"Sua imagem começa aqui",empty_desc:"O resultado aparecerá nesta área depois da geração.",loading_title:"Preparando sua imagem...",loading_desc:"Enviando o prompt para o modelo de IA.",loading_note:"Isso pode levar alguns minutos na cota gratuita.",ready_status:"Pronto para criar.",how_eyebrow:"SIMPLES E TRANSPARENTE",how_title:"Do texto à imagem.",step1_title:"Escreva sua ideia",step1_desc:"Use um prompt original. Você controla a descrição, sem texto fixo escondido no código.",step2_title:"Gere com FLUX",step2_desc:"O backend encaminha a solicitação para um Space compatível com o modelo selecionado.",step3_title:"Salve o resultado",step3_desc:"Visualize a imagem e baixe o arquivo quando a geração terminar.",security_title:"Limites de uso · proteção contra abuso",security_desc:"Somente usuários autenticados com Google, GitHub ou e-mail e senha podem gerar imagens. O backend valida a sessão Firebase e aplica até 5 gerações por hora por conta.",quota_title:"Cota gratuita e limites do provedor",quota_intro:"O ErikrafT AI envia as solicitações para um Space do Hugging Face. Os limites do site e os limites de computação do provedor são diferentes.",quota_site_label:"LIMITES DO ERIKRAFT AI",quota_site_value:"Até 5 gerações por hora por conta autenticada",quota_site_desc:"A geração requer uma sessão Firebase válida obtida com Google, GitHub ou e-mail e senha. O backend aplica até 5 gerações por hora por conta autenticada.",quota_gpu_label:"HUGGING FACE ZEROGPU · SE APLICÁVEL",quota_gpu_value:"2 min/dia sem autenticação · 5 min/dia para conta Free",quota_gpu_desc:"Quando o Space usa ZeroGPU, o Hugging Face documenta cotas diárias de tempo de GPU por categoria de conta. A cota reinicia 24 horas após o primeiro uso de GPU, e o saldo restante afeta a prioridade na fila. É tempo de computação, não um número garantido de imagens.",quota_availability_label:"DISPONIBILIDADE DO SPACE",quota_availability_value:"Filas, inicializações e suspensões podem ocorrer",quota_availability_desc:"O hardware gratuito pode ficar temporariamente indisponível ou precisar ser reiniciado após inatividade. No hardware CPU Basic, o Hugging Face informa suspensão após 48 horas sem atividade. Carregar um modelo grande também pode demorar.",quota_note:"A cota ZeroGPU só se aplica se este Space estiver usando esse hardware. A cota do provedor é independente dos limites do ErikrafT AI e não garante uma quantidade de imagens por dia nem um tempo de resposta.",quota_link_space:"Abrir Space utilizado pelo ErikrafT AI ↗",quota_link_zerogpu:"Cotas oficiais do ZeroGPU ↗",quota_link_sleep:"Regras de suspensão dos Spaces ↗",studio_login_eyebrow:"AUTENTICAÇÃO NECESSÁRIA",studio_login_title:"Entre para gerar imagens",studio_login_desc:"O gerador e os resultados ficam disponíveis somente depois de entrar com Google, GitHub ou e-mail e senha.",studio_google_button:"Continuar com Google",studio_github_button:"Continuar com GitHub",studio_login_note:"Até 5 gerações por hora por conta. A disponibilidade do Hugging Face pode variar.",auth_unavailable:"A autenticação está indisponível. Tente novamente mais tarde ou informe o administrador.",auth_required_error:"Entre com Google, GitHub ou uma conta de e-mail verificada antes de gerar imagens.",auth_provider_error:"Entre usando Google, GitHub ou uma conta de e-mail verificada para continuar.",email_separator:"OU USE E-MAIL E SENHA",email_label:"E-mail",password_label:"Senha",email_placeholder:"voce@exemplo.com",password_placeholder:"Mínimo de 6 caracteres",email_sign_in:"Entrar com e-mail",create_account:"Criar conta",forgot_password:"Esqueci minha senha",modal_auth_eyebrow:"SUA CONTA",modal_auth_title:"Entre ou crie sua conta",modal_auth_desc:"Use Google, GitHub ou seu e-mail e senha para continuar.",modal_auth_note:"A autenticação e a senha são gerenciadas pelo Firebase.",email_required:"Informe seu endereço de e-mail.",invalid_email:"Informe um endereço de e-mail válido.",password_required:"Digite sua senha.",weak_password:"A senha precisa ter pelo menos 6 caracteres.",email_already_in_use:"Este e-mail já está cadastrado. Entre ou redefina sua senha.",invalid_credentials:"E-mail ou senha incorretos.",too_many_requests:"Muitas tentativas. Aguarde antes de tentar novamente.",network_error:"Falha de conexão. Verifique sua internet e tente novamente.",email_provider_disabled:"O login por e-mail e senha não está habilitado no Firebase.",verification_email_sent:"Conta criada. Enviamos um link de verificação para seu e-mail. Confirme-o antes de entrar.",email_verification_required:"Seu e-mail ainda não foi verificado. Enviamos um novo link; confirme-o antes de entrar.",reset_email_sent:"Se existir uma conta com esse e-mail, enviaremos instruções para redefinir a senha.",reset_email_failed:"Não foi possível enviar o e-mail de redefinição. Verifique o endereço e tente novamente.",auth_domain_error:"Este domínio não está autorizado no Firebase Authentication.",auth_failed:"Não foi possível entrar. Tente novamente.",generation_http_error:"A geração falhou",provider_image_missing:"O Space não retornou uma imagem reconhecida.",support_project:"APOIE O PROJETO",donate_title:"Ajude a manter o projeto aberto.",donate_desc:"Se o ErikrafT AI™ é útil para você, contribua com Bitcoin. Confira a carteira antes de enviar; transações na blockchain são irreversíveis.",primary_account:"Conta principal",email_account:"Conta de e-mail",copy_address:"Copiar endereço",copied:"Endereço copiado!",open_wallet:"Abrir na carteira ↗",scan_qr:"Escaneie com sua carteira Bitcoin",bitcoin_note:"Envie apenas Bitcoin pela rede Bitcoin. Sempre confira o endereço na sua carteira antes de confirmar.",footer_text:"Open source · Construído por ErikrafT",generate:"Gerar imagem",generating:"Gerando...",validating:"Validando o limite de uso...",image_ready:"Imagem pronta.",image_load_error:"A imagem temporária não pôde ser carregada. Tente gerar novamente.",generation_error:"Não foi possível gerar a imagem."
  },
  "en": {
    nav_studio:"Studio",nav_how:"How it works",nav_donate:"Donate",hero_eyebrow:"AI IMAGE STUDIO · OPEN SOURCE",hero_title:"Turn your ideas<br><span>into images.</span>",hero_lead:"Create images from your imagination. Write a unique prompt, adjust the options, and generate your art with FLUX.",meta_prompt:"Custom prompts",meta_login:"Free account",meta_limits:"Abuse protection",studio_eyebrow:"YOUR CREATIVE SPACE",studio_title:'Image studio<span class="accent">.</span>',studio_intro:"Describe the image in your own words. No preset prompt is used.",prompt_label:"Your prompt",prompt_placeholder:"E.g. A futuristic train station in a forest, cinematic blue light, soft mist, detailed composition...",prompt_help:"Describe the subject, setting, lighting, and style.",model_label:"Model / task",model_help:"FLUX generates images from text. In the experimental image → text → image workflow, Qwythos analyzes the uploaded image together with your instructions; FLUX renders the final image.",qwythos_help:"Experimental image → text → image: upload a reference image and describe the changes you want. The image is sent to Qwythos for interpretation; FLUX generates the final image from the resulting prompt.",qwythos_runtime_notice:"Qwythos interprets the image and instructions in a separate step; FLUX then renders the final image. Space compatibility and quotas still apply.",model_runtime_notice:"Cosmos and Qwen remain blocked until memory, disk space, and a compatible backend have been confirmed.",qwythos_image_button:"Generate image (image → text → image)",reference_image_label:"Reference image (required for this task)",reference_image_help:"Upload any image format supported by your browser (original file up to 12 MB) and describe the desired changes. The image is converted to JPEG and sent to Qwythos; FLUX renders the final image.",reference_image_required:"Upload a reference image to use the image → text → image workflow.",reference_image_too_large:"The original image must be 12 MB or smaller; the prepared upload is capped at 3 MB.",reference_image_type:"Choose an image format supported by your browser.",reference_image_read_error:"Could not read the selected image.",reference_image_clear:"Remove image",reference_image_status:"No image selected.",reference_image_processing:"Preparing image for upload…",reference_image_added:"Image prepared and ready to send to Qwythos.",reference_image_unsupported:"The browser could not open or convert this image file. Try another format.",reference_image_uploading:"Converting and sending the image and instructions to Qwythos…",aspect_label:"Aspect ratio",quality_label:"Generation steps",notice_limits:"Sign in with Google, GitHub, or email and password to generate images. Up to 5 generations per hour per account; provider availability may vary.",generate_button:"Generate image",responsible_note:"By generating, you agree to use the service responsibly.",result_eyebrow:"RESULT",result_title:"Your creation",empty_title:"Your image starts here",empty_desc:"Your result will appear here after generation.",loading_title:"Preparing your image...",loading_desc:"Sending the prompt to the AI model.",loading_note:"This may take a few minutes on the free tier.",ready_status:"Ready to create.",how_eyebrow:"SIMPLE AND TRANSPARENT",how_title:"From text to image.",step1_title:"Write your idea",step1_desc:"Use an original prompt. You control the description, with no hidden fixed text in the code.",step2_title:"Generate with FLUX",step2_desc:"The backend forwards your request to a Space compatible with the selected model.",step3_title:"Save the result",step3_desc:"Preview your image and download it when generation finishes.",security_title:"Usage limits · abuse protection",security_desc:"Only users authenticated with Google, GitHub, or email and password can generate images. The backend validates the Firebase session and allows up to 5 generations per hour per account.",quota_title:"Free-tier quotas and provider limits",quota_intro:"ErikrafT AI sends image requests to a Hugging Face Space. This website’s limits are separate from the provider’s compute limits.",quota_site_label:"ERIKRAFT AI LIMITS",quota_site_value:"Up to 5 generations per hour per authenticated account",quota_site_desc:"Image generation requires a valid Firebase session from Google, GitHub, or email and password. The backend allows up to 5 generations per hour per authenticated account.",quota_gpu_label:"HUGGING FACE ZEROGPU · IF APPLICABLE",quota_gpu_value:"2 min/day unauthenticated · 5 min/day for a Free account",quota_gpu_desc:"When a Space uses ZeroGPU, Hugging Face documents daily GPU-time quotas by account tier. The quota resets 24 hours after first GPU use, and remaining quota affects queue priority. This is compute time, not a guaranteed number of images.",quota_availability_label:"SPACE AVAILABILITY",quota_availability_value:"Queues, cold starts, and suspensions may occur",quota_availability_desc:"Free hardware may be temporarily unavailable or need to restart after inactivity. On CPU Basic hardware, Hugging Face documents suspension after 48 hours without activity. Loading a large model can also take time.",quota_note:"The ZeroGPU quota only applies if this Space uses that hardware. Provider quota is independent of ErikrafT AI’s limits and does not guarantee a number of images per day or a response time.",quota_link_space:"Open the Space used by ErikrafT AI ↗",quota_link_zerogpu:"Official ZeroGPU quotas ↗",quota_link_sleep:"Spaces sleep and lifecycle rules ↗",studio_login_eyebrow:"SIGN-IN REQUIRED",studio_login_title:"Sign in to generate images",studio_login_desc:"The generator and results are available only after you sign in with Google, GitHub, or email and password.",studio_google_button:"Continue with Google",studio_github_button:"Continue with GitHub",studio_login_note:"Up to 5 generations per hour per account. Hugging Face availability may vary.",auth_unavailable:"Authentication is unavailable. Try again later or contact the administrator.",auth_required_error:"Sign in with Google, GitHub, or a verified email account before generating images.",auth_provider_error:"Sign in using Google, GitHub, or a verified email account to continue.",email_separator:"OR USE EMAIL AND PASSWORD",email_label:"Email",password_label:"Password",email_placeholder:"you@example.com",password_placeholder:"At least 6 characters",email_sign_in:"Sign in with email",create_account:"Create account",forgot_password:"Forgot password?",modal_auth_eyebrow:"YOUR ACCOUNT",modal_auth_title:"Sign in or create your account",modal_auth_desc:"Use Google, GitHub, or your email and password to continue.",modal_auth_note:"Authentication and password handling are managed by Firebase.",email_required:"Enter your email address.",invalid_email:"Enter a valid email address.",password_required:"Enter your password.",weak_password:"Your password must contain at least 6 characters.",email_already_in_use:"This email is already registered. Sign in or reset your password.",invalid_credentials:"Incorrect email or password.",too_many_requests:"Too many attempts. Please wait before trying again.",network_error:"Connection failed. Check your internet connection and try again.",email_provider_disabled:"Email and password sign-in is not enabled in Firebase.",verification_email_sent:"Account created. We sent a verification link to your email. Verify it before signing in.",email_verification_required:"Your email has not been verified yet. We sent a new link; verify it before signing in.",reset_email_sent:"If an account exists for this email, password-reset instructions will be sent.",reset_email_failed:"Could not send the password-reset email. Check the address and try again.",auth_domain_error:"This domain is not authorized in Firebase Authentication.",auth_failed:"Sign-in failed. Please try again.",generation_http_error:"Image generation failed",provider_image_missing:"The Space did not return a recognized image.",support_project:"SUPPORT THE PROJECT",donate_title:"Help keep the project open.",donate_desc:"If ErikrafT AI™ is useful to you, support it with Bitcoin. Verify the wallet before sending; blockchain transactions are irreversible.",primary_account:"Primary account",email_account:"Email account",copy_address:"Copy address",copied:"Address copied!",open_wallet:"Open in wallet ↗",scan_qr:"Scan with your Bitcoin wallet",bitcoin_note:"Send Bitcoin only over the Bitcoin network. Always verify the address in your wallet before confirming.",footer_text:"Open source · Built by ErikrafT",generate:"Generate image",generating:"Generating...",validating:"Checking usage limit...",image_ready:"Image ready.",image_load_error:"The temporary image could not be loaded. Try generating again.",generation_error:"Could not generate the image."
  }
};
function detectBrowserLanguage(){const candidates=[...(navigator.languages||[]),navigator.language||""];for(const locale of candidates){const normalized=locale.toLowerCase();if(normalized.startsWith("pt"))return "pt-BR";if(normalized.startsWith("en"))return "en";}return "en";}
function setLanguage(language){
  const selected=translations[language]?language:"pt-BR";
  const dict=translations[selected];
  document.documentElement.lang=selected;
  document.querySelectorAll("[data-i18n]").forEach(el=>{const key=el.dataset.i18n;if(dict[key])el.innerHTML=dict[key];});
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{const key=el.dataset.i18nPlaceholder;if(dict[key])el.setAttribute("placeholder",dict[key]);});
  $("language-select").value=selected;
  $("language-flag").src=selected==="en"?"/assets/english_language_flag.svg":"/assets/brazil_flag.svg";
  $("language-flag").alt=selected==="en"?"English":"Português (Brasil)";
  try{localStorage.setItem("erikraft-ai-language",selected);}catch{}
}
function languageText(key){return translations[document.documentElement.lang]?.[key]||translations["pt-BR"][key]||key;}
$("language-select").addEventListener("change",()=>{setLanguage($("language-select").value);updateModelSelection();});
try{const saved=localStorage.getItem("erikraft-ai-language");setLanguage(saved&&translations[saved]?saved:detectBrowserLanguage());}catch{setLanguage(detectBrowserLanguage());}
updateModelSelection();
if (!configured) $("studio-auth-error").textContent = languageText("auth_unavailable");

// Bitcoin donation address copying. Both QR codes are bundled SVG assets, with the shared Bitcoin logo layered in the markup.
document.querySelectorAll(".copy-wallet").forEach(button=>button.addEventListener("click",async()=>{
  const original=button.textContent;
  try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent=languageText("copied");}
  catch{const field=document.createElement("textarea");field.value=button.dataset.copy;field.setAttribute("readonly","");field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();const copied=document.execCommand("copy");field.remove();button.textContent=copied?languageText("copied"):original;}
  setTimeout(()=>{button.textContent=languageText("copy_address");},1800);
}));
