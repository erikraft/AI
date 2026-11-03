import assert from "node:assert/strict";
import { test } from "node:test";

import { detectVoicePromptLanguage } from "./generate.js";

test("returns null for an ambiguous numeric prompt so reference audio can supply the language", () => {
  const prompt = "1234 5678 9012";

  assert.ok(prompt.trim().length >= 12);
  assert.equal(detectVoicePromptLanguage(prompt), null);
});
