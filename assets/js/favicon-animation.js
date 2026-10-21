// Animate the site favicon briefly while keeping the static icon in the HTML for crawlers.
(() => {
  const favicon = document.querySelector('link[rel~="icon"]');
  if (!favicon || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const icon1 = '/favicon.ico';
  const icon2 = '/favicon2.ico';
  let showingFirst = true;

  const animation = window.setInterval(() => {
    favicon.href = showingFirst ? icon2 : icon1;
    showingFirst = !showingFirst;
  }, 500);

  window.setTimeout(() => {
    window.clearInterval(animation);
    favicon.href = icon1;
  }, 10000);
})();
