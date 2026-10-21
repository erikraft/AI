/**
 * ErikrafT AI — Cloudflare Workers migration entrypoint.
 *
 * This entrypoint is intentionally fail-closed while the Firebase/Firestore
 * and Hugging Face adapters are being ported and tested. Do not route the
 * production hostname to this Worker until /api/generate is implemented and
 * the integration test checklist in cloudflare/README.md passes.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/generate") {
      if (request.method !== "POST") {
        return Response.json(
          { error: "Método não permitido. Use POST." },
          { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }
        );
      }

      return Response.json(
        {
          error:
            "A API do Cloudflare ainda não foi ativada. Use a implantação atual enquanto a migração é concluída."
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": "300"
          }
        }
      );
    }

    // Never let the static asset binding expose dotfiles, repository metadata,
    // backend source, or configuration files from the repository root.
    if (
      url.pathname.startsWith("/.git") ||
      url.pathname.startsWith("/.github") ||
      url.pathname.startsWith("/cloudflare") ||
      url.pathname.startsWith("/huggingface") ||
      url.pathname === "/package.json" ||
      url.pathname === "/package-lock.json" ||
      url.pathname.startsWith("/api/")
    ) {
      return new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
