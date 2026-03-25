// ===== Triangle Areas =====

// --- Constants ---
const GRID_SIZE = 10;
const CELL_PX = 40;
const PAD_PX = 35;
const SVG_SIZE = GRID_SIZE * CELL_PX + 2 * PAD_PX;
const NS = 'http://www.w3.org/2000/svg';

// --- State ---
let config = { taskCount: 6, cmPerSquare: 1 };
let tasks = [];
let currentIdx = 0;
let score = 0;
let results = [];

// --- DOM Helpers ---
const $ = (sel) => document.querySelector(sel);

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

// Grid coord → SVG pixel (y flipped: 0=bottom, 10=top)
function px(gridX) { return PAD_PX + gridX * CELL_PX; }
function py(gridY) { return PAD_PX + (GRID_SIZE - gridY) * CELL_PX; }

// --- Random Helpers ---
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ensureOneEven(base, height, minB, maxB, minH, maxH) {
  if (config.cmPerSquare % 2 === 0) return [base, height];
  if (base % 2 === 0 || height % 2 === 0) return [base, height];
  // Make one of them even
  if (Math.random() < 0.5) {
    base = base < maxB ? base + 1 : base - 1;
  } else {
    height = height < maxH ? height + 1 : height - 1;
  }
  return [Math.max(minB, Math.min(maxB, base)), Math.max(minH, Math.min(maxH, height))];
}

// ===== Triangle Generators =====

function generateRightTriangle() {
  let base = randInt(2, 8);
  let height = randInt(2, 8);
  [base, height] = ensureOneEven(base, height, 2, 8, 2, 8);

  const atLeft = Math.random() < 0.5;
  const x0 = randInt(0, GRID_SIZE - base);
  const y0 = randInt(0, GRID_SIZE - height);

  const A = { x: x0, y: y0 };
  const B = { x: x0 + base, y: y0 };
  const C = atLeft
    ? { x: x0, y: y0 + height }
    : { x: x0 + base, y: y0 + height };

  return {
    type: 'right',
    typeBG: 'Правоъгълен',
    vertices: [A, B, C],
    base,
    height,
    baseStart: A,
    baseEnd: B,
    apex: C,
    heightFoot: atLeft ? { x: x0, y: y0 } : { x: x0 + base, y: y0 }
  };
}

function generateAcuteTriangle() {
  for (let attempt = 0; attempt < 200; attempt++) {
    let base = randInt(4, 8);
    let height = randInt(3, 8);

    // Apex offset from left base vertex (must be inside base)
    const apexDx = randInt(1, base - 1);
    const d1 = apexDx;
    const d2 = base - apexDx;

    // Acute condition: h² > d1 * d2
    if (height * height <= d1 * d2) continue;

    [base, height] = ensureOneEven(base, height, 4, 8, 3, 8);

    // Re-check with adjusted values
    const nd2 = base - Math.min(apexDx, base - 1);
    if (height * height <= apexDx * nd2) continue;

    const x0 = randInt(0, GRID_SIZE - base);
    const maxY0 = GRID_SIZE - height;
    if (maxY0 < 0) continue;
    const y0 = randInt(0, maxY0);

    const realApexDx = Math.min(apexDx, base - 1);

    return {
      type: 'acute',
      typeBG: 'Остроъгълен',
      vertices: [
        { x: x0, y: y0 },
        { x: x0 + base, y: y0 },
        { x: x0 + realApexDx, y: y0 + height }
      ],
      base,
      height,
      baseStart: { x: x0, y: y0 },
      baseEnd: { x: x0 + base, y: y0 },
      apex: { x: x0 + realApexDx, y: y0 + height },
      heightFoot: { x: x0 + realApexDx, y: y0 }
    };
  }

  // Fallback: centered isosceles-like, guaranteed acute
  let base = 6;
  let height = 6;
  [base, height] = ensureOneEven(base, height, 4, 8, 4, 8);
  const x0 = randInt(0, GRID_SIZE - base);
  const y0 = randInt(0, GRID_SIZE - height);
  const apexDx = Math.floor(base / 2);

  return {
    type: 'acute',
    typeBG: 'Остроъгълен',
    vertices: [
      { x: x0, y: y0 },
      { x: x0 + base, y: y0 },
      { x: x0 + apexDx, y: y0 + height }
    ],
    base,
    height,
    baseStart: { x: x0, y: y0 },
    baseEnd: { x: x0 + base, y: y0 },
    apex: { x: x0 + apexDx, y: y0 + height },
    heightFoot: { x: x0 + apexDx, y: y0 }
  };
}

function generateObtuseTriangle() {
  for (let attempt = 0; attempt < 200; attempt++) {
    let base = randInt(3, 7);
    let height = randInt(2, 6);
    const overhang = randInt(1, 3);
    const goLeft = Math.random() < 0.5;

    [base, height] = ensureOneEven(base, height, 3, 7, 2, 6);

    let x0min, x0max;
    if (goLeft) {
      x0min = overhang;
      x0max = GRID_SIZE - base;
    } else {
      x0min = 0;
      x0max = GRID_SIZE - base - overhang;
    }
    if (x0min > x0max) continue;

    const maxY0 = GRID_SIZE - height;
    if (maxY0 < 0) continue;

    const x0 = randInt(x0min, x0max);
    const y0 = randInt(0, maxY0);
    const apexX = goLeft ? x0 - overhang : x0 + base + overhang;

    return {
      type: 'obtuse',
      typeBG: 'Тъпоъгълен',
      vertices: [
        { x: x0, y: y0 },
        { x: x0 + base, y: y0 },
        { x: apexX, y: y0 + height }
      ],
      base,
      height,
      baseStart: { x: x0, y: y0 },
      baseEnd: { x: x0 + base, y: y0 },
      apex: { x: apexX, y: y0 + height },
      heightFoot: { x: apexX, y: y0 }
    };
  }

  // Fallback
  return {
    type: 'obtuse',
    typeBG: 'Тъпоъгълен',
    vertices: [
      { x: 3, y: 1 },
      { x: 8, y: 1 },
      { x: 1, y: 5 }
    ],
    base: 5,
    height: 4,
    baseStart: { x: 3, y: 1 },
    baseEnd: { x: 8, y: 1 },
    apex: { x: 1, y: 5 },
    heightFoot: { x: 1, y: 1 }
  };
}

// ===== Task Generation =====

function generateAllTasks(count) {
  const perType = Math.floor(count / 3);
  const remainder = count % 3;
  const types = ['right', 'acute', 'obtuse'];
  const generators = { right: generateRightTriangle, acute: generateAcuteTriangle, obtuse: generateObtuseTriangle };

  const allTasks = [];
  for (let t = 0; t < 3; t++) {
    const n = perType + (t < remainder ? 1 : 0);
    for (let i = 0; i < n; i++) {
      allTasks.push(generators[types[t]]());
    }
  }
  return shuffle(allTasks);
}

// ===== SVG Rendering =====

function renderGrid(svg) {
  const cm = config.cmPerSquare;

  // Background
  svg.appendChild(svgEl('rect', {
    x: 0, y: 0, width: SVG_SIZE, height: SVG_SIZE,
    fill: '#fafafa', rx: 8
  }));

  // Grid area background
  svg.appendChild(svgEl('rect', {
    x: px(0), y: py(GRID_SIZE), width: GRID_SIZE * CELL_PX, height: GRID_SIZE * CELL_PX,
    fill: '#fff', stroke: '#e0d6f0', 'stroke-width': 1
  }));

  // Grid lines
  for (let i = 0; i <= GRID_SIZE; i++) {
    svg.appendChild(svgEl('line', {
      x1: px(i), y1: py(0), x2: px(i), y2: py(GRID_SIZE),
      stroke: '#e0d6f0', 'stroke-width': i === 0 || i === GRID_SIZE ? 1.5 : 0.7
    }));
    svg.appendChild(svgEl('line', {
      x1: px(0), y1: py(i), x2: px(GRID_SIZE), y2: py(i),
      stroke: '#e0d6f0', 'stroke-width': i === 0 || i === GRID_SIZE ? 1.5 : 0.7
    }));
  }

  // Grid dots
  for (let x = 0; x <= GRID_SIZE; x++) {
    for (let y = 0; y <= GRID_SIZE; y++) {
      svg.appendChild(svgEl('circle', {
        cx: px(x), cy: py(y), r: 1.8,
        fill: '#c4b8db'
      }));
    }
  }

}

function renderTriangle(svg, task) {
  const [A, B, C] = task.vertices;

  // Triangle fill + border
  const points = `${px(A.x)},${py(A.y)} ${px(B.x)},${py(B.y)} ${px(C.x)},${py(C.y)}`;
  svg.appendChild(svgEl('polygon', {
    points,
    fill: 'rgba(124, 92, 191, 0.12)',
    stroke: '#7C5CBF',
    'stroke-width': 2.5,
    'stroke-linejoin': 'round'
  }));

  // Vertex dots and labels
  const labels = ['A', 'B', 'C'];
  const verts = [A, B, C];
  const triCenterX = (A.x + B.x + C.x) / 3;
  const triCenterY = (A.y + B.y + C.y) / 3;

  verts.forEach((v, i) => {
    svg.appendChild(svgEl('circle', {
      cx: px(v.x), cy: py(v.y), r: 5,
      fill: '#7C5CBF'
    }));

    // Label offset: push away from triangle center
    let dx = v.x - triCenterX;
    let dy = v.y - triCenterY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx = (dx / len) * 18;
    dy = (dy / len) * 18;

    const label = svgEl('text', {
      x: px(v.x) + dx,
      y: py(v.y) - dy + 5,
      'text-anchor': 'middle',
      'font-size': 14,
      'font-weight': 'bold',
      fill: '#5E3DA6',
      'font-family': 'Nunito, sans-serif'
    });
    label.textContent = labels[i];
    svg.appendChild(label);
  });
}

function renderSolution(svg, task) {
  const cm = config.cmPerSquare;
  const { baseStart: A, baseEnd: B, apex: C, heightFoot: H } = task;
  const baseCm = task.base * cm;
  const heightCm = task.height * cm;

  // --- Base line in red ---
  svg.appendChild(svgEl('line', {
    x1: px(A.x), y1: py(A.y),
    x2: px(B.x), y2: py(B.y),
    stroke: '#EF5350', 'stroke-width': 3.5, 'stroke-linecap': 'round'
  }));

  // Base label below
  const baseMidPx = (px(A.x) + px(B.x)) / 2;
  const baseLabelY = py(A.y) + 14;
  const bl = svgEl('text', {
    x: baseMidPx, y: baseLabelY,
    'text-anchor': 'middle', 'font-size': 13, 'font-weight': 'bold',
    fill: '#EF5350', 'font-family': 'Nunito, sans-serif'
  });
  bl.textContent = `a = ${baseCm} cm`;
  svg.appendChild(bl);

  // --- For obtuse: extend base line to foot (dashed) ---
  if (task.type === 'obtuse') {
    const extFrom = H.x < A.x ? H : B;
    const extTo = H.x < A.x ? A : B;
    // Draw from the nearer endpoint to H
    const nearX = H.x < A.x ? A.x : B.x;
    svg.appendChild(svgEl('line', {
      x1: px(H.x), y1: py(H.y),
      x2: px(nearX), y2: py(A.y),
      stroke: '#EF5350', 'stroke-width': 1.5, 'stroke-dasharray': '6,4',
      'stroke-linecap': 'round'
    }));
  }

  // --- Height line in red (dashed) ---
  svg.appendChild(svgEl('line', {
    x1: px(C.x), y1: py(C.y),
    x2: px(H.x), y2: py(H.y),
    stroke: '#EF5350', 'stroke-width': 2.5, 'stroke-dasharray': '8,5',
    'stroke-linecap': 'round'
  }));

  // Height foot dot
  svg.appendChild(svgEl('circle', {
    cx: px(H.x), cy: py(H.y), r: 3.5,
    fill: '#EF5350'
  }));

  // Height label to the side
  const hMidPy = (py(C.y) + py(H.y)) / 2;
  const hLabelX = px(C.x) < px(5) ? px(C.x) + 12 : px(C.x) - 12;
  const hAnchor = px(C.x) < px(5) ? 'start' : 'end';
  const hl = svgEl('text', {
    x: hLabelX, y: hMidPy + 4,
    'text-anchor': hAnchor, 'font-size': 13, 'font-weight': 'bold',
    fill: '#EF5350', 'font-family': 'Nunito, sans-serif'
  });
  hl.textContent = `h = ${heightCm} cm`;
  svg.appendChild(hl);

  // --- Right-angle marker at foot ---
  const mSize = 8;
  // Marker goes in the direction away from the apex along the base line
  const mDirX = H.x <= A.x ? 1 : (H.x >= B.x ? -1 : 1);
  const mx = px(H.x);
  const my = py(H.y);
  // Small square: from foot, go along base, then go toward apex
  svg.appendChild(svgEl('path', {
    d: `M${mx},${my - mSize} L${mx + mSize * mDirX},${my - mSize} L${mx + mSize * mDirX},${my}`,
    fill: 'none', stroke: '#EF5350', 'stroke-width': 1.5
  }));
}

// ===== Screens =====

function showSettingsScreen() {
  const container = $('#tri-container');
  container.innerHTML = `
    <div class="tri-settings animate-in">
      <p>Намери лицето на триъгълниците, начертани в квадратна мрежа</p>

      <div class="settings-form">
        <div class="setting-group">
          <label for="task-count">Брой задачи:</label>
          <input type="number" id="task-count" min="1" max="99" value="6" inputmode="numeric">
        </div>

        <div class="setting-group">
          <label for="cm-per-square">Страна на квадратче (cm):</label>
          <input type="number" id="cm-per-square" min="1" max="20" value="1" inputmode="numeric">
        </div>
      </div>

      <button class="btn btn-primary" id="start-btn">Започни</button>
    </div>
  `;

  $('#start-btn').addEventListener('click', () => {
    const count = parseInt($('#task-count').value);
    const cm = parseInt($('#cm-per-square').value);
    if (!count || count < 1) { $('#task-count').style.borderColor = 'var(--color-error)'; return; }
    if (!cm || cm < 1) { $('#cm-per-square').style.borderColor = 'var(--color-error)'; return; }
    config.taskCount = count;
    config.cmPerSquare = cm;
    startTest();
  });
}

function startTest() {
  tasks = generateAllTasks(config.taskCount);
  currentIdx = 0;
  score = 0;
  results = [];
  showTask();
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
      <div class="grid-label">1 квадратче = ${config.cmPerSquare} cm</div>
      <div class="grid-container">
        <svg id="grid-svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" preserveAspectRatio="xMidYMid meet"></svg>
      </div>

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

  const svg = $('#grid-svg');
  renderGrid(svg);
  renderTriangle(svg, task);

  const input = $('#area-input');
  const checkBtn = $('#check-btn');

  checkBtn.addEventListener('click', () => checkAnswer(task));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkAnswer(task);
  });

  setTimeout(() => input.focus(), 150);
}

function checkAnswer(task) {
  const input = $('#area-input');
  const checkBtn = $('#check-btn');
  const solutionArea = $('#solution-area');
  const nextArea = $('#next-area');

  if (input.disabled) return;

  // Parse answer (accept comma and period)
  const raw = input.value.trim().replace(',', '.');
  const userAnswer = parseFloat(raw);

  if (isNaN(userAnswer) || raw === '') {
    input.style.borderColor = 'var(--color-error)';
    input.focus();
    return;
  }

  const cm = config.cmPerSquare;
  const baseCm = task.base * cm;
  const heightCm = task.height * cm;
  const correctArea = (baseCm * heightCm) / 2;

  const correct = Math.abs(userAnswer - correctArea) < 0.01;

  // Disable input
  input.disabled = true;
  checkBtn.disabled = true;
  checkBtn.style.opacity = '0.5';

  if (correct) {
    input.classList.add('correct');
    score++;
  } else {
    input.classList.add('incorrect');
  }

  results.push(correct);

  // Update score display
  const scoreEl = document.querySelector('.tri-score');
  if (scoreEl) scoreEl.textContent = `${score} \u2713`;

  // Render solution on grid
  const svg = $('#grid-svg');
  renderSolution(svg, task);

  // Show formula
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
      <div class="formula-type">${task.typeBG} триъгълник</div>
      <div class="formula-display" id="formula-display">
        $$S = \\frac{a \\cdot h_a}{2} = \\frac{${baseCm} \\cdot ${heightCm}}{2} = \\frac{${baseCm * heightCm}}{2} = ${formatBG(correctArea)} \\text{ cm}^2$$
      </div>
    </div>
  `;

  // Render KaTeX in solution
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

  // Show next button
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
}

function showScoreScreen() {
  const container = $('#tri-container');
  const total = tasks.length;
  const wrong = total - score;
  const pct = Math.round((score / total) * 100);

  let message;
  if (pct === 100) message = 'Перфектен резултат!';
  else if (pct >= 80) message = 'Отличен резултат!';
  else if (pct >= 60) message = 'Добър резултат!';
  else if (pct >= 40) message = 'Може и по-добре. Опитай пак!';
  else message = 'Повтори материала и опитай отново.';

  // Per-type breakdown
  const typeResults = {
    right: { correct: 0, total: 0 },
    acute: { correct: 0, total: 0 },
    obtuse: { correct: 0, total: 0 }
  };
  tasks.forEach((t, i) => {
    typeResults[t.type].total++;
    if (results[i]) typeResults[t.type].correct++;
  });

  const typeNames = { right: 'Правоъгълен', acute: 'Остроъгълен', obtuse: 'Тъпоъгълен' };

  let breakdownHTML = '';
  for (const [type, data] of Object.entries(typeResults)) {
    if (data.total === 0) continue;
    const icon = data.correct === data.total ? '\u2713' : (data.correct > 0 ? '~' : '\u2717');
    const color = data.correct === data.total
      ? 'var(--color-success)'
      : (data.correct > 0 ? 'var(--color-accent)' : 'var(--color-error)');
    breakdownHTML += `
      <div class="breakdown-item">
        <span>${typeNames[type]}</span>
        <span><span style="color: ${color}; font-weight: 800;">${icon}</span> ${data.correct}/${data.total}</span>
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
      <div class="score-detail">
        ${pct}% верни отговори<br>
        <span style="color: var(--color-success); font-weight: 800;">${score} верни</span> &nbsp;/&nbsp;
        <span style="color: var(--color-error); font-weight: 800;">${wrong} грешни</span>
      </div>
      <div class="score-actions">
        <button class="btn btn-primary" id="retry-btn">Опитай отново</button>
        <button class="btn btn-outline" id="settings-btn">Нови настройки</button>
      </div>
      <div class="score-breakdown">
        <h4>Резултати по вид триъгълник</h4>
        ${breakdownHTML}
      </div>
    </div>
  `;

  $('#retry-btn').addEventListener('click', startTest);
  $('#settings-btn').addEventListener('click', showSettingsScreen);
}

// ===== Utilities =====

function formatBG(num) {
  const str = String(num);
  return str.replace('.', ',');
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

// ===== Init =====
document.addEventListener('DOMContentLoaded', showSettingsScreen);
