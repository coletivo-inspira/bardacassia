/** Continuous, compact recommendation ribbon; manual scrolling pauses motion. */
export function initializeRecommendationCarousel(section) {
  const viewport = section.querySelector('.song-recommendations');
  const cards = [...viewport.children];
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const track = document.createElement('div');
  track.className = 'recommendation-marquee-track';
  const group = document.createElement('div');
  group.className = 'recommendation-marquee-group';
  group.append(...cards);
  track.append(group);
  viewport.replaceChildren(track);
  let frame = 0, previous = 0, offset = 0, hovered = false, manual = false;
  let copy;
  const resize = new ResizeObserver(() => {
    copy?.remove();
    copy = null;
    if (cards.length > 1 && !motion.matches && !manual) {
      copy = group.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      [...copy.children].forEach((card, index) => {
        card.tabIndex = -1;
        card.addEventListener('click', () => cards[index].click(), options);
      });
      track.append(copy);
    }
    offset = 0;
    track.style.transform = '';
  });
  resize.observe(group);
  const animate = (now) => {
    const elapsed = previous ? Math.min(now - previous, 50) : 0;
    previous = now;
    const paused = motion.matches || manual || hovered || document.hidden || section.contains(document.activeElement);
    if (!paused && copy) {
      offset = (offset + elapsed * .022) % group.getBoundingClientRect().width;
      track.style.transform = `translateX(${-offset}px)`;
    }
    frame = requestAnimationFrame(animate);
  };
  const useManual = () => {
    manual = true;
    track.style.transform = '';
    viewport.scrollLeft = offset;
  };
  viewport.addEventListener('pointerdown', useManual, options);
  viewport.addEventListener('wheel', useManual, { ...options, passive: true });
  viewport.addEventListener('focusin', useManual, options);
  viewport.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') hovered = true; }, options);
  viewport.addEventListener('pointerleave', () => { hovered = false; }, options);
  viewport.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); useManual();
    viewport.scrollBy({ left: event.key === 'ArrowRight' ? 180 : -180, behavior: motion.matches ? 'instant' : 'smooth' });
  }, options);
  motion.addEventListener('change', useManual, options);
  frame = requestAnimationFrame(animate);
  return () => { cancelAnimationFrame(frame); resize.disconnect(); abort.abort(); };
}
