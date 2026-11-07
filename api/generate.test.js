import assert from "node:assert/strict";
import { test } from "node:test";

import { detectVoicePromptLanguage, shouldRefundGenerationReservation } from "./generate.js";

test("returns null for an ambiguous numeric prompt so reference audio can supply the language", () => {
  const prompt = "1234 5678 9012";

  assert.ok(prompt.trim().length >= 12);
  assert.equal(detectVoicePromptLanguage(prompt), null);
});


test("refunds a reservation only before remote inference is submitted", () => {
  const reservation = { allowed: true, count: 1, startedAt: 123 };

  assert.equal(shouldRefundGenerationReservation(reservation, false), true);
  assert.equal(shouldRefundGenerationReservation(reservation, true), false);
});

test("does not refund denied or missing reservations", () => {
  assert.equal(shouldRefundGenerationReservation(null, false), false);
  assert.equal(shouldRefundGenerationReservation({ allowed: false }, false), false);
  assert.equal(shouldRefundGenerationReservation({ allowed: false }, true), false);
});
