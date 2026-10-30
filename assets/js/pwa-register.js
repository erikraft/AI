// Register the PWA service worker. Installation prompts are controlled by the browser.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
      console.error("ErikrafT AI: service worker registration failed.", error);
    });
  });
}
