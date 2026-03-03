/* Zoom / fullscreen overlay for cards and visualizations.
   Uses a move-based approach: the original card DOM is moved into an overlay
   so Chart.js instances stay alive and resize automatically. On close the
   card is returned to its original location. */

import { Chart } from 'chart.js';

const ZOOM_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

const CLOSE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

let overlay: HTMLElement | null = null;
let placeholder: HTMLElement | null = null;  // marks where the card was
let activeCard: HTMLElement | null = null;

function ensureOverlay(): HTMLElement {
  if (overlay && document.body.contains(overlay)) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'zoom-overlay';
  overlay.innerHTML = `
    <div class="zoom-toolbar">
      <button class="zoom-close-btn" title="Close (Esc)">${CLOSE_ICON}</button>
    </div>
    <div class="zoom-content"></div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.zoom-close-btn')!.addEventListener('click', closeZoom);
  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('zoom-overlay')) closeZoom();
  });
  return overlay;
}

function closeZoom(): void {
  if (!overlay || !activeCard) return;
  overlay.classList.remove('zoom-visible');
  activeCard.classList.remove('zoom-card');

  // Move card back to its original position
  if (placeholder?.parentElement) {
    placeholder.parentElement.insertBefore(activeCard, placeholder);
    placeholder.remove();
  }

  // Trigger Chart.js resize back to normal
  activeCard.querySelectorAll('canvas').forEach(canvas => {
    const chart = Chart.getChart(canvas);
    chart?.resize();
  });

  activeCard = null;
  placeholder = null;
}

function openZoom(card: HTMLElement): void {
  // Close any existing zoom first
  if (activeCard) closeZoom();

  const ov = ensureOverlay();
  const content = ov.querySelector('.zoom-content')!;

  // Leave a placeholder in the DOM so we know where to put the card back
  placeholder = document.createElement('div');
  placeholder.className = 'zoom-placeholder';
  placeholder.style.display = 'none';
  card.parentElement!.insertBefore(placeholder, card);

  // Move the card into the overlay
  activeCard = card;
  card.classList.add('zoom-card');
  content.innerHTML = '';
  content.appendChild(card);

  requestAnimationFrame(() => {
    ov.classList.add('zoom-visible');
    // Trigger Chart.js resize to fill overlay
    card.querySelectorAll('canvas').forEach(canvas => {
      const chart = Chart.getChart(canvas);
      chart?.resize();
    });
  });
}

/** Inject zoom buttons into all .card elements within a container */
export function injectZoomButtons(container: HTMLElement): void {
  const cards = container.querySelectorAll<HTMLElement>('.card');
  cards.forEach(card => {
    // Skip cards that already have a zoom button or have no title (stat cards, controls)
    if (card.querySelector('.zoom-btn')) return;
    if (!card.querySelector('.card-title')) return;

    const btn = document.createElement('button');
    btn.className = 'zoom-btn';
    btn.innerHTML = ZOOM_ICON;
    btn.title = 'Fullscreen';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openZoom(card);
    });

    card.style.position = 'relative';
    card.appendChild(btn);
  });
}

/** Close zoom if navigating away */
export function teardownZoom(): void {
  if (activeCard) closeZoom();
}

// Global ESC handler
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeZoom();
});
