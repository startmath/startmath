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

// ===== Mixed / Compound Generators =====
// Each template returns a task with:
//   vertices:     outer polygon (without the internal shared edge)
//   subParts:     [{ label, dims, formulaType, area }] — sub-figure breakdown
//   sharedEdges:  array of [p1, p2] segments to reveal in the solution
//   subCentroids: centroid points of each sub-part (for on-grid labels)
//   totalArea:    sum of sub-part areas (in grid squares, pre-cm)
// sub-areas are computed in grid squares; cm scaling is applied at formula time.

function generateRect() {
  const w = randInt(2, 7);
  const h = randInt(2, 7);
  const x0 = randInt(0, GRID_SIZE - w);
  const y0 = randInt(0, GRID_SIZE - h);
  const isSquare = w === h;

  return {
    figure: 'mixed',
    template: 'rect',
    vertices: [
      { x: x0, y: y0 },
      { x: x0 + w, y: y0 },
      { x: x0 + w, y: y0 + h },
      { x: x0, y: y0 + h }
    ],
    subParts: [{
      label: isSquare ? 'Квадрат' : 'Правоъгълник',
      dims: isSquare ? [w] : [w, h],
      formulaType: isSquare ? 'square' : 'rect',
      area: w * h
    }],
    sharedEdges: [],
    subCentroids: [{ x: x0 + w / 2, y: y0 + h / 2 }],
    totalArea: w * h
  };
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

function generateLShape() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w1 = randInt(4, 6);
    const h1 = randInt(2, 3);
    const w2 = randInt(2, w1 - 1);
    const h2 = randInt(2, 3);
    if (h1 + h2 > GRID_SIZE) continue;

    const x0 = randInt(0, GRID_SIZE - w1);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);

    return {
      figure: 'mixed',
      template: 'lshape',
      vertices: [
        { x: x0, y: y0 },
        { x: x0 + w1, y: y0 },
        { x: x0 + w1, y: y0 + h1 },
        { x: x0 + w2, y: y0 + h1 },
        { x: x0 + w2, y: y0 + h1 + h2 },
        { x: x0, y: y0 + h1 + h2 }
      ],
      subParts: [
        { label: 'Правоъгълник 1', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: 'Правоъгълник 2', dims: [w2, h2], formulaType: 'rect', area: w2 * h2 }
      ],
      sharedEdges: [[
        { x: x0, y: y0 + h1 }, { x: x0 + w2, y: y0 + h1 }
      ]],
      subCentroids: [
        { x: x0 + w1 / 2, y: y0 + h1 / 2 },
        { x: x0 + w2 / 2, y: y0 + h1 + h2 / 2 }
      ],
      totalArea: w1 * h1 + w2 * h2
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

const MIXED_TEMPLATES = [
  generateRect, generateHouse, generateRectTrapezoid, generateLShape, generateRectTriangleSide
];

function generateMixed() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const gen = MIXED_TEMPLATES[Math.floor(Math.random() * MIXED_TEMPLATES.length)];
    const task = gen();
    if (task) return task;
  }
  return generateRect();
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
  return out;
}

function generateAllTasks(count, moduleId) {
  const mod = MODULES[moduleId];
  const gens = mod.generators;
  const all = [];

  if (moduleId === 'triangle') {
    // Distribute evenly across 3 subtypes, then swap ~25% of slots for non-grid
    const per = Math.floor(count / 3);
    const rem = count % 3;
    const baseGens = [generateRightTriangle, generateAcuteTriangle, generateObtuseTriangle];
    for (let i = 0; i < 3; i++) {
      const n = per + (i < rem ? 1 : 0);
      for (let j = 0; j < n; j++) {
        const useFrame = Math.random() < 0.25;
        all.push(transformFigure(useFrame ? generateTriangleNonGrid() : baseGens[i]()));
      }
    }
  } else if (moduleId === 'parallelogram') {
    // Reserve one rhombus slot when count > 2, the rest mix parallelograms + frame variants
    const rhombusCount = count > 2 ? 1 : 0;
    for (let i = 0; i < rhombusCount; i++) {
      all.push(transformFigure(generateRhombus()));
    }
    for (let i = 0; i < count - rhombusCount; i++) {
      const useFrame = Math.random() < 0.25;
      all.push(transformFigure(useFrame ? generateParallelogramNonGrid() : generateParallelogram()));
    }
  } else if (moduleId === 'mixed') {
    // Mix of compound grid-aligned figures + occasional non-grid frame variants
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let task;
      if (r < 0.15) {
        task = generateTriangleNonGrid();
        task.figure = 'mixed';
      } else if (r < 0.30) {
        task = generateParallelogramNonGrid();
        task.figure = 'mixed';
      } else {
        task = generateMixed();
      }
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
  const labels = VERTEX_LABELS.slice(0, task.vertices.length);
  renderPolygon(svg, task.vertices, labels);
  const c = centroid(task.vertices);
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
  label.textContent = labelText;

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
  hl.textContent = labelText;

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

    const onVert = vertices.find(v => v.x === corner.x);
    const onHoriz = vertices.find(v => v.y === corner.y);
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
    fill: 'none', stroke: '#d32f2f', 'stroke-width': 2.5,
    'stroke-dasharray': '6,3'
  }));

  // Draw the dashed legs of each cut-off piece along the bbox sides so the
  // pieces are visually delimited, and place the area label inside each piece.
  decomp.pieces.forEach((piece, idx) => {
    const hypotenuse = svgEl('line', {
      x1: px(piece.pV.x), y1: py(piece.pV.y),
      x2: px(piece.pH.x), y2: py(piece.pH.y),
      stroke: '#d32f2f', 'stroke-width': 1.5,
      'stroke-dasharray': '4,3', 'stroke-linecap': 'round'
    });
    svg.appendChild(hypotenuse);

    const centroidX = (piece.corner.x + piece.pV.x + piece.pH.x) / 3;
    const centroidY = (piece.corner.y + piece.pV.y + piece.pH.y) / 3;
    const label = svgEl('text', {
      x: px(centroidX), y: py(centroidY) + 4,
      'text-anchor': 'middle',
      'font-size': 11, 'font-weight': 'bold',
      fill: '#d32f2f', 'font-family': 'Nunito, sans-serif'
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
  const heightLabel = isRight ? 'b' : 'h';
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
  bl.textContent = `a = ${formatBG(baseCm)} cm`;
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
  hl.textContent = `${heightLabel} = ${formatBG(heightCm)} cm`;
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

function renderTrapezoidSolution(svg, task, correct) {
  const cm = config.cmPerSquare;
  const { bottomStart: A, bottomEnd: B, topStart: D, topEnd: C, heightTop: T, heightFoot: H } = task;
  const aCm = task.baseA * cm;
  const bCm = task.baseB * cm;
  const heightCm = task.height * cm;
  const color = correct ? '#4CAF50' : '#EF5350';
  const center = centroid(task.vertices);

  drawEdgeWithLabel(svg, A, B, `a = ${formatBG(aCm)} cm`, color, center);
  drawEdgeWithLabel(svg, D, C, `b = ${formatBG(bCm)} cm`, color, center);
  drawHeightWithLabel(svg, T, H, `h = ${formatBG(heightCm)} cm`, color, !task.heightOnSide, A, B);
  drawRightAngleMarker(svg, H, T, A, B, center, color);
}

// ===== Formula HTML =====

function renderMixedSolution(svg, task, correct) {
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
        x: px(c.x), y: py(c.y) + 5,
        'text-anchor': 'middle',
        'font-size': 13, 'font-weight': 'bold',
        fill: '#5E3DA6', 'font-family': 'Nunito, sans-serif'
      });
      label.textContent = `S${toSubscript(i + 1)}`;
      svg.appendChild(label);
    });
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

function triangleFormulaHTML(task, cm, area) {
  const baseCm = task.base * cm;
  const heightCm = task.height * cm;
  const isRight = task.type === 'right';
  return isRight
    ? `$$S = \\frac{a \\;\\text{.}\\; b}{2}$$
       $$S = \\frac{${formatBG(baseCm)} \\;\\text{.}\\; ${formatBG(heightCm)}}{2} = ${formatBG(area)} \\text{ cm}^2$$`
    : `$$S = \\frac{a \\;\\text{.}\\; h_a}{2}$$
       $$S = \\frac{${formatBG(baseCm)} \\;\\text{.}\\; ${formatBG(heightCm)}}{2} = ${formatBG(area)} \\text{ cm}^2$$`;
}

function parallelogramFormulaHTML(task, cm, area) {
  const baseCm = task.base * cm;
  const heightCm = task.height * cm;
  return `$$S = a \\;\\text{.}\\; h_a$$
          $$S = ${formatBG(baseCm)} \\;\\text{.}\\; ${formatBG(heightCm)} = ${formatBG(area)} \\text{ cm}^2$$`;
}

function trapezoidFormulaHTML(task, cm, area) {
  const aCm = task.baseA * cm;
  const bCm = task.baseB * cm;
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
        rect: 'Правоъгълник / квадрат',
        house: 'Правоъгълник + триъгълник',
        rectTrap: 'Правоъгълник + трапец',
        lshape: 'Г-образна фигура',
        rectTriSide: 'Правоъгълник + триъгълник'
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
    const cm = parseFloat($('#cm-per-square').value.replace(',', '.'));

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
  const userAnswer = parseFloat(raw);

  if (isNaN(userAnswer) || raw === '') {
    input.style.borderColor = 'var(--color-error)';
    input.focus();
    return;
  }

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
  const rounded = Math.round(num * 100) / 100;
  const str = String(rounded);
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
