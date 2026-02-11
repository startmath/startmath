// ===== Summary Renderer =====

import { $, $$ } from './utils.js';

let swiperInstance = null;

function renderMath(container) {
  // Use KaTeX auto-render if available
  if (window.renderMathInElement) {
    window.renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false
    });
  }
}

function renderMarkdownBold(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function buildSlideHTML(slide, index, total) {
  const typeClass = `type-${slide.type}`;
  let bodyHTML = '';

  // Build body paragraphs
  if (slide.body) {
    bodyHTML += slide.body.map(p => `<p>${renderMarkdownBold(p)}</p>`).join('');
  }

  // Build table if present
  if (slide.table) {
    const { headers, rows } = slide.table;
    bodyHTML += '<table class="summary-table">';
    bodyHTML += '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
    bodyHTML += '<tbody>';
    for (const row of rows) {
      bodyHTML += '<tr>' + row.map(cell => `<td>${renderMarkdownBold(cell)}</td>`).join('') + '</tr>';
    }
    bodyHTML += '</tbody></table>';
  }

  // Build steps if present
  if (slide.steps) {
    bodyHTML += '<ol class="steps">';
    for (const step of slide.steps) {
      bodyHTML += `<li>${renderMarkdownBold(step)}</li>`;
    }
    bodyHTML += '</ol>';
  }

  return `
    <div class="swiper-slide">
      <div class="slide-card ${typeClass}">
        <div class="slide-header">
          <span class="slide-number">${index + 1}</span>
          <span class="slide-title">${slide.title}</span>
        </div>
        <div class="slide-body">
          ${bodyHTML}
        </div>
      </div>
    </div>
  `;
}

export function renderSummary(data) {
  const container = $('#slides-container');
  const { slides, subtopics } = data;

  // Build all slides
  container.innerHTML = slides.map((slide, i) => buildSlideHTML(slide, i, slides.length)).join('');

  // Build subtopic drawer
  const drawer = $('#subtopic-drawer');
  drawer.innerHTML = '';
  let slideIndex = 0;
  const subtopicSlideMap = {};

  for (const st of subtopics) {
    const firstIdx = slides.findIndex(s => s.subtopic === st.id);
    if (firstIdx !== -1) subtopicSlideMap[st.id] = firstIdx;
  }

  for (const st of subtopics) {
    const btn = document.createElement('button');
    btn.textContent = st.title;
    btn.dataset.subtopic = st.id;
    btn.addEventListener('click', () => {
      const idx = subtopicSlideMap[st.id];
      if (idx !== undefined && swiperInstance) {
        swiperInstance.slideTo(idx);
        drawer.classList.remove('open');
      }
    });
    drawer.appendChild(btn);
  }

  // Toggle drawer
  const toggle = $('#subtopic-toggle');
  toggle.addEventListener('click', () => {
    drawer.classList.toggle('open');
  });

  // Initialize Swiper
  initSwiper(slides.length, subtopics, subtopicSlideMap);

  // Render math in all slides
  renderMath(container);
}

function initSwiper(totalSlides, subtopics, subtopicSlideMap) {
  const counterEl = $('#slide-counter');
  const progressFill = $('#summary-progress-fill');
  const drawer = $('#subtopic-drawer');

  swiperInstance = new Swiper('#summary-swiper', {
    slidesPerView: 1,
    spaceBetween: 20,
    keyboard: { enabled: true },
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev',
    },
    on: {
      slideChange(swiper) {
        const idx = swiper.activeIndex;
        counterEl.textContent = `${idx + 1} / ${totalSlides}`;
        progressFill.style.width = `${((idx + 1) / totalSlides) * 100}%`;

        // Update active subtopic in drawer
        const buttons = $$('button', drawer);
        buttons.forEach(btn => btn.classList.remove('active'));

        // Find which subtopic current slide belongs to
        const slides = swiper.slides;
        const slideEl = slides[idx];
        // We need to look up from our data
        // For now, just highlight based on index
      }
    }
  });

  // Initial state
  counterEl.textContent = `1 / ${totalSlides}`;
  progressFill.style.width = `${(1 / totalSlides) * 100}%`;
}

export function destroySummary() {
  if (swiperInstance) {
    swiperInstance.destroy(true, true);
    swiperInstance = null;
  }
}
