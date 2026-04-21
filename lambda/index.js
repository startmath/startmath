'use strict';

const crypto = require('crypto');

// ===== Encryption =====

const HMAC_SECRET = process.env.HMAC_SECRET || 'dev-secret';
// scrypt is a deliberately slow KDF (~600ms on 128MB Lambda). Derive once at
// module load so warm invocations don't pay it per encrypt/decrypt.
const KEY = crypto.scryptSync(HMAC_SECRET, 'salt', 32);

function encryptTask(task) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  let encrypted = cipher.update(JSON.stringify(task), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return iv.toString('base64') + '.' + tag.toString('base64') + '.' + encrypted;
}

function decryptTask(token) {
  const [ivB64, tagB64, data] = token.split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

// ===== Constants =====

const GRID_SIZE = 10;
const CELL_PX = 40;
const PAD_PX = 35;
const SVG_SIZE = GRID_SIZE * CELL_PX + 2 * PAD_PX;

const VERTEX_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// ===== SVG String Helpers =====

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgEl(tag, attrs, content = '') {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(' ');
  const selfClosing = ['line', 'circle', 'rect', 'path', 'polygon'].includes(tag);
  return selfClosing && !content ? `<${tag} ${a}/>` : `<${tag} ${a}>${content}</${tag}>`;
}

function buildLabelContent(text) {
  const m = /^(.*?)_([a-zA-Z\u0430-\u044f\u0410-\u042f0-9])(.*)$/.exec(text);
  if (!m) return escapeXml(text);
  const [, before, sub, after] = m;
  return `<tspan>${escapeXml(before)}</tspan><tspan font-size="75%" dy="3">${escapeXml(sub)}</tspan><tspan dy="-3">${escapeXml(after)}</tspan>`;
}

function textEl(attrs, text) {
  return svgEl('text', attrs, buildLabelContent(text));
}

// ===== Coord Helpers =====

function px(gridX) { return PAD_PX + gridX * CELL_PX; }
function py(gridY) { return PAD_PX + (GRID_SIZE - gridY) * CELL_PX; }

// Grid boundaries in SVG coordinates
const GRID_LEFT = px(0);
const GRID_RIGHT = px(GRID_SIZE);
const GRID_TOP = py(GRID_SIZE);
const GRID_BOTTOM = py(0);

function clampX(x) { return Math.max(GRID_LEFT + 4, Math.min(GRID_RIGHT - 4, x)); }
function clampY(y) { return Math.max(GRID_TOP + 10, Math.min(GRID_BOTTOM - 4, y)); }

// ===== Random Helpers =====

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

// ===== Utility =====

function formatBG(num) {
  const str = String(parseFloat(num.toPrecision(10)));
  return str.replace('.', ',');
}

function triangleBaseLetter(task) {
  if (!task.apex || !Array.isArray(task.vertices)) return 'a';
  const idx = task.vertices.findIndex(v => v.x === task.apex.x && v.y === task.apex.y);
  return ['a', 'b', 'c'][idx >= 0 ? idx : 0];
}

function toSubscript(n) {
  const subs = ['\u2080','\u2081','\u2082','\u2083','\u2084','\u2085','\u2086','\u2087','\u2088','\u2089'];
  return String(n).split('').map(c => subs[+c] || c).join('');
}

// ===== Geometry Helpers =====

function centroid(verts) {
  const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
  return { x: cx, y: cy };
}

function signedArea(verts) {
  let s = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    s += verts[i].x * verts[j].y - verts[j].x * verts[i].y;
  }
  return s / 2;
}

function shoelace(verts) {
  let sum = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    sum += verts[i].x * verts[j].y - verts[j].x * verts[i].y;
  }
  return Math.abs(sum) / 2;
}

function toCounterClockwise(verts) {
  if (!verts || verts.length < 3) return verts;
  if (signedArea(verts) > 0) return verts;
  const [first, ...rest] = verts;
  return [first, ...rest.reverse()];
}

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
  const cx = inner.reduce((s, v) => s + v.x, 0) / inner.length;
  const cy = inner.reduce((s, v) => s + v.y, 0) / inner.length;
  return pointInPolygon({ x: cx, y: cy }, outer);
}

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

function isPoint(v) {
  return v !== null && typeof v === 'object'
    && typeof v.x === 'number' && typeof v.y === 'number'
    && !Array.isArray(v);
}

function transformDeep(v, fn) {
  if (isPoint(v)) return fn(v);
  if (Array.isArray(v)) return v.map(item => transformDeep(item, fn));
  return v;
}

function visibleEdgeSegments(A, B, otherPoly) {
  const abLen2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2;
  if (abLen2 === 0) return [];
  const covered = [];
  for (let i = 0; i < otherPoly.length; i++) {
    const p = otherPoly[i], q = otherPoly[(i + 1) % otherPoly.length];
    const cross1 = (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x);
    const cross2 = (B.x - A.x) * (q.y - A.y) - (B.y - A.y) * (q.x - A.x);
    if (Math.abs(cross1) > 0.001 || Math.abs(cross2) > 0.001) continue;
    let t1 = ((p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y)) / abLen2;
    let t2 = ((q.x - A.x) * (B.x - A.x) + (q.y - A.y) * (B.y - A.y)) / abLen2;
    if (t1 > t2) [t1, t2] = [t2, t1];
    t1 = Math.max(0, t1); t2 = Math.min(1, t2);
    if (t2 > t1 + 0.001) covered.push([t1, t2]);
  }
  if (covered.length === 0) return [[A, B]];
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

function segmentOnPolygonEdge(p1, p2, poly) {
  const segs = visibleEdgeSegments(p1, p2, poly);
  return segs.length === 0;
}

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
    typeBG: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u0435\u043d',
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
      typeBG: '\u041e\u0441\u0442\u0440\u043e\u044a\u0433\u044a\u043b\u0435\u043d',
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

  let base = 6;
  let height = 6;
  [base, height] = ensureOneEven(base, height, 4, 8, 4, 8);
  const x0 = randInt(0, GRID_SIZE - base);
  const y0 = randInt(0, GRID_SIZE - height);
  const apexDx = Math.floor(base / 2);

  return {
    figure: 'triangle',
    type: 'acute',
    typeBG: '\u041e\u0441\u0442\u0440\u043e\u044a\u0433\u044a\u043b\u0435\u043d',
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
      typeBG: '\u0422\u044a\u043f\u043e\u044a\u0433\u044a\u043b\u0435\u043d',
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
    typeBG: '\u0422\u044a\u043f\u043e\u044a\u0433\u044a\u043b\u0435\u043d',
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

// ===== Parallelogram Generators =====

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

// ===== Trapezoid Generator =====

function generateTrapezoid() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const a = randInt(4, 8);
    const b = randInt(2, a - 1);
    const h = randInt(2, 6);

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

// ===== Non-grid (frame) Generators =====

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
        { x: x0 + c, y: y0 },
        { x: x0 + a + c, y: y0 + b },
        { x: x0 + a, y: y0 + b + d },
        { x: x0, y: y0 + d }
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
      const onLeft = { x: x0, y: y0 + legV };
      const onBot = { x: x0 + legH, y: y0 };
      vertices = [TL, TR, BR, onBot, onLeft];
    } else if (corner === 1) {
      const onBot = { x: x0 + w - legH, y: y0 };
      const onRight = { x: x0 + w, y: y0 + legV };
      vertices = [TL, TR, onRight, onBot, BL];
    } else if (corner === 2) {
      const onRight = { x: x0 + w, y: y0 + h - legV };
      const onTop = { x: x0 + w - legH, y: y0 + h };
      vertices = [TL, onTop, onRight, BR, BL];
    } else {
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

function finalizeMixed(task) {
  if (!task) return null;
  const simplified = simplifyPolygon(task.vertices);
  if (simplified.length < 4) return null;
  if (simplified.length < task.vertices.length - 1) return null;
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
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [w, h1], formulaType: 'rect', area: w * h1 },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [w, h2], formulaType: 'tri', area: (w * h2) / 2 }
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
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [w, h1], formulaType: 'rect', area: w * h1 },
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446', dims: [w, b, h2], formulaType: 'trap', area: (w + b) * h2 / 2 }
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

function generateTrapezoidTriangle() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = randInt(4, 7);
    const b = randInt(2, a - 2);
    const h1 = randInt(2, 3);
    const h2 = randInt(2, 4);
    if (h1 + h2 > GRID_SIZE) continue;
    if (((a + b) * h1) % 2 !== 0) continue;
    if ((b * h2) % 2 !== 0) continue;
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
        { x: x0, y: y0 },
        { x: x0 + a, y: y0 },
        { x: x0 + a - rightOff, y: y0 + h1 },
        { x: apexX, y: y0 + h1 + h2 },
        { x: x0 + leftOff, y: y0 + h1 }
      ],
      subParts: [
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446', dims: [a, b, h1], formulaType: 'trap', area: (a + b) * h1 / 2 },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [b, h2], formulaType: 'tri', area: (b * h2) / 2 }
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
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [wR, hR], formulaType: 'rect', area: wR * hR },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [hR, wT], formulaType: 'tri', area: (wT * hR) / 2 }
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

function generateParaTriangle() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(4, 6);
    const h1 = randInt(2, 3);
    const h2 = randInt(2, 4);
    const offMag = randInt(1, 2);
    const offSign = Math.random() < 0.5 ? -1 : 1;
    const off = offMag * offSign;
    if ((base * h2) % 2 !== 0) continue;
    if (base % 2 !== 0) continue;
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
        { x: apexX, y: y0 + h1 + h2 },
        { x: x0 + base + off, y: y0 + h1 },
        { x: x0 + base, y: y0 },
        { x: x0, y: y0 },
        { x: x0 + off, y: y0 + h1 }
      ],
      subParts: [
        { label: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a', dims: [base, h1], formulaType: 'para', area: base * h1 },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [base, h2], formulaType: 'tri', area: (base * h2) / 2 }
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
        { x: apexX, y: y0 + h1 + h2 + h3 },
        { x: x0 + a - rightOff, y: y0 + h1 + h2 },
        { x: x0 + a - rightOff, y: y0 + h1 },
        { x: x0 + a, y: y0 },
        { x: x0, y: y0 },
        { x: x0 + leftOff, y: y0 + h1 },
        { x: x0 + leftOff, y: y0 + h1 + h2 }
      ],
      subParts: [
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446', dims: [a, b, h1], formulaType: 'trap', area: (a + b) * h1 / 2 },
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [b, h2], formulaType: 'rect', area: b * h2 },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [b, h3], formulaType: 'tri', area: (b * h3) / 2 }
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
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h1 },
        { x: apexX, y: y0 + h1 + h2 },
        { x: x0, y: y0 + h1 }
      ],
      subParts: [
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [w, h1], formulaType: 'rect', area: w * h1 },
        { label: '\u0422\u044a\u043f\u043e\u044a\u0433\u044a\u043b\u0435\u043d \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [w, h2], formulaType: 'tri', area: (w * h2) / 2 }
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

function generateTrapRect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w = randInt(4, 6);
    const h1 = randInt(2, 3);
    const h2 = randInt(2, 3);
    const b = randInt(2, w - 1);
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
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [w, h1], formulaType: 'rect', area: w * h1 },
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446', dims: [w, b, h2], formulaType: 'trap', area: (w + b) * h2 / 2 }
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

function generateParaRect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(3, 5);
    const h1 = randInt(2, 3);
    const h2 = randInt(2, 3);
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
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [base, h1], formulaType: 'rect', area: base * h1 },
        { label: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a', dims: [base, h2], formulaType: 'para', area: base * h2 }
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

function generateDoubleTriangle() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(3, 6);
    const h1 = randInt(2, 4);
    const h2 = randInt(2, 4);
    if (h1 + h2 > GRID_SIZE) continue;
    if ((base * h1) % 2 !== 0 || (base * h2) % 2 !== 0) continue;
    if (base % 2 !== 0) continue;

    const x0 = randInt(0, GRID_SIZE - base);
    const y0 = randInt(0, GRID_SIZE - h1 - h2);
    const midX = x0 + base / 2;

    return {
      figure: 'mixed', template: 'doubleTriangle',
      vertices: [
        { x: midX, y: y0 },
        { x: x0 + base, y: y0 + h1 },
        { x: midX, y: y0 + h1 + h2 },
        { x: x0, y: y0 + h1 }
      ],
      subParts: [
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2460', dims: [base, h1], formulaType: 'tri', area: (base * h1) / 2 },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2461', dims: [base, h2], formulaType: 'tri', area: (base * h2) / 2 }
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

function generateRectTriBoth() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const wR = randInt(2, 4);
    const hR = randInt(3, 5);
    const wL = randInt(1, 3);
    const wRt = randInt(1, 3);
    if (wL + wR + wRt > GRID_SIZE) continue;
    if ((wL * hR) % 2 !== 0 || (wRt * hR) % 2 !== 0) continue;
    if (hR % 2 !== 0) continue;

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
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [wR, hR], formulaType: 'rect', area: wR * hR },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a (\u043b\u044f\u0432)', dims: [hR, wL], formulaType: 'tri', area: (wL * hR) / 2 },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a (\u0434\u0435\u0441\u0435\u043d)', dims: [hR, wRt], formulaType: 'tri', area: (wRt * hR) / 2 }
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

function generateTrapTrap() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = randInt(4, 7);
    const b1 = randInt(2, a - 1);
    const b2 = randInt(2, a - 1);
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
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446 \u2460', dims: [a, b2, h2], formulaType: 'trap', area: (a + b2) * h2 / 2 },
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446 \u2461', dims: [a, b1, h1], formulaType: 'trap', area: (a + b1) * h1 / 2 }
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

function generateParaTrap() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(4, 6);
    const h1 = randInt(2, 3);
    const h2 = randInt(2, 3);
    const offMag = randInt(1, 2);
    const off = (Math.random() < 0.5 ? 1 : -1) * offMag;
    const b = randInt(2, base - 1);
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
        { label: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a', dims: [base, h1], formulaType: 'para', area: base * h1 },
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446', dims: [base, b, h2], formulaType: 'trap', area: (base + b) * h2 / 2 }
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

function generateStepShape() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w1 = randInt(4, 7);
    const w2 = randInt(2, w1 - 1);
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
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2460', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2461', dims: [w2, h2], formulaType: 'rect', area: w2 * h2 }
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

function generateTriTrapTri() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = randInt(4, 7);
    const b = randInt(2, a - 2);
    const h1 = randInt(2, 3);
    const h2 = randInt(1, 3);
    const h3 = randInt(2, 3);
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
        { x: botApex, y: y0 },
        { x: x0 + a, y: y0 + h1 },
        { x: x0 + a - rOff, y: y0 + h1 + h2 },
        { x: topApex, y: y0 + h1 + h2 + h3 },
        { x: x0 + lOff, y: y0 + h1 + h2 },
        { x: x0, y: y0 + h1 }
      ],
      subParts: [
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2460', dims: [a, h1], formulaType: 'tri', area: (a * h1) / 2 },
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446', dims: [a, b, h2], formulaType: 'trap', area: (a + b) * h2 / 2 },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2461', dims: [b, h3], formulaType: 'tri', area: (b * h3) / 2 }
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

// ===== Subtraction Generators =====

function generateRectMinusRect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w1 = randInt(4, 7), h1 = randInt(4, 7);
    const w2 = randInt(1, w1 - 2), h2 = randInt(1, h1 - 2);
    if (w1 > GRID_SIZE || h1 > GRID_SIZE) continue;

    const x0 = randInt(0, GRID_SIZE - w1);
    const y0 = randInt(0, GRID_SIZE - h1);
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
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a (\u0432\u044a\u043d\u0448\u0435\u043d)', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a (\u0432\u044a\u0442\u0440\u0435\u0448\u0435\u043d)', dims: [w2, h2], formulaType: 'rect', area: w2 * h2 }
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
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [tBase, tHeight], formulaType: 'tri', area: (tBase * tHeight) / 2 }
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
    const allInside = innerV.every(v => {
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
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a (\u0432\u044a\u043d\u0448\u0435\u043d)', dims: [base1, h1], formulaType: 'tri', area: (base1 * h1) / 2 },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a (\u0432\u044a\u0442\u0440\u0435\u0448\u0435\u043d)', dims: [base2, h2], formulaType: 'tri', area: (base2 * h2) / 2 }
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

function generateRectMinusPara() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w1 = randInt(5, 7), h1 = randInt(4, 7);
    if (w1 > GRID_SIZE || h1 > GRID_SIZE) continue;
    const pBase = randInt(2, w1 - 1);
    const pH = randInt(2, h1 - 1);
    const pOff = randInt(1, 2) * (Math.random() < 0.5 ? 1 : -1);
    const pBBoxW = Math.max(pBase, pBase + pOff) - Math.min(0, pOff);
    if (pBBoxW > w1 || pH > h1) continue;

    const x0 = randInt(0, GRID_SIZE - w1);
    const y0 = randInt(0, GRID_SIZE - h1);
    const pBL = Math.min(0, pOff);
    const dxMax = w1 - pBBoxW;
    const dyMax = h1 - pH;
    const dx = randInt(0, dxMax);
    const dy = randInt(0, dyMax);
    const pX = x0 + dx - pBL;

    const outerV = [
      { x: x0, y: y0 }, { x: x0 + w1, y: y0 },
      { x: x0 + w1, y: y0 + h1 }, { x: x0, y: y0 + h1 }
    ];
    const innerV = [
      { x: pX, y: y0 + dy }, { x: pX + pBase, y: y0 + dy },
      { x: pX + pBase + pOff, y: y0 + dy + pH }, { x: pX + pOff, y: y0 + dy + pH }
    ];
    const ok = innerV.every(v => v.x >= x0 && v.x <= x0 + w1 && v.y >= y0 && v.y <= y0 + h1);
    if (!ok) continue;

    return {
      figure: 'mixed', template: 'rectMinusPara', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a', dims: [pBase, pH], formulaType: 'para', area: pBase * pH }
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

function generateRectMinusTrap() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const w1 = randInt(5, 8), h1 = randInt(4, 7);
    if (w1 > GRID_SIZE || h1 > GRID_SIZE) continue;
    const a = randInt(3, w1 - 1);
    const b = randInt(2, a - 1);
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
    const ok = innerV.every(v => v.x >= x0 && v.x <= x0 + w1 && v.y >= y0 && v.y <= y0 + h1);
    if (!ok) continue;

    return {
      figure: 'mixed', template: 'rectMinusTrap', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [w1, h1], formulaType: 'rect', area: w1 * h1 },
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446', dims: [a, b, tH], formulaType: 'trap', area: (a + b) * tH / 2 }
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
    const ok = innerV.every(v => pointInPolygon(v, outerV) ||
      outerV.some(ov => ov.x === v.x && ov.y === v.y));
    if (!ok) continue;

    return {
      figure: 'mixed', template: 'paraMinusTri', subtraction: true,
      vertices: outerV, innerVertices: innerV,
      subParts: [
        { label: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a', dims: [base, pH], formulaType: 'para', area: base * pH },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [tBase, tH], formulaType: 'tri', area: (tBase * tH) / 2 }
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

    const dy = randInt(0, tH - triH);
    const rowLeft = Math.ceil(x0 + lOff * dy / tH);
    const rowRight = Math.floor(x0 + a - rOff * dy / tH);
    if (triBase > rowRight - rowLeft) continue;
    const tX = randInt(rowLeft, rowRight - triBase);
    const tY = y0 + dy;
    const apexX = tX + triBase / 2;
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
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446', dims: [a, b, tH], formulaType: 'trap', area: (a + b) * tH / 2 },
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [triBase, triH], formulaType: 'tri', area: (triBase * triH) / 2 }
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

function generateTriMinusRect() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = randInt(4, 8), h = randInt(4, 7);
    if (base > GRID_SIZE || h > GRID_SIZE) continue;
    if (base % 2 !== 0 || (base * h) % 2 !== 0) continue;
    const rW = randInt(2, base - 1), rH = randInt(1, h - 2);

    const x0 = randInt(0, GRID_SIZE - base);
    const y0 = randInt(0, GRID_SIZE - h);
    const apexX = x0 + base / 2;

    const dy = randInt(0, h - rH);
    const leftAtDy = x0 + (apexX - x0) * dy / h;
    const rightAtDy = x0 + base - (x0 + base - apexX) * dy / h;
    const leftAtDyRH = x0 + (apexX - x0) * (dy + rH) / h;
    const rightAtDyRH = x0 + base - (x0 + base - apexX) * (dy + rH) / h;
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
        { label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [base, h], formulaType: 'tri', area: (base * h) / 2 },
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [rW, rH], formulaType: 'rect', area: rW * rH }
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
        { label: '\u0422\u0440\u0430\u043f\u0435\u0446', dims: [a, b, tH], formulaType: 'trap', area: (a + b) * tH / 2 },
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [rW, rH], formulaType: 'rect', area: rW * rH }
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
        { label: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a', dims: [base, pH], formulaType: 'para', area: base * pH },
        { label: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a', dims: [rW, rH], formulaType: 'rect', area: rW * rH }
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

// ===== Template Arrays =====

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
  task.vertices = simplifyPolygon(task.vertices);
  task.innerVertices = simplifyPolygon(task.innerVertices);
  if (task.vertices.length < 3 || task.innerVertices.length < 3) return null;
  if (task.totalArea <= 0) return null;
  return task;
}

function generateMixed() {
  for (let attempt = 0; attempt < 50; attempt++) {
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
  return finalizeMixed(generateHouse());
}

// ===== Transform =====

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

// ===== Task Generation =====

function generateAllTasks(count, moduleId) {
  const mod = MODULES[moduleId];
  const gens = mod.generators;
  const all = [];

  if (moduleId === 'triangle') {
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
    const rhombusCount = count > 2 ? 1 : 0;
    for (let i = 0; i < rhombusCount; i++) {
      all.push(transformFigure(generateRhombus()));
    }
    for (let i = 0; i < count - rhombusCount; i++) {
      all.push(transformFigure(generateParallelogram()));
    }
  } else if (moduleId === 'mixed') {
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

// ===== SVG Rendering (string-based) =====

function renderGrid() {
  const parts = [];

  parts.push(svgEl('rect', {
    x: 0, y: 0, width: SVG_SIZE, height: SVG_SIZE,
    fill: '#fafafa', rx: 8
  }));

  parts.push(svgEl('rect', {
    x: px(0), y: py(GRID_SIZE), width: GRID_SIZE * CELL_PX, height: GRID_SIZE * CELL_PX,
    fill: '#fff', stroke: '#e0d6f0', 'stroke-width': 1
  }));

  for (let i = 0; i <= GRID_SIZE; i++) {
    parts.push(svgEl('line', {
      x1: px(i), y1: py(0), x2: px(i), y2: py(GRID_SIZE),
      stroke: '#e0d6f0', 'stroke-width': i === 0 || i === GRID_SIZE ? 1.5 : 0.7
    }));
    parts.push(svgEl('line', {
      x1: px(0), y1: py(i), x2: px(GRID_SIZE), y2: py(i),
      stroke: '#e0d6f0', 'stroke-width': i === 0 || i === GRID_SIZE ? 1.5 : 0.7
    }));
  }

  for (let x = 0; x <= GRID_SIZE; x++) {
    for (let y = 0; y <= GRID_SIZE; y++) {
      parts.push(svgEl('circle', {
        cx: px(x), cy: py(y), r: 1.8,
        fill: '#c4b8db'
      }));
    }
  }

  return parts.join('');
}

function renderPolygon(verts, labels) {
  const parts = [];
  const points = verts.map(v => `${px(v.x)},${py(v.y)}`).join(' ');
  parts.push(svgEl('polygon', {
    points,
    fill: 'rgba(124, 92, 191, 0.12)',
    stroke: '#7C5CBF',
    'stroke-width': 2.5,
    'stroke-linejoin': 'round'
  }));

  const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;

  verts.forEach((v, i) => {
    parts.push(svgEl('circle', {
      cx: px(v.x), cy: py(v.y), r: 5,
      fill: '#7C5CBF'
    }));

    let dx = v.x - cx;
    let dy = v.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx = (dx / len) * 18;
    dy = (dy / len) * 18;

    parts.push(svgEl('text', {
      x: px(v.x) + dx,
      y: py(v.y) - dy + 5,
      'text-anchor': 'middle',
      'font-size': 14,
      'font-weight': 'bold',
      fill: '#5E3DA6',
      'font-family': 'Nunito, sans-serif'
    }, escapeXml(labels[i])));
  });

  return parts.join('');
}

function renderDimensionMarker(centerX, centerY, cm) {
  const parts = [];
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

  parts.push(svgEl('line', {
    x1: dmX, y1: dmY, x2: dmX2, y2: dmY,
    stroke: '#888', 'stroke-width': 1.5
  }));
  parts.push(svgEl('line', {
    x1: dmX, y1: dmY - tick, x2: dmX, y2: dmY + tick,
    stroke: '#888', 'stroke-width': 1.5
  }));
  parts.push(svgEl('line', {
    x1: dmX2, y1: dmY - tick, x2: dmX2, y2: dmY + tick,
    stroke: '#888', 'stroke-width': 1.5
  }));

  const cmText = formatBG(cm);
  parts.push(svgEl('text', {
    x: (dmX + dmX2) / 2, y: dmY - 8,
    'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold',
    fill: '#666', 'font-family': 'Nunito, sans-serif'
  }, escapeXml(`${cmText} cm`)));

  return parts.join('');
}

// ===== Figure-specific Rendering =====

function renderTriangleFigure(task, cmPerSquare) {
  const parts = [];
  parts.push(renderPolygon(task.vertices, ['A', 'B', 'C']));
  const c = centroid(task.vertices);
  parts.push(renderDimensionMarker(c.x, c.y, cmPerSquare));
  return parts.join('');
}

function renderParallelogramFigure(task, cmPerSquare) {
  const parts = [];
  parts.push(renderPolygon(task.vertices, ['A', 'B', 'C', 'D']));
  const c = centroid(task.vertices);
  parts.push(renderDimensionMarker(c.x, c.y, cmPerSquare));
  return parts.join('');
}

function renderTrapezoidFigure(task, cmPerSquare) {
  const parts = [];
  parts.push(renderPolygon(task.vertices, ['A', 'B', 'C', 'D']));
  const c = centroid(task.vertices);
  parts.push(renderDimensionMarker(c.x, c.y, cmPerSquare));
  return parts.join('');
}

function strokePolygonMinusShared(verts, otherPoly, attrs) {
  const parts = [];
  for (let i = 0; i < verts.length; i++) {
    const A = verts[i], B = verts[(i + 1) % verts.length];
    const segs = visibleEdgeSegments(A, B, otherPoly);
    for (const [p1, p2] of segs) {
      parts.push(svgEl('line', {
        x1: px(p1.x), y1: py(p1.y), x2: px(p2.x), y2: py(p2.y),
        ...attrs
      }));
    }
  }
  return parts.join('');
}

function renderSubtractionFigure(task, cmPerSquare) {
  const parts = [];
  const outer = task.vertices;
  const inner = task.innerVertices;

  const outerD = outer.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(v.x)},${py(v.y)}`).join(' ') + ' Z';
  const innerRev = [...inner].reverse();
  const innerD = innerRev.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(v.x)},${py(v.y)}`).join(' ') + ' Z';

  parts.push(svgEl('path', {
    d: outerD + ' ' + innerD,
    'fill-rule': 'evenodd',
    fill: 'rgba(124, 92, 191, 0.12)',
    stroke: 'none'
  }));

  const edgeAttrs = { stroke: '#7C5CBF', 'stroke-width': 2.5, 'stroke-linecap': 'round' };
  parts.push(strokePolygonMinusShared(outer, inner, edgeAttrs));
  parts.push(strokePolygonMinusShared(inner, outer, edgeAttrs));

  const allVerts = [...outer, ...inner];
  const allCx = allVerts.reduce((s, v) => s + v.x, 0) / allVerts.length;
  const allCy = allVerts.reduce((s, v) => s + v.y, 0) / allVerts.length;

  const outerLabels = VERTEX_LABELS.slice(0, outer.length);
  outer.forEach((v, i) => {
    let dx = v.x - allCx;
    let dy = v.y - allCy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx = (dx / len) * 18;
    dy = (dy / len) * 18;
    parts.push(svgEl('circle', {
      cx: px(v.x), cy: py(v.y), r: 5, fill: '#7C5CBF'
    }));
    parts.push(svgEl('text', {
      x: px(v.x) + dx, y: py(v.y) - dy + 5,
      'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold',
      fill: '#5E3DA6', 'font-family': 'Nunito, sans-serif'
    }, escapeXml(outerLabels[i])));
  });

  const innerLabels = VERTEX_LABELS.slice(outer.length, outer.length + inner.length);
  inner.forEach((v, i) => {
    if (outer.some(ov => ov.x === v.x && ov.y === v.y)) return;
    let dx = v.x - allCx;
    let dy = v.y - allCy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx = (dx / len) * 18;
    dy = (dy / len) * 18;
    parts.push(svgEl('circle', {
      cx: px(v.x), cy: py(v.y), r: 5, fill: '#7C5CBF'
    }));
    parts.push(svgEl('text', {
      x: px(v.x) + dx, y: py(v.y) - dy + 5,
      'text-anchor': 'middle', 'font-size': 14, 'font-weight': 'bold',
      fill: '#5E3DA6', 'font-family': 'Nunito, sans-serif'
    }, escapeXml(innerLabels[i])));
  });

  const c = centroid(outer);
  parts.push(renderDimensionMarker(c.x, c.y, cmPerSquare));
  return parts.join('');
}

function renderMixedFigure(task, cmPerSquare) {
  if (task.subtraction) {
    return renderSubtractionFigure(task, cmPerSquare);
  }
  const parts = [];
  const labels = VERTEX_LABELS.slice(0, task.vertices.length);
  parts.push(renderPolygon(task.vertices, labels));
  const c = centroid(task.vertices);
  parts.push(renderDimensionMarker(c.x, c.y, cmPerSquare));
  return parts.join('');
}

// ===== Solution Rendering =====

function drawEdgeWithLabel(start, end, labelText, color, centerPt) {
  const parts = [];
  parts.push(svgEl('line', {
    x1: px(start.x), y1: py(start.y),
    x2: px(end.x), y2: py(end.y),
    stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'round'
  }));

  const horiz = start.y === end.y;
  let attrs = {
    'font-size': 13, 'font-weight': 'bold',
    fill: color, 'font-family': 'Nunito, sans-serif'
  };

  if (horiz) {
    const midPX = (px(start.x) + px(end.x)) / 2;
    const edgePY = py(start.y);
    const centerPY = py(centerPt.y);
    const outsideY = centerPY < edgePY ? edgePY + 14 : edgePY - 6;
    const insideY = centerPY < edgePY ? edgePY - 6 : edgePY + 14;
    let y = outsideY;
    if (outsideY < GRID_TOP + 10 || outsideY > GRID_BOTTOM - 4) y = insideY;
    attrs.x = clampX(midPX);
    attrs.y = clampY(y);
    attrs['text-anchor'] = 'middle';
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
    attrs.x = clampX(x);
    attrs.y = clampY(midPY + 4);
    attrs['text-anchor'] = goRight ? 'start' : 'end';
  }

  parts.push(textEl(attrs, labelText));
  return parts.join('');
}

function drawHeightWithLabel(top, foot, labelText, color, dashed, baseStart, baseEnd) {
  const parts = [];
  const attrs = {
    x1: px(top.x), y1: py(top.y),
    x2: px(foot.x), y2: py(foot.y),
    stroke: color, 'stroke-width': 2.5,
    'stroke-linecap': 'round'
  };
  if (dashed) attrs['stroke-dasharray'] = '8,5';
  parts.push(svgEl('line', attrs));

  parts.push(svgEl('circle', {
    cx: px(foot.x), cy: py(foot.y), r: 3.5,
    fill: color
  }));

  const baseHoriz = baseStart.y === baseEnd.y;
  let textAttrs = {
    'font-size': 13, 'font-weight': 'bold',
    fill: color, 'font-family': 'Nunito, sans-serif'
  };

  if (baseHoriz) {
    const hMidPy = (py(top.y) + py(foot.y)) / 2;
    let goRight = px(top.x) < px(5);
    let hLabelX = goRight ? px(top.x) + 12 : px(top.x) - 12;
    if (hLabelX < GRID_LEFT + 4 || hLabelX > GRID_RIGHT - 4) {
      goRight = !goRight;
      hLabelX = goRight ? px(top.x) + 12 : px(top.x) - 12;
    }
    textAttrs.x = clampX(hLabelX);
    textAttrs.y = clampY(hMidPy + 4);
    textAttrs['text-anchor'] = goRight ? 'start' : 'end';
  } else {
    const hMidPx = (px(top.x) + px(foot.x)) / 2;
    let goBelow = py(top.y) > py(5);
    let hLabelY = goBelow ? py(top.y) + 16 : py(top.y) - 8;
    if (hLabelY < GRID_TOP + 10 || hLabelY > GRID_BOTTOM - 4) {
      goBelow = !goBelow;
      hLabelY = goBelow ? py(top.y) + 16 : py(top.y) - 8;
    }
    textAttrs.x = clampX(hMidPx);
    textAttrs.y = clampY(hLabelY);
    textAttrs['text-anchor'] = 'middle';
  }

  parts.push(textEl(textAttrs, labelText));
  return parts.join('');
}

function drawRightAngleMarker(foot, top, baseStart, baseEnd, shapeCenter, color) {
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

  return svgEl('path', {
    d: `M${fx + v1x},${fy + v1y} L${fx + v1x + v2x},${fy + v1y + v2y} L${fx + v2x},${fy + v2y}`,
    fill: 'none', stroke: color, 'stroke-width': 1.5
  });
}

function renderTriangleSolution(task, correct, cmPerSquare) {
  const parts = [];
  const cm = cmPerSquare;
  const { baseStart: A, baseEnd: B, apex: C, heightFoot: H } = task;
  const baseCm = task.base * cm;
  const heightCm = task.height * cm;
  const horiz = A.y === B.y;
  const isRight = task.type === 'right';
  const baseLetter = isRight ? 'a' : triangleBaseLetter(task);
  const color = correct ? '#4CAF50' : '#EF5350';
  const heightLabel = isRight ? 'b' : `h_${baseLetter}`;

  // Base line
  parts.push(svgEl('line', {
    x1: px(A.x), y1: py(A.y),
    x2: px(B.x), y2: py(B.y),
    stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'round'
  }));

  // Base label
  const triCenterPY = py((A.y + B.y + C.y) / 3);
  const triCenterPX = px((A.x + B.x + C.x) / 3);
  let blAttrs = {
    'font-size': 13, 'font-weight': 'bold',
    fill: color, 'font-family': 'Nunito, sans-serif'
  };

  if (horiz) {
    blAttrs.x = clampX((px(A.x) + px(B.x)) / 2);
    const outsideY = triCenterPY < py(A.y) ? py(A.y) + 14 : py(A.y) - 6;
    const insideY = triCenterPY < py(A.y) ? py(A.y) - 6 : py(A.y) + 14;
    let y = outsideY;
    if (outsideY < GRID_TOP + 10 || outsideY > GRID_BOTTOM - 4) y = insideY;
    blAttrs.y = clampY(y);
    blAttrs['text-anchor'] = 'middle';
  } else {
    const midY = (py(A.y) + py(B.y)) / 2;
    let goRight = triCenterPX < px(A.x);
    let labelX = goRight ? px(A.x) + 10 : px(A.x) - 10;
    if (labelX < GRID_LEFT + 4 || labelX > GRID_RIGHT - 4) {
      goRight = !goRight;
      labelX = goRight ? px(A.x) + 10 : px(A.x) - 10;
    }
    blAttrs.x = clampX(labelX);
    blAttrs.y = clampY(midY + 4);
    blAttrs['text-anchor'] = goRight ? 'start' : 'end';
  }
  parts.push(textEl(blAttrs, `${baseLetter} = ${formatBG(baseCm)} cm`));

  // Obtuse: dashed extension
  if (task.type === 'obtuse') {
    parts.push(svgEl('line', {
      x1: px(H.x), y1: py(H.y),
      x2: horiz ? px(H.x < A.x ? A.x : B.x) : px(A.x),
      y2: horiz ? py(A.y) : py(H.y < Math.min(A.y, B.y) ? Math.min(A.y, B.y) : Math.max(A.y, B.y)),
      stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '6,4',
      'stroke-linecap': 'round'
    }));
  }

  // Height line
  const heightLineAttrs = {
    x1: px(C.x), y1: py(C.y),
    x2: px(H.x), y2: py(H.y),
    stroke: color, 'stroke-width': 2.5,
    'stroke-linecap': 'round'
  };
  if (!isRight) heightLineAttrs['stroke-dasharray'] = '8,5';
  parts.push(svgEl('line', heightLineAttrs));

  parts.push(svgEl('circle', {
    cx: px(H.x), cy: py(H.y), r: 3.5,
    fill: color
  }));

  // Height label
  let hlAttrs = {
    'font-size': 13, 'font-weight': 'bold',
    fill: color, 'font-family': 'Nunito, sans-serif'
  };
  if (horiz) {
    const hMidPy = (py(C.y) + py(H.y)) / 2;
    let goRight = px(C.x) < px(5);
    let hLabelX = goRight ? px(C.x) + 12 : px(C.x) - 12;
    if (hLabelX < GRID_LEFT + 4 || hLabelX > GRID_RIGHT - 4) {
      goRight = !goRight;
      hLabelX = goRight ? px(C.x) + 12 : px(C.x) - 12;
    }
    hlAttrs.x = clampX(hLabelX);
    hlAttrs.y = clampY(hMidPy + 4);
    hlAttrs['text-anchor'] = goRight ? 'start' : 'end';
  } else {
    const hMidPx = (px(C.x) + px(H.x)) / 2;
    let goBelow = py(C.y) > py(5);
    let hLabelY = goBelow ? py(C.y) + 16 : py(C.y) - 8;
    if (hLabelY < GRID_TOP + 10 || hLabelY > GRID_BOTTOM - 4) {
      goBelow = !goBelow;
      hLabelY = goBelow ? py(C.y) + 16 : py(C.y) - 8;
    }
    hlAttrs.x = clampX(hMidPx);
    hlAttrs.y = clampY(hLabelY);
    hlAttrs['text-anchor'] = 'middle';
  }
  parts.push(textEl(hlAttrs, `${heightLabel} = ${formatBG(heightCm)} cm`));

  // Right-angle marker
  const mSize = 8;
  const mx = px(H.x);
  const my = py(H.y);
  if (horiz) {
    const mDirX = H.x <= A.x ? 1 : (H.x >= B.x ? -1 : 1);
    parts.push(svgEl('path', {
      d: `M${mx},${my - mSize} L${mx + mSize * mDirX},${my - mSize} L${mx + mSize * mDirX},${my}`,
      fill: 'none', stroke: color, 'stroke-width': 1.5
    }));
  } else {
    const mDirY = H.y <= Math.min(A.y, B.y) ? 1 : -1;
    const mdy = -mSize * mDirY;
    const mdx = C.x > H.x ? mSize : -mSize;
    parts.push(svgEl('path', {
      d: `M${mx + mdx},${my} L${mx + mdx},${my + mdy} L${mx},${my + mdy}`,
      fill: 'none', stroke: color, 'stroke-width': 1.5
    }));
  }

  return parts.join('');
}

function renderParallelogramSolution(task, correct, cmPerSquare) {
  const parts = [];
  const cm = cmPerSquare;
  const { baseStart: A, baseEnd: B, heightTop: T, heightFoot: H } = task;
  const baseCm = task.base * cm;
  const heightCm = task.height * cm;
  const color = correct ? '#4CAF50' : '#EF5350';
  const center = centroid(task.vertices);

  parts.push(drawEdgeWithLabel(A, B, `a = ${formatBG(baseCm)} cm`, color, center));
  parts.push(drawHeightWithLabel(T, H, `h\u2090 = ${formatBG(heightCm)} cm`, color, true, A, B));
  parts.push(drawRightAngleMarker(H, T, A, B, center, color));
  return parts.join('');
}

function trapezoidOrientedLabels(task) {
  const { bottomStart, bottomEnd, topStart, topEnd, baseA, baseB } = task;
  return {
    aStart: bottomStart, aEnd: bottomEnd, aLen: baseA,
    bStart: topStart,    bEnd: topEnd,    bLen: baseB
  };
}

function renderTrapezoidSolution(task, correct, cmPerSquare) {
  const parts = [];
  const cm = cmPerSquare;
  const { heightTop: T, heightFoot: H, bottomStart, bottomEnd } = task;
  const { aStart, aEnd, aLen, bStart, bEnd, bLen } = trapezoidOrientedLabels(task);
  const aCm = aLen * cm;
  const bCm = bLen * cm;
  const heightCm = task.height * cm;
  const color = correct ? '#4CAF50' : '#EF5350';
  const center = centroid(task.vertices);

  parts.push(drawEdgeWithLabel(aStart, aEnd, `a = ${formatBG(aCm)} cm`, color, center));
  parts.push(drawEdgeWithLabel(bStart, bEnd, `b = ${formatBG(bCm)} cm`, color, center));
  parts.push(drawHeightWithLabel(T, H, `h = ${formatBG(heightCm)} cm`, color, !task.heightOnSide, bottomStart, bottomEnd));
  parts.push(drawRightAngleMarker(H, T, bottomStart, bottomEnd, center, color));
  return parts.join('');
}

function renderFrameSolution(task, correct, cmPerSquare) {
  const parts = [];
  const cm = cmPerSquare;
  const color = correct ? '#4CAF50' : '#EF5350';
  const decomp = decomposeBBoxFrame(task.vertices);

  const frameX = px(decomp.bbox.minX);
  const frameY = py(decomp.bbox.maxY);
  const frameW = decomp.bboxWidth * CELL_PX;
  const frameH = decomp.bboxHeight * CELL_PX;
  parts.push(svgEl('rect', {
    x: frameX, y: frameY, width: frameW, height: frameH,
    fill: 'none', stroke: color, 'stroke-width': 2.5,
    'stroke-dasharray': '6,3'
  }));

  decomp.pieces.forEach((piece, idx) => {
    parts.push(svgEl('line', {
      x1: px(piece.pV.x), y1: py(piece.pV.y),
      x2: px(piece.pH.x), y2: py(piece.pH.y),
      stroke: color, 'stroke-width': 1.5,
      'stroke-dasharray': '4,3', 'stroke-linecap': 'round'
    }));

    const centroidX = (piece.corner.x + piece.pV.x + piece.pH.x) / 3;
    const centroidY = (piece.corner.y + piece.pV.y + piece.pH.y) / 3;
    parts.push(svgEl('text', {
      x: px(centroidX), y: py(centroidY) + 6,
      'text-anchor': 'middle',
      'font-size': 18, 'font-weight': 'bold',
      fill: color, 'font-family': 'Nunito, sans-serif',
      stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke'
    }, escapeXml(`S${toSubscript(idx + 1)}`)));
  });

  const points = task.vertices.map(v => `${px(v.x)},${py(v.y)}`).join(' ');
  parts.push(svgEl('polygon', {
    points,
    fill: 'none',
    stroke: color,
    'stroke-width': 3,
    'stroke-linejoin': 'round'
  }));

  return parts.join('');
}

function renderMixedSolution(task, correct, cmPerSquare) {
  if (task.subtraction) {
    return renderSubtractionSolution(task, correct, cmPerSquare);
  }
  const parts = [];
  const color = correct ? '#4CAF50' : '#EF5350';

  for (const edge of task.sharedEdges) {
    const [p1, p2] = edge;
    parts.push(svgEl('line', {
      x1: px(p1.x), y1: py(p1.y),
      x2: px(p2.x), y2: py(p2.y),
      stroke: '#7C5CBF', 'stroke-width': 2,
      'stroke-dasharray': '6,4', 'stroke-linecap': 'round'
    }));
  }

  const points = task.vertices.map(v => `${px(v.x)},${py(v.y)}`).join(' ');
  parts.push(svgEl('polygon', {
    points,
    fill: 'none',
    stroke: color,
    'stroke-width': 3,
    'stroke-linejoin': 'round'
  }));

  if (task.subCentroids) {
    task.subCentroids.forEach((c, i) => {
      parts.push(svgEl('text', {
        x: px(c.x), y: py(c.y) + 7,
        'text-anchor': 'middle',
        'font-size': 20, 'font-weight': 'bold',
        fill: '#5E3DA6', 'font-family': 'Nunito, sans-serif',
        stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke'
      }, escapeXml(`S${toSubscript(i + 1)}`)));
    });
  }

  return parts.join('');
}

function renderSubtractionSolution(task, correct, cmPerSquare) {
  const parts = [];
  const color = correct ? '#4CAF50' : '#EF5350';

  parts.push(strokePolygonMinusShared(task.vertices, task.innerVertices, {
    stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round'
  }));

  const inv = task.innerVertices;
  for (let i = 0; i < inv.length; i++) {
    const p1 = inv[i], p2 = inv[(i + 1) % inv.length];
    parts.push(svgEl('line', {
      x1: px(p1.x), y1: py(p1.y), x2: px(p2.x), y2: py(p2.y),
      stroke: '#fff', 'stroke-width': 5, 'stroke-linecap': 'round'
    }));
    parts.push(svgEl('line', {
      x1: px(p1.x), y1: py(p1.y), x2: px(p2.x), y2: py(p2.y),
      stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round',
      'stroke-dasharray': '5,4'
    }));
  }

  const outerC = centroid(task.vertices);
  const innerC = centroid(task.innerVertices);
  let s1 = outerC;
  if (pointInPolygon(s1, task.innerVertices)) {
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
    s1 = { x: (bestMid.x + outerC.x) / 2, y: (bestMid.y + outerC.y) / 2 };
  }

  const labels = [
    { pt: s1, text: `S${toSubscript(1)}` },
    { pt: innerC, text: `S${toSubscript(2)}` }
  ];
  for (const { pt, text } of labels) {
    parts.push(svgEl('text', {
      x: px(pt.x), y: py(pt.y) + 7,
      'text-anchor': 'middle',
      'font-size': 20, 'font-weight': 'bold',
      fill: '#5E3DA6', 'font-family': 'Nunito, sans-serif',
      stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke'
    }, escapeXml(text)));
  }

  return parts.join('');
}

// ===== Formula HTML =====

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
    $$S_{\u0440\u0430\u043c\u043a\u0430} = ${formatBG(frameWcm)} \\;\\text{.}\\; ${formatBG(frameHcm)} = ${formatBG(frameAreaCm)} \\text{ cm}^2$$
    ${piecesHTML}
    $$S_{\u043e\u0442\u0440\u044f\u0437\u0430\u043d\u043e} = ${cutoffSum} = ${formatBG(totalCutoff)} \\text{ cm}^2$$
    $$S = S_{\u0440\u0430\u043c\u043a\u0430} - S_{\u043e\u0442\u0440\u044f\u0437\u0430\u043d\u043e} = ${formatBG(frameAreaCm)} - ${formatBG(totalCutoff)} = ${formatBG(area)} \\text{ cm}^2$$
  `;
}

// ===== MODULES =====

const MODULES = {
  triangle: {
    label: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
    generators: [generateRightTriangle, generateAcuteTriangle, generateObtuseTriangle],
    computeArea: (task, cm) => task.nonGrid
      ? shoelace(task.vertices) * cm * cm
      : (task.base * cm * task.height * cm) / 2,
    renderFigure: renderTriangleFigure,
    renderSolution: (task, correct, cmPerSquare) => task.nonGrid
      ? renderFrameSolution(task, correct, cmPerSquare)
      : renderTriangleSolution(task, correct, cmPerSquare),
    formulaHTML: (task, cm, area) => task.nonGrid
      ? frameFormulaHTML(task, cm, area)
      : triangleFormulaHTML(task, cm, area),
    typeLabel: (task) => task.nonGrid
      ? '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a (\u0441 \u0440\u0430\u043c\u043a\u0430)'
      : `${task.typeBG} \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a`
  },
  parallelogram: {
    label: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a',
    generators: [generateParallelogram, generateRhombus],
    computeArea: (task, cm) => task.nonGrid
      ? shoelace(task.vertices) * cm * cm
      : task.base * cm * task.height * cm,
    renderFigure: renderParallelogramFigure,
    renderSolution: (task, correct, cmPerSquare) => task.nonGrid
      ? renderFrameSolution(task, correct, cmPerSquare)
      : renderParallelogramSolution(task, correct, cmPerSquare),
    formulaHTML: (task, cm, area) => task.nonGrid
      ? frameFormulaHTML(task, cm, area)
      : parallelogramFormulaHTML(task, cm, area),
    typeLabel: (task) => {
      if (task.nonGrid) return '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a (\u0441 \u0440\u0430\u043c\u043a\u0430)';
      if (task.isRhombus) return '\u0420\u043e\u043c\u0431';
      return '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a';
    }
  },
  trapezoid: {
    label: '\u0422\u0440\u0430\u043f\u0435\u0446',
    generators: [generateTrapezoid],
    computeArea: (task, cm) => ((task.baseA + task.baseB) * cm * task.height * cm) / 2,
    renderFigure: renderTrapezoidFigure,
    renderSolution: renderTrapezoidSolution,
    formulaHTML: trapezoidFormulaHTML,
    typeLabel: () => '\u0422\u0440\u0430\u043f\u0435\u0446'
  },
  mixed: {
    label: '\u0421\u043c\u0435\u0441\u0435\u043d\u0438 \u0444\u0438\u0433\u0443\u0440\u0438',
    generators: [generateMixed],
    computeArea: (task, cm) => task.nonGrid
      ? shoelace(task.vertices) * cm * cm
      : task.totalArea * cm * cm,
    renderFigure: renderMixedFigure,
    renderSolution: (task, correct, cmPerSquare) => task.nonGrid
      ? renderFrameSolution(task, correct, cmPerSquare)
      : renderMixedSolution(task, correct, cmPerSquare),
    formulaHTML: (task, cm, area) => task.nonGrid
      ? frameFormulaHTML(task, cm, area)
      : mixedFormulaHTML(task, cm, area),
    typeLabel: (task) => {
      if (task.nonGrid) return '\u0421\u043c\u0435\u0441\u0435\u043d\u0430 \u0444\u0438\u0433\u0443\u0440\u0430 (\u0441 \u0440\u0430\u043c\u043a\u0430)';
      const labels = {
        house: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a + \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        rectTrap: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a + \u0442\u0440\u0430\u043f\u0435\u0446',
        rectTriSide: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a + \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        trapTriangle: '\u0422\u0440\u0430\u043f\u0435\u0446 + \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        paraTriangle: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a + \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        tower: '\u0422\u0440\u0430\u043f\u0435\u0446 + \u043f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a + \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        rectObtuseTriangle: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a + \u0442\u044a\u043f\u043e\u044a\u0433\u044a\u043b\u0435\u043d \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        trapRect: '\u0422\u0440\u0430\u043f\u0435\u0446 + \u043f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        paraRect: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a + \u043f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        doubleTriangle: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a + \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        rectTriBoth: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a + \u043f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a + \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        trapTrap: '\u0422\u0440\u0430\u043f\u0435\u0446 + \u0442\u0440\u0430\u043f\u0435\u0446',
        paraTrap: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a + \u0442\u0440\u0430\u043f\u0435\u0446',
        stepShape: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a + \u043f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        triTrapTri: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a + \u0442\u0440\u0430\u043f\u0435\u0446 + \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        rectMinusRect: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2212 \u043f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        rectMinusTri: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2212 \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        triMinusTri: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2212 \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        rectMinusPara: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2212 \u0443\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a',
        rectMinusTrap: '\u041f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2212 \u0442\u0440\u0430\u043f\u0435\u0446',
        paraMinusTri: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a \u2212 \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        trapMinusTri: '\u0422\u0440\u0430\u043f\u0435\u0446 \u2212 \u0442\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        triMinusRect: '\u0422\u0440\u0438\u044a\u0433\u044a\u043b\u043d\u0438\u043a \u2212 \u043f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        trapMinusRect: '\u0422\u0440\u0430\u043f\u0435\u0446 \u2212 \u043f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a',
        paraMinusRect: '\u0423\u0441\u043f\u043e\u0440\u0435\u0434\u043d\u0438\u043a \u2212 \u043f\u0440\u0430\u0432\u043e\u044a\u0433\u044a\u043b\u043d\u0438\u043a'
      };
      return labels[task.template] || '\u0421\u043c\u0435\u0441\u0435\u043d\u0430 \u0444\u0438\u0433\u0443\u0440\u0430';
    }
  }
};

// ===== Rendering Wrappers =====

function renderFigureSVG(task, moduleId, cmPerSquare) {
  const mod = MODULES[moduleId];
  let content = renderGrid();
  content += mod.renderFigure(task, cmPerSquare);
  return `<svg id="grid-svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
}

function renderSolutionSVG(task, moduleId, correct, cmPerSquare) {
  const mod = MODULES[moduleId];
  let content = renderGrid();
  content += mod.renderFigure(task, cmPerSquare);
  content += mod.renderSolution(task, correct, cmPerSquare);
  return `<svg id="grid-svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
}

// ===== Lambda Handler =====

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.rawPath || '';
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    if (path === '/generate') {
      const { figureType, taskCount, cmPerSquare } = body;
      const moduleId = figureType || 'triangle';
      const count = Math.min(Math.max(parseInt(taskCount) || 6, 1), 100);
      const cm = parseFloat(cmPerSquare) || 1;

      if (!MODULES[moduleId]) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown figure type' }) };
      }

      const mod = MODULES[moduleId];
      const tasks = generateAllTasks(count, moduleId);

      const result = tasks.map(task => {
        const token = encryptTask({ task, moduleId });
        const svgFigure = renderFigureSVG(task, moduleId, cm);
        const typeLabel = mod.typeLabel(task);
        return { id: token, svgFigure, typeLabel };
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ tasks: result })
      };

    } else if (path === '/check') {
      const { taskId, answer, cmPerSquare } = body;

      if (!taskId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing taskId' }) };
      }

      let decrypted;
      try {
        decrypted = decryptTask(taskId);
      } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid token' }) };
      }

      const { task, moduleId } = decrypted;
      const cm = parseFloat(cmPerSquare) || 1;
      const mod = MODULES[moduleId];

      if (!mod) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown module' }) };
      }

      const correctArea = mod.computeArea(task, cm);
      const userAnswer = parseFloat(answer);
      const correct = Math.abs(userAnswer - correctArea) < 0.05;

      const svgSolution = renderSolutionSVG(task, moduleId, correct, cm);
      const formulaHTML = mod.formulaHTML(task, cm, correctArea);
      const typeLabel = mod.typeLabel(task);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ correct, svgSolution, formulaHTML, correctArea, typeLabel })
      };

    } else {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal error', message: err.message })
    };
  }
};
