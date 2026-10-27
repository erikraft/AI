import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("image-to-JSON model is exposed in the bilingual website UI", () => {
  const html = read("../index.html");
  const app = read("../assets/js/app.js");
  assert.match(html, /value="erikraft\/image-to-json-prompt"/);
  assert.match(html, /id="copy-json"/);
  assert.match(html, /id="download-json"/);
  assert.match(app, /image_to_json_ready/);
  assert.match(app, /filter_image_to_json/);
});

test("image-to-JSON API validates the vision blueprint and authenticates requests", () => {
  const api = read("../api/generate.js");
  assert.match(api, /isImageToJsonPrompt/);
  assert.match(api, /\/generate_image_to_json_prompt/);
  assert.match(api, /Array\.isArray\(blueprint\.elements\)/);
  assert.match(api, /spaceApiSecret\.length < 32/);
});

test("the Hugging Face endpoint requests a JSON-only visual reconstruction", () => {
  const space = read("../huggingface/app.py");
  assert.match(space, /IMAGE_TO_JSON_SYSTEM_PROMPT/);
  assert.match(space, /api_name="generate_image_to_json_prompt"/);
  assert.match(space, /json\.dumps\(blueprint, ensure_ascii=False, indent=2\)/);
});

test("MongoDB history can store a full JSON blueprint", () => {
  const history = read("../api/history.js");
  assert.match(history, /cleanText\(body\.outputText, 50000\)/);
});
