import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("animated browser favicon uses both ICO frames and leaves the PWA icon separate", () => {
  const html = read("../index.html");
  const animation = read("../assets/js/favicon-animation.js");
  const manifest = JSON.parse(read("../manifest.webmanifest"));

  assert.match(html, /<link rel="icon" href="\/favicon\.ico" type="image\/x-icon">/);
  assert.doesNotMatch(html, /<link rel="icon" href="\/assets\/icons\/erikraft-ai\.svg"/);
  assert.match(html, /<script src="\/assets\/js\/favicon-animation\.js" defer><\/script>/);
  assert.match(animation, /document\.querySelector\('link\[rel~="icon"\]\[href="\/favicon\.ico"\]'\)/);
  assert.match(animation, /const icon1 = '\/favicon\.ico'/);
  assert.match(animation, /const icon2 = '\/favicon2\.ico'/);
  assert.match(animation, /\}, 500\)/);
  assert.match(animation, /\}, 10000\)/);
  assert.ok(existsSync(new URL("../favicon.ico", import.meta.url)));
  assert.ok(existsSync(new URL("../favicon2.ico", import.meta.url)));

  assert.equal(manifest.icons.length, 1);
  assert.equal(manifest.icons[0].src, "/assets/icons/erikraft-ai-pwa.svg");
});
