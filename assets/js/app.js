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
    $("account-label").textContent = user ? (user.displayName || user.email || "Conectado") : "Visitante";
    $("login-open").classList.toggle("hidden", Boolean(user));
    $("logout").classList.toggle("hidden", !user);
    if (user) $("auth-modal").classList.add("hidden");
  });
} else {
  $("account-label").textContent = "Visitante";
  $("auth-error").textContent = "Login indisponível no momento; você ainda pode gerar imagens como visitante.";
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
    const headers = { "Content-Type": "application/json" };
    if (currentUser) headers.Authorization = "Bearer " + await currentUser.getIdToken();
    const response = await fetch("/api/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, width: dimensions[0], height: dimensions[1], steps: Number($("quality").value) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "A geração falhou (" + response.status + ").");
    imageUrl = data.imageUrl;
    if (!imageUrl) throw new Error("O provedor não retornou uma URL de imagem.");
    const img = $("generated-image");
    img.onload = () => { $("loading-result").classList.add("hidden"); img.classList.remove("hidden"); $("download").disabled = false; $("result-status").textContent = languageText("image_ready"); $("result-status").className = "result-status status-success"; };
    img.onerror = () => { $("loading-result").classList.add("hidden"); $("empty-result").classList.remove("hidden"); $("result-status").textContent = languageText("image_load_error"); $("result-status").className = "result-status status-error"; };
    img.src = imageUrl;
  } catch (error) {
    $("loading-result").classList.add("hidden");
    $("empty-result").classList.remove("hidden");
    $("result-status").textContent = error.message || languageText("generation_error");
    $("result-status").className = "result-status status-error";
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = languageText("generate");
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

// Language selector: remember the choice and fall back to the browser language.
const translations = {
  "pt-BR": {
    nav_studio:"Studio",nav_how:"Como funciona",nav_donate:"Doar",hero_eyebrow:"AI IMAGE STUDIO · OPEN SOURCE",hero_title:"Transforme suas<br><span>ideias em imagens.</span>",hero_lead:"Crie imagens a partir da sua imaginação. Escreva um prompt único, ajuste as opções e gere sua arte com FLUX.",meta_prompt:"Prompt personalizado",meta_login:"Conta gratuita",meta_limits:"Limites contra abuso",studio_eyebrow:"SEU ESPAÇO CRIATIVO",studio_title:'Image studio<span class="accent">.</span>',studio_intro:"Descreva a imagem com suas próprias palavras. Não existe prompt predefinido.",prompt_label:"Seu prompt",prompt_placeholder:"Ex.: Uma estação de trem futurista no meio de uma floresta, luz azul cinematográfica, neblina suave, composição detalhada...",prompt_help:"Descreva o assunto, o ambiente, a luz e o estilo.",aspect_label:"Proporção",quality_label:"Etapas de geração",notice_limits:"Sem conta: até 2 imagens por hora por IP. Com conta: até 5 por hora. Limites sujeitos à disponibilidade do provedor. Não envie informações pessoais no prompt.",generate_button:"Gerar imagem",responsible_note:"Ao gerar, você concorda em usar o serviço de forma responsável.",result_eyebrow:"RESULTADO",result_title:"Sua criação",empty_title:"Sua imagem começa aqui",empty_desc:"O resultado aparecerá nesta área depois da geração.",loading_title:"Preparando sua imagem...",loading_desc:"Enviando o prompt para o modelo de IA.",loading_note:"Isso pode levar alguns minutos na cota gratuita.",ready_status:"Pronto para criar.",how_eyebrow:"SIMPLES E TRANSPARENTE",how_title:"Do texto à imagem.",step1_title:"Escreva sua ideia",step1_desc:"Use um prompt original. Você controla a descrição, sem texto fixo escondido no código.",step2_title:"Gere com FLUX",step2_desc:"O backend encaminha a solicitação para um Space compatível com o modelo selecionado.",step3_title:"Salve o resultado",step3_desc:"Visualize a imagem e baixe o arquivo quando a geração terminar.",security_title:"Limites de uso · proteção contra abuso",security_desc:"Visitantes podem gerar sem conta com limite por IP. Contas autenticadas têm limite maior por usuário. A API aplica limites transacionais no Firestore antes de encaminhar a geração.",quota_title:"Cota gratuita e limites do provedor",quota_intro:"O ErikrafT AI envia as solicitações para um Space do Hugging Face. Os limites do site e os limites de computação do provedor são diferentes.",quota_site_label:"LIMITES DO ERIKRAFT AI",quota_site_value:"Até 2 por hora sem login · até 5 com login",quota_site_desc:"Sem conta, até 2 gerações por hora por IP. Com conta autenticada, até 5 gerações por hora por usuário. Esses limites são aplicados pelo backend do site para reduzir abuso.",quota_gpu_label:"HUGGING FACE ZEROGPU · SE APLICÁVEL",quota_gpu_value:"2 min/dia sem autenticação · 5 min/dia para conta Free",quota_gpu_desc:"Quando o Space usa ZeroGPU, o Hugging Face documenta cotas diárias de tempo de GPU por categoria de conta. É tempo de computação, não um número garantido de imagens; cada geração pode consumir um tempo diferente.",quota_availability_label:"DISPONIBILIDADE DO SPACE",quota_availability_value:"Filas, inicializações e suspensões podem ocorrer",quota_availability_desc:"O hardware gratuito pode ficar temporariamente indisponível ou precisar ser reiniciado após inatividade. No hardware CPU Basic, o Hugging Face informa suspensão após 48 horas sem atividade. Carregar um modelo grande também pode demorar.",quota_note:"A cota ZeroGPU só se aplica se este Space estiver usando esse hardware. A cota do provedor é independente dos limites do ErikrafT AI e não garante uma quantidade de imagens por dia nem um tempo de resposta.",quota_link_space:"Abrir Space utilizado pelo ErikrafT AI ↗",quota_link_zerogpu:"Cotas oficiais do ZeroGPU ↗",quota_link_sleep:"Regras de suspensão dos Spaces ↗",support_project:"APOIE O PROJETO",donate_title:"Ajude a manter o projeto aberto.",donate_desc:"Se o ErikrafT AI™ é útil para você, contribua com Bitcoin. Confira a carteira antes de enviar; transações na blockchain são irreversíveis.",primary_account:"Conta principal",email_account:"Conta de e-mail",copy_address:"Copiar endereço",copied:"Endereço copiado!",open_wallet:"Abrir na carteira ↗",scan_qr:"Escaneie com sua carteira Bitcoin",bitcoin_note:"Envie apenas Bitcoin pela rede Bitcoin. Sempre confira o endereço na sua carteira antes de confirmar.",footer_text:"Open source · Construído por ErikrafT",generate:"Gerar imagem",generating:"Gerando...",validating:"Validando o limite de uso...",image_ready:"Imagem pronta.",image_load_error:"A imagem temporária não pôde ser carregada. Tente gerar novamente.",generation_error:"Não foi possível gerar a imagem."
  },
  "en": {
    nav_studio:"Studio",nav_how:"How it works",nav_donate:"Donate",hero_eyebrow:"AI IMAGE STUDIO · OPEN SOURCE",hero_title:"Turn your ideas<br><span>into images.</span>",hero_lead:"Create images from your imagination. Write a unique prompt, adjust the options, and generate your art with FLUX.",meta_prompt:"Custom prompts",meta_login:"Free account",meta_limits:"Abuse protection",studio_eyebrow:"YOUR CREATIVE SPACE",studio_title:'Image studio<span class="accent">.</span>',studio_intro:"Describe the image in your own words. No preset prompt is used.",prompt_label:"Your prompt",prompt_placeholder:"E.g. A futuristic train station in a forest, cinematic blue light, soft mist, detailed composition...",prompt_help:"Describe the subject, setting, lighting, and style.",aspect_label:"Aspect ratio",quality_label:"Generation steps",notice_limits:"Without an account: up to 2 images per hour per IP. With an account: up to 5 per hour. Subject to provider availability. Do not include personal information in prompts.",generate_button:"Generate image",responsible_note:"By generating, you agree to use the service responsibly.",result_eyebrow:"RESULT",result_title:"Your creation",empty_title:"Your image starts here",empty_desc:"Your result will appear here after generation.",loading_title:"Preparing your image...",loading_desc:"Sending the prompt to the AI model.",loading_note:"This may take a few minutes on the free tier.",ready_status:"Ready to create.",how_eyebrow:"SIMPLE AND TRANSPARENT",how_title:"From text to image.",step1_title:"Write your idea",step1_desc:"Use an original prompt. You control the description, with no hidden fixed text in the code.",step2_title:"Generate with FLUX",step2_desc:"The backend forwards your request to a Space compatible with the selected model.",step3_title:"Save the result",step3_desc:"Preview your image and download it when generation finishes.",security_title:"Usage limits · abuse protection",security_desc:"Visitors can generate without an account with an IP-based limit. Signed-in accounts receive a higher per-user limit. Firestore transactions enforce limits before forwarding requests.",quota_title:"Free-tier quotas and provider limits",quota_intro:"ErikrafT AI sends image requests to a Hugging Face Space. This website’s limits are separate from the provider’s compute limits.",quota_site_label:"ERIKRAFT AI LIMITS",quota_site_value:"Up to 2 per hour without sign-in · up to 5 with sign-in",quota_site_desc:"Without an account, the backend allows up to 2 generations per hour per IP address. With an authenticated account, it allows up to 5 per hour per user. These website limits help reduce abuse.",quota_gpu_label:"HUGGING FACE ZEROGPU · IF APPLICABLE",quota_gpu_value:"2 min/day unauthenticated · 5 min/day for a Free account",quota_gpu_desc:"When a Space uses ZeroGPU, Hugging Face documents daily GPU-time quotas by account tier. This is compute time, not a guaranteed number of images; each generation can take a different amount of time.",quota_availability_label:"SPACE AVAILABILITY",quota_availability_value:"Queues, cold starts, and suspensions may occur",quota_availability_desc:"Free hardware may be temporarily unavailable or need to restart after inactivity. On CPU Basic hardware, Hugging Face documents suspension after 48 hours without activity. Loading a large model can also take time.",quota_note:"The ZeroGPU quota only applies if this Space uses that hardware. Provider quota is independent of ErikrafT AI’s limits and does not guarantee a number of images per day or a response time.",quota_link_space:"Open the Space used by ErikrafT AI ↗",quota_link_zerogpu:"Official ZeroGPU quotas ↗",quota_link_sleep:"Spaces sleep and lifecycle rules ↗",support_project:"SUPPORT THE PROJECT",donate_title:"Help keep the project open.",donate_desc:"If ErikrafT AI™ is useful to you, support it with Bitcoin. Verify the wallet before sending; blockchain transactions are irreversible.",primary_account:"Primary account",email_account:"Email account",copy_address:"Copy address",copied:"Address copied!",open_wallet:"Open in wallet ↗",scan_qr:"Scan with your Bitcoin wallet",bitcoin_note:"Send Bitcoin only over the Bitcoin network. Always verify the address in your wallet before confirming.",footer_text:"Open source · Built by ErikrafT",generate:"Generate image",generating:"Generating...",validating:"Checking usage limit...",image_ready:"Image ready.",image_load_error:"The temporary image could not be loaded. Try generating again.",generation_error:"Could not generate the image."
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
$("language-select").addEventListener("change",()=>setLanguage($("language-select").value));
try{const saved=localStorage.getItem("erikraft-ai-language");setLanguage(saved&&translations[saved]?saved:detectBrowserLanguage());}catch{setLanguage(detectBrowserLanguage());}

// Bitcoin donation address copying and QR rendering.
document.querySelectorAll(".copy-wallet").forEach(button=>button.addEventListener("click",async()=>{
  const original=button.textContent;
  try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent=languageText("copied");}
  catch{const field=document.createElement("textarea");field.value=button.dataset.copy;field.setAttribute("readonly","");field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();const copied=document.execCommand("copy");field.remove();button.textContent=copied?languageText("copied"):original;}
  setTimeout(()=>{button.textContent=languageText("copy_address");},1800);
}));
function renderBitcoinQrs(){
  const hosts=[...document.querySelectorAll(".bitcoin-qr-host")];
  const markUnavailable=()=>hosts.forEach(host=>{host.setAttribute("aria-label","QR code unavailable. Use the visible Bitcoin address or open it in your wallet.");host.classList.add("qr-unavailable");host.textContent="";});
  const draw=()=>{
    if(typeof window.QRCodeStyling!=="function"){markUnavailable();return;}
    hosts.forEach(host=>{
      const address=host.dataset.address;
      if(!address)return;
      host.replaceChildren();
      try{
        const qr=new window.QRCodeStyling({width:440,height:440,type:"svg",data:"bitcoin:"+address,image:"/assets/bitcoin-logo.svg",margin:10,qrOptions:{errorCorrectionLevel:"H",typeNumber:0,mode:"Byte"},dotsOptions:{color:"#0a090b",type:"square"},cornersSquareOptions:{color:"#0a090b",type:"square"},cornersDotOptions:{color:"#0a090b",type:"square"},backgroundOptions:{color:"#ffffff"},imageOptions:{hideBackgroundDots:true,imageSize:0.22,margin:5,crossOrigin:"anonymous",saveAsBlob:true}});
        qr.append(host);host.setAttribute("aria-label","Bitcoin payment QR code with Bitcoin logo. Amount is not preset.");host.classList.remove("qr-unavailable");
      }catch(error){console.error("Unable to render Bitcoin QR code:",error);host.setAttribute("aria-label","QR code unavailable. Use the visible Bitcoin address or open it in your wallet.");host.classList.add("qr-unavailable");}
    });
  };
  if(typeof window.QRCodeStyling==="function"){draw();return;}
  const fallback=document.createElement("script");fallback.src="https://unpkg.com/qr-code-styling@1.9.2/lib/qr-code-styling.js";fallback.async=true;fallback.onload=draw;fallback.onerror=markUnavailable;document.head.appendChild(fallback);
}
renderBitcoinQrs();
