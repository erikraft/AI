import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("voice cloning is exposed in the selector and has upload, recording, and audio output controls", () => {
  const html = read("../index.html");
  const app = read("../assets/js/app.js");
  assert.match(html, /option value="tonyassi\/voice-clone"/);
  assert.doesNotMatch(html, /data-search="[^"]*tonyassi/);
  assert.match(html, /id="voice-audio-input"/);
  assert.match(html, /id="voice-record-start"/);
  assert.match(html, /id="voice-record-stop"/);
  assert.match(html, /id="generated-audio"/);
  assert.match(app, /VOICE_CLONE_MODEL = "tonyassi\/voice-clone"/);
  assert.match(app, /data\.type === "audio"/);
});

test("voice cloning routes through authenticated API with reference-language detection", () => {
  const api = read("../api/generate.js");
  assert.ok(api.includes('VOICE_CLONE_SPACE_ID = "Nymbo/Voice-Clone-Multilingual"'));
  assert.ok(api.includes('VOICE_LANGUAGE_SPACE_ID = "hf-audio/whisper-large-v3"'));
  assert.ok(api.includes("detectVoiceReferenceLanguage(voiceAudioFile, clientOptions)"));
  assert.ok(api.includes("[prompt.trim(), voiceAudioFile, voiceLanguage]"));
  assert.match(api, /Client\.connect\(targetSpaceId/);
  assert.ok(api.includes('"/predict"'));
  assert.match(api, /MAX_VOICE_AUDIO_BYTES = 3 \* 1024 \* 1024/);
  assert.match(api, /new File\(\[bytes\], "voice-reference\.wav", \{ type: "audio\/wav" \}\)/);
  assert.match(api, /(?:wav|x-wav)/);
});

test("profile popover remains fixed and layered above the footer", () => {
  const profile = read("../assets/js/profile.js");
  assert.match(profile, /\.profile-popover\{position:fixed;z-index:1000/);
  assert.doesNotMatch(profile, /\.profile-popover\{position:relative\}/);
});

test("result stage has responsive desktop, tablet, and mobile rules", () => {
  const css = read("../assets/css/styles.css");
  const app = read("../assets/js/app.js");
  assert.match(css, /@media \(min-width:1100px\)/);
  assert.match(css, /@media \(max-width:900px\)/);
  assert.match(css, /@media \(max-width:600px\)/);
  assert.match(css, /\.result-stage\.is-audio-result/);
  assert.match(app, /generatorForm\.parentElement !== resultStage/);
  assert.match(app, /generatorForm\.parentElement !== studioGrid/);
  assert.match(css, /\.result-stage\.is-chat-result #generator-form\.is-chat-composer/);
  assert.match(css, /\.result-stage:not\(\.is-chat-result\) \.qwen-chat-thread/);
});

test("voice upload status never reflects an attacker-controlled filename as markup", () => {
  const app = read("../assets/js/app.js");
  assert.match(app, /textContent = document\.documentElement\.lang === "en" \? "Voice sample converted to WAV and ready\." : "Amostra convertida para WAV e pronta\."/);
  assert.doesNotMatch(app, /file\.name\s*\+\s*["'] ready/);
});

test("hero uses the supplied SVG brand mark and profile removal persists a no-photo avatar", () => {
  const html = read("../index.html");
  const css = read("../assets/css/styles.css");
  const profile = read("../assets/js/profile.js");
  const api = read("../api/profile.js");
  assert.match(html, /class="brand-mark hero-brand-mark"/);
  assert.match(html, /viewBox="0 0 128 128"/);
  assert.match(css, /\.hero-brand-mark[^}]*rotate\(-7deg\)/);
  assert.match(profile, /data\.photoDisabled \? ""/);
  assert.match(profile, /restoreProviderPhoto: true/);
  assert.match(api, /photoDisabled: true/);
  assert.match(api, /req\.body\?\.restoreProviderPhoto === true/);
});

test("privacy and terms explain MongoDB Atlas profile-photo storage and no-photo preference", () => {
  const privacy = read("../privacy.html");
  const terms = read("../terms.html");
  assert.match(privacy, /MongoDB Atlas e foto de perfil/);
  assert.match(privacy, /MongoDB Atlas and profile photos/);
  assert.match(terms, /MongoDB Atlas, fotos de perfil e dados armazenados/);
  assert.match(terms, /MongoDB Atlas, profile photos, and stored data/);
});

test("history prompts are readonly, selectable, scrollable, and localized for assistive technology", () => {
  const app = read("../assets/js/app.js");
  const css = read("../assets/css/styles.css");
  assert.match(app, /document\.createElement\("textarea"\); prompt\.className = "history-prompt"/);
  assert.match(app, /prompt\.readOnly = true/);
  assert.match(app, /prompt\.setAttribute\("aria-label", document\.documentElement\.lang === "en"/);
  assert.match(css, /\.history-prompt\{[^}]*overflow:auto/);
  assert.match(css, /\.history-prompt\{[^}]*resize:none/);
});

test("privacy policy and terms use the requested October 24, 2026 date in both languages", () => {
  for (const path of ["../privacy.html", "../terms.html"]) {
    const html = read(path);
    assert.match(html, /dateModified": "2026-10-24"/);
    assert.match(html, /24 de outubro de 2026/);
    assert.match(html, /October 24, 2026/);
    assert.doesNotMatch(html, /October 22, 2026|22 de outubro de 2026|dateModified": "2026-10-22"/);
  }
});


test("Hugging Face Space exposes a voice-cloning tab with reference-language detection", () => {
  const app = read("../huggingface/app.py");
  const frontend = read("../assets/js/app.js");
  const readme = read("../README.md");
  assert.match(app, /from gradio_client import Client, handle_file/);
  assert.match(app, /Client\("hf-audio\/whisper-large-v3", verbose=False\)/);
  assert.match(app, /Whisper transcribes the reference sample to detect its spoken language/);
  assert.match(app, /multilingual XTTS-v2/);
  assert.doesNotMatch(app, /tonyassi\/voice-clone/);
  assert.match(frontend, /detect the spoken language in your reference audio/);
  assert.match(frontend, /não no idioma do site/);
  assert.doesNotMatch(readme, /tonyassi\/voice-clone/);
  assert.match(readme, /Nymbo\/Voice-Clone-Multilingual/);
  assert.match(app, /Client\("Nymbo\/Voice-Clone-Multilingual", verbose=False\)/);
  assert.match(app, /_detect_reference_language\(safe_reference_audio\)/);
  assert.match(app, /api_name="clone_voice"/);
  assert.match(app, /sources=\["upload", "microphone"\]/);
  assert.match(app, /3 \* 1024 \* 1024/);
});


test("voice cloning discovers the current Whisper endpoint and enforces a ten-second minimum", () => {
  const space = read("../huggingface/app.py");
  const api = read("../api/generate.js");
  const frontend = read("../assets/js/app.js");
  const pkg = JSON.parse(read("../package.json"));

  assert.match(space, /_whisper_transcription_endpoint\(whisper\)/);
  assert.match(space, /view_api\(return_format="dict", print_info=False\)/);
  assert.doesNotMatch(space, /min_length\s*=/);
  assert.match(space, /_validate_reference_audio_duration\(safe_reference_audio\)/);
  assert.match(space, /duration_seconds < 10/);
  assert.match(space, /format="wav"/);
  assert.doesNotMatch(space, /api_name="\/file_transcribe"/);

  assert.match(api, /findWhisperTranscriptionEndpoint\(client\)/);
  assert.match(api, /await client\.view_api\(\)/);
  assert.match(api, /MIN_VOICE_AUDIO_DURATION_SECONDS = 10/);
  assert.match(api, /await parseBuffer\(bytes, \{ mimeType \}, \{ duration: true, skipCovers: true \}\)/);
  assert.match(api, /await voiceAudioToGradioFile\(voiceAudio\)/);
  assert.doesNotMatch(api, /"\/file_transcribe"/);
  assert.ok(pkg.dependencies["music-metadata"]);

  assert.match(frontend, /normalizeVoiceAudioToWav\(file\)/);
  assert.match(frontend, /recordedDuration < 10/);
  assert.match(frontend, /duration < 10/);
  assert.match(frontend, /MAX_VOICE_DURATION_SECONDS = 60/);
  assert.match(frontend, /VOICE_AUDIO_TARGET_SAMPLE_RATE = 16000/);
});


test("voice recording controls enforce duration limits and save audio history", () => {
  const html = read("../index.html");
  const app = read("../assets/js/app.js");
  const css = read("../assets/css/styles.css");
  const historyApi = read("../api/history.js");
  assert.match(html, /id="voice-record-timer"/);
  assert.match(html, /id="voice-audio-remove"/);
  assert.match(html, /id="usage-notice"/);
  assert.match(html, /viewBox="0 0 640 640"/);
  assert.match(app, /MIN_VOICE_RECORDING_SECONDS = 10/);
  assert.match(app, /MAX_VOICE_RECORDING_SECONDS = 60/);
  assert.match(app, /recordedDuration < 10/);
  assert.match(app, /voiceRecordingTimeout = window\.setTimeout/);
  assert.match(app, /function enhanceAudioPlayer\(audio, variant = ""\)/);
  assert.match(app, /saveHistoryEntry\("audio", prompt, modelSelect\.value, \{ mediaUrl: audioUrl \}\)/);
  assert.match(app, /classList\.toggle\("hidden", authenticated\)/);
  assert.doesNotMatch(app, /innerHTML/);
  assert.match(css, /\.custom-audio-player/);
  assert.match(historyApi, /\["image", "video", "audio", "text"\]/);
  assert.match(historyApi, /\["image", "video", "audio"\]\.includes\(type\)/);
});


test("Google and GitHub sign-in buttons in the modal preserve SVG logos and localize only their labels", () => {
  const html = read("../index.html");
  const app = read("../assets/js/app.js");
  assert.ok(html.includes('<button id="google-login" class="provider-button">'));
  assert.ok(html.includes('<svg class="provider-logo google-logo"'));
  assert.ok(html.includes('<span data-i18n="google_login_button">Continuar com Google</span>'));
  assert.ok(html.includes('<button id="github-login" class="provider-button">'));
  assert.ok(html.includes('<span data-i18n="github_login_button">Continuar com GitHub</span>'));
  assert.ok(html.includes('<svg class="provider-logo" viewBox="0 0 24 24">'));
  assert.doesNotMatch(html, /<button id="google-login"[^>]*data-i18n=/);
  assert.doesNotMatch(html, /<button id="github-login"[^>]*data-i18n=/);
  assert.match(app, /google_login_button:"Continue with Google"/);
  assert.match(app, /github_login_button:"Continue with GitHub"/);
  assert.match(app, /google_login_button:"Continuar com Google"/);
  assert.match(app, /github_login_button:"Continuar com GitHub"/);
});

test("hidden Qwen MCP URL validation does not block image generation", () => {
  const html = read("../index.html");
  const app = read("../assets/js/app.js");
  const urlInput = html.match(/<input id="qwen-mcp-url"[^>]*>/)?.[0];

  assert.ok(urlInput, "Qwen MCP URL input should exist");
  assert.doesNotMatch(urlInput, /\brequired\b/, "hidden MCP URL must not participate in native form validation");
  assert.match(app, /const urlInput = \$\("qwen-mcp-url"\);[\s\S]*?if \(!urlInput\.checkValidity\(\)\) \{\s*urlInput\.reportValidity\(\);/);
});

test("image inference is bounded before the Vercel gateway deadline", () => {
  const api = read("../api/generate.js");
  assert.match(api, /IMAGE_INFERENCE_TIMEOUT_MS = 225_000/);
  assert.match(api, /QWYTHOS_STEP_TIMEOUT_MS = 105_000/);
  assert.match(api, /predictWithTimeout\(\s*client,\s*"\/generate_image"/);
  assert.match(api, /predictWithTimeout\(\s*client,\s*"\/generate_image_from_image"/);
  assert.match(api, /predictWithTimeout\(\s*client,\s*"\/generate_image_from_image_render"/);
  assert.match(api, /phase === "space-generate" \|\| phase === "space-interpret"[\s\S]*?res\.status\(504\)/);
});
