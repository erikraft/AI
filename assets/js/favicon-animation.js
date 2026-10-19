// ErikrafT AI™ — animated browser-tab favicon.
// Keep favicon.ico as the static HTML icon for crawlers; animate only in the browser.
(() => {
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;

  const icon1 = 'https://www.erikraft.com/favicon.ico';
  const icon2 = 'https://www.erikraft.com/favicon2.ico';
  let showingFirst = true;

  link.href = icon1;
  const animation = window.setInterval(() => {
    link.href = showingFirst ? icon2 : icon1;
    showingFirst = !showingFirst;
  }, 500);

  window.setTimeout(() => {
    window.clearInterval(animation);
    link.href = icon1;
  }, 10000);
})();
