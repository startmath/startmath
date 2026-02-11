// ===== Quiz Engine =====

import { $, $$, createElement, shuffle, displayNumber, formatBG, parseBGInput, saveProgress, loadProgress } from './utils.js';
import { generateValues, answerFunctions, optionsFunctions, buildEquationText } from './math-helpers.js';

let quizData = null;
let questions = [];
let currentIndex = 0;
let score = 0;
let answered = [];
let gradeId = '';
let topicId = '';

export function initQuiz(data, grade, topic) {
  quizData = data;
  gradeId = grade;
  topicId = topic;

  const startBtn = $('#start-quiz-btn');
  if (startBtn) {
    startBtn.addEventListener('click', startQuiz);
  }
}

function startQuiz() {
  questions = generateQuestions();
  currentIndex = 0;
  score = 0;
  answered = new Array(questions.length).fill(null);
  renderQuestion();
}

function generateQuestions() {
  const templates = quizData.templates;
  const count = quizData.questionsPerQuiz || 15;

  // Try to pick from different subtopics
  const shuffled = shuffle([...templates]);
  const selected = shuffled.slice(0, count);

  // If we don't have enough templates, repeat some
  while (selected.length < count) {
    selected.push(shuffled[selected.length % shuffled.length]);
  }

  return shuffle(selected).map(template => buildQuestion(template));
}

function buildQuestion(template) {
  const values = generateValues(template.generate);
  let questionText = template.question;
  let answer, options, type;

  // Replace placeholders in question text
  for (const [key, val] of Object.entries(values)) {
    const displayed = typeof val === 'number' ? displayNumber(val) : String(val);
    questionText = questionText.replace(`{${key}}`, displayed);
  }

  type = template.type;

  if (type === 'equation') {
    // Build equation text
    const eqType = values.eqType;
    const eq = buildEquationText(eqType, values);
    questionText = `Намери x: ${eq.text}`;
    answer = eq.answer;
    type = 'fill-in'; // equations use fill-in input
  } else if (type === 'fill-in') {
    // Compute answer using answerFunc
    const func = answerFunctions[template.answerFunc];
    answer = func(values);
  } else if (type === 'comparison') {
    const func = answerFunctions[template.answerFunc];
    answer = func(values);
    options = ['<', '=', '>'];
  } else if (type === 'multiple-choice') {
    const func = optionsFunctions[template.optionsFunc];
    const result = func(values);
    answer = result.correct;
    options = result.options;
  }

  return {
    id: template.id,
    subtopic: template.subtopic,
    type,
    question: questionText,
    answer,
    options: options || null,
    explanation: template.explanation
  };
}

function renderQuestion() {
  const container = $('#quiz-container');
  const q = questions[currentIndex];
  const total = questions.length;

  let html = `
    <div class="quiz-progress">
      <span>Въпрос ${currentIndex + 1} / ${total}</span>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${((currentIndex) / total) * 100}%"></div>
      </div>
      <span>${score} ✓</span>
    </div>
    <div class="question-card animate-in">
      <div class="question-label">Подтема: ${getSubtopicTitle(q.subtopic)}</div>
      <div class="question-text">${q.question}</div>
      <div id="answer-area"></div>
      <div id="feedback-area"></div>
      <div id="next-area" class="next-btn-wrap"></div>
    </div>
  `;

  container.innerHTML = html;

  const answerArea = $('#answer-area');

  switch (q.type) {
    case 'multiple-choice':
      renderMultipleChoice(answerArea, q);
      break;
    case 'comparison':
      renderComparison(answerArea, q);
      break;
    case 'fill-in':
      renderFillIn(answerArea, q);
      break;
  }

  // Render math in question
  renderMathInQuiz(container);
}

function renderMultipleChoice(area, q) {
  const letters = ['А', 'Б', 'В', 'Г'];
  const list = createElement('div', { className: 'options-list' });

  q.options.forEach((opt, i) => {
    const btn = createElement('button', {
      className: 'option-btn',
      innerHTML: `<span class="option-letter">${letters[i]}</span><span>${typeof opt === 'number' ? displayNumber(opt) : opt}</span>`
    });

    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      handleMultipleChoiceAnswer(list, btn, opt, q);
    });

    list.appendChild(btn);
  });

  area.appendChild(list);
}

function renderComparison(area, q) {
  const list = createElement('div', { className: 'comparison-options' });

  ['<', '=', '>'].forEach(symbol => {
    const btn = createElement('button', {
      className: 'option-btn',
      textContent: symbol
    });

    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      handleComparisonAnswer(list, btn, symbol, q);
    });

    list.appendChild(btn);
  });

  area.appendChild(list);
}

function renderFillIn(area, q) {
  const group = createElement('div', { className: 'fill-in-group' });

  const input = createElement('input', {
    className: 'fill-in-input',
    type: 'text',
    inputmode: 'decimal',
    placeholder: '?',
    autocomplete: 'off'
  });

  const submitBtn = createElement('button', {
    className: 'btn btn-primary',
    textContent: 'Провери'
  });

  submitBtn.addEventListener('click', () => {
    handleFillInAnswer(input, submitBtn, q);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleFillInAnswer(input, submitBtn, q);
    }
  });

  group.appendChild(input);
  group.appendChild(submitBtn);
  area.appendChild(group);

  // Auto-focus
  setTimeout(() => input.focus(), 100);
}

function handleMultipleChoiceAnswer(list, clickedBtn, selectedOpt, q) {
  const correct = String(q.answer) === String(selectedOpt);
  const buttons = $$('.option-btn', list);

  buttons.forEach(btn => {
    btn.classList.add('disabled');
    const btnText = btn.querySelector('span:last-child').textContent;
    if (String(btnText) === String(typeof q.answer === 'number' ? displayNumber(q.answer) : q.answer)) {
      btn.classList.add('correct');
    }
  });

  if (correct) {
    clickedBtn.classList.add('correct');
    score++;
  } else {
    clickedBtn.classList.add('incorrect');
  }

  answered[currentIndex] = correct;
  showFeedback(correct, q.explanation, q.answer);
  showNextButton();
}

function handleComparisonAnswer(list, clickedBtn, symbol, q) {
  const correct = symbol === q.answer;
  const buttons = $$('.option-btn', list);

  buttons.forEach(btn => {
    btn.classList.add('disabled');
    if (btn.textContent === q.answer) {
      btn.classList.add('correct');
    }
  });

  if (correct) {
    clickedBtn.classList.add('correct');
    score++;
  } else {
    clickedBtn.classList.add('incorrect');
  }

  answered[currentIndex] = correct;
  showFeedback(correct, q.explanation, q.answer);
  showNextButton();
}

function handleFillInAnswer(input, submitBtn, q) {
  const userVal = parseBGInput(input.value);
  if (userVal === null) {
    input.style.borderColor = 'var(--color-error)';
    return;
  }

  submitBtn.disabled = true;
  input.disabled = true;

  const expectedVal = typeof q.answer === 'number' ? q.answer : parseFloat(q.answer);
  const correct = Math.abs(userVal - expectedVal) < 0.0001;

  if (correct) {
    input.classList.add('correct');
    score++;
  } else {
    input.classList.add('incorrect');
  }

  answered[currentIndex] = correct;
  showFeedback(correct, q.explanation, q.answer);
  showNextButton();
}

function showFeedback(correct, explanation, correctAnswer) {
  const area = $('#feedback-area');
  const icon = correct ? '✓' : '✗';
  const cls = correct ? 'correct' : 'incorrect';
  const prefix = correct ? 'Правилно!' : `Грешен отговор. Верен: ${typeof correctAnswer === 'number' ? displayNumber(correctAnswer) : correctAnswer}`;

  area.innerHTML = `
    <div class="feedback ${cls}">
      <span class="feedback-icon">${icon}</span>
      <span>${prefix} ${explanation}</span>
    </div>
  `;
}

function showNextButton() {
  const area = $('#next-area');
  const isLast = currentIndex === questions.length - 1;
  const label = isLast ? 'Виж резултата' : 'Следващ въпрос →';

  const btn = createElement('button', {
    className: 'btn btn-primary',
    textContent: label,
    onClick: () => {
      if (isLast) {
        showScoreScreen();
      } else {
        currentIndex++;
        renderQuestion();
      }
    }
  });

  area.innerHTML = '';
  area.appendChild(btn);
}

function showScoreScreen() {
  const container = $('#quiz-container');
  const total = questions.length;
  const pct = Math.round((score / total) * 100);

  let message;
  if (pct === 100) message = 'Перфектен резултат! 🌟';
  else if (pct >= 80) message = 'Отличен резултат!';
  else if (pct >= 60) message = 'Добър резултат!';
  else if (pct >= 40) message = 'Може и по-добре. Опитай пак!';
  else message = 'Повтори материала и опитай отново.';

  // Save best score
  const key = `quiz_${gradeId}_${topicId}`;
  const prev = loadProgress(key);
  if (!prev || score > prev.score) {
    saveProgress(key, { score, total, pct, date: new Date().toISOString() });
  }
  const best = loadProgress(key);

  // Build per-subtopic breakdown
  const subtopicResults = {};
  questions.forEach((q, i) => {
    if (!subtopicResults[q.subtopic]) {
      subtopicResults[q.subtopic] = { correct: 0, total: 0, title: getSubtopicTitle(q.subtopic) };
    }
    subtopicResults[q.subtopic].total++;
    if (answered[i]) subtopicResults[q.subtopic].correct++;
  });

  let breakdownHTML = '';
  for (const [id, data] of Object.entries(subtopicResults)) {
    const icon = data.correct === data.total ? '✓' : (data.correct > 0 ? '~' : '✗');
    const iconClass = data.correct === data.total ? 'color: var(--color-success)' :
                      (data.correct > 0 ? 'color: var(--color-accent)' : 'color: var(--color-error)');
    breakdownHTML += `
      <div class="breakdown-item">
        <span>${data.title}</span>
        <span>
          <span class="status-icon" style="${iconClass}">${icon}</span>
          ${data.correct}/${data.total}
        </span>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="score-screen animate-in">
      <div class="score-circle">
        <span class="score-number">${score}</span>
        <span class="score-total">от ${total}</span>
      </div>
      <div class="score-message">${message}</div>
      <div class="score-detail">${pct}% верни отговори${best && best.score > score ? ` | Най-добър: ${best.pct}%` : ''}</div>
      <div class="score-actions">
        <button class="btn btn-primary" id="retry-btn">Опитай отново</button>
        <button class="btn btn-outline" id="back-to-summary-btn">Към обобщението</button>
      </div>
      <div class="score-breakdown">
        <h4>Резултати по подтеми</h4>
        ${breakdownHTML}
      </div>
    </div>
  `;

  $('#retry-btn').addEventListener('click', startQuiz);
  $('#back-to-summary-btn').addEventListener('click', () => {
    // Switch to summary tab
    const summaryTab = $('[data-tab="summary"]');
    if (summaryTab) summaryTab.click();
  });
}

// Subtopic title lookup
let subtopicTitles = {};
export function setSubtopicTitles(subtopics) {
  subtopicTitles = {};
  for (const st of subtopics) {
    subtopicTitles[st.id] = st.title;
  }
}

function getSubtopicTitle(id) {
  return subtopicTitles[id] || id;
}

function renderMathInQuiz(container) {
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
