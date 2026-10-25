(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const fallbackColor = '255, 0, 128';

  // Keep the browser's native text selection and animate only its background.
  // No overlay elements, outlines, dashed borders, gradients, or shadows.
  if (reduceMotion.matches) {
    root.style.setProperty('--erikraft-selection-rgb', fallbackColor);
    return;
  }

  let frame = 0;
  let previousTime = 0;
  let hue = 0;
  const cycleDuration = 3600;

  function animate(time) {
    if (reduceMotion.matches) {
      root.style.setProperty('--erikraft-selection-rgb', fallbackColor);
      frame = 0;
      return;
    }

    if (!previousTime) previousTime = time;
    hue = (hue + ((time - previousTime) * 360 / cycleDuration)) % 360;
    previousTime = time;

    const chroma = 1;
    const section = hue / 60;
    const x = chroma * (1 - Math.abs(section % 2 - 1));
    let rgb;

    if (section < 1) rgb = [255, Math.round(x * 255), 0];
    else if (section < 2) rgb = [Math.round(x * 255), 255, 0];
    else if (section < 3) rgb = [0, 255, Math.round(x * 255)];
    else if (section < 4) rgb = [0, Math.round(x * 255), 255];
    else if (section < 5) rgb = [Math.round(x * 255), 0, 255];
    else rgb = [255, 0, Math.round(x * 255)];

    root.style.setProperty('--erikraft-selection-rgb', rgb.join(', '));
    frame = window.requestAnimationFrame(animate);
  }

  function start() {
    if (!frame && !reduceMotion.matches) {
      previousTime = 0;
      frame = window.requestAnimationFrame(animate);
    }
  }

  function stop() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  const onMotionPreferenceChange = () => {
    if (reduceMotion.matches) {
      stop();
      root.style.setProperty('--erikraft-selection-rgb', fallbackColor);
    } else {
      start();
    }
  };

  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener('change', onMotionPreferenceChange);
  } else if (reduceMotion.addListener) {
    reduceMotion.addListener(onMotionPreferenceChange);
  }
})();
