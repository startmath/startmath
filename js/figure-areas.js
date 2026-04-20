// ===== Figure Areas =====

// --- Constants ---
const GRID_SIZE = 10;
const CELL_PX = 40;
const PAD_PX = 35;
const SVG_SIZE = GRID_SIZE * CELL_PX + 2 * PAD_PX;
const NS = 'http://www.w3.org/2000/svg';

// --- State ---
let config = { figureType: 'triangle', taskCount: 6, cmPerSquare: 1 };
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

// Sets the text content of an SVG <text> element, rendering any "_x" sequence
// in the input as a proper <tspan> subscript. Accepts either a plain string
// like "h_a = 5 cm" or a bare string with no underscore.
function setLabelText(el, text) {
  while (el.firstChild) el.removeChild(el.firstChild);
  const m = /^(.*?)_([a-zA-Zа-яА-Я0-9])(.*)$/.exec(text);
  if (!m) {
    el.textContent = text;
    return;
  }
  const [, before, sub, after] = m;
  const t1 = document.createElementNS(NS, 'tspan');
  t1.textContent = before;
  el.appendChild(t1);

  const t2 = document.createElementNS(NS, 'tspan');
  t2.setAttribute('font-size', '75%');
  t2.setAttribute('dy', '3');
  t2.textContent = sub;
  el.appendChild(t2);

  const t3 = document.createElementNS(NS, 'tspan');
  t3.setAttribute('dy', '-3');
  t3.textContent = after;
  el.appendChild(t3);
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
  if (base % 2 === 0 || height % 2 === 0) return [base, height];
  if (Math.random() < 0.5) {
    base = base < maxB ? base + 1 : base - 1;
  } else {
    height = height < maxH ? height + 1 : height - 1;
  }
  return [Math.max(minB, Math.min(maxB, base)), Math.max(minH, Math.min(maxH, height))];
}

// For non-right triangles the height letter is derived from the apex's CCW
// vertex label. Triangle vertices are labeled A, B, C in CCW order, so the
// side opposite vertex X is side x. A height drawn from vertex X lands on
// side x, hence the label h_x.
function triangleBaseLetter(task) {
  if (!task.apex || !Array.isArray(task.vertices)) return 'a';
  const idx = task.vertices.findIndex(v => v.x === task.apex.x && v.y === task.apex.y);
  return ['a', 'b', 'c'][idx >= 0 ? idx : 0];
}

// Strict numeric input check. Accepts optional minus, digits, and at most one
// decimal separator (dot). The caller pre-normalizes comma to dot.
function isValidAnswerInput(raw) {
  if (!raw) return false;
  return /^\d+(\.\d+)?$/.test(raw);
}

function showInputError(input, message) {
  input.style.borderColor = 'var(--color-error)';
  // Reuse or create an inline error element next to the answer section
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
    figure: 'triangle',
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

    const apexDx = randInt(1, base - 1);
    const d1 = apexDx;
    const d2 = base - apexDx;

    if (height * height <= d1 * d2) continue;

    [base, height] = ensureOneEven(base, height, 4, 8, 3, 8);

    const nd2 = base - Math.min(apexDx, base - 1);
    if (height * height <= apexDx * nd2) continue;

    const x0 = randInt(0, GRID_SIZE - base);
    const maxY0 = GRID_SIZE - height;
    if (maxY0 < 0) continue;
    const y0 = randInt(0, maxY0);

    const realApexDx = Math.min(apexDx, base - 1);

    return {
      figure: 'triangle',
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
    figure: 'triangle',
    type: 'acute',
    typeBG: 'Остроъгълен',
    baseLabel: pickBaseLabel(),
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
      figure: 'triangle',
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

  return {
    figure: 'triangle',
    type: 'obtuse',
    typeBG: 'Тъпоъгълен',
    baseLabel: pickBaseLabel(),
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

// ===== Parallelogram Generator =====

function generateParallelogram() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const base = randInt(3, 7);
    const height = randInt(2, 6);
    const offMag = randInt(1, 3);
    const offSign = Math.random() < 0.5 ? -1 : 1;
    const off = offMag * offSign;

    const xMin = Math.min(0, off);
    const xMax = Math.max(base, base + off);
    const x0min = -xMin;
    const x0max = GRID_SIZE - xMax;
    if (x0min > x0max) continue;

    const x0 = randInt(x0min, x0max);
    const y0 = randInt(0, GRID_SIZE - height);

    const A = { x: x0, y: y0 };
    const B = { x: x0 + base, y: y0 };
    const C = { x: x0 + base + off, y: y0 + height };
    const D = { x: x0 + off, y: y0 + height };

    // Height dropped from top vertex whose foot lands inside segment AB
    let heightTop, heightFoot;
    if (off >= 0) {
      heightTop = D;
      heightFoot = { x: x0 + off, y: y0 };
    } else {
      heightTop = C;
      heightFoot = { x: x0 + base + off, y: y0 };
    }

    return {
      figure: 'parallelogram',
      vertices: [A, B, C, D],
      base,
      height,
      baseStart: A,
      baseEnd: B,
      heightTop,
      heightFoot
    };
  }

  // Fallback
  return {
    figure: 'parallelogram',
    vertices: [
      { x: 1, y: 1 }, { x: 6, y: 1 }, { x: 8, y: 5 }, { x: 3, y: 5 }
    ],
    base: 5,
    height: 4,
    baseStart: { x: 1, y: 1 },
    baseEnd: { x: 6, y: 1 },
    heightTop: { x: 3, y: 5 },
    heightFoot: { x: 3, y: 1 }
  };
}

// Rhombus: parallelogram whose slant side equals the base length.
// Uses 3-4-5 Pythagorean triples so the side equals 5 exactly.
function generateRhombus() {
  const variants = [
    { base: 5, off: 3, height: 4 },
    { base: 5, off: -3, height: 4 },
    { base: 5, off: 4, height: 3 },
    { base: 5, off: -4, height: 3 }
  ];
  const { base, off, height } = variants[Math.floor(Math.random() * variants.length)];

  const xMin = Math.min(0, off);
  const xMax = Math.max(base, base + off);
  const x0 = randInt(-xMin, GRID_SIZE - xMax);
  const y0 = randInt(0, GRID_SIZE - height);

  const A = { x: x0, y: y0 };
  const B = { x: x0 + base, y: y0 };
  const C = { x: x0 + base + off, y: y0 + height };
  const D = { x: x0 + off, y: y0 + height };

  let heightTop, heightFoot;
  if (off >= 0) {
    heightTop = D;
    heightFoot = { x: x0 + off, y: y0 };
  } else {
    heightTop = C;
    heightFoot = { x: x0 + base + off, y: y0 };
  }

  return {
    figure: 'parallelogram',
    isRhombus: true,
    vertices: [A, B, C, D],
    base,
    height,
    baseStart: A,
    baseEnd: B,
    heightTop,
    heightFoot
  };
}

// ===== Non-grid (frame) Generators =====

// Canonical non-grid triangle: v1=(0,y1) on left side, v2=(x2,0) on bottom side,
// v3=(w,h) at TR corner of its bbox. All three edges are slanted (no axis-aligned sides).
// Bbox has 3 right-triangle cut-offs at BL, BR, TL corners.
function generateTriangleNonGrid() {
  const w = randInt(3, 6);
  const h = randInt(3, 6);
  const y1 = randInt(1, h - 1);
  const x2 = randInt(1, w - 1);
  const x0 = randInt(0, GRID_SIZE - w);
  const y0 = randInt(0, GRID_SIZE - h);

  return {
    figure: 'triangle',
    nonGrid: true,
    vertices: [
      { x: x0, y: y0 + y1 },
      { x: x0 + x2, y: y0 },
      { x: x0 + w, y: y0 + h }
    ]
  };
}

// Non-grid parallelogram: u=(a,b), v=(-c,d) — all four vertices lie on distinct
// bbox sides (none at bbox corners). Bbox has 4 right-triangle cut-offs, 2 of
// area a*b/2 and 2 of area c*d/2.
function generateParallelogramNonGrid() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = randInt(1, 3);
    const b = randInt(1, 3);
    const c = randInt(1, 3);
    const d = randInt(1, 3);
    const bboxW = a + c;
    const bboxH = b + d;
    if (bboxW < 3 || bboxH < 3) continue;
    if (bboxW > GRID_SIZE || bboxH > GRID_SIZE) continue;

    const x0 = randInt(0, GRID_SIZE - bboxW);
    const y0 = randInt(0, GRID_SIZE - bboxH);

    return {
      figure: 'parallelogram',
      nonGrid: true,
      vertices: [
        { x: x0 + c, y: y0 },             // bottom side
        { x: x0 + a + c, y: y0 + b },     // right side
        { x: x0 + a, y: y0 + b + d },     // top side
        { x: x0, y: y0 + d }              // left side
      ]
    };
  }
  return {
    figure: 'parallelogram',
    nonGrid: true,
    vertices: [
      { x: 2, y: 1 }, { x: 5, y: 3 }, { x: 4, y: 6 }, { x: 1, y: 4 }
    ]
  };
}

// ===== Trapezoid Generator =====

function generateTrapezoid() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const a = randInt(4, 8);
    const b = randInt(2, a - 1);
    const h = randInt(2, 6);

    // Need (a+b)*h even so the area is a clean number
    if (((a + b) * h) % 2 !== 0) continue;

    const diff = a - b;
    let leftOffset;
    const r = Math.random();
    if (r < 0.3) {
      leftOffset = 0;
    } else if (r < 0.5) {
      leftOffset = diff;
    } else if (r < 0.75 && diff % 2 === 0) {
      leftOffset = diff / 2;
    } else if (diff >= 2) {
      leftOffset = randInt(1, diff - 1);
    } else {
      leftOffset = 0;
    }

    const maxX0 = GRID_SIZE - a;
    const maxY0 = GRID_SIZE - h;
    if (maxX0 < 0 || maxY0 < 0) continue;
    const x0 = randInt(0, maxX0);
    const y0 = randInt(0, maxY0);

    const rightOffset = diff - leftOffset;
    const A = { x: x0, y: y0 };
    const B = { x: x0 + a, y: y0 };
    const C = { x: x0 + a - rightOffset, y: y0 + h };
    const D = { x: x0 + leftOffset, y: y0 + h };

    let heightTop, heightFoot, heightOnSide;
    if (leftOffset === 0) {
      heightTop = D;
      heightFoot = A;
      heightOnSide = true;
    } else if (rightOffset === 0) {
      heightTop = C;
      heightFoot = B;
      heightOnSide = true;
    } else {
      heightTop = D;
      heightFoot = { x: x0 + leftOffset, y: y0 };
      heightOnSide = false;
    }

    return {
      figure: 'trapezoid',
      vertices: [A, B, C, D],
      baseA: a,
      baseB: b,
      height: h,
      bottomStart: A,
      bottomEnd: B,
      topStart: D,
      topEnd: C,
      heightTop,
      heightFoot,
      heightOnSide
    };
  }

  // Fallback: simple right trapezoid
  return {
    figure: 'trapezoid',
    vertices: [
      { x: 1, y: 1 }, { x: 7, y: 1 }, { x: 5, y: 5 }, { x: 1, y: 5 }
    ],
    baseA: 6, baseB: 4, height: 4,
    bottomStart: { x: 1, y: 1 },
    bottomEnd: { x: 7, y: 1 },
    topStart: { x: 1, y: 5 },
    topEnd: { x: 5, y: 5 },
    heightTop: { x: 1, y: 5 },
    heightFoot: { x: 1, y: 1 },
    heightOnSide: true
  };
}

// Non-grid pentagon: rectangle with one corner cut off by a slanted line,
// yielding 5 vertices (4 original, +1 cut pair, −1 removed corner). The frame
// decomposition reports 1 right-triangle cut-off piece at the cut corner.
function generateFramedPentagon() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w = randInt(5, 8);
    const h = randInt(5, 8);
    const legH = randInt(1, Math.min(3, w - 2));
    const legV = randInt(1, Math.min(3, h - 2));
    if (legH < 1 || legV < 1) continue;
    const x0 = randInt(0, GRID_SIZE - w);
    const y0 = randInt(0, GRID_SIZE - h);

    const TL = { x: x0, y: y0 + h };
    const TR = { x: x0 + w, y: y0 + h };
    const BR = { x: x0 + w, y: y0 };
    const BL = { x: x0, y: y0 };

    const corner = Math.floor(Math.random() * 4);
    let vertices;
    if (corner === 0) {
      // BL cut
      const onLeft = { x: x0, y: y0 + legV };
      const onBot = { x: x0 + legH, y: y0 };
      vertices = [TL, TR, BR, onBot, onLeft];
    } else if (corner === 1) {
      // BR cut
      const onBot = { x: x0 + w - legH, y: y0 };
      const onRight = { x: x0 + w, y: y0 + legV };
      vertices = [TL, TR, onRight, onBot, BL];
    } else if (corner === 2) {
      // TR cut
      const onRight = { x: x0 + w, y: y0 + h - legV };
      const onTop = { x: x0 + w - legH, y: y0 + h };
      vertices = [TL, onTop, onRight, BR, BL];
    } else {
      // TL cut
      const onTop = { x: x0 + legH, y: y0 + h };
      const onLeft = { x: x0, y: y0 + h - legV };
      vertices = [onLeft, onTop, TR, BR, BL];
    }

    return {
      figure: 'mixed',
      template: 'framedPentagon',
      nonGrid: true,
      vertices
    };
  }
  return null;
}

// Non-grid hexagon: rectangle with two opposite corners cut off.
function generateFramedHexagon() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w = randInt(6, 8);
    const h = randInt(6, 8);
    const legH1 = randInt(1, 2);
    const legV1 = randInt(1, 2);
    const legH2 = randInt(1, 2);
    const legV2 = randInt(1, 2);
    if (legH1 + legH2 > w - 2) continue;
    if (legV1 + legV2 > h - 2) continue;
    const x0 = randInt(0, GRID_SIZE - w);
    const y0 = randInt(0, GRID_SIZE - h);

    // Cut TR and BL (opposite corners)
    const TL = { x: x0, y: y0 + h };
    const onTop = { x: x0 + w - legH1, y: y0 + h };
    const onRight = { x: x0 + w, y: y0 + h - legV1 };
    const BR = { x: x0 + w, y: y0 };
    const onBot = { x: x0 + legH2, y: y0 };
    const onLeft = { x: x0, y: y0 + legV2 };

    return {
      figure: 'mixed',
      template: 'framedHexagon',
      nonGrid: true,
      vertices: [TL, onTop, onRight, BR, onBot, onLeft]
    };
  }
  return null;
}

// ===== Mixed / Compound Generators =====
// Each template returns a task with:
//   vertices:     outer polygon (without the internal shared edge)
//   subParts:     [{ label, dims, formulaType, area }] — sub-figure breakdown
//   sharedEdges:  array of [p1, p2] segments to reveal in the solution
//   subCentroids: centroid points of each sub-part (for on-grid labels)
//   totalArea:    sum of sub-part areas (in grid squares, pre-cm)
// sub-areas are computed in grid squares; cm scaling is applied at formula time.
//
// Every template runs its vertex list through simplifyPolygon so that collinear
// triples (which would render as a "hint" vertex dot mid-edge, giving away the
// decomposition) are stripped before the task is shown.

function simplifyPolygon(verts) {
  const n = verts.length;
  if (n < 3) return verts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n];
    const curr = verts[i];
    const next = verts[(i + 1) % n];
    const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    if (cross !== 0) out.push(curr);
  }
  return out;
}

function finalizeMixed(task) {
  if (!task) return null;
  const simplified = simplifyPolygon(task.vertices);
  if (simplified.length < 4) return null;
  if (simplified.length < task.vertices.length - 1) return null;
  // Reject if simplification reduced the shape to ≤ 4 vertices — that means
  // the compound collapsed into something that looks like a standard simple
  // figure (trapezoid, parallelogram, rectangle).
  if (simplified.length <= 4 && simplified.length < task.vertices.length) return null;
  task.vertices = simplified;
  return task;
}

function generateHouse() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w = randInt(3, 6);
    const h1 = randInt(2, 4);
    const h2 = randInt(2, 4);
    if (h1 + h2 > GRID_SIZE) continue;
    if ((w * h2) % 2 !== 0) continue;

    const x0 = randInt(0, GRID_SIZE - w);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);
    const apexX = x0 + Math.floor(w / 2);

    return {
      figure: 'mixed',
      template: 'house',
      vertices: [
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h1 },
        { x: apexX, y: y0 + h1 + h2 },
        { x: x0, y: y0 + h1 }
      ],
      subParts: [
        { label: 'Правоъгълник', dims: [w, h1], formulaType: 'rect', area: w * h1 },
        { label: 'Триъгълник', dims: [w, h2], formulaType: 'tri', area: (w * h2) / 2 }
      ],
      sharedEdges: [[
        { x: x0, y: y0 + h1 }, { x: x0 + w, y: y0 + h1 }
      ]],
      subCentroids: [
        { x: x0 + w / 2, y: y0 + h1 / 2 },
        { x: x0 + w / 2, y: y0 + h1 + h2 / 3 }
      ],
      totalArea: w * h1 + (w * h2) / 2
    };
  }
  return null;
}

function generateRectTrapezoid() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w = randInt(4, 6);
    const h1 = randInt(2, 3);
    const h2 = randInt(2, 3);
    const b = randInt(2, w - 1);
    if (h1 + h2 > GRID_SIZE) continue;
    if (((w + b) * h2) % 2 !== 0) continue;

    const diff = w - b;
    const leftOffset = Math.floor(diff / 2);
    const rightOffset = diff - leftOffset;

    const x0 = randInt(0, GRID_SIZE - w);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);

    return {
      figure: 'mixed',
      template: 'rectTrap',
      vertices: [
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h1 },
        { x: x0 + w - rightOffset, y: y0 + h1 + h2 },
        { x: x0 + leftOffset, y: y0 + h1 + h2 },
        { x: x0, y: y0 + h1 }
      ],
      subParts: [
        { label: 'Правоъгълник', dims: [w, h1], formulaType: 'rect', area: w * h1 },
        { label: 'Трапец', dims: [w, b, h2], formulaType: 'trap', area: (w + b) * h2 / 2 }
      ],
      sharedEdges: [[
        { x: x0, y: y0 + h1 }, { x: x0 + w, y: y0 + h1 }
      ]],
      subCentroids: [
        { x: x0 + w / 2, y: y0 + h1 / 2 },
        { x: x0 + w / 2, y: y0 + h1 + h2 / 2 }
      ],
      totalArea: w * h1 + (w + b) * h2 / 2
    };
  }
  return null;
}

// Trapezoid on the bottom + triangle on top (triangle base = trapezoid top).
// The shared edge is horizontal between the trapezoid's top and the triangle's
// bottom; removed from the outer polygon so the student can't see the seam.
function generateTrapezoidTriangle() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = randInt(4, 7);
    const b = randInt(2, a - 2);
    const h1 = randInt(2, 3);
    const h2 = randInt(2, 4);
    if (h1 + h2 > GRID_SIZE) continue;
    if (((a + b) * h1) % 2 !== 0) continue;
    if ((b * h2) % 2 !== 0) continue;
    // need b even so the apex lands on a lattice point
    if (b % 2 !== 0) continue;

    const diff = a - b;
    const leftOff = Math.floor(diff / 2);
    const rightOff = diff - leftOff;
    if (leftOff === 0 || rightOff === 0) continue;

    const x0 = randInt(0, GRID_SIZE - a);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);
    const apexX = x0 + leftOff + b / 2;

    return {
      figure: 'mixed',
      template: 'trapTriangle',
      vertices: [
        { x: x0, y: y0 },                             // A: trap BL
        { x: x0 + a, y: y0 },                         // B: trap BR
        { x: x0 + a - rightOff, y: y0 + h1 },         // C: trap TR / tri base R
        { x: apexX, y: y0 + h1 + h2 },                // D: apex
        { x: x0 + leftOff, y: y0 + h1 }               // E: trap TL / tri base L
      ],
      subParts: [
        { label: 'Трапец', dims: [a, b, h1], formulaType: 'trap', area: (a + b) * h1 / 2 },
        { label: 'Триъгълник', dims: [b, h2], formulaType: 'tri', area: (b * h2) / 2 }
      ],
      sharedEdges: [[
        { x: x0 + leftOff, y: y0 + h1 },
        { x: x0 + a - rightOff, y: y0 + h1 }
      ]],
      subCentroids: [
        { x: x0 + a / 2, y: y0 + h1 / 2 },
        { x: apexX, y: y0 + h1 + h2 / 3 }
      ],
      totalArea: (a + b) * h1 / 2 + (b * h2) / 2
    };
  }
  return null;
}

function generateRectTriangleSide() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const wR = randInt(3, 5);
    const hR = randInt(3, 5);
    const wT = randInt(2, 4);
    if (wR + wT > GRID_SIZE) continue;
    if ((wT * hR) % 2 !== 0) continue;

    const x0 = randInt(0, GRID_SIZE - wR - wT);
    const y0 = randInt(0, GRID_SIZE - hR);
    const apexOnTop = Math.random() < 0.5;
    const apexY = apexOnTop ? y0 + hR : y0;

    return {
      figure: 'mixed',
      template: 'rectTriSide',
      vertices: apexOnTop ? [
        { x: x0, y: y0 },
        { x: x0 + wR, y: y0 },
        { x: x0 + wR + wT, y: y0 + hR },
        { x: x0 + wR, y: y0 + hR },
        { x: x0, y: y0 + hR }
      ] : [
        { x: x0, y: y0 },
        { x: x0 + wR, y: y0 },
        { x: x0 + wR + wT, y: y0 },
        { x: x0 + wR, y: y0 + hR },
        { x: x0, y: y0 + hR }
      ],
      subParts: [
        { label: 'Правоъгълник', dims: [wR, hR], formulaType: 'rect', area: wR * hR },
        { label: 'Триъгълник', dims: [hR, wT], formulaType: 'tri', area: (wT * hR) / 2 }
      ],
      sharedEdges: [[
        { x: x0 + wR, y: y0 }, { x: x0 + wR, y: y0 + hR }
      ]],
      subCentroids: [
        { x: x0 + wR / 2, y: y0 + hR / 2 },
        { x: x0 + wR + wT / 3, y: apexOnTop ? y0 + hR - hR / 3 : y0 + hR / 3 }
      ],
      totalArea: wR * hR + (wT * hR) / 2
    };
  }
  return null;
}

// Parallelogram on the bottom + isoceles triangle on top. Triangle base
// matches the parallelogram's top edge. Yields 5 outer vertices.
function generateParaTriangle() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(4, 6);
    const h1 = randInt(2, 3);
    const h2 = randInt(2, 4);
    const offMag = randInt(1, 2);
    const offSign = Math.random() < 0.5 ? -1 : 1;
    const off = offMag * offSign;
    if ((base * h2) % 2 !== 0) continue;
    if (base % 2 !== 0) continue; // so apex lands on a lattice point
    if (h1 + h2 > GRID_SIZE) continue;

    const xMin = Math.min(0, off);
    const xMax = Math.max(base, base + off);
    const x0min = -xMin;
    const x0max = GRID_SIZE - xMax;
    if (x0min > x0max) continue;
    const x0 = randInt(x0min, x0max);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);

    const apexX = x0 + off + base / 2;

    return {
      figure: 'mixed',
      template: 'paraTriangle',
      vertices: [
        { x: apexX, y: y0 + h1 + h2 },            // apex
        { x: x0 + base + off, y: y0 + h1 },       // para TR
        { x: x0 + base, y: y0 },                  // para BR
        { x: x0, y: y0 },                         // para BL
        { x: x0 + off, y: y0 + h1 }               // para TL
      ],
      subParts: [
        { label: 'Успоредник', dims: [base, h1], formulaType: 'para', area: base * h1 },
        { label: 'Триъгълник', dims: [base, h2], formulaType: 'tri', area: (base * h2) / 2 }
      ],
      sharedEdges: [[
        { x: x0 + off, y: y0 + h1 },
        { x: x0 + base + off, y: y0 + h1 }
      ]],
      subCentroids: [
        { x: x0 + base / 2 + off / 2, y: y0 + h1 / 2 },
        { x: apexX, y: y0 + h1 + h2 / 3 }
      ],
      totalArea: base * h1 + (base * h2) / 2
    };
  }
  return null;
}

// Three-part compound: trapezoid bottom + rectangle middle + triangle top.
// All three parts share the same top/bottom width `b` so they stack neatly.
// Yields 7 outer vertices.
function generateTower() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = randInt(5, 7);
    const b = randInt(2, a - 2);
    const h1 = randInt(1, 2);
    const h2 = randInt(1, 3);
    const h3 = randInt(2, 3);
    if (h1 + h2 + h3 > GRID_SIZE) continue;
    if (((a + b) * h1) % 2 !== 0) continue;
    if ((b * h3) % 2 !== 0) continue;
    if (b % 2 !== 0) continue;

    const diff = a - b;
    const leftOff = Math.floor(diff / 2);
    const rightOff = diff - leftOff;
    if (leftOff === 0 || rightOff === 0) continue;

    const x0 = randInt(0, GRID_SIZE - a);
    const y0 = randInt(0, GRID_SIZE - h1 - h2 - h3);
    const apexX = x0 + leftOff + b / 2;

    return {
      figure: 'mixed',
      template: 'tower',
      vertices: [
        { x: apexX, y: y0 + h1 + h2 + h3 },             // apex
        { x: x0 + a - rightOff, y: y0 + h1 + h2 },      // rect TR
        { x: x0 + a - rightOff, y: y0 + h1 },           // trap TR / rect BR
        { x: x0 + a, y: y0 },                           // trap BR
        { x: x0, y: y0 },                               // trap BL
        { x: x0 + leftOff, y: y0 + h1 },                // trap TL / rect BL
        { x: x0 + leftOff, y: y0 + h1 + h2 }            // rect TL
      ],
      subParts: [
        { label: 'Трапец', dims: [a, b, h1], formulaType: 'trap', area: (a + b) * h1 / 2 },
        { label: 'Правоъгълник', dims: [b, h2], formulaType: 'rect', area: b * h2 },
        { label: 'Триъгълник', dims: [b, h3], formulaType: 'tri', area: (b * h3) / 2 }
      ],
      sharedEdges: [
        [{ x: x0 + leftOff, y: y0 + h1 }, { x: x0 + a - rightOff, y: y0 + h1 }],
        [{ x: x0 + leftOff, y: y0 + h1 + h2 }, { x: x0 + a - rightOff, y: y0 + h1 + h2 }]
      ],
      subCentroids: [
        { x: x0 + a / 2, y: y0 + h1 / 2 },
        { x: x0 + leftOff + b / 2, y: y0 + h1 + h2 / 2 },
        { x: apexX, y: y0 + h1 + h2 + h3 / 3 }
      ],
      totalArea: (a + b) * h1 / 2 + b * h2 + (b * h3) / 2
    };
  }
  return null;
}

// Rectangle + obtuse triangle leaning outside the rectangle's horizontal
// extent. The triangle's base coincides with the rectangle's top edge, but
// its apex hangs past one of the top corners, giving a clearly concave shape.
function generateRectObtuseTriangle() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w = randInt(3, 5);
    const h1 = randInt(2, 3);
    const h2 = randInt(3, 4);
    const overhang = randInt(2, 3);
    const goLeft = Math.random() < 0.5;
    if ((w * h2) % 2 !== 0) continue;
    if (h1 + h2 > GRID_SIZE) continue;
    const bboxW = w + overhang;
    if (bboxW > GRID_SIZE) continue;

    const x0min = goLeft ? overhang : 0;
    const x0max = goLeft ? GRID_SIZE - w : GRID_SIZE - w - overhang;
    if (x0min > x0max) continue;
    const x0 = randInt(x0min, x0max);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);
    const apexX = goLeft ? x0 - overhang : x0 + w + overhang;

    return {
      figure: 'mixed',
      template: 'rectObtuseTriangle',
      vertices: [
        { x: x0, y: y0 },                     // rect BL
        { x: x0 + w, y: y0 },                 // rect BR
        { x: x0 + w, y: y0 + h1 },            // rect TR
        { x: apexX, y: y0 + h1 + h2 },        // obtuse apex (off to one side)
        { x: x0, y: y0 + h1 }                 // rect TL
      ],
      subParts: [
        { label: 'Правоъгълник', dims: [w, h1], formulaType: 'rect', area: w * h1 },
        { label: 'Тъпоъгълен триъгълник', dims: [w, h2], formulaType: 'tri', area: (w * h2) / 2 }
      ],
      sharedEdges: [[
        { x: x0, y: y0 + h1 }, { x: x0 + w, y: y0 + h1 }
      ]],
      subCentroids: [
        { x: x0 + w / 2, y: y0 + h1 / 2 },
        { x: (x0 + x0 + w + apexX) / 3, y: y0 + h1 + h2 / 3 }
      ],
      totalArea: w * h1 + (w * h2) / 2
    };
  }
  return null;
}

// Trapezoid on top + rectangle on bottom (inverse of rectTrap).
function generateTrapRect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w = randInt(4, 6);       // rect width = trap longer base
    const h1 = randInt(2, 3);      // rect height
    const h2 = randInt(2, 3);      // trap height
    const b = randInt(2, w - 1);   // trap shorter base
    if (h1 + h2 > GRID_SIZE) continue;
    if (((w + b) * h2) % 2 !== 0) continue;

    const diff = w - b;
    const leftOff = Math.floor(diff / 2);
    const rightOff = diff - leftOff;

    const x0 = randInt(0, GRID_SIZE - w);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);

    return {
      figure: 'mixed', template: 'trapRect',
      vertices: [
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h1 },
        { x: x0 + w - rightOff, y: y0 + h1 + h2 },
        { x: x0 + leftOff, y: y0 + h1 + h2 },
        { x: x0, y: y0 + h1 }
      ],
      subParts: [
        { label: 'Правоъгълник', dims: [w, h1], formulaType: 'rect', area: w * h1 },
        { label: 'Трапец', dims: [w, b, h2], formulaType: 'trap', area: (w + b) * h2 / 2 }
      ],
      sharedEdges: [[{ x: x0, y: y0 + h1 }, { x: x0 + w, y: y0 + h1 }]],
      subCentroids: [
        { x: x0 + w / 2, y: y0 + h1 / 2 },
        { x: x0 + w / 2, y: y0 + h1 + h2 / 2 }
      ],
      totalArea: w * h1 + (w + b) * h2 / 2
    };
  }
  return null;
}

// Parallelogram on top + rectangle on bottom.
function generateParaRect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(3, 5);
    const h1 = randInt(2, 3);       // rect height
    const h2 = randInt(2, 3);       // para height
    const off = (Math.random() < 0.5 ? 1 : -1) * randInt(1, 2);
    if (h1 + h2 > GRID_SIZE) continue;

    const xMin = Math.min(0, off);
    const xMax = Math.max(base, base + off);
    const x0min = -xMin;
    const x0max = GRID_SIZE - xMax;
    if (x0min > x0max) continue;
    const x0 = randInt(x0min, x0max);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);

    return {
      figure: 'mixed', template: 'paraRect',
      vertices: [
        { x: x0, y: y0 },
        { x: x0 + base, y: y0 },
        { x: x0 + base, y: y0 + h1 },
        { x: x0 + base + off, y: y0 + h1 + h2 },
        { x: x0 + off, y: y0 + h1 + h2 },
        { x: x0, y: y0 + h1 }
      ],
      subParts: [
        { label: 'Правоъгълник', dims: [base, h1], formulaType: 'rect', area: base * h1 },
        { label: 'Успоредник', dims: [base, h2], formulaType: 'para', area: base * h2 }
      ],
      sharedEdges: [[{ x: x0, y: y0 + h1 }, { x: x0 + base, y: y0 + h1 }]],
      subCentroids: [
        { x: x0 + base / 2, y: y0 + h1 / 2 },
        { x: x0 + base / 2 + off / 2, y: y0 + h1 + h2 / 2 }
      ],
      totalArea: base * h1 + base * h2
    };
  }
  return null;
}

// Two triangles sharing a common base (creates a diamond/kite shape).
function generateDoubleTriangle() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(3, 6);
    const h1 = randInt(2, 4);   // bottom triangle height
    const h2 = randInt(2, 4);   // top triangle height
    if (h1 + h2 > GRID_SIZE) continue;
    if ((base * h1) % 2 !== 0 || (base * h2) % 2 !== 0) continue;
    if (base % 2 !== 0) continue; // apex on lattice

    const x0 = randInt(0, GRID_SIZE - base);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);
    const midX = x0 + base / 2;

    return {
      figure: 'mixed', template: 'doubleTriangle',
      vertices: [
        { x: midX, y: y0 },                       // bottom apex
        { x: x0 + base, y: y0 + h1 },             // right of shared base
        { x: midX, y: y0 + h1 + h2 },             // top apex
        { x: x0, y: y0 + h1 }                     // left of shared base
      ],
      subParts: [
        { label: 'Триъгълник ①', dims: [base, h1], formulaType: 'tri', area: (base * h1) / 2 },
        { label: 'Триъгълник ②', dims: [base, h2], formulaType: 'tri', area: (base * h2) / 2 }
      ],
      sharedEdges: [[{ x: x0, y: y0 + h1 }, { x: x0 + base, y: y0 + h1 }]],
      subCentroids: [
        { x: midX, y: y0 + h1 / 3 },
        { x: midX, y: y0 + h1 + h2 / 3 }
      ],
      totalArea: (base * h1) / 2 + (base * h2) / 2
    };
  }
  return null;
}

// Rectangle with triangles on left and right sides (hexagonal arrow).
function generateRectTriBoth() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const wR = randInt(2, 4);     // rect width
    const hR = randInt(3, 5);     // rect & triangle height
    const wL = randInt(1, 3);     // left triangle protrusion
    const wRt = randInt(1, 3);    // right triangle protrusion
    if (wL + wR + wRt > GRID_SIZE) continue;
    if ((wL * hR) % 2 !== 0 || (wRt * hR) % 2 !== 0) continue;
    if (hR % 2 !== 0) continue;   // apex at mid-height on lattice

    const x0 = randInt(wL, GRID_SIZE - wR - wRt);
    const y0 = randInt(0, GRID_SIZE - hR);
    const midY = y0 + hR / 2;

    return {
      figure: 'mixed', template: 'rectTriBoth',
      vertices: [
        { x: x0, y: y0 },
        { x: x0 + wR, y: y0 },
        { x: x0 + wR + wRt, y: midY },
        { x: x0 + wR, y: y0 + hR },
        { x: x0, y: y0 + hR },
        { x: x0 - wL, y: midY }
      ],
      subParts: [
        { label: 'Правоъгълник', dims: [wR, hR], formulaType: 'rect', area: wR * hR },
        { label: 'Триъгълник (ляв)', dims: [hR, wL], formulaType: 'tri', area: (wL * hR) / 2 },
        { label: 'Триъгълник (десен)', dims: [hR, wRt], formulaType: 'tri', area: (wRt * hR) / 2 }
      ],
      sharedEdges: [
        [{ x: x0, y: y0 }, { x: x0, y: y0 + hR }],
        [{ x: x0 + wR, y: y0 }, { x: x0 + wR, y: y0 + hR }]
      ],
      subCentroids: [
        { x: x0 + wR / 2, y: y0 + hR / 2 },
        { x: x0 - wL / 3, y: midY },
        { x: x0 + wR + wRt / 3, y: midY }
      ],
      totalArea: wR * hR + (wL * hR) / 2 + (wRt * hR) / 2
    };
  }
  return null;
}

// Two trapezoids stacked: wider bases touching, narrower ends outward.
function generateTrapTrap() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = randInt(4, 7);       // shared (wider) base
    const b1 = randInt(2, a - 1); // top trap shorter base
    const b2 = randInt(2, a - 1); // bottom trap shorter base
    const h1 = randInt(2, 3);
    const h2 = randInt(2, 3);
    if (h1 + h2 > GRID_SIZE) continue;
    if (((a + b1) * h1) % 2 !== 0 || ((a + b2) * h2) % 2 !== 0) continue;

    const d1 = a - b1;
    const l1 = Math.floor(d1 / 2), r1 = d1 - l1;
    const d2 = a - b2;
    const l2 = Math.floor(d2 / 2), r2 = d2 - l2;

    const x0 = randInt(0, GRID_SIZE - a);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);

    return {
      figure: 'mixed', template: 'trapTrap',
      vertices: [
        { x: x0 + l2, y: y0 },
        { x: x0 + a - r2, y: y0 },
        { x: x0 + a, y: y0 + h2 },
        { x: x0 + a - r1, y: y0 + h2 + h1 },
        { x: x0 + l1, y: y0 + h2 + h1 },
        { x: x0, y: y0 + h2 }
      ],
      subParts: [
        { label: 'Трапец ①', dims: [a, b2, h2], formulaType: 'trap', area: (a + b2) * h2 / 2 },
        { label: 'Трапец ②', dims: [a, b1, h1], formulaType: 'trap', area: (a + b1) * h1 / 2 }
      ],
      sharedEdges: [[{ x: x0, y: y0 + h2 }, { x: x0 + a, y: y0 + h2 }]],
      subCentroids: [
        { x: x0 + a / 2, y: y0 + h2 / 2 },
        { x: x0 + a / 2, y: y0 + h2 + h1 / 2 }
      ],
      totalArea: (a + b2) * h2 / 2 + (a + b1) * h1 / 2
    };
  }
  return null;
}

// Parallelogram on bottom + trapezoid on top.
function generateParaTrap() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(4, 6);
    const h1 = randInt(2, 3);      // para height
    const h2 = randInt(2, 3);      // trap height
    const offMag = randInt(1, 2);
    const off = (Math.random() < 0.5 ? 1 : -1) * offMag;
    const b = randInt(2, base - 1); // trap shorter base
    if (h1 + h2 > GRID_SIZE) continue;
    if (((base + b) * h2) % 2 !== 0) continue;

    const diff = base - b;
    const lOff = Math.floor(diff / 2), rOff = diff - lOff;

    const xMin = Math.min(0, off);
    const xMax = Math.max(base, base + off);
    const x0min = -xMin;
    const x0max = GRID_SIZE - xMax;
    if (x0min > x0max) continue;
    const x0 = randInt(x0min, x0max);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);

    return {
      figure: 'mixed', template: 'paraTrap',
      vertices: [
        { x: x0, y: y0 },
        { x: x0 + base, y: y0 },
        { x: x0 + base + off, y: y0 + h1 },
        { x: x0 + base + off - rOff, y: y0 + h1 + h2 },
        { x: x0 + off + lOff, y: y0 + h1 + h2 },
        { x: x0 + off, y: y0 + h1 }
      ],
      subParts: [
        { label: 'Успоредник', dims: [base, h1], formulaType: 'para', area: base * h1 },
        { label: 'Трапец', dims: [base, b, h2], formulaType: 'trap', area: (base + b) * h2 / 2 }
      ],
      sharedEdges: [[{ x: x0 + off, y: y0 + h1 }, { x: x0 + base + off, y: y0 + h1 }]],
      subCentroids: [
        { x: x0 + base / 2 + off / 2, y: y0 + h1 / 2 },
        { x: x0 + off + base / 2, y: y0 + h1 + h2 / 2 }
      ],
      totalArea: base * h1 + (base + b) * h2 / 2
    };
  }
  return null;
}

// Two rectangles of different widths stacked (step/L shape). The wider one
// is on the bottom, aligned to one side, creating an L-step silhouette.
function generateStepShape() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w1 = randInt(4, 7);    // bottom (wider)
    const w2 = randInt(2, w1 - 1); // top (narrower)
    const h1 = randInt(2, 3);
    const h2 = randInt(2, 3);
    if (h1 + h2 > GRID_SIZE || w1 > GRID_SIZE) continue;

    const alignLeft = Math.random() < 0.5;
    const x0 = randInt(0, GRID_SIZE - w1);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);

    const verts = alignLeft ? [
      { x: x0, y: y0 },
      { x: x0 + w1, y: y0 },
      { x: x0 + w1, y: y0 + h1 },
      { x: x0 + w2, y: y0 + h1 },
      { x: x0 + w2, y: y0 + h1 + h2 },
      { x: x0, y: y0 + h1 + h2 }
    ] : [
      { x: x0, y: y0 },
      { x: x0 + w1, y: y0 },
      { x: x0 + w1, y: y0 + h1 + h2 },
      { x: x0 + w1 - w2, y: y0 + h1 + h2 },
      { x: x0 + w1 - w2, y: y0 + h1 },
      { x: x0, y: y0 + h1 }
    ];

    return {
      figure: 'mixed', template: 'stepShape',
      vertices: verts,
      subParts: [
        { label: 'Правоъгълник ①', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: 'Правоъгълник ②', dims: [w2, h2], formulaType: 'rect', area: w2 * h2 }
      ],
      sharedEdges: alignLeft
        ? [[{ x: x0, y: y0 + h1 }, { x: x0 + w2, y: y0 + h1 }]]
        : [[{ x: x0 + w1 - w2, y: y0 + h1 }, { x: x0 + w1, y: y0 + h1 }]],
      subCentroids: alignLeft
        ? [{ x: x0 + w1 / 2, y: y0 + h1 / 2 }, { x: x0 + w2 / 2, y: y0 + h1 + h2 / 2 }]
        : [{ x: x0 + w1 / 2, y: y0 + h1 / 2 }, { x: x0 + w1 - w2 / 2, y: y0 + h1 + h2 / 2 }],
      totalArea: w1 * h1 + w2 * h2
    };
  }
  return null;
}

// Triangle at bottom + trapezoid in middle + triangle at top (3-part symmetric).
function generateTriTrapTri() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = randInt(4, 7);       // trapezoid longer base
    const b = randInt(2, a - 2);   // trapezoid shorter base
    const h1 = randInt(2, 3);      // bottom triangle
    const h2 = randInt(1, 3);      // trapezoid
    const h3 = randInt(2, 3);      // top triangle
    if (h1 + h2 + h3 > GRID_SIZE) continue;
    if ((a * h1) % 2 !== 0 || ((a + b) * h2) % 2 !== 0 || (b * h3) % 2 !== 0) continue;
    if (a % 2 !== 0 || b % 2 !== 0) continue;

    const diff = a - b;
    const lOff = Math.floor(diff / 2), rOff = diff - lOff;
    if (lOff === 0 || rOff === 0) continue;

    const x0 = randInt(0, GRID_SIZE - a);
    const y0 = randInt(0, GRID_SIZE - h1 - h2 - h3);
    const botApex = x0 + a / 2;
    const topApex = x0 + lOff + b / 2;

    return {
      figure: 'mixed', template: 'triTrapTri',
      vertices: [
        { x: botApex, y: y0 },                         // bottom apex
        { x: x0 + a, y: y0 + h1 },                     // trap BR
        { x: x0 + a - rOff, y: y0 + h1 + h2 },         // trap TR
        { x: topApex, y: y0 + h1 + h2 + h3 },           // top apex
        { x: x0 + lOff, y: y0 + h1 + h2 },              // trap TL
        { x: x0, y: y0 + h1 }                           // trap BL
      ],
      subParts: [
        { label: 'Триъгълник ①', dims: [a, h1], formulaType: 'tri', area: (a * h1) / 2 },
        { label: 'Трапец', dims: [a, b, h2], formulaType: 'trap', area: (a + b) * h2 / 2 },
        { label: 'Триъгълник ②', dims: [b, h3], formulaType: 'tri', area: (b * h3) / 2 }
      ],
      sharedEdges: [
        [{ x: x0, y: y0 + h1 }, { x: x0 + a, y: y0 + h1 }],
        [{ x: x0 + lOff, y: y0 + h1 + h2 }, { x: x0 + a - rOff, y: y0 + h1 + h2 }]
      ],
      subCentroids: [
        { x: botApex, y: y0 + h1 / 3 },
        { x: x0 + a / 2, y: y0 + h1 + h2 / 2 },
        { x: topApex, y: y0 + h1 + h2 + h3 / 3 }
      ],
      totalArea: (a * h1) / 2 + (a + b) * h2 / 2 + (b * h3) / 2
    };
  }
  return null;
}

// ===== Subtraction (outer − inner) Generators =====
// Each returns a task with `subtraction: true`, `innerVertices`, and two
// `subParts` where totalArea = subParts[0].area − subParts[1].area.
// The inner figure may share a side/partial side with the outer figure.

// Helper: check that inner polygon is strictly inside outer polygon.
// Uses ray-casting for each inner vertex against the outer polygon.
function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function allInnerInsideOuter(inner, outer) {
  // Every inner vertex must be inside or on the boundary of the outer polygon.
  // For lattice figures sharing edges this is guaranteed by construction, but
  // a quick centroid check catches obvious failures after transforms.
  const cx = inner.reduce((s, v) => s + v.x, 0) / inner.length;
  const cy = inner.reduce((s, v) => s + v.y, 0) / inner.length;
  return pointInPolygon({ x: cx, y: cy }, outer);
}

// Rectangle with a smaller rectangle removed. Inner can be anywhere inside,
// at a corner, or along an edge — placement is random.
function generateRectMinusRect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w1 = randInt(4, 7), h1 = randInt(4, 7);
    const w2 = randInt(1, w1 - 2), h2 = randInt(1, h1 - 2);
    if (w1 > GRID_SIZE || h1 > GRID_SIZE) continue;

    const x0 = randInt(0, GRID_SIZE - w1);
    const y0 = randInt(0, GRID_SIZE - h1);
    // Random inner offset within the outer rect
    const ix = x0 + randInt(0, w1 - w2);
    const iy = y0 + randInt(0, h1 - h2);
    const outerV = [
      { x: x0, y: y0 }, { x: x0 + w1, y: y0 },
      { x: x0 + w1, y: y0 + h1 }, { x: x0, y: y0 + h1 }
    ];
    const innerV = [
      { x: ix, y: iy }, { x: ix + w2, y: iy },
      { x: ix + w2, y: iy + h2 }, { x: ix, y: iy + h2 }
    ];
    return {
      figure: 'mixed', template: 'rectMinusRect', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: 'Правоъгълник (външен)', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: 'Правоъгълник (вътрешен)', dims: [w2, h2], formulaType: 'rect', area: w2 * h2 }
      ],
      subCentroids: [
        { x: x0 + w1 / 2, y: y0 + h1 / 2 },
        { x: ix + w2 / 2, y: iy + h2 / 2 }
      ],
      totalArea: w1 * h1 - w2 * h2
    };
  }
  return null;
}

// Rectangle with a triangle removed. Triangle can be anywhere inside,
// or touching/sharing a side.
function generateRectMinusTri() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w1 = randInt(4, 7), h1 = randInt(4, 7);
    if (w1 > GRID_SIZE || h1 > GRID_SIZE) continue;
    const tBase = randInt(2, w1);
    const tHeight = randInt(2, h1 - 1);
    if ((tBase * tHeight) % 2 !== 0) continue;
    if (tBase % 2 !== 0) continue;

    const x0 = randInt(0, GRID_SIZE - w1);
    const y0 = randInt(0, GRID_SIZE - h1);
    // Random horizontal offset for the triangle base within the rect
    const tX = x0 + randInt(0, w1 - tBase);
    const tY = y0 + randInt(0, h1 - tHeight);
    const apexX = tX + tBase / 2;

    const outerV = [
      { x: x0, y: y0 }, { x: x0 + w1, y: y0 },
      { x: x0 + w1, y: y0 + h1 }, { x: x0, y: y0 + h1 }
    ];
    const innerV = [
      { x: tX, y: tY }, { x: tX + tBase, y: tY },
      { x: apexX, y: tY + tHeight }
    ];
    return {
      figure: 'mixed', template: 'rectMinusTri', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: 'Правоъгълник', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: 'Триъгълник', dims: [tBase, tHeight], formulaType: 'tri', area: (tBase * tHeight) / 2 }
      ],
      subCentroids: [
        { x: x0 + w1 / 2, y: y0 + h1 / 2 },
        { x: (tX + tX + tBase + apexX) / 3, y: (tY + tY + tY + tHeight) / 3 }
      ],
      totalArea: w1 * h1 - (tBase * tHeight) / 2
    };
  }
  return null;
}

// Triangle with a smaller triangle removed. Inner can share a side or float
// freely inside. We use the `pointInPolygon` check to verify containment.
function generateTriMinusTri() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base1 = randInt(4, 8), h1 = randInt(4, 7);
    if (base1 > GRID_SIZE || h1 > GRID_SIZE) continue;
    if (base1 % 2 !== 0 || (base1 * h1) % 2 !== 0) continue;

    const base2 = randInt(2, base1 - 1);
    const h2 = randInt(2, h1 - 1);
    if (base2 % 2 !== 0 || (base2 * h2) % 2 !== 0) continue;

    const x0 = randInt(0, GRID_SIZE - base1);
    const y0 = randInt(0, GRID_SIZE - h1);
    const apex1X = x0 + base1 / 2;

    // Random offset for inner triangle: base can start anywhere along the
    // outer base, or float up. Check all 3 inner vertices are inside outer.
    const maxTX = x0 + base1 - base2;
    const tX = randInt(x0, maxTX);
    const maxTY = y0 + h1 - h2;
    const tY = randInt(y0, maxTY);
    const apex2X = tX + base2 / 2;

    const outerV = [
      { x: x0, y: y0 }, { x: x0 + base1, y: y0 },
      { x: apex1X, y: y0 + h1 }
    ];
    const innerV = [
      { x: tX, y: tY }, { x: tX + base2, y: tY },
      { x: apex2X, y: tY + h2 }
    ];
    // Verify all inner vertices are inside the outer triangle
    const allInside = innerV.every(v => {
      // Check via barycentric / edge equations for the outer triangle
      // At height y, the outer triangle spans from leftEdge to rightEdge
      const dy = v.y - y0;
      if (dy < 0 || dy > h1) return false;
      const leftEdge = x0 + (apex1X - x0) * dy / h1;
      const rightEdge = x0 + base1 - (x0 + base1 - apex1X) * dy / h1;
      return v.x >= leftEdge - 0.001 && v.x <= rightEdge + 0.001;
    });
    if (!allInside) continue;

    return {
      figure: 'mixed', template: 'triMinusTri', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: 'Триъгълник (външен)', dims: [base1, h1], formulaType: 'tri', area: (base1 * h1) / 2 },
        { label: 'Триъгълник (вътрешен)', dims: [base2, h2], formulaType: 'tri', area: (base2 * h2) / 2 }
      ],
      subCentroids: [
        { x: apex1X, y: y0 + h1 / 3 },
        { x: apex2X, y: tY + h2 / 3 }
      ],
      totalArea: (base1 * h1) / 2 - (base2 * h2) / 2
    };
  }
  return null;
}

// Rectangle with a parallelogram removed. Para floats freely inside the rect.
function generateRectMinusPara() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w1 = randInt(5, 7), h1 = randInt(4, 7);
    if (w1 > GRID_SIZE || h1 > GRID_SIZE) continue;
    const pBase = randInt(2, w1 - 1);
    const pH = randInt(2, h1 - 1);
    const pOff = randInt(1, 2) * (Math.random() < 0.5 ? 1 : -1);
    // Para bounding box width
    const pBBoxW = Math.max(pBase, pBase + pOff) - Math.min(0, pOff);
    if (pBBoxW > w1 || pH > h1) continue;

    const x0 = randInt(0, GRID_SIZE - w1);
    const y0 = randInt(0, GRID_SIZE - h1);
    // Random offset within the rect for the para's bounding box
    const pBL = Math.min(0, pOff); // para leftmost relative coord
    const dxMax = w1 - pBBoxW;
    const dyMax = h1 - pH;
    const dx = randInt(0, dxMax);
    const dy = randInt(0, dyMax);
    const pX = x0 + dx - pBL; // bottom-left of para base

    const outerV = [
      { x: x0, y: y0 }, { x: x0 + w1, y: y0 },
      { x: x0 + w1, y: y0 + h1 }, { x: x0, y: y0 + h1 }
    ];
    const innerV = [
      { x: pX, y: y0 + dy }, { x: pX + pBase, y: y0 + dy },
      { x: pX + pBase + pOff, y: y0 + dy + pH }, { x: pX + pOff, y: y0 + dy + pH }
    ];
    // Quick bounds check: all inner vertices in outer rect
    const ok = innerV.every(v => v.x >= x0 && v.x <= x0 + w1 && v.y >= y0 && v.y <= y0 + h1);
    if (!ok) continue;

    return {
      figure: 'mixed', template: 'rectMinusPara', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: 'Правоъгълник', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: 'Успоредник', dims: [pBase, pH], formulaType: 'para', area: pBase * pH }
      ],
      subCentroids: [
        { x: x0 + w1 / 2, y: y0 + h1 / 2 },
        { x: pX + pBase / 2 + pOff / 2, y: y0 + dy + pH / 2 }
      ],
      totalArea: w1 * h1 - pBase * pH
    };
  }
  return null;
}

// Rectangle with a trapezoid removed. Trap floats freely inside the rect.
function generateRectMinusTrap() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w1 = randInt(5, 8), h1 = randInt(4, 7);
    if (w1 > GRID_SIZE || h1 > GRID_SIZE) continue;
    const a = randInt(3, w1 - 1);    // trap longer base
    const b = randInt(2, a - 1);      // trap shorter base
    const tH = randInt(2, h1 - 1);
    if (((a + b) * tH) % 2 !== 0) continue;
    const diff = a - b;
    const lOff = Math.floor(diff / 2);
    const rOff = diff - lOff;
    if (lOff === 0 || rOff === 0) continue;
    if (a > w1 || tH > h1) continue;

    const x0 = randInt(0, GRID_SIZE - w1);
    const y0 = randInt(0, GRID_SIZE - h1);
    const tx = x0 + randInt(0, w1 - a);
    const ty = y0 + randInt(0, h1 - tH);
    const outerV = [
      { x: x0, y: y0 }, { x: x0 + w1, y: y0 },
      { x: x0 + w1, y: y0 + h1 }, { x: x0, y: y0 + h1 }
    ];
    const innerV = [
      { x: tx, y: ty }, { x: tx + a, y: ty },
      { x: tx + a - rOff, y: ty + tH }, { x: tx + lOff, y: ty + tH }
    ];
    // Verify inner fits in outer rect
    const ok = innerV.every(v => v.x >= x0 && v.x <= x0 + w1 && v.y >= y0 && v.y <= y0 + h1);
    if (!ok) continue;

    return {
      figure: 'mixed', template: 'rectMinusTrap', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: 'Правоъгълник', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: 'Трапец', dims: [a, b, tH], formulaType: 'trap', area: (a + b) * tH / 2 }
      ],
      subCentroids: [
        { x: x0 + w1 / 2, y: y0 + h1 / 2 },
        { x: tx + a / 2, y: ty + tH / 2 }
      ],
      totalArea: w1 * h1 - (a + b) * tH / 2
    };
  }
  return null;
}

// Parallelogram with a triangle removed. Triangle placed randomly inside;
// `pointInPolygon` verifies containment.
function generateParaMinusTri() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(4, 6), pH = randInt(3, 5);
    const off = randInt(1, 2) * (Math.random() < 0.5 ? 1 : -1);
    if (base > GRID_SIZE || pH > GRID_SIZE) continue;
    const xMin = Math.min(0, off);
    const xMax = Math.max(base, base + off);
    const x0min = -xMin;
    const x0max = GRID_SIZE - xMax;
    if (x0min > x0max) continue;

    const tBase = randInt(2, base - 1);
    const tH = randInt(2, pH - 1);
    if ((tBase * tH) % 2 !== 0 || tBase % 2 !== 0) continue;

    const x0 = randInt(x0min, x0max);
    const y0 = randInt(0, GRID_SIZE - pH);
    const outerV = [
      { x: x0, y: y0 }, { x: x0 + base, y: y0 },
      { x: x0 + base + off, y: y0 + pH }, { x: x0 + off, y: y0 + pH }
    ];

    // At height dy within the para, the left edge is at x0 + off*dy/pH
    // and the right edge is at x0 + base + off*dy/pH. Width is always `base`.
    // Random dy for inner triangle base, then random x within that row.
    const dy = randInt(0, pH - tH);
    const rowLeft = x0 + Math.ceil(off * dy / pH);
    const rowRight = x0 + base + Math.floor(off * dy / pH);
    const rowWidth = rowRight - rowLeft;
    if (tBase > rowWidth) continue;
    const tX = randInt(rowLeft, rowRight - tBase);
    const tY = y0 + dy;
    const apexDy = dy + tH;
    const apexRowLeft = x0 + Math.ceil(off * apexDy / pH);
    const apexRowRight = x0 + base + Math.floor(off * apexDy / pH);
    const apexX = tX + tBase / 2;
    if (apexX < apexRowLeft || apexX > apexRowRight) continue;

    const innerV = [
      { x: tX, y: tY }, { x: tX + tBase, y: tY },
      { x: apexX, y: tY + tH }
    ];
    // Full containment check
    const ok = innerV.every(v => pointInPolygon(v, outerV) ||
      outerV.some(ov => ov.x === v.x && ov.y === v.y));
    if (!ok) continue;

    return {
      figure: 'mixed', template: 'paraMinusTri', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: 'Успоредник', dims: [base, pH], formulaType: 'para', area: base * pH },
        { label: 'Триъгълник', dims: [tBase, tH], formulaType: 'tri', area: (tBase * tH) / 2 }
      ],
      subCentroids: [
        { x: x0 + base / 2 + off / 2, y: y0 + pH / 2 },
        { x: (tX + tX + tBase + apexX) / 3, y: (tY * 2 + tY + tH) / 3 }
      ],
      totalArea: base * pH - (tBase * tH) / 2
    };
  }
  return null;
}

// Trapezoid with a triangle removed. Triangle placed randomly inside.
function generateTrapMinusTri() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = randInt(5, 8), b = randInt(2, a - 2);
    const tH = randInt(3, 6);
    if (a > GRID_SIZE || tH > GRID_SIZE) continue;
    if (((a + b) * tH) % 2 !== 0) continue;
    const diff = a - b;
    const lOff = Math.floor(diff / 2), rOff = diff - lOff;
    if (lOff === 0 || rOff === 0) continue;

    const triBase = randInt(2, a - 1);
    const triH = randInt(2, tH - 1);
    if ((triBase * triH) % 2 !== 0 || triBase % 2 !== 0) continue;

    const x0 = randInt(0, GRID_SIZE - a);
    const y0 = randInt(0, GRID_SIZE - tH);
    const outerV = [
      { x: x0, y: y0 }, { x: x0 + a, y: y0 },
      { x: x0 + a - rOff, y: y0 + tH }, { x: x0 + lOff, y: y0 + tH }
    ];

    // At height dy, the trap spans from x0+lOff*dy/tH to x0+a-rOff*dy/tH
    const dy = randInt(0, tH - triH);
    const rowLeft = Math.ceil(x0 + lOff * dy / tH);
    const rowRight = Math.floor(x0 + a - rOff * dy / tH);
    if (triBase > rowRight - rowLeft) continue;
    const tX = randInt(rowLeft, rowRight - triBase);
    const tY = y0 + dy;
    const apexX = tX + triBase / 2;
    // Check apex row
    const apexDy = dy + triH;
    const apexLeft = Math.ceil(x0 + lOff * apexDy / tH);
    const apexRight = Math.floor(x0 + a - rOff * apexDy / tH);
    if (apexX < apexLeft || apexX > apexRight) continue;

    const innerV = [
      { x: tX, y: tY }, { x: tX + triBase, y: tY },
      { x: apexX, y: tY + triH }
    ];
    return {
      figure: 'mixed', template: 'trapMinusTri', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: 'Трапец', dims: [a, b, tH], formulaType: 'trap', area: (a + b) * tH / 2 },
        { label: 'Триъгълник', dims: [triBase, triH], formulaType: 'tri', area: (triBase * triH) / 2 }
      ],
      subCentroids: [
        { x: x0 + a / 2, y: y0 + tH / 2 },
        { x: apexX, y: tY + triH / 3 }
      ],
      totalArea: (a + b) * tH / 2 - (triBase * triH) / 2
    };
  }
  return null;
}

// Triangle with a rectangle removed. Rect placed randomly inside the triangle.
function generateTriMinusRect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(4, 8), h = randInt(4, 7);
    if (base > GRID_SIZE || h > GRID_SIZE) continue;
    if (base % 2 !== 0 || (base * h) % 2 !== 0) continue;
    const rW = randInt(2, base - 1), rH = randInt(1, h - 2);

    const x0 = randInt(0, GRID_SIZE - base);
    const y0 = randInt(0, GRID_SIZE - h);
    const apexX = x0 + base / 2;

    // Random vertical offset for the rect within the triangle
    const dy = randInt(0, h - rH);
    // At height dy, the triangle spans from leftEdge to rightEdge
    const leftAtDy = x0 + (apexX - x0) * dy / h;
    const rightAtDy = x0 + base - (x0 + base - apexX) * dy / h;
    // At height dy+rH
    const leftAtDyRH = x0 + (apexX - x0) * (dy + rH) / h;
    const rightAtDyRH = x0 + base - (x0 + base - apexX) * (dy + rH) / h;
    // The rect must fit within the narrower of the two horizontal slices
    const minLeft = Math.ceil(Math.max(leftAtDy, leftAtDyRH));
    const maxRight = Math.floor(Math.min(rightAtDy, rightAtDyRH));
    if (rW > maxRight - minLeft) continue;
    const rX = randInt(minLeft, maxRight - rW);
    const rY = y0 + dy;

    const outerV = [
      { x: x0, y: y0 }, { x: x0 + base, y: y0 },
      { x: apexX, y: y0 + h }
    ];
    const innerV = [
      { x: rX, y: rY }, { x: rX + rW, y: rY },
      { x: rX + rW, y: rY + rH }, { x: rX, y: rY + rH }
    ];
    return {
      figure: 'mixed', template: 'triMinusRect', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: 'Триъгълник', dims: [base, h], formulaType: 'tri', area: (base * h) / 2 },
        { label: 'Правоъгълник', dims: [rW, rH], formulaType: 'rect', area: rW * rH }
      ],
      subCentroids: [
        { x: apexX, y: y0 + h / 3 },
        { x: rX + rW / 2, y: rY + rH / 2 }
      ],
      totalArea: (base * h) / 2 - rW * rH
    };
  }
  return null;
}

// Trapezoid with a rectangle removed. Rect placed randomly inside.
function generateTrapMinusRect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = randInt(5, 8), b = randInt(2, a - 2);
    const tH = randInt(3, 6);
    if (a > GRID_SIZE || tH > GRID_SIZE) continue;
    if (((a + b) * tH) % 2 !== 0) continue;
    const diff = a - b;
    const lOff = Math.floor(diff / 2), rOff = diff - lOff;
    if (lOff === 0 || rOff === 0) continue;

    const rW = randInt(2, a - 1), rH = randInt(1, tH - 1);

    const x0 = randInt(0, GRID_SIZE - a);
    const y0 = randInt(0, GRID_SIZE - tH);

    // Random vertical offset for the rect
    const dy = randInt(0, tH - rH);
    const leftAtDy = Math.ceil(x0 + lOff * dy / tH);
    const rightAtDy = Math.floor(x0 + a - rOff * dy / tH);
    const leftAtDyRH = Math.ceil(x0 + lOff * (dy + rH) / tH);
    const rightAtDyRH = Math.floor(x0 + a - rOff * (dy + rH) / tH);
    const minLeft = Math.max(leftAtDy, leftAtDyRH);
    const maxRight = Math.min(rightAtDy, rightAtDyRH);
    if (rW > maxRight - minLeft) continue;
    const rX = randInt(minLeft, maxRight - rW);
    const rY = y0 + dy;

    const outerV = [
      { x: x0, y: y0 }, { x: x0 + a, y: y0 },
      { x: x0 + a - rOff, y: y0 + tH }, { x: x0 + lOff, y: y0 + tH }
    ];
    const innerV = [
      { x: rX, y: rY }, { x: rX + rW, y: rY },
      { x: rX + rW, y: rY + rH }, { x: rX, y: rY + rH }
    ];
    return {
      figure: 'mixed', template: 'trapMinusRect', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: 'Трапец', dims: [a, b, tH], formulaType: 'trap', area: (a + b) * tH / 2 },
        { label: 'Правоъгълник', dims: [rW, rH], formulaType: 'rect', area: rW * rH }
      ],
      subCentroids: [
        { x: x0 + a / 2, y: y0 + tH / 2 },
        { x: rX + rW / 2, y: rY + rH / 2 }
      ],
      totalArea: (a + b) * tH / 2 - rW * rH
    };
  }
  return null;
}

// Parallelogram with a rectangle removed. Rect placed randomly inside.
function generateParaMinusRect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(4, 6), pH = randInt(3, 5);
    const off = randInt(1, 2) * (Math.random() < 0.5 ? 1 : -1);
    if (base > GRID_SIZE || pH > GRID_SIZE) continue;
    const xMin = Math.min(0, off);
    const xMax = Math.max(base, base + off);
    const x0min = -xMin;
    const x0max = GRID_SIZE - xMax;
    if (x0min > x0max) continue;

    const rW = randInt(2, base - 1), rH = randInt(1, pH - 1);

    const x0 = randInt(x0min, x0max);
    const y0 = randInt(0, GRID_SIZE - pH);
    const outerV = [
      { x: x0, y: y0 }, { x: x0 + base, y: y0 },
      { x: x0 + base + off, y: y0 + pH }, { x: x0 + off, y: y0 + pH }
    ];

    // At height dy, the para left edge is at x0 + off*dy/pH, width = base.
    const dy = randInt(0, pH - rH);
    const rowLeft = Math.ceil(x0 + off * dy / pH);
    const rowLeftRH = Math.ceil(x0 + off * (dy + rH) / pH);
    const minLeft = Math.max(rowLeft, rowLeftRH);
    const rowRight = Math.floor(x0 + base + off * dy / pH);
    const rowRightRH = Math.floor(x0 + base + off * (dy + rH) / pH);
    const maxRight = Math.min(rowRight, rowRightRH);
    if (rW > maxRight - minLeft) continue;
    const rX = randInt(minLeft, maxRight - rW);
    const rY = y0 + dy;

    const innerV = [
      { x: rX, y: rY }, { x: rX + rW, y: rY },
      { x: rX + rW, y: rY + rH }, { x: rX, y: rY + rH }
    ];
    return {
      figure: 'mixed', template: 'paraMinusRect', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: 'Успоредник', dims: [base, pH], formulaType: 'para', area: base * pH },
        { label: 'Правоъгълник', dims: [rW, rH], formulaType: 'rect', area: rW * rH }
      ],
      subCentroids: [
        { x: x0 + base / 2 + off / 2, y: y0 + pH / 2 },
        { x: rX + rW / 2, y: rY + rH / 2 }
      ],
      totalArea: base * pH - rW * rH
    };
  }
  return null;
}

const SUBTRACTION_TEMPLATES = [
  generateRectMinusRect,
  generateRectMinusTri,
  generateTriMinusTri,
  generateRectMinusPara,
  generateRectMinusTrap,
  generateParaMinusTri,
  generateTrapMinusTri,
  generateTriMinusRect,
  generateTrapMinusRect,
  generateParaMinusRect
];

const MIXED_TEMPLATES = [
  generateHouse,
  generateRectTrapezoid,
  // generateRectTriangleSide removed: always simplifies to a trapezoid
  generateTrapezoidTriangle,
  generateParaTriangle,
  generateTower,
  generateRectObtuseTriangle,
  generateTrapRect,
  generateParaRect,
  generateDoubleTriangle,
  generateRectTriBoth,
  generateTrapTrap,
  generateParaTrap,
  generateStepShape,
  generateTriTrapTri
];

function finalizeSubtraction(task) {
  if (!task) return null;
  // Simplify both polygons (strip collinear vertices)
  task.vertices = simplifyPolygon(task.vertices);
  task.innerVertices = simplifyPolygon(task.innerVertices);
  if (task.vertices.length < 3 || task.innerVertices.length < 3) return null;
  if (task.totalArea <= 0) return null;
  return task;
}

function generateMixed() {
  for (let attempt = 0; attempt < 50; attempt++) {
    // ~30% chance of subtraction template
    const useSub = Math.random() < 0.3 && SUBTRACTION_TEMPLATES.length > 0;
    if (useSub) {
      const gen = SUBTRACTION_TEMPLATES[Math.floor(Math.random() * SUBTRACTION_TEMPLATES.length)];
      const task = finalizeSubtraction(gen());
      if (task) return task;
    } else {
      const gen = MIXED_TEMPLATES[Math.floor(Math.random() * MIXED_TEMPLATES.length)];
      const task = finalizeMixed(gen());
      if (task) return task;
    }
  }
  // Last-resort fallback: a guaranteed-valid house
  return finalizeMixed(generateHouse());
}

// ===== Task Generation =====

function isPoint(v) {
  return v !== null && typeof v === 'object'
    && typeof v.x === 'number' && typeof v.y === 'number'
    && !Array.isArray(v);
}

// Recursively transform every point-like value inside a structure. Numbers,
// strings, non-point objects, and arrays of non-points pass through unchanged.
// This lets task fields like `vertices`, `subCentroids`, and nested
// `sharedEdges` (array of [p1,p2] pairs) all be transformed uniformly.
function transformDeep(v, fn) {
  if (isPoint(v)) return fn(v);
  if (Array.isArray(v)) return v.map(item => transformDeep(item, fn));
  return v;
}

// Signed shoelace area in grid coordinates (y up). Positive = CCW in grid
// coords, which maps to CCW visually on screen since the SVG y-flip simply
// mirrors vertically without reversing winding. Negative = CW visually.
function signedArea(verts) {
  let s = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    s += verts[i].x * verts[j].y - verts[j].x * verts[i].y;
  }
  return s / 2;
}

// Returns a copy of `verts` ordered visually counter-clockwise (A → B → C → D …).
// The starting vertex is the same object that was first in the input, so the
// winding flips but the entry point is preserved; for odd polygons this means
// A stays put and the rest reverse around it.
function toCounterClockwise(verts) {
  if (!verts || verts.length < 3) return verts;
  if (signedArea(verts) > 0) return verts;
  // CW → reverse, keeping verts[0] as the starting vertex
  const [first, ...rest] = verts;
  return [first, ...rest.reverse()];
}

function transformFigure(task) {
  const G = GRID_SIZE;
  const transforms = [
    (p) => ({ x: p.x, y: p.y }),
    (p) => ({ x: p.y, y: p.x }),
    (p) => ({ x: G - p.x, y: G - p.y }),
    (p) => ({ x: G - p.y, y: G - p.x }),
    (p) => ({ x: G - p.x, y: p.y }),
    (p) => ({ x: p.x, y: G - p.y }),
    (p) => ({ x: p.y, y: G - p.x }),
    (p) => ({ x: G - p.y, y: p.x }),
  ];
  const fn = transforms[Math.floor(Math.random() * transforms.length)];

  const out = { ...task };
  for (const [k, v] of Object.entries(task)) {
    out[k] = transformDeep(v, fn);
  }
  // Enforce counter-clockwise vertex ordering starting from the leftmost
  // vertex (ties broken by bottommost). Applied to both outer and inner
  // polygons so labels are consistent after any transform.
  function orderVertices(verts) {
    if (!Array.isArray(verts) || verts.length < 3) return verts;
    verts = toCounterClockwise(verts);
    let leftIdx = 0;
    for (let i = 1; i < verts.length; i++) {
      const v = verts[i], best = verts[leftIdx];
      if (v.x < best.x || (v.x === best.x && v.y < best.y)) leftIdx = i;
    }
    if (leftIdx > 0) {
      verts = verts.slice(leftIdx).concat(verts.slice(0, leftIdx));
    }
    return verts;
  }
  out.vertices = orderVertices(out.vertices);
  if (Array.isArray(out.innerVertices)) {
    out.innerVertices = orderVertices(out.innerVertices);
  }
  return out;
}

function generateAllTasks(count, moduleId) {
  const mod = MODULES[moduleId];
  const gens = mod.generators;
  const all = [];

  if (moduleId === 'triangle') {
    // Distribute evenly across the 3 subtypes
    const per = Math.floor(count / 3);
    const rem = count % 3;
    const baseGens = [generateRightTriangle, generateAcuteTriangle, generateObtuseTriangle];
    for (let i = 0; i < 3; i++) {
      const n = per + (i < rem ? 1 : 0);
      for (let j = 0; j < n; j++) {
        all.push(transformFigure(baseGens[i]()));
      }
    }
  } else if (moduleId === 'parallelogram') {
    // Reserve one rhombus slot when count > 2; the rest are plain parallelograms
    const rhombusCount = count > 2 ? 1 : 0;
    for (let i = 0; i < rhombusCount; i++) {
      all.push(transformFigure(generateRhombus()));
    }
    for (let i = 0; i < count - rhombusCount; i++) {
      all.push(transformFigure(generateParallelogram()));
    }
  } else if (moduleId === 'mixed') {
    // Mix of compound grid-aligned figures + occasional non-grid frame variants.
    // Frame pool: triangle (3 verts), parallelogram (4), pentagon (5), hexagon (6).
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let task;
      if (r < 0.10) {
        task = generateTriangleNonGrid();
        task.figure = 'mixed';
      } else if (r < 0.20) {
        task = generateParallelogramNonGrid();
        task.figure = 'mixed';
      } else if (r < 0.27) {
        task = generateFramedPentagon();
        if (task) task.figure = 'mixed';
      } else if (r < 0.32) {
        task = generateFramedHexagon();
        if (task) task.figure = 'mixed';
      }
      if (!task) task = generateMixed();
      all.push(transformFigure(task));
    }
  } else {
    for (let i = 0; i < count; i++) {
      const gen = gens[Math.floor(Math.random() * gens.length)];
      all.push(transformFigure(gen()));
    }
  }
  return shuffle(all);
}

// ===== SVG Rendering =====

function renderGrid(svg) {
  svg.appendChild(svgEl('rect', {
    x: 0, y: 0, width: SVG_SIZE, height: SVG_SIZE,
    fill: '#fafafa', rx: 8
  }));

  svg.appendChild(svgEl('rect', {
    x: px(0), y: py(GRID_SIZE), width: GRID_SIZE * CELL_PX, height: GRID_SIZE * CELL_PX,
    fill: '#fff', stroke: '#e0d6f0', 'stroke-width': 1
  }));

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

  for (let x = 0; x <= GRID_SIZE; x++) {
    for (let y = 0; y <= GRID_SIZE; y++) {
      svg.appendChild(svgEl('circle', {
        cx: px(x), cy: py(y), r: 1.8,
        fill: '#c4b8db'
      }));
    }
  }
}

function renderPolygon(svg, verts, labels) {
  const points = verts.map(v => `${px(v.x)},${py(v.y)}`).join(' ');
  svg.appendChild(svgEl('polygon', {
    points,
    fill: 'rgba(124, 92, 191, 0.12)',
    stroke: '#7C5CBF',
    'stroke-width': 2.5,
    'stroke-linejoin': 'round'
  }));

  const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;

  verts.forEach((v, i) => {
    svg.appendChild(svgEl('circle', {
      cx: px(v.x), cy: py(v.y), r: 5,
      fill: '#7C5CBF'
    }));

    let dx = v.x - cx;
    let dy = v.y - cy;
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

function renderDimensionMarker(svg, centerX, centerY, cm) {
  const corners = [
    { gx: 0, gy: 0 },
    { gx: GRID_SIZE - 1, gy: 0 },
    { gx: 0, gy: GRID_SIZE - 1 },
    { gx: GRID_SIZE - 1, gy: GRID_SIZE - 1 }
  ];

  let best = corners[0];
  let bestDist = 0;
  for (const c of corners) {
    const cx = c.gx + 0.5;
    const cy = c.gy + 0.5;
    const d = (cx - centerX) ** 2 + (cy - centerY) ** 2;
    if (d > bestDist) { bestDist = d; best = c; }
  }

  const dmX = px(best.gx);
  const dmX2 = px(best.gx + 1);
  const dmY = (py(best.gy) + py(best.gy + 1)) / 2;
  const tick = 5;

  svg.appendChild(svgEl('line', {
    x1: dmX, y1: dmY, x2: dmX2, y2: dmY,
    stroke: '#888', 'stroke-width': 1.5
  }));
  svg.appendChild(svgEl('line', {
    x1: dmX, y1: dmY - tick, x2: dmX, y2: dmY + tick,
    stroke: '#888', 'stroke-width': 1.5
  }));
  svg.appendChild(svgEl('line', {
    x1: dmX2, y1: dmY - tick, x2: dmX2, y2: dmY + tick,
    stroke: '#888', 'stroke-width': 1.5
  }));

  const cmText = formatBG(cm);
  const dmLabel = svgEl('text', {
    x: (dmX + dmX2) / 2, y: dmY - 8,
    'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold',
    fill: '#666', 'font-family': 'Nunito, sans-serif'
  });
  dmLabel.textContent = `${cmText} cm`;
  svg.appendChild(dmLabel);
}

function centroid(verts) {
  const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
  return { x: cx, y: cy };
}

// Grid boundaries in SVG coordinates (y is flipped: py(GRID_SIZE) is top)
const GRID_LEFT = px(0);
const GRID_RIGHT = px(GRID_SIZE);
const GRID_TOP = py(GRID_SIZE);
const GRID_BOTTOM = py(0);

// Clamp label coordinates to stay inside the grid square
function clampX(x) { return Math.max(GRID_LEFT + 4, Math.min(GRID_RIGHT - 4, x)); }
function clampY(y) { return Math.max(GRID_TOP + 10, Math.min(GRID_BOTTOM - 4, y)); }

// ===== Figure-specific Rendering =====

const VERTEX_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function renderTriangleFigure(svg, task) {
  renderPolygon(svg, task.vertices, ['A', 'B', 'C']);
  const c = centroid(task.vertices);
  renderDimensionMarker(svg, c.x, c.y, config.cmPerSquare);
}

function renderMixedFigure(svg, task) {
  if (task.subtraction) {
    renderSubtractionFigure(svg, task);
    return;
  }
  const labels = VERTEX_LABELS.slice(0, task.vertices.length);
  renderPolygon(svg, task.vertices, labels);
  const c = centroid(task.vertices);
  renderDimensionMarker(svg, c.x, c.y, config.cmPerSquare);
}

// Returns the visible (non-overlapping) segments of edge A→B after subtracting
// all edges from `otherPoly` that lie on the same line. Each result segment is
// a pair of {x,y} points.
function visibleEdgeSegments(A, B, otherPoly) {
  const abLen2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2;
  if (abLen2 === 0) return [];
  // Collect t-intervals [t1,t2] on edge A→B that are covered by otherPoly edges
  const covered = [];
  for (let i = 0; i < otherPoly.length; i++) {
    const p = otherPoly[i], q = otherPoly[(i + 1) % otherPoly.length];
    // Check collinearity
    const cross1 = (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x);
    const cross2 = (B.x - A.x) * (q.y - A.y) - (B.y - A.y) * (q.x - A.x);
    if (Math.abs(cross1) > 0.001 || Math.abs(cross2) > 0.001) continue;
    // Project p and q onto A→B as t values
    let t1 = ((p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y)) / abLen2;
    let t2 = ((q.x - A.x) * (B.x - A.x) + (q.y - A.y) * (B.y - A.y)) / abLen2;
    if (t1 > t2) [t1, t2] = [t2, t1];
    t1 = Math.max(0, t1); t2 = Math.min(1, t2);
    if (t2 > t1 + 0.001) covered.push([t1, t2]);
  }
  if (covered.length === 0) return [[A, B]];
  // Merge overlapping intervals and compute uncovered segments
  covered.sort((a, b) => a[0] - b[0]);
  const merged = [covered[0]];
  for (let i = 1; i < covered.length; i++) {
    const last = merged[merged.length - 1];
    if (covered[i][0] <= last[1] + 0.001) {
      last[1] = Math.max(last[1], covered[i][1]);
    } else {
      merged.push(covered[i]);
    }
  }
  const lerp = (t) => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
  const segments = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor + 0.001) segments.push([lerp(cursor), lerp(s)]);
    cursor = e;
  }
  if (cursor < 1 - 0.001) segments.push([lerp(cursor), lerp(1)]);
  return segments;
}

// Convenience: tests if an edge is fully covered by the other polygon.
function segmentOnPolygonEdge(p1, p2, poly) {
  const segs = visibleEdgeSegments(p1, p2, poly);
  return segs.length === 0;
}

// Draw a polygon edge-by-edge, skipping parts that overlap with `otherPoly`.
function strokePolygonMinusShared(svg, verts, otherPoly, attrs) {
  for (let i = 0; i < verts.length; i++) {
    const A = verts[i], B = verts[(i + 1) % verts.length];
    const segs = visibleEdgeSegments(A, B, otherPoly);
    for (const [p1, p2] of segs) {
      svg.appendChild(svgEl('line', {
        x1: px(p1.x), y1: py(p1.y), x2: px(p2.x), y2: py(p2.y),
        ...attrs
      }));
    }
  }
}

// Renders a subtraction figure: outer polygon with inner polygon "hole".
// Only the ring area (outer minus inner) is shaded.
function renderSubtractionFigure(svg, task) {
  const outer = task.vertices;
  const inner = task.innerVertices;

  // Build SVG path with evenodd fill: outer CCW + inner CW = hole
  const outerD = outer.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(v.x)},${py(v.y)}`).join(' ') + ' Z';
  const innerRev = [...inner].reverse();
  const innerD = innerRev.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(v.x)},${py(v.y)}`).join(' ') + ' Z';

  svg.appendChild(svgEl('path', {
    d: outerD + ' ' + innerD,
    'fill-rule': 'evenodd',
    fill: 'rgba(124, 92, 191, 0.12)',
    stroke: 'none'
  }));

  // Stroke both polygons edge-by-edge, skipping shared segments on both sides
  const edgeAttrs = { stroke: '#7C5CBF', 'stroke-width': 2.5, 'stroke-linecap': 'round' };
  strokePolygonMinusShared(svg, outer, inner, edgeAttrs);
  strokePolygonMinusShared(svg, inner, outer, edgeAttrs);

  // Collect all unique vertices (outer + non-shared inner) for labeling.
  // Use combined centroid of ALL vertices for consistent label push direction.
  const allVerts = [...outer, ...inner];
  const allCx = allVerts.reduce((s, v) => s + v.x, 0) / allVerts.length;
  const allCy = allVerts.reduce((s, v) => s + v.y, 0) / allVerts.length;

  // Label outer vertices A, B, C, …
  const outerLabels = VERTEX_LABELS.slice(0, outer.length);
  outer.forEach((v, i) => {
    let dx = v.x - allCx;
    let dy = v.y - allCy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx = (dx / len) * 18;
    dy = (dy / len) * 18;
    svg.appendChild(svgEl('circle', {
      cx: px(v.x), cy: py(v.y), r: 5, fill: '#7C5CBF'
    }));
    const label = svgEl('text', {
      x: px(v.x) + dx, y: py(v.y) - dy + 5,
      'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold',
      fill: '#5E3DA6', 'font-family': 'Nunito, sans-serif'
    });
    label.textContent = outerLabels[i];
    svg.appendChild(label);
  });

  // Label inner vertices continuing from where outer left off.
  // Skip vertices that coincide with an outer vertex (they already have a label).
  const innerLabels = VERTEX_LABELS.slice(outer.length, outer.length + inner.length);
  inner.forEach((v, i) => {
    if (outer.some(ov => ov.x === v.x && ov.y === v.y)) return;
    let dx = v.x - allCx;
    let dy = v.y - allCy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx = (dx / len) * 18;
    dy = (dy / len) * 18;
    svg.appendChild(svgEl('circle', {
      cx: px(v.x), cy: py(v.y), r: 5, fill: '#7C5CBF'
    }));
    const label = svgEl('text', {
      x: px(v.x) + dx, y: py(v.y) - dy + 5,
      'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold',
      fill: '#5E3DA6', 'font-family': 'Nunito, sans-serif'
    });
    label.textContent = innerLabels[i];
    svg.appendChild(label);
  });

  // Dimension marker
  const c = centroid(outer);
  renderDimensionMarker(svg, c.x, c.y, config.cmPerSquare);
}

function renderParallelogramFigure(svg, task) {
  renderPolygon(svg, task.vertices, ['A', 'B', 'C', 'D']);
  const c = centroid(task.vertices);
  renderDimensionMarker(svg, c.x, c.y, config.cmPerSquare);
}

function renderTrapezoidFigure(svg, task) {
  renderPolygon(svg, task.vertices, ['A', 'B', 'C', 'D']);
  const c = centroid(task.vertices);
  renderDimensionMarker(svg, c.x, c.y, config.cmPerSquare);
}

// ===== Solution Rendering =====

// Draws a colored segment along an edge of the polygon with a label.
// `centerPt` is used to place the label on the side opposite the figure center;
// if that side would escape the grid, flip to the inside of the shape instead.
function drawEdgeWithLabel(svg, start, end, labelText, color, centerPt) {
  svg.appendChild(svgEl('line', {
    x1: px(start.x), y1: py(start.y),
    x2: px(end.x), y2: py(end.y),
    stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'round'
  }));

  const horiz = start.y === end.y;
  const label = svgEl('text', {
    'font-size': 13, 'font-weight': 'bold',
    fill: color, 'font-family': 'Nunito, sans-serif'
  });
  setLabelText(label, labelText);

  if (horiz) {
    const midPX = (px(start.x) + px(end.x)) / 2;
    const edgePY = py(start.y);
    const centerPY = py(centerPt.y);
    const outsideY = centerPY < edgePY ? edgePY + 14 : edgePY - 6;
    const insideY = centerPY < edgePY ? edgePY - 6 : edgePY + 14;
    let y = outsideY;
    if (outsideY < GRID_TOP + 10 || outsideY > GRID_BOTTOM - 4) y = insideY;
    label.setAttribute('x', clampX(midPX));
    label.setAttribute('y', clampY(y));
    label.setAttribute('text-anchor', 'middle');
  } else {
    const midPY = (py(start.y) + py(end.y)) / 2;
    const edgePX = px(start.x);
    const centerPX = px(centerPt.x);
    let goRight = centerPX < edgePX;
    let x = goRight ? edgePX + 10 : edgePX - 10;
    if (x < GRID_LEFT + 4 || x > GRID_RIGHT - 4) {
      goRight = !goRight;
      x = goRight ? edgePX + 10 : edgePX - 10;
    }
    label.setAttribute('x', clampX(x));
    label.setAttribute('y', clampY(midPY + 4));
    label.setAttribute('text-anchor', goRight ? 'start' : 'end');
  }
  svg.appendChild(label);
}

// Draws the height line + foot dot + label. If `dashed` is true, the line is dashed.
// `top` is the apex vertex, `foot` is the perpendicular point on the base.
// The geometric meaning is preserved (height goes from apex down to base)
// regardless of the shape's screen orientation after transforms.
function drawHeightWithLabel(svg, top, foot, labelText, color, dashed, baseStart, baseEnd) {
  const attrs = {
    x1: px(top.x), y1: py(top.y),
    x2: px(foot.x), y2: py(foot.y),
    stroke: color, 'stroke-width': dashed ? 2.5 : 2.5,
    'stroke-linecap': 'round'
  };
  if (dashed) attrs['stroke-dasharray'] = '8,5';
  svg.appendChild(svgEl('line', attrs));

  svg.appendChild(svgEl('circle', {
    cx: px(foot.x), cy: py(foot.y), r: 3.5,
    fill: color
  }));

  const baseHoriz = baseStart.y === baseEnd.y;
  const hl = svgEl('text', {
    'font-size': 13, 'font-weight': 'bold',
    fill: color, 'font-family': 'Nunito, sans-serif'
  });
  setLabelText(hl, labelText);

  if (baseHoriz) {
    const hMidPy = (py(top.y) + py(foot.y)) / 2;
    let goRight = px(top.x) < px(5);
    let hLabelX = goRight ? px(top.x) + 12 : px(top.x) - 12;
    if (hLabelX < GRID_LEFT + 4 || hLabelX > GRID_RIGHT - 4) {
      goRight = !goRight;
      hLabelX = goRight ? px(top.x) + 12 : px(top.x) - 12;
    }
    hl.setAttribute('x', clampX(hLabelX));
    hl.setAttribute('y', clampY(hMidPy + 4));
    hl.setAttribute('text-anchor', goRight ? 'start' : 'end');
  } else {
    const hMidPx = (px(top.x) + px(foot.x)) / 2;
    let goBelow = py(top.y) > py(5);
    let hLabelY = goBelow ? py(top.y) + 16 : py(top.y) - 8;
    if (hLabelY < GRID_TOP + 10 || hLabelY > GRID_BOTTOM - 4) {
      goBelow = !goBelow;
      hLabelY = goBelow ? py(top.y) + 16 : py(top.y) - 8;
    }
    hl.setAttribute('x', clampX(hMidPx));
    hl.setAttribute('y', clampY(hLabelY));
    hl.setAttribute('text-anchor', 'middle');
  }
  svg.appendChild(hl);
}

// Vector-based right-angle marker that works for any rotation.
// v1 = height direction (foot→top), v2 = base direction flipped to point
// toward the shape center so the marker sits inside the figure.
function drawRightAngleMarker(svg, foot, top, baseStart, baseEnd, shapeCenter, color) {
  const mSize = 8;
  const fx = px(foot.x);
  const fy = py(foot.y);

  const tdx = px(top.x) - fx;
  const tdy = py(top.y) - fy;
  const tLen = Math.hypot(tdx, tdy) || 1;
  const v1x = (tdx / tLen) * mSize;
  const v1y = (tdy / tLen) * mSize;

  const bdx = px(baseEnd.x) - px(baseStart.x);
  const bdy = py(baseEnd.y) - py(baseStart.y);
  const bLen = Math.hypot(bdx, bdy) || 1;
  let v2x = (bdx / bLen) * mSize;
  let v2y = (bdy / bLen) * mSize;

  const cx = px(shapeCenter.x) - fx;
  const cy = py(shapeCenter.y) - fy;
  if (v2x * cx + v2y * cy < 0) {
    v2x = -v2x;
    v2y = -v2y;
  }

  svg.appendChild(svgEl('path', {
    d: `M${fx + v1x},${fy + v1y} L${fx + v1x + v2x},${fy + v1y + v2y} L${fx + v2x},${fy + v2y}`,
    fill: 'none', stroke: color, 'stroke-width': 1.5
  }));
}

// ===== Frame (non-grid) helpers =====

// Shoelace area for any simple polygon given as a vertex list
function shoelace(verts) {
  let sum = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    sum += verts[i].x * verts[j].y - verts[j].x * verts[i].y;
  }
  return Math.abs(sum) / 2;
}

// Decompose the bbox of the polygon into cut-off right-triangle pieces. For every
// bbox corner not already covered by a polygon vertex, find the two polygon
// vertices that lie on the adjacent bbox sides and build the right-triangle piece.
function decomposeBBoxFrame(vertices) {
  const xs = vertices.map(v => v.x);
  const ys = vertices.map(v => v.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const bboxCorners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ];

  const pieces = [];
  for (const corner of bboxCorners) {
    if (vertices.some(v => v.x === corner.x && v.y === corner.y)) continue;

    // Pick the vertex on each adjacent bbox side that is CLOSEST to this
    // corner — not just the first one found. This matters for polygons with
    // more than 4 vertices where multiple points share a side.
    let onVert = null;
    for (const v of vertices) {
      if (v.x !== corner.x) continue;
      if (!onVert || Math.abs(v.y - corner.y) < Math.abs(onVert.y - corner.y)) {
        onVert = v;
      }
    }
    let onHoriz = null;
    for (const v of vertices) {
      if (v.y !== corner.y) continue;
      if (!onHoriz || Math.abs(v.x - corner.x) < Math.abs(onHoriz.x - corner.x)) {
        onHoriz = v;
      }
    }
    if (!onVert || !onHoriz) continue;

    const legV = Math.abs(onVert.y - corner.y);
    const legH = Math.abs(onHoriz.x - corner.x);
    pieces.push({
      corner,
      pV: onVert,
      pH: onHoriz,
      legV,
      legH,
      area: (legV * legH) / 2
    });
  }

  return {
    bbox: { minX, minY, maxX, maxY },
    bboxWidth: maxX - minX,
    bboxHeight: maxY - minY,
    bboxArea: (maxX - minX) * (maxY - minY),
    pieces
  };
}

// Renders the red bbox frame, re-outlines the figure in the answer color,
// and places a small red label with each cut-off piece's area inside the piece.
function renderFrameSolution(svg, task, correct) {
  const cm = config.cmPerSquare;
  const color = correct ? '#4CAF50' : '#EF5350';
  const decomp = decomposeBBoxFrame(task.vertices);

  const frameX = px(decomp.bbox.minX);
  const frameY = py(decomp.bbox.maxY);
  const frameW = decomp.bboxWidth * CELL_PX;
  const frameH = decomp.bboxHeight * CELL_PX;
  svg.appendChild(svgEl('rect', {
    x: frameX, y: frameY, width: frameW, height: frameH,
    fill: 'none', stroke: color, 'stroke-width': 2.5,
    'stroke-dasharray': '6,3'
  }));

  // Draw the dashed legs of each cut-off piece along the bbox sides so the
  // pieces are visually delimited, and place the area label inside each piece.
  decomp.pieces.forEach((piece, idx) => {
    const hypotenuse = svgEl('line', {
      x1: px(piece.pV.x), y1: py(piece.pV.y),
      x2: px(piece.pH.x), y2: py(piece.pH.y),
      stroke: color, 'stroke-width': 1.5,
      'stroke-dasharray': '4,3', 'stroke-linecap': 'round'
    });
    svg.appendChild(hypotenuse);

    const centroidX = (piece.corner.x + piece.pV.x + piece.pH.x) / 3;
    const centroidY = (piece.corner.y + piece.pV.y + piece.pH.y) / 3;
    const label = svgEl('text', {
      x: px(centroidX), y: py(centroidY) + 6,
      'text-anchor': 'middle',
      'font-size': 18, 'font-weight': 'bold',
      fill: color, 'font-family': 'Nunito, sans-serif',
      stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke'
    });
    label.textContent = `S${toSubscript(idx + 1)}`;
    svg.appendChild(label);
  });

  // Re-outline the figure in the answer color
  const points = task.vertices.map(v => `${px(v.x)},${py(v.y)}`).join(' ');
  svg.appendChild(svgEl('polygon', {
    points,
    fill: 'none',
    stroke: color,
    'stroke-width': 3,
    'stroke-linejoin': 'round'
  }));
}

function toSubscript(n) {
  const subs = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
  return String(n).split('').map(c => subs[+c] || c).join('');
}

function frameFormulaHTML(task, cm, area) {
  const decomp = decomposeBBoxFrame(task.vertices);
  const frameWcm = decomp.bboxWidth * cm;
  const frameHcm = decomp.bboxHeight * cm;
  const frameAreaCm = decomp.bboxArea * cm * cm;

  const piecesHTML = decomp.pieces.map((p, i) => {
    const legHcm = p.legH * cm;
    const legVcm = p.legV * cm;
    const pCm = p.area * cm * cm;
    return `$$S_${i + 1} = \\frac{${formatBG(legHcm)} \\;\\text{.}\\; ${formatBG(legVcm)}}{2} = ${formatBG(pCm)} \\text{ cm}^2$$`;
  }).join('');

  const totalCutoff = decomp.pieces.reduce((s, p) => s + p.area, 0) * cm * cm;
  const cutoffSum = decomp.pieces.map((_, i) => `S_${i + 1}`).join(' + ');

  return `
    $$S_{рамка} = ${formatBG(frameWcm)} \\;\\text{.}\\; ${formatBG(frameHcm)} = ${formatBG(frameAreaCm)} \\text{ cm}^2$$
    ${piecesHTML}
    $$S_{отрязано} = ${cutoffSum} = ${formatBG(totalCutoff)} \\text{ cm}^2$$
    $$S = S_{рамка} - S_{отрязано} = ${formatBG(frameAreaCm)} - ${formatBG(totalCutoff)} = ${formatBG(area)} \\text{ cm}^2$$
  `;
}

function renderTriangleSolution(svg, task, correct) {
  const cm = config.cmPerSquare;
  const { baseStart: A, baseEnd: B, apex: C, heightFoot: H } = task;
  const baseCm = task.base * cm;
  const heightCm = task.height * cm;
  const horiz = A.y === B.y;
  const isRight = task.type === 'right';
  const baseLetter = isRight ? 'a' : triangleBaseLetter(task);
  const color = correct ? '#4CAF50' : '#EF5350';

  // Base (preserve original positioning logic exactly for triangles)
  svg.appendChild(svgEl('line', {
    x1: px(A.x), y1: py(A.y),
    x2: px(B.x), y2: py(B.y),
    stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'round'
  }));

  const bl = svgEl('text', {
    'font-size': 13, 'font-weight': 'bold',
    fill: color, 'font-family': 'Nunito, sans-serif'
  });
  const heightLabel = isRight ? 'b' : `h_${baseLetter}`;
  setLabelText(bl, `${baseLetter} = ${formatBG(baseCm)} cm`);
  const triCenterPY = py((A.y + B.y + C.y) / 3);
  const triCenterPX = px((A.x + B.x + C.x) / 3);
  if (horiz) {
    bl.setAttribute('x', clampX((px(A.x) + px(B.x)) / 2));
    const outsideY = triCenterPY < py(A.y) ? py(A.y) + 14 : py(A.y) - 6;
    const insideY = triCenterPY < py(A.y) ? py(A.y) - 6 : py(A.y) + 14;
    let y = outsideY;
    if (outsideY < GRID_TOP + 10 || outsideY > GRID_BOTTOM - 4) y = insideY;
    bl.setAttribute('y', clampY(y));
    bl.setAttribute('text-anchor', 'middle');
  } else {
    const midY = (py(A.y) + py(B.y)) / 2;
    let goRight = triCenterPX < px(A.x);
    let labelX = goRight ? px(A.x) + 10 : px(A.x) - 10;
    if (labelX < GRID_LEFT + 4 || labelX > GRID_RIGHT - 4) {
      goRight = !goRight;
      labelX = goRight ? px(A.x) + 10 : px(A.x) - 10;
    }
    bl.setAttribute('x', clampX(labelX));
    bl.setAttribute('y', clampY(midY + 4));
    bl.setAttribute('text-anchor', goRight ? 'start' : 'end');
  }
  svg.appendChild(bl);

  // Obtuse: dashed extension of base line to foot
  if (task.type === 'obtuse') {
    svg.appendChild(svgEl('line', {
      x1: px(H.x), y1: py(H.y),
      x2: horiz ? px(H.x < A.x ? A.x : B.x) : px(A.x),
      y2: horiz ? py(A.y) : py(H.y < Math.min(A.y, B.y) ? Math.min(A.y, B.y) : Math.max(A.y, B.y)),
      stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '6,4',
      'stroke-linecap': 'round'
    }));
  }

  // Height/side line
  const heightLineAttrs = {
    x1: px(C.x), y1: py(C.y),
    x2: px(H.x), y2: py(H.y),
    stroke: color, 'stroke-width': 2.5,
    'stroke-linecap': 'round'
  };
  if (!isRight) heightLineAttrs['stroke-dasharray'] = '8,5';
  svg.appendChild(svgEl('line', heightLineAttrs));

  svg.appendChild(svgEl('circle', {
    cx: px(H.x), cy: py(H.y), r: 3.5,
    fill: color
  }));

  // Height label
  const hl = svgEl('text', {
    'font-size': 13, 'font-weight': 'bold',
    fill: color, 'font-family': 'Nunito, sans-serif'
  });
  setLabelText(hl, `${heightLabel} = ${formatBG(heightCm)} cm`);
  if (horiz) {
    const hMidPy = (py(C.y) + py(H.y)) / 2;
    let goRight = px(C.x) < px(5);
    let hLabelX = goRight ? px(C.x) + 12 : px(C.x) - 12;
    if (hLabelX < GRID_LEFT + 4 || hLabelX > GRID_RIGHT - 4) {
      goRight = !goRight;
      hLabelX = goRight ? px(C.x) + 12 : px(C.x) - 12;
    }
    hl.setAttribute('x', clampX(hLabelX));
    hl.setAttribute('y', clampY(hMidPy + 4));
    hl.setAttribute('text-anchor', goRight ? 'start' : 'end');
  } else {
    const hMidPx = (px(C.x) + px(H.x)) / 2;
    let goBelow = py(C.y) > py(5);
    let hLabelY = goBelow ? py(C.y) + 16 : py(C.y) - 8;
    if (hLabelY < GRID_TOP + 10 || hLabelY > GRID_BOTTOM - 4) {
      goBelow = !goBelow;
      hLabelY = goBelow ? py(C.y) + 16 : py(C.y) - 8;
    }
    hl.setAttribute('x', clampX(hMidPx));
    hl.setAttribute('y', clampY(hLabelY));
    hl.setAttribute('text-anchor', 'middle');
  }
  svg.appendChild(hl);

  // Right-angle marker at foot
  const mSize = 8;
  const mx = px(H.x);
  const my = py(H.y);
  if (horiz) {
    const mDirX = H.x <= A.x ? 1 : (H.x >= B.x ? -1 : 1);
    svg.appendChild(svgEl('path', {
      d: `M${mx},${my - mSize} L${mx + mSize * mDirX},${my - mSize} L${mx + mSize * mDirX},${my}`,
      fill: 'none', stroke: color, 'stroke-width': 1.5
    }));
  } else {
    const mDirY = H.y <= Math.min(A.y, B.y) ? 1 : -1;
    const mdy = -mSize * mDirY;
    const mdx = C.x > H.x ? mSize : -mSize;
    svg.appendChild(svgEl('path', {
      d: `M${mx + mdx},${my} L${mx + mdx},${my + mdy} L${mx},${my + mdy}`,
      fill: 'none', stroke: color, 'stroke-width': 1.5
    }));
  }
}

function renderParallelogramSolution(svg, task, correct) {
  const cm = config.cmPerSquare;
  const { baseStart: A, baseEnd: B, heightTop: T, heightFoot: H } = task;
  const baseCm = task.base * cm;
  const heightCm = task.height * cm;
  const color = correct ? '#4CAF50' : '#EF5350';
  const center = centroid(task.vertices);

  drawEdgeWithLabel(svg, A, B, `a = ${formatBG(baseCm)} cm`, color, center);
  drawHeightWithLabel(svg, T, H, `hₐ = ${formatBG(heightCm)} cm`, color, true, A, B);
  drawRightAngleMarker(svg, H, T, A, B, center, color);
}

// The longer of the two parallel sides is always labeled `a`, the shorter
// `b`. `baseA` in the generator is the longer side by construction, so we
// just return the "bottom" (longer) pair as `a`.
function trapezoidOrientedLabels(task) {
  const { bottomStart, bottomEnd, topStart, topEnd, baseA, baseB } = task;
  return {
    aStart: bottomStart, aEnd: bottomEnd, aLen: baseA,
    bStart: topStart,    bEnd: topEnd,    bLen: baseB
  };
}

function renderTrapezoidSolution(svg, task, correct) {
  const cm = config.cmPerSquare;
  const { heightTop: T, heightFoot: H, bottomStart, bottomEnd } = task;
  const { aStart, aEnd, aLen, bStart, bEnd, bLen } = trapezoidOrientedLabels(task);
  const aCm = aLen * cm;
  const bCm = bLen * cm;
  const heightCm = task.height * cm;
  const color = correct ? '#4CAF50' : '#EF5350';
  const center = centroid(task.vertices);

  drawEdgeWithLabel(svg, aStart, aEnd, `a = ${formatBG(aCm)} cm`, color, center);
  drawEdgeWithLabel(svg, bStart, bEnd, `b = ${formatBG(bCm)} cm`, color, center);
  drawHeightWithLabel(svg, T, H, `h = ${formatBG(heightCm)} cm`, color, !task.heightOnSide, bottomStart, bottomEnd);
  drawRightAngleMarker(svg, H, T, bottomStart, bottomEnd, center, color);
}

// ===== Formula HTML =====

function renderMixedSolution(svg, task, correct) {
  if (task.subtraction) {
    renderSubtractionSolution(svg, task, correct);
    return;
  }
  const color = correct ? '#4CAF50' : '#EF5350';

  // Reveal shared edges as dashed purple
  for (const edge of task.sharedEdges) {
    const [p1, p2] = edge;
    svg.appendChild(svgEl('line', {
      x1: px(p1.x), y1: py(p1.y),
      x2: px(p2.x), y2: py(p2.y),
      stroke: '#7C5CBF', 'stroke-width': 2,
      'stroke-dasharray': '6,4', 'stroke-linecap': 'round'
    }));
  }

  // Re-outline the compound shape in the answer color
  const points = task.vertices.map(v => `${px(v.x)},${py(v.y)}`).join(' ');
  svg.appendChild(svgEl('polygon', {
    points,
    fill: 'none',
    stroke: color,
    'stroke-width': 3,
    'stroke-linejoin': 'round'
  }));

  // Place S₁, S₂ labels at each sub-part centroid
  if (task.subCentroids) {
    task.subCentroids.forEach((c, i) => {
      const label = svgEl('text', {
        x: px(c.x), y: py(c.y) + 7,
        'text-anchor': 'middle',
        'font-size': 20, 'font-weight': 'bold',
        fill: '#5E3DA6', 'font-family': 'Nunito, sans-serif',
        stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke'
      });
      label.textContent = `S${toSubscript(i + 1)}`;
      svg.appendChild(label);
    });
  }
}

function renderSubtractionSolution(svg, task, correct) {
  const color = correct ? '#4CAF50' : '#EF5350';

  // Re-outline outer edges (solid), skipping shared segments
  strokePolygonMinusShared(svg, task.vertices, task.innerVertices, {
    stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round'
  });
  // Re-outline inner edges (dashed), skipping shared segments
  strokePolygonMinusShared(svg, task.innerVertices, task.vertices, {
    stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round',
    'stroke-dasharray': '6,4'
  });

  // S₁ in the ring area (outer minus inner), S₂ inside the inner figure.
  // For S₁: use outer centroid, but if it falls inside the inner polygon,
  // move it toward the midpoint of the longest non-shared outer edge.
  const outerC = centroid(task.vertices);
  const innerC = centroid(task.innerVertices);
  let s1 = outerC;
  if (pointInPolygon(s1, task.innerVertices)) {
    // Find midpoint of the longest outer edge that is not shared
    let bestLen = 0, bestMid = outerC;
    for (let i = 0; i < task.vertices.length; i++) {
      const a = task.vertices[i], b = task.vertices[(i + 1) % task.vertices.length];
      const segs = visibleEdgeSegments(a, b, task.innerVertices);
      for (const [p, q] of segs) {
        const len2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (len2 > bestLen) {
          bestLen = len2;
          bestMid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        }
      }
    }
    // Place S₁ between the outer edge midpoint and the outer centroid
    s1 = { x: (bestMid.x + outerC.x) / 2, y: (bestMid.y + outerC.y) / 2 };
  }

  const labels = [
    { pt: s1, text: `S${toSubscript(1)}` },
    { pt: innerC, text: `S${toSubscript(2)}` }
  ];
  for (const { pt, text } of labels) {
    const label = svgEl('text', {
      x: px(pt.x), y: py(pt.y) + 7,
      'text-anchor': 'middle',
      'font-size': 20, 'font-weight': 'bold',
      fill: '#5E3DA6', 'font-family': 'Nunito, sans-serif',
      stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke'
    });
    label.textContent = text;
    svg.appendChild(label);
  }
}

function subFormulaHTML(part, idx, cm) {
  const sub = `S_${idx}`;
  if (part.formulaType === 'square') {
    const [a] = part.dims;
    const aCm = a * cm;
    const area = part.area * cm * cm;
    return `$$${sub} = ${formatBG(aCm)}^2 = ${formatBG(area)} \\text{ cm}^2 \\quad \\text{(${part.label})}$$`;
  }
  if (part.formulaType === 'rect') {
    const [a, b] = part.dims;
    const aCm = a * cm;
    const bCm = b * cm;
    const area = part.area * cm * cm;
    return `$$${sub} = ${formatBG(aCm)} \\;\\text{.}\\; ${formatBG(bCm)} = ${formatBG(area)} \\text{ cm}^2 \\quad \\text{(${part.label})}$$`;
  }
  if (part.formulaType === 'tri') {
    const [a, h] = part.dims;
    const aCm = a * cm;
    const hCm = h * cm;
    const area = part.area * cm * cm;
    return `$$${sub} = \\frac{${formatBG(aCm)} \\;\\text{.}\\; ${formatBG(hCm)}}{2} = ${formatBG(area)} \\text{ cm}^2 \\quad \\text{(${part.label})}$$`;
  }
  if (part.formulaType === 'trap') {
    const [a, b, h] = part.dims;
    const aCm = a * cm;
    const bCm = b * cm;
    const hCm = h * cm;
    const area = part.area * cm * cm;
    return `$$${sub} = \\frac{(${formatBG(aCm)} + ${formatBG(bCm)}) \\;\\text{.}\\; ${formatBG(hCm)}}{2} = ${formatBG(area)} \\text{ cm}^2 \\quad \\text{(${part.label})}$$`;
  }
  if (part.formulaType === 'para') {
    const [a, h] = part.dims;
    const aCm = a * cm;
    const hCm = h * cm;
    const area = part.area * cm * cm;
    return `$$${sub} = ${formatBG(aCm)} \\;\\text{.}\\; ${formatBG(hCm)} = ${formatBG(area)} \\text{ cm}^2 \\quad \\text{(${part.label})}$$`;
  }
  return '';
}

function mixedFormulaHTML(task, cm, area) {
  if (task.subtraction) {
    return subtractionFormulaHTML(task, cm, area);
  }
  const subs = task.subParts.map((p, i) => subFormulaHTML(p, i + 1, cm)).join('');
  const sumExpr = task.subParts.map((_, i) => `S_${i + 1}`).join(' + ');
  if (task.subParts.length === 1) {
    return subs;
  }
  return `
    ${subs}
    $$S = ${sumExpr} = ${formatBG(area)} \\text{ cm}^2$$
  `;
}

function subtractionFormulaHTML(task, cm, area) {
  const subs = task.subParts.map((p, i) => subFormulaHTML(p, i + 1, cm)).join('');
  return `
    ${subs}
    $$S = S_1 - S_2 = ${formatBG(task.subParts[0].area * cm * cm)} - ${formatBG(task.subParts[1].area * cm * cm)} = ${formatBG(area)} \\text{ cm}^2$$
  `;
}

function triangleFormulaHTML(task, cm, area) {
  const baseCm = task.base * cm;
  const heightCm = task.height * cm;
  const isRight = task.type === 'right';
  if (isRight) {
    return `$$S = \\frac{a \\;\\text{.}\\; b}{2}$$
            $$S = \\frac{${formatBG(baseCm)} \\;\\text{.}\\; ${formatBG(heightCm)}}{2} = ${formatBG(area)} \\text{ cm}^2$$`;
  }
  const base = triangleBaseLetter(task);
  return `$$S = \\frac{${base} \\;\\text{.}\\; h_${base}}{2}$$
          $$S = \\frac{${formatBG(baseCm)} \\;\\text{.}\\; ${formatBG(heightCm)}}{2} = ${formatBG(area)} \\text{ cm}^2$$`;
}

function parallelogramFormulaHTML(task, cm, area) {
  const baseCm = task.base * cm;
  const heightCm = task.height * cm;
  return `$$S = a \\;\\text{.}\\; h_a$$
          $$S = ${formatBG(baseCm)} \\;\\text{.}\\; ${formatBG(heightCm)} = ${formatBG(area)} \\text{ cm}^2$$`;
}

function trapezoidFormulaHTML(task, cm, area) {
  const { aLen, bLen } = trapezoidOrientedLabels(task);
  const aCm = aLen * cm;
  const bCm = bLen * cm;
  const hCm = task.height * cm;
  const sum = aCm + bCm;
  return `$$S = \\frac{(a + b) \\;\\text{.}\\; h}{2}$$
          $$S = \\frac{(${formatBG(aCm)} + ${formatBG(bCm)}) \\;\\text{.}\\; ${formatBG(hCm)}}{2} = \\frac{${formatBG(sum)} \\;\\text{.}\\; ${formatBG(hCm)}}{2} = ${formatBG(area)} \\text{ cm}^2$$`;
}

// ===== Figure Modules =====

const MODULES = {
  triangle: {
    label: 'Триъгълник',
    titlePlural: 'Лица на триъгълници',
    generators: [generateRightTriangle, generateAcuteTriangle, generateObtuseTriangle],
    distributeEvenly: true,
    hasSubtypeBreakdown: true,
    typeNames: { right: 'Правоъгълен', acute: 'Остроъгълен', obtuse: 'Тъпоъгълен' },
    breakdownTitle: 'Резултати по вид триъгълник',
    computeArea: (task, cm) => task.nonGrid
      ? shoelace(task.vertices) * cm * cm
      : (task.base * cm * task.height * cm) / 2,
    renderFigure: renderTriangleFigure,
    renderSolution: (svg, task, correct) => task.nonGrid
      ? renderFrameSolution(svg, task, correct)
      : renderTriangleSolution(svg, task, correct),
    formulaHTML: (task, cm, area) => task.nonGrid
      ? frameFormulaHTML(task, cm, area)
      : triangleFormulaHTML(task, cm, area),
    typeLabel: (task) => task.nonGrid
      ? 'Триъгълник (с рамка)'
      : `${task.typeBG} триъгълник`
  },
  parallelogram: {
    label: 'Успоредник',
    titlePlural: 'Лица на успоредници',
    generators: [generateParallelogram, generateRhombus],
    distributeEvenly: false,
    hasSubtypeBreakdown: false,
    computeArea: (task, cm) => task.nonGrid
      ? shoelace(task.vertices) * cm * cm
      : task.base * cm * task.height * cm,
    renderFigure: renderParallelogramFigure,
    renderSolution: (svg, task, correct) => task.nonGrid
      ? renderFrameSolution(svg, task, correct)
      : renderParallelogramSolution(svg, task, correct),
    formulaHTML: (task, cm, area) => task.nonGrid
      ? frameFormulaHTML(task, cm, area)
      : parallelogramFormulaHTML(task, cm, area),
    typeLabel: (task) => {
      if (task.nonGrid) return 'Успоредник (с рамка)';
      if (task.isRhombus) return 'Ромб';
      return 'Успоредник';
    }
  },
  trapezoid: {
    label: 'Трапец',
    titlePlural: 'Лица на трапеци',
    generators: [generateTrapezoid],
    distributeEvenly: false,
    hasSubtypeBreakdown: false,
    computeArea: (task, cm) => ((task.baseA + task.baseB) * cm * task.height * cm) / 2,
    renderFigure: renderTrapezoidFigure,
    renderSolution: renderTrapezoidSolution,
    formulaHTML: trapezoidFormulaHTML,
    typeLabel: () => 'Трапец'
  },
  mixed: {
    label: 'Смесени фигури',
    titlePlural: 'Лица на смесени фигури',
    generators: [generateMixed],
    distributeEvenly: false,
    hasSubtypeBreakdown: false,
    computeArea: (task, cm) => task.nonGrid
      ? shoelace(task.vertices) * cm * cm
      : task.totalArea * cm * cm,
    renderFigure: renderMixedFigure,
    renderSolution: (svg, task, correct) => task.nonGrid
      ? renderFrameSolution(svg, task, correct)
      : renderMixedSolution(svg, task, correct),
    formulaHTML: (task, cm, area) => task.nonGrid
      ? frameFormulaHTML(task, cm, area)
      : mixedFormulaHTML(task, cm, area),
    typeLabel: (task) => {
      if (task.nonGrid) return 'Смесена фигура (с рамка)';
      const labels = {
        house: 'Правоъгълник + триъгълник',
        rectTrap: 'Правоъгълник + трапец',
        rectTriSide: 'Правоъгълник + триъгълник',
        trapTriangle: 'Трапец + триъгълник',
        paraTriangle: 'Успоредник + триъгълник',
        tower: 'Трапец + правоъгълник + триъгълник',
        rectObtuseTriangle: 'Правоъгълник + тъпоъгълен триъгълник',
        trapRect: 'Трапец + правоъгълник',
        paraRect: 'Успоредник + правоъгълник',
        doubleTriangle: 'Триъгълник + триъгълник',
        rectTriBoth: 'Триъгълник + правоъгълник + триъгълник',
        trapTrap: 'Трапец + трапец',
        paraTrap: 'Успоредник + трапец',
        stepShape: 'Правоъгълник + правоъгълник',
        triTrapTri: 'Триъгълник + трапец + триъгълник',
        rectMinusRect: 'Правоъгълник − правоъгълник',
        rectMinusTri: 'Правоъгълник − триъгълник',
        triMinusTri: 'Триъгълник − триъгълник',
        rectMinusPara: 'Правоъгълник − успоредник',
        rectMinusTrap: 'Правоъгълник − трапец',
        paraMinusTri: 'Успоредник − триъгълник',
        trapMinusTri: 'Трапец − триъгълник',
        triMinusRect: 'Триъгълник − правоъгълник',
        trapMinusRect: 'Трапец − правоъгълник',
        paraMinusRect: 'Успоредник − правоъгълник'
      };
      return labels[task.template] || 'Смесена фигура';
    }
  }
};

function updatePageHeading(moduleId) {
  const mod = MODULES[moduleId];
  document.title = `${mod.titlePlural} - StartMath`;
  const h1 = document.querySelector('.section-title h1');
  if (h1) h1.textContent = mod.titlePlural;
  const crumb = document.querySelector('.breadcrumb .current');
  if (crumb) crumb.textContent = mod.titlePlural;
}

// ===== Screens =====

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

function startTest() {
  tasks = generateAllTasks(config.taskCount, config.figureType);
  currentIdx = 0;
  score = 0;
  results = [];
  showTask();
}

function showTask() {
  const task = tasks[currentIdx];
  const mod = MODULES[config.figureType];
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
  mod.renderFigure(svg, task);

  const input = $('#area-input');
  const checkBtn = $('#check-btn');

  checkBtn.addEventListener('click', () => checkAnswer(task));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkAnswer(task);
  });
  // Clear the validation error as soon as the user edits the input. If an
  // answer was previously rejected (red border + inline message), starting
  // to type a new value wipes both so the UI looks fresh again.
  input.addEventListener('input', () => clearInputError(input));

  setTimeout(() => input.focus(), 150);
}

function checkAnswer(task) {
  const input = $('#area-input');
  const checkBtn = $('#check-btn');
  const solutionArea = $('#solution-area');
  const nextArea = $('#next-area');
  const mod = MODULES[config.figureType];

  if (input.disabled) return;

  const raw = input.value.trim().replace(',', '.');

  // Reject empty input, letters, or any non-numeric characters. Only digits
  // and at most one decimal separator are allowed.
  if (!isValidAnswerInput(raw)) {
    showInputError(input, raw === ''
      ? 'Въведи отговор.'
      : 'Въведи само число (без букви).');
    input.focus();
    return;
  }
  const userAnswer = parseFloat(raw);

  const cm = config.cmPerSquare;
  const correctArea = mod.computeArea(task, cm);

  const correct = Math.abs(userAnswer - correctArea) < 0.05;

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

  const scoreEl = document.querySelector('.tri-score');
  if (scoreEl) scoreEl.textContent = `${score} \u2713`;

  const svg = $('#grid-svg');
  mod.renderSolution(svg, task, correct);

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
      <div class="formula-type">${mod.typeLabel(task)}</div>
      <div class="formula-display" id="formula-display">
        ${mod.formulaHTML(task, cm, correctArea)}
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
}

function showScoreScreen() {
  const container = $('#tri-container');
  const mod = MODULES[config.figureType];
  const total = tasks.length;
  const wrong = total - score;
  const pct = Math.round((score / total) * 100);

  let message;
  if (pct === 100) message = 'Перфектен резултат!';
  else if (pct >= 80) message = 'Отличен резултат!';
  else if (pct >= 60) message = 'Добър резултат!';
  else if (pct >= 40) message = 'Може и по-добре. Опитай пак!';
  else message = 'Повтори материала и опитай отново.';

  let breakdownHTML = '';
  if (mod.hasSubtypeBreakdown) {
    const typeResults = {};
    for (const key of Object.keys(mod.typeNames)) {
      typeResults[key] = { correct: 0, total: 0 };
    }
    tasks.forEach((t, i) => {
      if (!typeResults[t.type]) return;
      typeResults[t.type].total++;
      if (results[i]) typeResults[t.type].correct++;
    });

    let itemsHTML = '';
    for (const [type, data] of Object.entries(typeResults)) {
      if (data.total === 0) continue;
      const icon = data.correct === data.total ? '\u2713' : (data.correct > 0 ? '~' : '\u2717');
      const color = data.correct === data.total
        ? 'var(--color-success)'
        : (data.correct > 0 ? 'var(--color-accent)' : 'var(--color-error)');
      itemsHTML += `
        <div class="breakdown-item">
          <span>${mod.typeNames[type]}</span>
          <span><span style="color: ${color}; font-weight: 800;">${icon}</span> ${data.correct}/${data.total}</span>
        </div>
      `;
    }
    breakdownHTML = `
      <div class="score-breakdown">
        <h4>${mod.breakdownTitle}</h4>
        ${itemsHTML}
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
        <button class="btn btn-outline" id="settings-btn">Промени избора</button>
      </div>
      ${breakdownHTML}
    </div>
  `;

  $('#retry-btn').addEventListener('click', startTest);
  $('#settings-btn').addEventListener('click', showSettingsScreen);
}

// ===== Utilities =====

function formatBG(num) {
  // Remove trailing-zero float noise but keep meaningful precision.
  // parseFloat drops trailing zeros from toPrecision/toFixed.
  const str = String(parseFloat(num.toPrecision(10)));
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
