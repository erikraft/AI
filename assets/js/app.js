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
const FLUX_MODEL = "aoxo/flux.1dev-abliterated";
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
  const studioGrid = $("studio-grid");
  studioGrid.classList.toggle("is-chatbot", isQwen);
  const resultStage = $("result-stage");
  resultStage.classList.toggle("is-video-result", isCosmos);
  resultStage.classList.toggle("is-chat-result", isQwen);
  $("empty-title").textContent = isCosmos ? languageText("video_empty_title") : isQwen ? languageText("qwen_empty_title") : languageText("empty_title");
  $("empty-desc").textContent = isCosmos ? languageText("video_empty_desc") : isQwen ? languageText("qwen_empty_desc") : languageText("empty_desc");
  $("empty-result").classList.toggle("task-empty-no-image", isCosmos || isQwen);
  $("selected-model-label").textContent = model;
  const labels = {
    [FLUX_MODEL]: english ? FLUX_MODEL + " — text-to-image" : FLUX_MODEL + " — texto → imagem",
    [QWYTHOS_MODEL]: english ? QWYTHOS_MODEL + " — image → text → image" : QWYTHOS_MODEL + " — imagem → texto → imagem",
    [COSMOS_MODEL]: english ? COSMOS_MODEL + " — text-to-video (experimental)" : COSMOS_MODEL + " — texto → vídeo (experimental)",
    [QWEN_MODEL]: english ? QWEN_MODEL + " — text assistant (experimental)" : QWEN_MODEL + " — assistente de texto (experimental)"
  };
  for (const option of modelSelect.options) if (labels[option.value]) option.textContent = labels[option.value];
  $("image-options-row").classList.toggle("hidden", isCosmos || isQwen);
  
  const qwythosInputPanel = $("qwythos-image-input");
  qwythosInputPanel.classList.toggle("hidden", !isQwythos);
  qwythosInputPanel.hidden = !isQwythos;
  qwythosInputPanel.setAttribute("aria-hidden", String(!isQwythos));
  $("generate").querySelector("span").textContent = modelButtonLabel(model);
  const taskBadges = english
    ? { image: "TEXT → IMAGE", "image-edit": "IMAGE → TEXT → IMAGE", video: "TEXT → VIDEO", text: "TEXT → TEXT" }
    : { image: "TEXTO → IMAGEM", "image-edit": "IMAGEM → TEXTO → IMAGEM", video: "TEXTO → VÍDEO", text: "TEXTO → TEXTO" };
  $("model-task-badge").textContent = taskBadges[task];
  $("model-help").textContent = isQwythos
    ? languageText("qwythos_help")
    : isCosmos
      ? (english ? "Cosmos3 Nano generates a short video from text. The Space limits the first attempt to 16 frames at 256×256 and checks VRAM/disk before loading." : "Cosmos3 Nano cria um vídeo curto a partir do texto. O Space limita a tentativa a 16 quadros em 256×256 e verifica VRAM/disco antes de carregar.")
      : isQwen
        ? (english ? "Qwen3.8 is a third-party 27B text model. It uses a low-memory GGUF quantization on CPU only to avoid GPU OOM; responses can be slow and quality is reduced." : "Qwen3.8 é um modelo de texto de terceiros com 27B parâmetros. Usa uma quantização GGUF de menor memória somente na CPU para evitar falta de VRAM; respostas podem ser lentas e a qualidade é reduzida.")
        : languageText("model_help");
  const enabled = isCosmos ? MODEL_AVAILABILITY.cosmosVideo : isQwen ? MODEL_AVAILABILITY.qwenText : true;
  $("model-runtime-pill").textContent = isCosmos
    ? (enabled ? (english ? "Configured · runtime checks apply" : "Configurado · sujeito às verificações do runtime") : (english ? "Unavailable · backend secret required" : "Indisponível · requer segredo do backend"))
    : isQwen
      ? (enabled ? (english ? "Configured · runtime checks apply" : "Configurado · sujeito às verificações do runtime") : (english ? "Unavailable · backend secret required" : "Indisponível · requer segredo do backend"))
      : (english ? "Available · provider limits apply" : "Disponível · sujeito aos limites do provedor");
  $("model-runtime-notice").textContent = isCosmos
    ? (english
        ? (enabled ? "The backend is configured to call Cosmos. The Space still checks its feature flag, available VRAM and disk at runtime; successful inference is not guaranteed." : "Unavailable until the backend API secret is configured. The Space also requires its Cosmos feature flag, suitable VRAM and enough disk space.")
        : (enabled ? "O backend está configurado para chamar o Cosmos. O Space ainda verifica a flag do modelo, a VRAM e o disco disponíveis; a inferência não é garantida." : "Indisponível até configurar o segredo da API no backend. O Space também exige a flag do Cosmos, VRAM compatível e espaço em disco suficiente."))
    : isQwen
      ? (english
          ? (enabled ? "The backend is configured to call Qwen. The Space still checks its feature flag, CPU runtime, available RAM and disk before inference; responses may be slow." : "Unavailable until the backend API secret is configured. The Space also requires its Qwen feature flag, CPU runtime, enough RAM and disk.")
          : (enabled ? "O backend está configurado para chamar o Qwen. O Space ainda verifica a flag do modelo, o runtime de CPU, a RAM e o disco antes de inferir; as respostas podem demorar." : "Indisponível até configurar o segredo da API no backend. O Space também exige a flag do Qwen, runtime de CPU, RAM e disco suficientes.")
        )
      : isQwythos
      ? languageText("qwythos_runtime_notice")
      : languageText("model_runtime_notice");
  $("result-title").textContent = isCosmos ? languageText("video_result_title") : isQwen ? languageText("qwen_chat_title") : languageText("result_title");
  $("download").classList.toggle("hidden", isQwen);
  $("download").disabled = true;
  $("generated-image").classList.add("hidden");
  
  $("generated-video").classList.add("hidden");
  $("generated-text").classList.add("hidden");
  $("generated-text").textContent = "";
  $("qwythos-result-text").classList.add("hidden");
  $("qwen-chat-thread").classList.toggle("hidden", !isQwen || !$("qwen-chat-thread").children.length);
  $("empty-result").classList.toggle("hidden", isQwen && $("qwen-chat-thread").children.length > 0);
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
  // Keep all models selectable so the user can inspect each task's inputs and requirements.
  // The runtime pill explains missing backend configuration; the Worker remains fail-closed.
  updateModelSelection();
}
void loadModelAvailability();
const MAX_REFERENCE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_REFERENCE_DATA_BYTES = 3 * 1024 * 1024;
const referenceImageInput = $("reference-image");
const referenceCameraInput = $("reference-image-camera");
const referenceGalleryInput = $("reference-image-gallery");
const referenceCameraButton = $("reference-image-camera-button");
const referenceGalleryButton = $("reference-image-gallery-button");
const referenceImagePreview = $("reference-image-preview");
const referenceImageClear = $("reference-image-clear");
const referenceImageStatus = $("reference-image-status");
const referenceDropzone = $("reference-image-dropzone");
const referenceBrowseButton = $("reference-image-browse");
const referenceFileInputs = [referenceImageInput, referenceCameraInput, referenceGalleryInput];
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
  if (!file || (file.type && !file.type.startsWith("image/"))) throw new Error(languageText("reference_image_type"));
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
  for (const input of referenceFileInputs) input.value = "";
  referenceImagePreview.removeAttribute("src");
  referenceImagePreview.classList.add("hidden");
  referenceImageClear.classList.add("hidden");
  referenceDropzone.classList.remove("has-image", "is-dragging");
  referenceImageStatus.textContent = languageText("reference_image_status");
  $("reference-image-error").textContent = "";
}

async function processReferenceImage(file) {
  const version = ++referenceImageSelectionVersion;
  referenceImageDataUrl = "";
  referenceImagePreview.removeAttribute("src");
  referenceImagePreview.classList.add("hidden");
  referenceImageClear.classList.add("hidden");
  referenceDropzone.classList.remove("has-image");
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
    referenceDropzone.classList.add("has-image");
    referenceImageStatus.textContent = languageText("reference_image_added");
  } catch (error) {
    if (version !== referenceImageSelectionVersion) return;
    for (const input of referenceFileInputs) input.value = "";
    referenceImageStatus.textContent = languageText("reference_image_status");
    $("reference-image-error").textContent = error?.message || languageText("reference_image_read_error");
  }
}

for (const input of referenceFileInputs) {
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    // Reset immediately so the same photo can be selected again after a failed attempt.
    input.value = "";
    void processReferenceImage(file);
  });
}
referenceDropzone.addEventListener("click", (event) => {
  // A programmatic file-input click bubbles back to the dropzone; do not trigger it again.
  if (event.target.closest("button") || referenceFileInputs.includes(event.target)) return;
  referenceImageInput.click();
});
referenceBrowseButton.addEventListener("click", (event) => {
  event.stopPropagation();
  referenceImageInput.click();
});
referenceCameraButton.addEventListener("click", (event) => {
  event.stopPropagation();
  referenceCameraInput.click();
});
referenceGalleryButton.addEventListener("click", (event) => {
  event.stopPropagation();
  referenceGalleryInput.click();
});
referenceDropzone.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
    event.preventDefault();
    referenceImageInput.click();
  }
});
for (const eventName of ["dragenter", "dragover"]) {
  referenceDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    referenceDropzone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "dragend"]) {
  referenceDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!referenceDropzone.contains(event.relatedTarget)) referenceDropzone.classList.remove("is-dragging");
  });
}
referenceDropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  referenceDropzone.classList.remove("is-dragging");
  const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith("image/"));
  if (file) {
    void processReferenceImage(file);
  } else {
    $("reference-image-error").textContent = languageText("reference_image_type");
  }
});
referenceImageClear.addEventListener("click", clearSelectedReferenceImage);
promptInput.addEventListener("input", () => $("char-count").textContent = promptInput.value.length + " / 1500");
promptInput.addEventListener("input", () => $("char-count").textContent = promptInput.value.length + " / 1500");

function appendQwenChatMessage(role, text, pending = false) {
  const thread = $("qwen-chat-thread");
  const message = document.createElement("article");
  message.className = "qwen-chat-message " + (role === "user" ? "from-user" : "from-assistant") + (pending ? " is-pending" : "");
  message.dataset.role = role;
  const label = document.createElement("span");
  label.className = "qwen-message-label";
  label.textContent = languageText(role === "user" ? "qwen_user_label" : "qwen_assistant_label");
  const content = document.createElement("p");
  content.className = "qwen-message-content";
  content.textContent = text;
  message.append(label, content);
  thread.appendChild(message);
  thread.classList.remove("hidden");
  thread.scrollTop = thread.scrollHeight;
  return message;
}

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
  const isQwenRequest = modelSelect.value === QWEN_MODEL;
  const qwenThread = $("qwen-chat-thread");
  const qwenHistory = isQwenRequest
    ? [...qwenThread.querySelectorAll(".qwen-chat-message")]
        .filter((message) => !message.classList.contains("is-pending"))
        .slice(-4)
        .map((message) => ({
          role: message.dataset.role,
          text: (message.querySelector(".qwen-message-content")?.textContent || "").slice(0, 900)
        }))
    : [];
  const contextBudget = Math.max(0, 1450 - prompt.length);
  const contextText = qwenHistory.map((message) => (message.role === "user" ? "User: " : "Assistant: ") + message.text).join("\n");
  const requestPrompt = isQwenRequest && qwenHistory.length && contextBudget > 0
    ? (contextText.slice(-contextBudget) + "\nUser: " + prompt).slice(-1500)
    : prompt;
  let qwenPendingMessage = null;
  button.disabled = true;
  button.querySelector("span").textContent = languageText("generating");
  $("empty-result").classList.add("hidden");
  $("generated-image").classList.add("hidden");
  $("generated-video").classList.add("hidden");
  $("generated-text").classList.add("hidden");
  if (isQwenRequest) {
    qwenThread.classList.remove("hidden");
    qwenThread.appendChild((() => {
      const message = document.createElement("article");
      message.className = "qwen-chat-message from-user";
      message.dataset.role = "user";
      const label = document.createElement("span");
      label.className = "qwen-message-label";
      label.textContent = languageText("qwen_user_label");
      const content = document.createElement("p");
      content.className = "qwen-message-content";
      content.textContent = prompt;
      message.append(label, content);
      return message;
    })());
    qwenPendingMessage = appendQwenChatMessage("assistant", languageText("qwen_thinking"), true);
    qwenThread.scrollTop = qwenThread.scrollHeight;
    $("loading-result").classList.add("hidden");
  } else {
    $("loading-result").classList.remove("hidden");
  }
  $("result-status").className = "result-status";
  $("result-status").textContent = languageText("validating");
  const requestController = new AbortController();
  // Qwen runs on CPU and has its own server-side budget; this is a final UI
  // safeguard for transport failures that would otherwise leave "Thinking…" visible.
  const requestTimeoutMs = isQwenRequest ? 180_000 : 285_000;
  const requestTimeoutId = window.setTimeout(() => requestController.abort(), requestTimeoutMs);
  try {
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + await currentUser.getIdToken() };
    const isQwythos = modelSelect.value === QWYTHOS_MODEL;
    const referenceImage = isQwythos ? referenceImageDataUrl : null;
    if (isQwythos && !referenceImage) throw new Error(languageText("reference_image_required"));
    $("loading-message").textContent = isQwythos ? languageText("reference_image_uploading") : languageText("loading_desc");
    const response = await fetch("/api/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: requestPrompt, model: modelSelect.value, width: dimensions[0], height: dimensions[1], steps: Number($("quality").value), language: document.documentElement.lang, ...(referenceImage ? { referenceImage } : {}) }),
      signal: requestController.signal
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
      if (isQwenRequest && qwenPendingMessage) {
        qwenPendingMessage.querySelector(".qwen-message-content").textContent = answer;
        qwenPendingMessage.classList.remove("is-pending");
        $("qwen-chat-thread").classList.remove("hidden");
        $("generated-text").classList.add("hidden");
      } else {
        $("generated-text").textContent = answer;
        $("generated-text").classList.remove("hidden");
      }
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
    const errorMessage = error?.name === "AbortError"
      ? languageText(isQwenRequest ? "qwen_timeout" : "request_timeout")
      : (error?.message || languageText("generation_error"));
    if (isQwenRequest && qwenPendingMessage) {
      qwenPendingMessage.querySelector(".qwen-message-content").textContent = errorMessage;
      qwenPendingMessage.classList.remove("is-pending");
      qwenPendingMessage.classList.add("has-error");
      $("qwen-chat-thread").classList.remove("hidden");
      $("empty-result").classList.add("hidden");
    } else {
      $("empty-result").classList.remove("hidden");
    }
    $("result-status").textContent = errorMessage;
    $("result-status").className = "result-status status-error";
  } finally {
    window.clearTimeout(requestTimeoutId);
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
    language_label:"Idioma",
    model_selector_kicker:"ROTEADOR DE MODELOS",
    nav_studio:"Modelos",nav_how:"Como funciona",nav_donate:"Doar",nav_source:"Código-fonte ↗",footer_privacy:"Privacidade",footer_terms:"Termos de Uso",bitcoin_qr_primary_label:"QR code Bitcoin para a conta principal",bitcoin_qr_email_label:"QR code Bitcoin para a conta de e-mail",hero_eyebrow:"HUB DE MODELOS DE IA · CÓDIGO ABERTO",hero_title:"Um hub de IA.<br><span>Várias possibilidades.</span>",hero_lead:"Explore fluxos de imagem, vídeo e texto em um único hub de código aberto. Escolha um modelo e a interface se adapta à tarefa, conforme a disponibilidade do backend.",meta_prompt:"Prompt personalizado",meta_login:"Conta gratuita",meta_limits:"Limites contra abuso",studio_eyebrow:"UM HUB · VÁRIOS MODELOS",studio_title:"Hub de modelos<span class=\"accent\">.</span>",studio_intro:"Escolha um modelo disponível. Os campos, as instruções e a área de resultado mudam de acordo com a tarefa selecionada.",prompt_label:"Seu prompt",prompt_placeholder:"Ex.: Uma estação de trem futurista no meio de uma floresta, luz azul cinematográfica, neblina suave, composição detalhada...",prompt_help:"Descreva o assunto, o ambiente, a luz e o estilo.",model_label:"Modelo e tarefa",model_help:"O FLUX transforma texto em imagem. Para usar uma imagem de referência, selecione Qwythos; os campos mudam conforme o modelo escolhido.",qwythos_help:"Fluxo experimental Imagem + texto → imagem: envie uma imagem de referência e descreva as alterações desejadas. O Qwythos interpreta a imagem e as instruções em uma etapa de texto; depois, o FLUX renderiza a imagem final.",qwythos_runtime_notice:"O Qwythos interpreta a imagem enviada e as instruções; em seguida, o FLUX renderiza a imagem final em uma chamada separada. O upload é obrigatório neste modo.",model_runtime_notice:"Modo texto → imagem: escreva um prompt para gerar uma imagem com FLUX. Para usar uma imagem enviada como referência, selecione Qwythos. Filas e limites do provedor podem variar.",qwythos_image_button:"Gerar imagem (imagem → texto → imagem)",reference_image_label:"Imagem de entrada (obrigatória neste modo)",reference_drop_title:"Arraste uma imagem para cá ou toque para escolher",reference_drop_hint:"Use a câmera, a galeria ou os arquivos do dispositivo · imagens de até 12 MB",reference_camera:"Tirar foto",reference_gallery:"Abrir galeria",reference_browse:"Escolher arquivo",reference_image_help:"Envie qualquer arquivo de imagem que seu navegador consiga abrir (até 12 MB) e descreva a alteração desejada. A imagem será convertida para JPEG e enviada ao modelo Qwythos para interpretação; o FLUX renderiza a imagem final.",reference_image_required:"Envie uma imagem de referência para usar o fluxo Imagem → texto → imagem.",reference_image_too_large:"A imagem original deve ter no máximo 12 MB; a versão preparada para envio é limitada a 3 MB.",reference_image_type:"Selecione uma imagem que seu navegador consiga abrir.",reference_image_read_error:"Não foi possível ler a imagem selecionada.",reference_image_clear:"Remover imagem",reference_image_status:"Nenhuma imagem selecionada.",reference_image_processing:"Preparando imagem para envio…",reference_image_added:"Imagem preparada e pronta para ser enviada ao Qwythos.",reference_image_unsupported:"O navegador não conseguiu abrir ou converter este arquivo de imagem. Tente outro formato.",reference_image_uploading:"Convertendo e enviando a imagem e as instruções para o Qwythos…",aspect_label:"Proporção",quality_label:"Etapas de geração",notice_limits:"Entre com Google, GitHub ou e-mail e senha para usar os modelos. O site limita a até 5 solicitações por hora por conta; a disponibilidade do provedor pode variar.",generate_button:"Gerar imagem",responsible_note:"Ao gerar, você concorda em usar o serviço de forma responsável.",result_eyebrow:"RESULTADO",result_title:"Seu resultado",empty_title:"Sua imagem começa aqui",empty_desc:"O resultado aparecerá nesta área depois da geração.",video_result_title:"Seu vídeo",video_empty_title:"Seu vídeo aparecerá aqui",video_empty_desc:"O vídeo gerado será exibido nesta área quando estiver pronto.",qwen_chat_title:"Conversa com Qwen",qwen_empty_title:"Converse com o Qwen",qwen_empty_desc:"Digite uma pergunta no campo abaixo para iniciar a conversa.",qwen_user_label:"Você",qwen_assistant_label:"Qwen",qwen_thinking:"Pensando…",qwen_timeout:"O Qwen não respondeu dentro do limite de 3 minutos. Confira os logs do Space; antes de repetir, aguarde um pouco porque a inferência anterior pode ainda estar na fila.",request_timeout:"A solicitação demorou demais e foi encerrada. Confira o status do Space e tente novamente mais tarde.",loading_title:"Preparando sua imagem...",loading_desc:"Enviando o prompt para o modelo de IA.",loading_note:"Isso pode levar alguns minutos na cota gratuita.",ready_status:"Pronto para criar.",how_eyebrow:"UM HUB · VÁRIAS TAREFAS",how_title:"Da ideia ao resultado.",step1_title:"Escreva sua ideia",step1_desc:"Use um prompt original. Você controla a descrição, sem texto fixo escondido no código.",step2_title:"Escolha o modelo",step2_desc:"O hub encaminha o pedido ao modelo selecionado e apresenta o resultado como imagem, vídeo ou texto, conforme a tarefa e a disponibilidade do backend.",step3_title:"Confira o resultado",step3_desc:"Visualize a imagem, assista ao vídeo ou leia a resposta textual. Baixe os arquivos de mídia quando houver suporte.",security_title:"Limites de uso · proteção contra abuso",security_desc:"Somente usuários autenticados com Google, GitHub ou e-mail e senha podem gerar imagens. O backend valida a sessão Firebase e aplica até 5 gerações por hora por conta.",space_feature_eyebrow:"EXECUÇÃO DE MODELOS · HUGGING FACE",space_feature_title:"Conheça o Space do ErikrafT AI",space_feature_desc:"O Space do Hugging Face é o ambiente que executa os modelos de IA por trás do ErikrafT AI. Explore a página do Space para acompanhar a aplicação e seus recursos; o processamento pode variar conforme a disponibilidade, a fila e os limites de hardware.",space_feature_open:"Abrir Space no Hugging Face ↗",space_feature_source:"Explorar código aberto no GitHub ↗",quota_title:"Cota gratuita e limites do provedor",quota_intro:"O ErikrafT AI envia as solicitações para um Space do Hugging Face. Os limites do site e os limites de computação do provedor são diferentes.",quota_site_label:"LIMITES DO ERIKRAFT AI",quota_site_value:"Até 5 gerações por hora por conta autenticada",quota_site_desc:"A geração requer uma sessão Firebase válida obtida com Google, GitHub ou e-mail e senha. O backend aplica até 5 gerações por hora por conta autenticada.",quota_gpu_label:"HUGGING FACE ZEROGPU · SE APLICÁVEL",quota_gpu_value:"2 min/dia sem autenticação · 5 min/dia para conta Free",quota_gpu_desc:"Quando o Space usa ZeroGPU, o Hugging Face documenta cotas diárias de tempo de GPU por categoria de conta. A cota reinicia 24 horas após o primeiro uso de GPU, e o saldo restante afeta a prioridade na fila. É tempo de computação, não um número garantido de imagens.",quota_availability_label:"DISPONIBILIDADE DO SPACE",quota_availability_value:"Filas, inicializações e suspensões podem ocorrer",quota_availability_desc:"O hardware gratuito pode ficar temporariamente indisponível ou precisar ser reiniciado após inatividade. No hardware CPU Basic, o Hugging Face informa suspensão após 48 horas sem atividade. Carregar um modelo grande também pode demorar.",quota_note:"A cota ZeroGPU só se aplica se este Space estiver usando esse hardware. A cota do provedor é independente dos limites do ErikrafT AI e não garante uma quantidade de imagens por dia nem um tempo de resposta.",quota_link_space:"Abrir Space utilizado pelo ErikrafT AI ↗",quota_link_zerogpu:"Cotas oficiais do ZeroGPU ↗",quota_link_sleep:"Regras de suspensão dos Spaces ↗",studio_login_eyebrow:"AUTENTICAÇÃO NECESSÁRIA",studio_login_title:"Entre para gerar imagens",studio_login_desc:"O gerador e os resultados ficam disponíveis somente depois de entrar com Google, GitHub ou e-mail e senha.",studio_google_button:"Continuar com Google",studio_github_button:"Continuar com GitHub",studio_login_note:"Até 5 gerações por hora por conta. A disponibilidade do Hugging Face pode variar.",auth_unavailable:"A autenticação está indisponível. Tente novamente mais tarde ou informe o administrador.",auth_required_error:"Entre com Google, GitHub ou uma conta de e-mail verificada antes de gerar imagens.",auth_provider_error:"Entre usando Google, GitHub ou uma conta de e-mail verificada para continuar.",email_separator:"OU USE E-MAIL E SENHA",email_label:"E-mail",password_label:"Senha",email_placeholder:"voce@exemplo.com",password_placeholder:"Mínimo de 6 caracteres",email_sign_in:"Entrar com e-mail",create_account:"Criar conta",forgot_password:"Esqueci minha senha",modal_auth_eyebrow:"SUA CONTA",modal_auth_title:"Entre ou crie sua conta",modal_auth_desc:"Use Google, GitHub ou seu e-mail e senha para continuar.",modal_auth_note:"A autenticação e a senha são gerenciadas pelo Firebase.",email_required:"Informe seu endereço de e-mail.",invalid_email:"Informe um endereço de e-mail válido.",password_required:"Digite sua senha.",weak_password:"A senha precisa ter pelo menos 6 caracteres.",email_already_in_use:"Este e-mail já está cadastrado. Entre ou redefina sua senha.",invalid_credentials:"E-mail ou senha incorretos.",too_many_requests:"Muitas tentativas. Aguarde antes de tentar novamente.",network_error:"Falha de conexão. Verifique sua internet e tente novamente.",email_provider_disabled:"O login por e-mail e senha não está habilitado no Firebase.",verification_email_sent:"Conta criada. Enviamos um link de verificação para seu e-mail. Confirme-o antes de entrar.",email_verification_required:"Seu e-mail ainda não foi verificado. Enviamos um novo link; confirme-o antes de entrar.",reset_email_sent:"Se existir uma conta com esse e-mail, enviaremos instruções para redefinir a senha.",reset_email_failed:"Não foi possível enviar o e-mail de redefinição. Verifique o endereço e tente novamente.",auth_domain_error:"Este domínio não está autorizado no Firebase Authentication.",auth_failed:"Não foi possível entrar. Tente novamente.",generation_http_error:"A geração falhou",provider_image_missing:"O Space não retornou uma imagem reconhecida.",support_project:"APOIE O PROJETO",donate_title:"Ajude a manter o projeto aberto.",donate_desc:"Se o ErikrafT AI™ é útil para você, contribua com Bitcoin. Confira a carteira antes de enviar; transações na blockchain são irreversíveis.",primary_account:"Conta principal",email_account:"Conta de e-mail",copy_address:"Copiar endereço",copied:"Endereço copiado!",open_wallet:"Abrir na carteira ↗",scan_qr:"Escaneie com sua carteira Bitcoin",bitcoin_note:"Envie apenas Bitcoin pela rede Bitcoin. Sempre confira o endereço na sua carteira antes de confirmar.",footer_text:"Open source · Construído por ErikrafT",generate:"Gerar imagem",generating:"Gerando...",validating:"Validando o limite de uso...",image_ready:"Imagem pronta.",image_load_error:"A imagem temporária não pôde ser carregada. Tente gerar novamente.",generation_error:"Não foi possível gerar a imagem."
  },
  "en": {
    language_label:"Language",
    model_selector_kicker:"MODEL ROUTER",
    nav_studio:"AI Hub",nav_how:"How it works",nav_donate:"Donate",nav_source:"Source code ↗",footer_privacy:"Privacy",footer_terms:"Terms of Use",bitcoin_qr_primary_label:"Bitcoin QR code for the main account",bitcoin_qr_email_label:"Bitcoin QR code for the email account",hero_eyebrow:"AI MODEL HUB · OPEN SOURCE",hero_title:"One AI hub.<br><span>Many possibilities.</span>",hero_lead:"Explore image, video, and text workflows in one open-source hub. Choose a model and the interface adapts to its task, subject to backend availability.",meta_prompt:"Custom prompts",meta_login:"Free account",meta_limits:"Abuse protection",studio_eyebrow:"ONE HUB · MULTIPLE MODELS",studio_title:"AI model hub<span class=\"accent\">.</span>",studio_intro:"Choose an available model. The inputs, guidance, and result area change to match the selected task.",prompt_label:"Your prompt",prompt_placeholder:"E.g. A futuristic train station in a forest, cinematic blue light, soft mist, detailed composition...",prompt_help:"Describe the subject, setting, lighting, and style.",model_label:"Model and task",model_help:"FLUX turns text into an image. To use a reference image, select Qwythos; the inputs change with the selected model.",qwythos_help:"Experimental image + text → image workflow: upload a reference image and describe the changes. Qwythos interprets the image and instructions in a text step; FLUX then renders the final image.",qwythos_runtime_notice:"Qwythos interprets the uploaded image and instructions; FLUX then renders the final image in a separate request. An image upload is required in this mode.",model_runtime_notice:"Text → image mode: write a prompt to generate an image with FLUX. To start from an uploaded reference, select Qwythos. Provider queues and limits may vary.",qwythos_image_button:"Generate image (image → text → image)",reference_image_label:"Input image (required for this task)",reference_drop_title:"Drop an image here or tap to choose",reference_drop_hint:"Use your camera, photo gallery, or device files · images up to 12 MB",reference_camera:"Take a photo",reference_gallery:"Open photo gallery",reference_browse:"Choose file",reference_image_help:"Upload any image file your browser can open (up to 12 MB) and describe the desired changes. The image is converted to JPEG and sent to the Qwythos model for AI interpretation; FLUX renders the final image.",reference_image_required:"Upload a reference image to use the image → text → image workflow.",reference_image_too_large:"The original image must be 12 MB or smaller; the prepared upload is capped at 3 MB.",reference_image_type:"Choose an image file your browser can open.",reference_image_read_error:"Could not read the selected image.",reference_image_clear:"Remove image",reference_image_status:"No image selected.",reference_image_processing:"Preparing image for upload…",reference_image_added:"Image prepared and ready to send to Qwythos.",reference_image_unsupported:"The browser could not open or convert this image file. Try another format.",reference_image_uploading:"Converting and sending the image and instructions to Qwythos…",aspect_label:"Aspect ratio",quality_label:"Generation steps",notice_limits:"Sign in with Google, GitHub, or email and password to use the models. The site limits usage to 5 requests per account per hour; provider availability may vary.",generate_button:"Generate image",responsible_note:"By generating, you agree to use the service responsibly.",result_eyebrow:"RESULT",result_title:"Your result",empty_title:"Your image starts here",empty_desc:"Your result will appear here after generation.",video_result_title:"Your video",video_empty_title:"Your video will appear here",video_empty_desc:"The generated video will be displayed in this area when it is ready.",qwen_chat_title:"Chat with Qwen",qwen_empty_title:"Chat with Qwen",qwen_empty_desc:"Type a question in the prompt field below to start the conversation.",qwen_user_label:"You",qwen_assistant_label:"Qwen",qwen_thinking:"Thinking…",qwen_timeout:"Qwen did not respond within the 3-minute limit. Check the Space logs; wait a little before retrying because the previous inference may still be queued.",request_timeout:"The request took too long and was stopped. Check the Space status and try again later.",loading_title:"Preparing your image...",loading_desc:"Sending the prompt to the AI model.",loading_note:"This may take a few minutes on the free tier.",ready_status:"Ready to create.",how_eyebrow:"ONE HUB · MULTIPLE TASKS",how_title:"From idea to output.",step1_title:"Write your idea",step1_desc:"Use an original prompt. You control the description, with no hidden fixed text in the code.",step2_title:"Choose a model",step2_desc:"The hub routes your request to the selected model and displays an image, video, or text response according to the task and backend availability.",step3_title:"Review the result",step3_desc:"View the image, watch the video, or read the text response. Download media files when supported.",security_title:"Usage limits · abuse protection",security_desc:"Only users authenticated with Google, GitHub, or email and password can generate images. The backend validates the Firebase session and allows up to 5 generations per hour per account.",space_feature_eyebrow:"MODEL RUNTIME · HUGGING FACE",space_feature_title:"Explore the ErikrafT AI Space",space_feature_desc:"The Hugging Face Space is the environment that runs the AI models behind ErikrafT AI. Visit the Space page to explore the app and its resources; processing may vary with availability, queueing, and hardware limits.",space_feature_open:"Open Space on Hugging Face ↗",space_feature_source:"Explore the open-source code on GitHub ↗",quota_title:"Free-tier quotas and provider limits",quota_intro:"ErikrafT AI sends image requests to a Hugging Face Space. This website’s limits are separate from the provider’s compute limits.",quota_site_label:"ERIKRAFT AI LIMITS",quota_site_value:"Up to 5 generations per hour per authenticated account",quota_site_desc:"Image generation requires a valid Firebase session from Google, GitHub, or email and password. The backend allows up to 5 generations per hour per authenticated account.",quota_gpu_label:"HUGGING FACE ZEROGPU · IF APPLICABLE",quota_gpu_value:"2 min/day unauthenticated · 5 min/day for a Free account",quota_gpu_desc:"When a Space uses ZeroGPU, Hugging Face documents daily GPU-time quotas by account tier. The quota resets 24 hours after first GPU use, and remaining quota affects queue priority. This is compute time, not a guaranteed number of images.",quota_availability_label:"SPACE AVAILABILITY",quota_availability_value:"Queues, cold starts, and suspensions may occur",quota_availability_desc:"Free hardware may be temporarily unavailable or need to restart after inactivity. On CPU Basic hardware, Hugging Face documents suspension after 48 hours without activity. Loading a large model can also take time.",quota_note:"The ZeroGPU quota only applies if this Space uses that hardware. Provider quota is independent of ErikrafT AI’s limits and does not guarantee a number of images per day or a response time.",quota_link_space:"Open the Space used by ErikrafT AI ↗",quota_link_zerogpu:"Official ZeroGPU quotas ↗",quota_link_sleep:"Spaces sleep and lifecycle rules ↗",studio_login_eyebrow:"SIGN-IN REQUIRED",studio_login_title:"Sign in to generate images",studio_login_desc:"The generator and results are available only after you sign in with Google, GitHub, or email and password.",studio_google_button:"Continue with Google",studio_github_button:"Continue with GitHub",studio_login_note:"Up to 5 generations per hour per account. Hugging Face availability may vary.",auth_unavailable:"Authentication is unavailable. Try again later or contact the administrator.",auth_required_error:"Sign in with Google, GitHub, or a verified email account before generating images.",auth_provider_error:"Sign in using Google, GitHub, or a verified email account to continue.",email_separator:"OR USE EMAIL AND PASSWORD",email_label:"Email",password_label:"Password",email_placeholder:"you@example.com",password_placeholder:"At least 6 characters",email_sign_in:"Sign in with email",create_account:"Create account",forgot_password:"Forgot password?",modal_auth_eyebrow:"YOUR ACCOUNT",modal_auth_title:"Sign in or create your account",modal_auth_desc:"Use Google, GitHub, or your email and password to continue.",modal_auth_note:"Authentication and password handling are managed by Firebase.",email_required:"Enter your email address.",invalid_email:"Enter a valid email address.",password_required:"Enter your password.",weak_password:"Your password must contain at least 6 characters.",email_already_in_use:"This email is already registered. Sign in or reset your password.",invalid_credentials:"Incorrect email or password.",too_many_requests:"Too many attempts. Please wait before trying again.",network_error:"Connection failed. Check your internet connection and try again.",email_provider_disabled:"Email and password sign-in is not enabled in Firebase.",verification_email_sent:"Account created. We sent a verification link to your email. Verify it before signing in.",email_verification_required:"Your email has not been verified yet. We sent a new link; verify it before signing in.",reset_email_sent:"If an account exists for this email, password-reset instructions will be sent.",reset_email_failed:"Could not send the password-reset email. Check the address and try again.",auth_domain_error:"This domain is not authorized in Firebase Authentication.",auth_failed:"Sign-in failed. Please try again.",generation_http_error:"Image generation failed",provider_image_missing:"The Space did not return a recognized image.",support_project:"SUPPORT THE PROJECT",donate_title:"Help keep the project open.",donate_desc:"If ErikrafT AI™ is useful to you, support it with Bitcoin. Verify the wallet before sending; blockchain transactions are irreversible.",primary_account:"Primary account",email_account:"Email account",copy_address:"Copy address",copied:"Address copied!",open_wallet:"Open in wallet ↗",scan_qr:"Scan with your Bitcoin wallet",bitcoin_note:"Send Bitcoin only over the Bitcoin network. Always verify the address in your wallet before confirming.",footer_text:"Open source · Built by ErikrafT",generate:"Generate image",generating:"Generating...",validating:"Checking usage limit...",image_ready:"Image ready.",image_load_error:"The temporary image could not be loaded. Try generating again.",generation_error:"Could not generate the image."
  }
};
function detectBrowserLanguage(){const candidates=[...(navigator.languages||[]),navigator.language||""];for(const locale of candidates){const normalized=locale.toLowerCase();if(normalized.startsWith("pt"))return "pt-BR";if(normalized.startsWith("en"))return "en";}return "en";}
function setLanguage(language){
  const selected=translations[language]?language:"pt-BR";
  const dict=translations[selected];
  document.documentElement.lang=selected;
  const seo = selected === "en"
    ? { title: "ErikrafT AI™ — AI Model Hub", description: "Explore an open-source AI hub for image, video, and text workflows using multiple models.", ogTitle: "ErikrafT AI™ — AI Model Hub", ogDescription: "Open-source AI hub for FLUX image generation, Qwythos image-guided workflows, Cosmos video, and Qwen text when available." }
    : { title: "ErikrafT AI™ — Hub de modelos de IA", description: "Explore um hub de IA de código aberto para fluxos de imagem, vídeo e texto com vários modelos.", ogTitle: "ErikrafT AI™ — Hub de modelos de IA", ogDescription: "Hub de IA de código aberto para imagens com FLUX, fluxos com imagem de referência via Qwythos, vídeos com Cosmos e texto com Qwen quando disponíveis." };
  document.title = seo.title;
  const setMeta = (selector, value) => { const element = document.querySelector(selector); if (element) element.setAttribute("content", value); };
  setMeta('meta[name="description"]', seo.description);
  setMeta('meta[property="og:title"]', seo.ogTitle);
  setMeta('meta[property="og:description"]', seo.ogDescription);
  setMeta('meta[name="twitter:title"]', seo.ogTitle);
  setMeta('meta[name="twitter:description"]', seo.ogDescription);
  document.querySelectorAll("[data-i18n]").forEach(el=>{const key=el.dataset.i18n;if(dict[key])el.innerHTML=dict[key];});
  document.querySelectorAll("[data-i18n-aria-label]").forEach(el=>{const key=el.dataset.i18nAriaLabel;if(dict[key])el.setAttribute("aria-label",dict[key]);});
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
