(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const supportsSelection = typeof window.getSelection === 'function';
  if (!supportsSelection) return;

  const layer = document.createElement('div');
  layer.className = 'text-selection-effects';
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('data-text-selection-effects', '');
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.body) return;
    document.body.appendChild(layer);
    refresh();
  }, { once: true });

  let frame = 0;
  let lastRects = [];
  function refresh() {
    if (!layer.isConnected || reduceMotion.matches) {
      layer.replaceChildren();
      lastRects = [];
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      layer.replaceChildren();
      lastRects = [];
      return;
    }
    const range = selection.getRangeAt(0);
    const root = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (!root || root.closest('input, textarea, select, [contenteditable="true"], [data-no-selection-effect]')) {
      layer.replaceChildren();
      lastRects = [];
      return;
    }
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
    const signature = rects.map(r => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',')).join(';');
    if (signature === lastRects.join(';')) return;
    lastRects = signature ? signature.split(';') : [];
    const fragment = document.createDocumentFragment();
    rects.forEach(rect => {
      const glow = document.createElement('span');
      glow.className = 'text-selection-effect';
      glow.style.left = rect.left + 'px';
      glow.style.top = rect.top + 'px';
      glow.style.width = rect.width + 'px';
      glow.style.height = rect.height + 'px';
      fragment.appendChild(glow);
    });
    layer.replaceChildren(fragment);
  }
  function scheduleRefresh() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  }
  document.addEventListener('selectionchange', scheduleRefresh);
  window.addEventListener('scroll', scheduleRefresh, { passive: true, capture: true });
  window.addEventListener('resize', scheduleRefresh, { passive: true });
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', scheduleRefresh);
  else if (reduceMotion.addListener) reduceMotion.addListener(scheduleRefresh);
})();