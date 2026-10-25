import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const profile = readFileSync(new URL("../assets/js/profile.js", import.meta.url), "utf8");

test("profile photo rings keep the purple palette and rotate continuously", () => {
  assert.ok(
    profile.includes("background:conic-gradient(#a78bfa 0%,#e9d5ff 18%,#8b5cf6 36%,#d8b4fe 52%,#7c3aed 70%,#c4b5fd 86%,#a78bfa 100%)"),
    "the rotating ring should keep the existing purple gradient colors",
  );
  assert.ok(
    profile.includes("animation:profile-ring-spin 4s linear infinite;"),
    "both profile-ring pseudo-elements should use an infinite linear rotation",
  );
  assert.ok(
    profile.includes("@keyframes profile-ring-spin{to{transform:rotate(360deg)}}"),
    "the ring animation should complete a full turn",
  );
  assert.ok(
    profile.includes("@media(prefers-reduced-motion:reduce){.hero-jarvis,.profile-trigger::before,.profile-large-avatar::before,.profile-plan-badge{animation:none!important;"),
    "the animation should respect reduced-motion preferences",
  );
  assert.ok(
    profile.includes(".profile-trigger::before,.profile-large-avatar::before{"),
    "the header avatar and expanded profile avatar should share the ring style",
  );
});
