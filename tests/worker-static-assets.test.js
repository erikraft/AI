import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/worker.js";

function mockEnv() {
  const requestedPaths = [];
  return {
    requestedPaths,
    env: {
      ASSETS: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          requestedPaths.push(pathname);
          return new Response("static:" + pathname, {
            status: 200,
            headers: { "Content-Type": "image/x-icon" }
          });
        }
      }
    }
  };
}

test("serves both favicon variants through the static asset binding", async () => {
  for (const pathname of ["/favicon.ico", "/favicon2.ico"]) {
    const { env, requestedPaths } = mockEnv();
    const response = await worker.fetch(new Request("https://ai.erikraft.com" + pathname), env);

    assert.equal(response.status, 200, pathname + " should be public");
    assert.equal(await response.text(), "static:" + pathname);
    assert.deepEqual(requestedPaths, [pathname]);
  }
});

test("does not expose internal Worker source as a static asset", async () => {
  const { env, requestedPaths } = mockEnv();
  const response = await worker.fetch(
    new Request("https://ai.erikraft.com/cloudflare/worker.js"),
    env
  );

  assert.equal(response.status, 404);
  assert.deepEqual(requestedPaths, []);
});
