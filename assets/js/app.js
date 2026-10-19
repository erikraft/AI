import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, GithubAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

const firebaseConfig = window.ERIKRAFT_FIREBASE_CONFIG || {};
const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
const $ = (id) => document.getElementById(id);
let auth = null;
let currentUser = null;
let imageUrl = "";

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    $("account-label").textContent = user ? (user.displayName || user.email || "Conectado") : "Não conectado";
    $("login-open").classList.toggle("hidden", Boolean(user));
    $("logout").classList.toggle("hidden", !user);
    if (user) $("auth-modal").classList.add("hidden");
  });
} else {
  $("account-label").textContent = "Configure o Firebase";
  $("auth-error").textContent = "Configure assets/js/firebase-config.js antes de habilitar o login.";
}

$("login-open").addEventListener("click", () => $("auth-modal").classList.remove("hidden"));
document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", () => $("auth-modal").classList.add("hidden")));
$("logout").addEventListener("click", async () => { if (auth) await signOut(auth); });
async function login(provider) {
  $("auth-error").textContent = "";
  if (!auth) { $("auth-error").textContent = "O login ainda não foi configurado pelo administrador."; return; }
  try { await signInWithPopup(auth, provider); }
  catch (error) { $("auth-error").textContent = error.code === "auth/unauthorized-domain" ? "Este domínio não está autorizado no Firebase Authentication." : (error.message || "Não foi possível entrar."); }
}
$("google-login").addEventListener("click", () => login(new GoogleAuthProvider()));
$("github-login").addEventListener("click", () => login(new GithubAuthProvider()));

const promptInput = $("prompt");
promptInput.addEventListener("input", () => $("char-count").textContent = promptInput.value.length + " / 1500");
$("generator-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) { $("auth-modal").classList.remove("hidden"); $("auth-error").textContent = "Entre com Google ou GitHub para gerar uma imagem."; return; }
  const prompt = promptInput.value.trim();
  if (!prompt) return;
  const dimensions = { square: [768,768], landscape: [1024,768], portrait: [768,1024] }[$("aspect").value];
  const button = $("generate");
  button.disabled = true;
  button.querySelector("span").textContent = "Gerando...";
  $("empty-result").classList.add("hidden");
  $("generated-image").classList.add("hidden");
  $("loading-result").classList.remove("hidden");
  $("result-status").className = "result-status";
  $("result-status").textContent = "Validando conta e limite de uso...";
  try {
    const token = await currentUser.getIdToken();
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ prompt, width: dimensions[0], height: dimensions[1], steps: Number($("quality").value) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "A geração falhou (" + response.status + ").");
    imageUrl = data.imageUrl;
    if (!imageUrl) throw new Error("O provedor não retornou uma URL de imagem.");
    const img = $("generated-image");
    img.onload = () => { $("loading-result").classList.add("hidden"); img.classList.remove("hidden"); $("download").disabled = false; $("result-status").textContent = "Imagem pronta."; $("result-status").className = "result-status status-success"; };
    img.onerror = () => { $("loading-result").classList.add("hidden"); $("empty-result").classList.remove("hidden"); $("result-status").textContent = "A imagem temporária não pôde ser carregada. Tente gerar novamente."; $("result-status").className = "result-status status-error"; };
    img.src = imageUrl;
  } catch (error) {
    $("loading-result").classList.add("hidden");
    $("empty-result").classList.remove("hidden");
    $("result-status").textContent = error.message || "Não foi possível gerar a imagem.";
    $("result-status").className = "result-status status-error";
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Gerar imagem";
  }
});
$("download").addEventListener("click", async () => {
  if (!imageUrl) return;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("download failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "erikraft-ai-image.png"; link.click();
    URL.revokeObjectURL(url);
  } catch {
    window.open(imageUrl, "_blank", "noopener,noreferrer");
  }
});
