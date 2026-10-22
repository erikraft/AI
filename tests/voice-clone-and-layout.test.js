import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("voice cloning is exposed in the selector and has upload, recording, and audio output controls", () => {
  const html = read("../index.html");
  const app = read("../assets/js/app.js");
  assert.match(html, /option value="tonyassi\/voice-clone"/);
  assert.match(html, /id="voice-audio-input"/);
  assert.match(html, /id="voice-record-start"/);
  assert.match(html, /id="voice-record-stop"/);
  assert.match(html, /id="generated-audio"/);
  assert.match(app, /VOICE_CLONE_MODEL = "tonyassi\/voice-clone"/);
  assert.match(app, /data\.type === "audio"/);
});

test("voice cloning routes through the authenticated generation API to the upstream Gradio endpoint", () => {
  const api = read("../api/generate.js");
  assert.ok(api.includes('VOICE_CLONE_SPACE_ID = "tonyassi/voice-clone"'));
  assert.match(api, /Client\.connect\(targetSpaceId/);
  assert.ok(api.includes('predictWithTimeout(client, "/clone", [prompt.trim(), voiceAudioFile]'));
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
