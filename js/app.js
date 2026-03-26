// ===== App Router & Initialization =====

import { $, $$, getParam, createElement, loadProgress, displayNumber } from './utils.js';
import { loadGrades, loadTopics, loadSummary, loadQuiz } from './data-loader.js';

async function init() {
  const path = window.location.pathname;

  if (path.endsWith('grade.html')) {
    await initGradePage();
  } else if (path.endsWith('topic.html')) {
    await initTopicPage();
  } else {
    await initLandingPage();
  }
}

// ===== Landing Page =====

async function initLandingPage() {
  const grid = $('#grades-grid');
  if (!grid) return;

  try {
    const data = await loadGrades();
    grid.innerHTML = '';

    for (const grade of data.grades) {
      const card = createElement('div', {
        className: `card animate-in ${grade.active ? '' : 'disabled'}`
      });

      card.innerHTML = `
        <div class="card-icon">${grade.icon}</div>
        <h3>${grade.title}</h3>
        <p>${grade.description}</p>
        ${grade.active ? '' : '<span class="badge coming-soon">Очаквайте скоро</span>'}
      `;

      if (grade.active) {
        card.addEventListener('click', () => {
          window.location.href = `pages/grade.html?grade=${grade.id}`;
        });
      }

      grid.appendChild(card);
    }
  } catch (err) {
    grid.innerHTML = `<p style="color: var(--color-error);">Грешка при зареждане: ${err.message}</p>`;
  }
}

// ===== Grade Page =====

async function initGradePage() {
  const gradeId = getParam('grade');
  if (!gradeId) {
    window.location.href = '../index.html';
    return;
  }

  const titleEl = $('#grade-title');
  const descEl = $('#grade-description');
  const breadcrumb = $('#breadcrumb-grade');
  const grid = $('#topics-grid');

  try {
    const data = await loadTopics(gradeId);

    document.title = `${data.gradeTitle} - StartMath`;
    titleEl.textContent = data.gradeTitle;
    descEl.textContent = 'Избери тема за учене';
    breadcrumb.textContent = data.gradeTitle;

    grid.innerHTML = '';

    for (const topic of data.topics) {
      const card = createElement('div', {
        className: `card animate-in ${topic.active ? '' : 'disabled'}`
      });

      // Check for saved progress
      const progress = loadProgress(`quiz_${gradeId}_${topic.id}`);
      let badgeHTML = '';
      if (progress) {
        badgeHTML = `<span class="badge progress">${progress.pct}% ✓</span>`;
      } else if (!topic.active) {
        badgeHTML = '<span class="badge coming-soon">Очаквайте скоро</span>';
      }

      card.innerHTML = `
        <div class="card-icon">${topic.icon}</div>
        <h3>${topic.title}</h3>
        <p>${topic.description}</p>
        <p style="font-size: 0.85rem; color: var(--color-text-light);">${topic.subtopicCount} подтеми</p>
        ${badgeHTML}
      `;

      if (topic.active) {
        card.addEventListener('click', () => {
          if (topic.page) {
            window.location.href = topic.page;
          } else {
            window.location.href = `topic.html?grade=${gradeId}&topic=${topic.id}`;
          }
        });
      }

      grid.appendChild(card);
    }
  } catch (err) {
    grid.innerHTML = `<p style="color: var(--color-error);">Грешка при зареждане: ${err.message}</p>`;
  }
}

// ===== Topic Page =====

async function initTopicPage() {
  const gradeId = getParam('grade');
  const topicId = getParam('topic');

  if (!gradeId || !topicId) {
    window.location.href = '../index.html';
    return;
  }

  const titleEl = $('#topic-title');
  const breadcrumbGrade = $('#breadcrumb-grade');
  const breadcrumbTopic = $('#breadcrumb-topic');

  // Set up breadcrumb
  breadcrumbGrade.href = `grade.html?grade=${gradeId}`;
  breadcrumbGrade.textContent = `${gradeId} клас`;

  // Set up tabs
  setupTabs();

  try {
    // Load summary and quiz data in parallel
    const [summaryData, quizData] = await Promise.all([
      loadSummary(gradeId, topicId),
      loadQuiz(gradeId, topicId)
    ]);

    document.title = `${summaryData.topicTitle} - StartMath`;
    titleEl.textContent = summaryData.topicTitle;
    breadcrumbTopic.textContent = summaryData.topicTitle;

    // Wait for external scripts to load
    await waitForDependencies();

    // Render summary
    const { renderSummary } = await import('./summary-renderer.js');
    renderSummary(summaryData);

    // Initialize quiz
    const { initQuiz, setSubtopicTitles } = await import('./quiz-engine.js');
    setSubtopicTitles(summaryData.subtopics);
    initQuiz(quizData, gradeId, topicId);

  } catch (err) {
    titleEl.textContent = 'Грешка при зареждане';
    console.error(err);
  }
}

function setupTabs() {
  const tabBtns = $$('.tab-btn');
  const tabContents = $$('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const content = $(`#tab-${tabId}`);
      if (content) content.classList.add('active');
    });
  });
}

function waitForDependencies() {
  return new Promise((resolve) => {
    let checks = 0;
    const maxChecks = 100; // 10 seconds

    function check() {
      if (window.Swiper && window.renderMathInElement) {
        resolve();
        return;
      }
      checks++;
      if (checks >= maxChecks) {
        console.warn('Dependencies not fully loaded, proceeding anyway');
        resolve();
        return;
      }
      setTimeout(check, 100);
    }

    check();
  });
}

// ===== Start =====
document.addEventListener('DOMContentLoaded', init);
