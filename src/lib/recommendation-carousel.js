/** One disposable carousel per modal song; never duplicates focusable cards. */
export function initializeRecommendationCarousel(section) {
  const track = section.querySelector('.song-recommendations');
  const controls = section.querySelector('.recommendation-controls');
  const cards = [...track.children];
  const pause = controls.querySelector('[data-recommendation="pause"]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let paused = motion.matches;
  let interacting = false;
  let hovered = false;
  let timer;
  const update = () => {
    clearInterval(timer);
    pause.textContent = paused ? 'Retomar' : 'Pausar';
    pause.setAttribute('aria-pressed', String(paused));
    if (cards.length < 2 || paused || interacting || hovered || document.hidden || motion.matches || section.contains(document.activeElement)) return;
    timer = setInterval(() => advance(1), 5000);
  };
  const advance = (direction) => {
    const nearest = cards.reduce((best, card, index) => Math.abs(card.offsetLeft - track.offsetLeft - track.scrollLeft) < Math.abs(cards[best].offsetLeft - track.offsetLeft - track.scrollLeft) ? index : best, 0);
    const next = cards[(nearest + direction + cards.length) % cards.length];
    track.scrollTo({ left: next.offsetLeft - track.offsetLeft, behavior: motion.matches ? 'instant' : 'smooth' });
  };
  controls.hidden = cards.length < 2;
  controls.addEventListener('click', (event) => {
    const action = event.target.closest('[data-recommendation]')?.dataset.recommendation;
    if (action === 'pause') paused = !paused;
    else if (action) { paused = true; advance(action === 'next' ? 1 : -1); }
    update();
  }, options);
  section.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') { hovered = true; update(); } }, options);
  section.addEventListener('pointerleave', () => { hovered = false; update(); }, options);
  track.addEventListener('pointerdown', () => { interacting = true; paused = true; update(); }, options);
  document.addEventListener('pointerup', () => { interacting = false; update(); }, options);
  track.addEventListener('wheel', () => { paused = true; update(); }, { ...options, passive: true });
  track.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); paused = true; advance(event.key === 'ArrowRight' ? 1 : -1); update();
  }, options);
  section.addEventListener('focusin', update, options);
  section.addEventListener('focusout', () => queueMicrotask(() => { if (!abort.signal.aborted) update(); }), options);
  document.addEventListener('visibilitychange', update, options);
  motion.addEventListener('change', () => { if (motion.matches) paused = true; update(); }, options);
  update();
  return () => { clearInterval(timer); abort.abort(); controls.hidden = true; };
}
