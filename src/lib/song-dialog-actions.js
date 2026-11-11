const paths = {
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  spotify: '<circle cx="12" cy="12" r="9"/><path d="M6 9c4-2 8-1 12 1M7 12c3-1 6-1 10 1M8 15c3-1 5-1 8 1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  qr: '<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h3v3h3v3h-6zm6-3h-6v3M12 3v9H3m9 3v6"/>',
  send: '<path d="m3 3 18 9-18 9 4-9Zm4 9h14"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
};

/** Preserve icons even when async preview/request handlers replace button labels. */
export function initializeSongDialogActions(dialog) {
  const paint = () => {
    const items = [
      ['#copy-song-code', 'copy'], ['#dialog-preview', 'play'], ['#dialog-spotify', 'spotify'],
      ['.dialog-done', 'check'], ['#qr-show', 'qr'], ['#request-song', 'send'],
      ['#send-request', 'send'], ['#request-see-queue', 'list'],
    ];
    for (const [selector, defaultIcon] of items) {
      const button = dialog.querySelector(selector);
      if (!button || button.querySelector('svg')) continue;
      const label = button.textContent.trim();
      const icon = label === 'Pausar' ? 'pause' : label === 'Copiado!' ? 'check' : defaultIcon;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = paths[icon];
      const text = document.createElement('span');
      text.textContent = label;
      button.replaceChildren(svg, text);
      if (selector === '#copy-song-code') { button.setAttribute('aria-label', label); button.title = label; }
    }
  };
  paint();
  new MutationObserver(paint).observe(dialog, { childList: true, subtree: true });
}
