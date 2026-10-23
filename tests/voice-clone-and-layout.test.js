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
});

test("profile popover remains fixed and layered above the footer", () => {
  const profile = read("../assets/js/profile.js");
  assert.match(profile, /\.profile-popover\{position:fixed;z-index:1000/);
  assert.doesNotMatch(profile, /\.profile-popover\{position:relative\}/);
});

test("result stage has responsive desktop, tablet, and mobile rules", () => {
  const css = read("../assets/css/styles.css");
  assert.match(css, /@media \(min-width:1100px\)/);
  assert.match(css, /@media \(max-width:900px\)/);
  assert.match(css, /@media \(max-width:600px\)/);
  assert.match(css, /\.result-stage\.is-audio-result/);
});

test("voice upload status never reflects an attacker-controlled filename as markup", () => {
  const app = read("../assets/js/app.js");
  assert.match(app, /textContent = document\.documentElement\.lang === "en" \? "Voice sample ready\." : "Amostra de voz pronta\."/);
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

test("privacy policy and terms use the requested October 23, 2026 date in both languages", () => {
  for (const path of ["../privacy.html", "../terms.html"]) {
    const html = read(path);
    assert.match(html, /dateModified": "2026-10-23"/);
    assert.match(html, /23 de outubro de 2026/);
    assert.match(html, /October 23, 2026/);
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

  assert.match(frontend, /getVoiceAudioDuration\(file\)/);
  assert.match(frontend, /recordedDuration < 10/);
  assert.match(frontend, /duration < 10/);
});
