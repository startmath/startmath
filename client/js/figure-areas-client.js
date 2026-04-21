// ===== Figure Areas - Thin Client =====

const API_URL = '__LAMBDA_URL__';

// --- Heading titles per figure type ---
const TITLES = {
  triangle:      'Лица на триъгълници',
  parallelogram: 'Лица на успоредници',
  trapezoid:     'Лица на трапеци',
  mixed:         'Лица на смесени фигури'
};

// --- State ---
let config = { figureType: 'triangle', taskCount: 6, cmPerSquare: 1 };
let tasks = [];      // Array of { id, svgFigure, typeLabel }
let currentIdx = 0;
let score = 0;
let results = [];    // Array of { correct, typeLabel, correctArea }

// --- DOM Helpers ---
const $ = (sel) => document.querySelector(sel);

function formatBG(num) {
  const str = String(parseFloat(num.toPrecision(10)));
  return str.replace('.', ',');
}

function isValidAnswerInput(raw) {
  if (!raw) return false;
  return /^\d+(\.\d+)?$/.test(raw);
}

function showInputError(input, message) {
  input.style.borderColor = 'var(--color-error)';
  let err = document.querySelector('#answer-error');
  if (!err) {
    err = document.createElement('div');
    err.id = 'answer-error';
    err.className = 'settings-error';
    err.style.marginTop = '0.5rem';
    const section = document.querySelector('.answer-section');
    if (section) section.appendChild(err);
  }
  err.textContent = message;
  err.classList.remove('hidden');
}

function clearInputError(input) {
  if (input) input.style.borderColor = '';
  const err = document.querySelector('#answer-error');
  if (err) {
    err.textContent = '';
    err.classList.add('hidden');
  }
}

function waitForKaTeX(callback) {
  let checks = 0;
  function check() {
    if (window.renderMathInElement) {
      callback();
      return;
    }
    checks++;
    if (checks < 50) setTimeout(check, 100);
  }
  check();
}

function updatePageHeading(figureType) {
  const title = TITLES[figureType] || 'Лица на фигури';
  document.title = `${title} - StartMath`;
  const h1 = document.querySelector('.section-title h1');
  if (h1) h1.textContent = title;
  const crumb = document.querySelector('.breadcrumb .current');
  if (crumb) crumb.textContent = title;
}

// --- API helpers ---

async function apiCall(endpoint, body) {
  const resp = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API error ${resp.status}: ${text}`);
  }
  return resp.json();
}

function showApiError(message) {
  const container = $('#tri-container');
  container.innerHTML = `
    <div class="tri-settings animate-in">
      <div class="feedback incorrect" style="margin-bottom: 1rem;">
        <span class="feedback-icon">\u2717</span>
        <span>${message}</span>
      </div>
      <button class="btn btn-primary" id="retry-settings-btn">Назад към настройки</button>
    </div>
  `;
  $('#retry-settings-btn').addEventListener('click', showSettingsScreen);
}

// --- Screens ---

function showSettingsScreen() {
  const container = $('#tri-container');
  container.innerHTML = `
    <div class="tri-settings animate-in">
      <p>Намери лицето на фигурите, начертани в квадратна мрежа</p>

      <div class="settings-form">
        <div class="setting-group">
          <label for="figure-type">Вид фигура:</label>
          <select id="figure-type">
            <option value="triangle">Триъгълник</option>
            <option value="parallelogram">Успоредник</option>
            <option value="trapezoid">Трапец</option>
            <option value="mixed">Смесени фигури</option>
          </select>
        </div>

        <div class="setting-group">
          <label for="task-count">Брой задачи:</label>
          <input type="number" id="task-count" min="1" max="100" value="6" inputmode="numeric">
        </div>

        <div class="setting-group">
          <label for="cm-per-square">Страна на квадратче (cm):</label>
          <input type="text" id="cm-per-square" value="1" inputmode="decimal" placeholder="напр. 1,5">
        </div>
      </div>

      <div id="settings-error" class="settings-error hidden"></div>
      <button class="btn btn-primary" id="start-btn">Започни</button>
    </div>
  `;

  // Limit cm input to max 2 decimal places as user types
  $('#cm-per-square').addEventListener('input', (e) => {
    const raw = e.target.value.replace(',', '.');
    const match = raw.match(/^(\d*\.?\d{0,2})/);
    const clamped = match ? match[1].replace('.', ',') : '';
    if (e.target.value !== clamped) e.target.value = clamped;
  });

  // Restore last selection
  $('#figure-type').value = config.figureType;
  $('#figure-type').addEventListener('change', (e) => {
    updatePageHeading(e.target.value);
  });
  updatePageHeading(config.figureType);

  $('#start-btn').addEventListener('click', () => {
    const errEl = $('#settings-error');
    errEl.classList.add('hidden');
    errEl.textContent = '';

    const figureType = $('#figure-type').value;
    const count = parseInt($('#task-count').value);
    const cm = Math.round(parseFloat($('#cm-per-square').value.replace(',', '.')) * 100) / 100;

    if (!count || count < 1 || count > 100) {
      $('#task-count').style.borderColor = 'var(--color-error)';
      errEl.textContent = 'Брой задачи: от 1 до 100';
      errEl.classList.remove('hidden');
      return;
    }
    if (!cm || cm <= 0 || cm > 10) {
      $('#cm-per-square').style.borderColor = 'var(--color-error)';
      errEl.textContent = 'Страна на квадратче: от 0,1 до 10 cm';
      errEl.classList.remove('hidden');
      return;
    }
    config.figureType = figureType;
    config.taskCount = count;
    config.cmPerSquare = cm;
    updatePageHeading(figureType);
    startTest();
  });
}

async function startTest() {
  const container = $('#tri-container');
  container.innerHTML = `
    <div class="tri-settings animate-in" style="text-align: center;">
      <div class="loading">
        <div class="spinner"></div>
        Генериране на задачи...
      </div>
    </div>
  `;

  try {
    const data = await apiCall('/generate', {
      figureType: config.figureType,
      taskCount: config.taskCount,
      cmPerSquare: config.cmPerSquare
    });
    tasks = data.tasks;
    currentIdx = 0;
    score = 0;
    results = [];
    showTask();
  } catch (err) {
    showApiError('Грешка при зареждане на задачите. Моля, опитайте отново.');
  }
}

function showTask() {
  const task = tasks[currentIdx];
  const container = $('#tri-container');

  container.innerHTML = `
    <div class="tri-progress">
      <span>Задача ${currentIdx + 1} / ${tasks.length}</span>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${(currentIdx / tasks.length) * 100}%"></div>
      </div>
      <span class="tri-score">${score} &#10003;</span>
    </div>

    <div class="tri-task animate-in">
      <div class="grid-container" id="grid-container"></div>

      <div class="answer-section">
        <div class="answer-prompt">
          <span>S =</span>
          <div class="answer-input-group">
            <input type="text" id="area-input" inputmode="decimal" placeholder="?" autocomplete="off">
            <span class="unit-label">cm&sup2;</span>
          </div>
        </div>
        <button class="btn btn-primary" id="check-btn">Провери</button>
      </div>

      <div id="solution-area" class="hidden"></div>
      <div id="next-area" class="hidden"></div>
    </div>
  `;

  // Insert the pre-rendered SVG from the API
  const gridContainer = $('#grid-container');
  gridContainer.innerHTML = task.svgFigure;

  const input = $('#area-input');
  const checkBtn = $('#check-btn');

  checkBtn.addEventListener('click', () => checkAnswer(task));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkAnswer(task);
  });
  input.addEventListener('input', () => clearInputError(input));

  setTimeout(() => input.focus(), 150);
}

async function checkAnswer(task) {
  const input = $('#area-input');
  const checkBtn = $('#check-btn');
  const solutionArea = $('#solution-area');
  const nextArea = $('#next-area');

  if (input.disabled) return;

  const raw = input.value.trim().replace(',', '.');

  if (!isValidAnswerInput(raw)) {
    showInputError(input, raw === ''
      ? 'Въведи отговор.'
      : 'Въведи само число (без букви).');
    input.focus();
    return;
  }
  const userAnswer = parseFloat(raw);

  // Disable input and show loading state
  input.disabled = true;
  checkBtn.disabled = true;
  checkBtn.textContent = '...';
  checkBtn.style.opacity = '0.5';

  try {
    const data = await apiCall('/check', {
      taskId: task.id,
      answer: userAnswer,
      cmPerSquare: config.cmPerSquare
    });

    const correct = data.correct;
    const correctArea = data.correctArea;

    if (correct) {
      input.classList.add('correct');
      score++;
    } else {
      input.classList.add('incorrect');
    }

    results.push({ correct, typeLabel: data.typeLabel || task.typeLabel, correctArea });

    const scoreEl = document.querySelector('.tri-score');
    if (scoreEl) scoreEl.textContent = `${score} \u2713`;

    // Replace the SVG with the solution overlay version
    const gridContainer = $('#grid-container');
    gridContainer.innerHTML = data.svgSolution;

    solutionArea.classList.remove('hidden');

    const icon = correct ? '\u2713' : '\u2717';
    const cls = correct ? 'correct' : 'incorrect';
    const prefix = correct ? 'Правилно!' : `Грешен отговор. Вярно: ${formatBG(correctArea)} cm\u00B2`;

    solutionArea.innerHTML = `
      <div class="feedback ${cls}">
        <span class="feedback-icon">${icon}</span>
        <span>${prefix}</span>
      </div>
      <div class="formula-solution">
        <div class="formula-type">${data.typeLabel || task.typeLabel}</div>
        <div class="formula-display" id="formula-display">
          ${data.formulaHTML}
        </div>
      </div>
    `;

    waitForKaTeX(() => {
      const el = $('#formula-display');
      if (el && window.renderMathInElement) {
        window.renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      }
    });

    nextArea.classList.remove('hidden');
    const isLast = currentIdx === tasks.length - 1;
    nextArea.innerHTML = `
      <button class="btn btn-primary" id="next-btn">${isLast ? 'Виж резултата' : 'Следваща задача \u2192'}</button>
    `;

    $('#next-btn').addEventListener('click', () => {
      if (isLast) {
        showScoreScreen();
      } else {
        currentIdx++;
        showTask();
      }
    });
  } catch (err) {
    // Re-enable on error so user can retry
    input.disabled = false;
    checkBtn.disabled = false;
    checkBtn.textContent = 'Провери';
    checkBtn.style.opacity = '1';
    showInputError(input, 'Грешка при проверка. Опитай отново.');
  }
}

function showScoreScreen() {
  const container = $('#tri-container');
  const total = tasks.length;
  const correctCount = results.filter(r => r.correct).length;
  const wrong = total - correctCount;
  const pct = Math.round((correctCount / total) * 100);

  let message;
  if (pct === 100) message = 'Перфектен резултат!';
  else if (pct >= 80) message = 'Отличен резултат!';
  else if (pct >= 60) message = 'Добър резултат!';
  else if (pct >= 40) message = 'Може и по-добре. Опитай пак!';
  else message = 'Повтори материала и опитай отново.';

  container.innerHTML = `
    <div class="score-screen animate-in">
      <div class="score-circle">
        <span class="score-number">${correctCount}</span>
        <span class="score-total">от ${total}</span>
      </div>
      <div class="score-message">${message}</div>
      <div class="score-detail">
        ${pct}% верни отговори<br>
        <span style="color: var(--color-success); font-weight: 800;">${correctCount} верни</span> &nbsp;/&nbsp;
        <span style="color: var(--color-error); font-weight: 800;">${wrong} грешни</span>
      </div>
      <div class="score-actions">
        <button class="btn btn-primary" id="retry-btn">Опитай отново</button>
        <button class="btn btn-outline" id="settings-btn">Промени избора</button>
      </div>
    </div>
  `;

  $('#retry-btn').addEventListener('click', startTest);
  $('#settings-btn').addEventListener('click', showSettingsScreen);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', showSettingsScreen);
