// Regression tests for js/figure-areas.js
//
// Run with: node tests/figure-areas.test.js
// Must pass before every push. These lock in behavior that has already been
// verified against the UI, so the next refactor can't silently regress it.

const fs = require('fs');
const path = require('path');

// Stub the minimal browser surface figure-areas.js touches at import time
global.document = {
  addEventListener: () => {},
  querySelector: () => null,
  createElementNS: () => ({
    setAttribute: () => {},
    appendChild: () => {},
    textContent: ''
  })
};
global.window = {};

const srcPath = path.join(__dirname, '..', 'js', 'figure-areas.js');
const src = fs.readFileSync(srcPath, 'utf8');

// Expose everything we want to test via the return of a Function wrapper
const loader = new Function(src + `
  return {
    GRID_SIZE, CELL_PX, PAD_PX, SVG_SIZE,
    GRID_LEFT, GRID_RIGHT, GRID_TOP, GRID_BOTTOM,
    clampX, clampY,
    shoelace, decomposeBBoxFrame,
    transformFigure, generateAllTasks,
    generateRightTriangle, generateAcuteTriangle, generateObtuseTriangle,
    generateParallelogram, generateRhombus,
    generateTrapezoid,
    generateTriangleNonGrid, generateParallelogramNonGrid,
    generateFramedPentagon, generateFramedHexagon,
    generateMixed, generateHouse, generateRectTrapezoid,
    generateRectTriangleSide, generateTrapezoidTriangle,
    generateParaTriangle, generateTower, generateRectObtuseTriangle,
    MIXED_TEMPLATES, SUBTRACTION_TEMPLATES, simplifyPolygon, finalizeSubtraction,
    MODULES,
    parallelogramFormulaHTML, triangleFormulaHTML, trapezoidFormulaHTML,
    mixedFormulaHTML, frameFormulaHTML,
    trapezoidOrientedLabels, transformDeep,
    signedArea, toCounterClockwise,
    isValidAnswerInput, triangleBaseLetter
  };
`);
const fa = loader();

// -----------------------------------------------------------------
// Tiny assertion helper
// -----------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  ✗ ${name}`);
    console.log(`      ${e.message}`);
  }
}

function section(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'equality'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertClose(actual, expected, eps, msg) {
  if (Math.abs(actual - expected) > (eps || 1e-6)) {
    throw new Error(`${msg || 'close'}: expected ≈ ${expected}, got ${actual}`);
  }
}

function inGrid(pt) {
  return pt.x >= 0 && pt.x <= fa.GRID_SIZE && pt.y >= 0 && pt.y <= fa.GRID_SIZE;
}

// -----------------------------------------------------------------
// Tests
// -----------------------------------------------------------------

section('module surface', () => {
  test('all four modules are defined', () => {
    assert(fa.MODULES.triangle);
    assert(fa.MODULES.parallelogram);
    assert(fa.MODULES.trapezoid);
    assert(fa.MODULES.mixed);
  });

  test('each module has required fields', () => {
    for (const id of ['triangle', 'parallelogram', 'trapezoid', 'mixed']) {
      const m = fa.MODULES[id];
      assert(typeof m.label === 'string', `${id}.label`);
      assert(typeof m.titlePlural === 'string', `${id}.titlePlural`);
      assert(typeof m.computeArea === 'function', `${id}.computeArea`);
      assert(typeof m.renderFigure === 'function', `${id}.renderFigure`);
      assert(typeof m.renderSolution === 'function', `${id}.renderSolution`);
      assert(typeof m.formulaHTML === 'function', `${id}.formulaHTML`);
      assert(typeof m.typeLabel === 'function', `${id}.typeLabel`);
    }
  });
});

section('grid bounds', () => {
  test('grid constants position the grid inside the SVG padding', () => {
    assertEq(fa.GRID_LEFT, fa.PAD_PX);
    assertEq(fa.GRID_RIGHT, fa.PAD_PX + fa.GRID_SIZE * fa.CELL_PX);
    assertEq(fa.GRID_TOP, fa.PAD_PX);
    assertEq(fa.GRID_BOTTOM, fa.PAD_PX + fa.GRID_SIZE * fa.CELL_PX);
  });

  test('clampX/clampY never escape the grid square', () => {
    for (let i = -50; i <= fa.SVG_SIZE + 50; i += 5) {
      const cx = fa.clampX(i);
      assert(cx >= fa.GRID_LEFT && cx <= fa.GRID_RIGHT, `clampX(${i})=${cx}`);
      const cy = fa.clampY(i);
      assert(cy >= fa.GRID_TOP && cy <= fa.GRID_BOTTOM, `clampY(${i})=${cy}`);
    }
  });
});

section('triangle module', () => {
  test('generates exact count of tasks', () => {
    const tasks = fa.generateAllTasks(12, 'triangle');
    assertEq(tasks.length, 12);
  });

  test('never generates non-grid frame variants', () => {
    for (let i = 0; i < 5; i++) {
      const tasks = fa.generateAllTasks(20, 'triangle');
      for (const t of tasks) {
        assert(!t.nonGrid, 'triangle task must not be nonGrid');
        assert(t.figure === 'triangle', `expected triangle figure, got ${t.figure}`);
      }
    }
  });

  test('distributes evenly across 3 subtypes', () => {
    const tasks = fa.generateAllTasks(9, 'triangle');
    const counts = { right: 0, acute: 0, obtuse: 0 };
    for (const t of tasks) counts[t.type]++;
    assertEq(counts.right, 3);
    assertEq(counts.acute, 3);
    assertEq(counts.obtuse, 3);
  });

  test('every task has vertices inside the grid', () => {
    const tasks = fa.generateAllTasks(20, 'triangle');
    for (const t of tasks) {
      assertEq(t.vertices.length, 3);
      for (const v of t.vertices) assert(inGrid(v), `vertex ${JSON.stringify(v)} outside grid`);
    }
  });

  test('computeArea matches shoelace for every generated task', () => {
    const tasks = fa.generateAllTasks(30, 'triangle');
    for (const t of tasks) {
      const direct = fa.MODULES.triangle.computeArea(t, 1);
      const sh = fa.shoelace(t.vertices);
      assertClose(direct, sh, 1e-9, `triangle ${t.type}`);
    }
  });

  test('right-triangle formula uses a, b', () => {
    const t = fa.generateRightTriangle();
    const html = fa.triangleFormulaHTML(t, 1, 1);
    assert(/a.*b/.test(html) && !/h_a/.test(html), 'right triangle should use a and b, not h_a');
  });

  test('non-right triangle formula uses h_{letter} from apex position', () => {
    for (let i = 0; i < 30; i++) {
      const base = fa.generateAcuteTriangle();
      const t = fa.transformFigure(base);
      const letter = fa.triangleBaseLetter(t);
      assert(['a', 'b', 'c'].includes(letter));
      const html = fa.triangleFormulaHTML(t, 1, 1);
      const re = new RegExp(`h_${letter}`);
      assert(re.test(html), `formula should contain h_${letter}: ${html}`);
    }
  });

  test('obtuse triangle formula uses the apex-driven letter', () => {
    for (let i = 0; i < 30; i++) {
      const base = fa.generateObtuseTriangle();
      const t = fa.transformFigure(base);
      const letter = fa.triangleBaseLetter(t);
      assert(['a', 'b', 'c'].includes(letter));
      const html = fa.triangleFormulaHTML(t, 1, 1);
      const re = new RegExp(`h_${letter}`);
      assert(re.test(html));
    }
  });
});

section('parallelogram module', () => {
  test('generates exact count of tasks', () => {
    const tasks = fa.generateAllTasks(10, 'parallelogram');
    assertEq(tasks.length, 10);
  });

  test('never generates non-grid frame variants', () => {
    for (let i = 0; i < 5; i++) {
      const tasks = fa.generateAllTasks(20, 'parallelogram');
      for (const t of tasks) {
        assert(!t.nonGrid, 'parallelogram task must not be nonGrid');
        assert(t.figure === 'parallelogram', `expected parallelogram figure, got ${t.figure}`);
      }
    }
  });

  test('guarantees at least one rhombus when count > 2', () => {
    for (let i = 0; i < 10; i++) {
      const tasks = fa.generateAllTasks(6, 'parallelogram');
      const rhombi = tasks.filter(t => t.isRhombus);
      assert(rhombi.length >= 1, `run ${i}: no rhombus in parallelogram batch of 6`);
    }
  });

  test('does not force a rhombus when count <= 2', () => {
    // 10 runs of count=2 should occasionally contain zero rhombi
    let sawRhombusless = false;
    for (let i = 0; i < 30; i++) {
      const tasks = fa.generateAllTasks(2, 'parallelogram');
      if (!tasks.some(t => t.isRhombus)) { sawRhombusless = true; break; }
    }
    assert(sawRhombusless, 'count=2 should not force a rhombus slot');
  });

  test('every task has 4 in-grid vertices', () => {
    const tasks = fa.generateAllTasks(20, 'parallelogram');
    for (const t of tasks) {
      assertEq(t.vertices.length, 4);
      for (const v of t.vertices) assert(inGrid(v), `vertex ${JSON.stringify(v)} outside grid`);
    }
  });

  test('rhombus has base² = off² + height²', () => {
    for (let i = 0; i < 20; i++) {
      const r = fa.generateRhombus();
      // Reconstruct the offset from vertices (pre-transform they're canonical)
      const base = r.base;
      const height = r.height;
      // base² must equal off² + h² where off ∈ {3,4,-3,-4}
      const expectedSideSq = base * base;
      // All 4 sides of a rhombus must be equal to base
      const sides = [];
      for (let j = 0; j < 4; j++) {
        const p = r.vertices[j];
        const q = r.vertices[(j + 1) % 4];
        sides.push((q.x - p.x) ** 2 + (q.y - p.y) ** 2);
      }
      for (const s of sides) assertEq(s, expectedSideSq, 'rhombus sides must all equal base²');
    }
  });

  test('parallelogram formula uses h_a subscript', () => {
    const t = fa.generateParallelogram();
    const html = fa.parallelogramFormulaHTML(t, 1, 1);
    assert(/h_a/.test(html), 'parallelogram formula must contain h_a');
  });

  test('computeArea equals base * height', () => {
    for (const t of fa.generateAllTasks(15, 'parallelogram')) {
      const area = fa.MODULES.parallelogram.computeArea(t, 1);
      assertEq(area, t.base * t.height);
    }
  });
});

section('trapezoid module', () => {
  test('generates exact count of tasks', () => {
    const tasks = fa.generateAllTasks(8, 'trapezoid');
    assertEq(tasks.length, 8);
  });

  test('never generates non-grid frame variants', () => {
    for (let i = 0; i < 5; i++) {
      const tasks = fa.generateAllTasks(12, 'trapezoid');
      for (const t of tasks) {
        assert(!t.nonGrid, 'trapezoid task must not be nonGrid');
        assert(t.figure === 'trapezoid');
      }
    }
  });

  test('every task has 4 in-grid vertices and b < a', () => {
    const tasks = fa.generateAllTasks(20, 'trapezoid');
    for (const t of tasks) {
      assertEq(t.vertices.length, 4);
      assert(t.baseB < t.baseA, 'top base must be shorter than bottom base');
      for (const v of t.vertices) assert(inGrid(v), `vertex ${JSON.stringify(v)} outside grid`);
    }
  });

  test('area formula (a+b)*h/2 matches computeArea', () => {
    for (const t of fa.generateAllTasks(20, 'trapezoid')) {
      const expected = (t.baseA + t.baseB) * t.height / 2;
      assertClose(fa.MODULES.trapezoid.computeArea(t, 1), expected);
    }
  });
});

section('mixed module', () => {
  test('generates exact count of tasks', () => {
    const tasks = fa.generateAllTasks(12, 'mixed');
    assertEq(tasks.length, 12);
  });

  test('eventually generates non-grid frame variants', () => {
    let sawNonGrid = false;
    for (let i = 0; i < 30 && !sawNonGrid; i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      if (tasks.some(t => t.nonGrid)) sawNonGrid = true;
    }
    assert(sawNonGrid, 'mixed mode should produce at least one non-grid task across 30 batches');
  });

  test('eventually generates every current template', () => {
    const seen = new Set();
    for (let i = 0; i < 120; i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      for (const t of tasks) if (t.template) seen.add(t.template);
    }
    for (const expected of ['house', 'rectTrap', 'trapTriangle']) {
      assert(seen.has(expected), `template ${expected} never generated across 120 batches`);
    }
  });

  test('never generates plain rectangle / L-shape templates', () => {
    for (let i = 0; i < 60; i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      for (const t of tasks) {
        assert(t.template !== 'rect', 'rect template should be removed');
        assert(t.template !== 'lshape', 'lshape template should be removed');
        assert(t.template !== 'square', 'square template should be removed');
      }
    }
  });

  test('every compound task has subParts with positive area summing to totalArea', () => {
    const tasks = fa.generateAllTasks(40, 'mixed');
    for (const t of tasks) {
      if (t.nonGrid) continue;
      assert(Array.isArray(t.subParts) && t.subParts.length >= 1);
      let combined = 0;
      for (const p of t.subParts) {
        assert(p.area > 0, 'sub-part area must be positive');
        combined += p.area;
      }
      if (t.subtraction) {
        // For subtraction: totalArea = subParts[0] - subParts[1]
        const expected = t.subParts[0].area - t.subParts[1].area;
        assertClose(expected, t.totalArea, 1e-9, 'subtraction: S1-S2 must equal totalArea');
      } else {
        assertClose(combined, t.totalArea, 1e-9, 'sub-part sum must equal totalArea');
      }
    }
  });

  test('every compound task has in-grid vertices', () => {
    const tasks = fa.generateAllTasks(40, 'mixed');
    for (const t of tasks) {
      for (const v of t.vertices) assert(inGrid(v), `vertex ${JSON.stringify(v)} outside grid`);
    }
  });

  test('compound totalArea equals shoelace of outer polygon', () => {
    const tasks = fa.generateAllTasks(40, 'mixed');
    for (const t of tasks) {
      if (t.nonGrid) continue;
      if (t.subtraction) {
        // For subtraction: totalArea = shoelace(outer) - shoelace(inner)
        const outerArea = fa.shoelace(t.vertices);
        const innerArea = fa.shoelace(t.innerVertices);
        assertClose(t.totalArea, outerArea - innerArea, 1e-9, `template ${t.template}`);
      } else {
        assertClose(t.totalArea, fa.shoelace(t.vertices), 1e-9, `template ${t.template}`);
      }
    }
  });

  test('non-grid mixed tasks pass the shoelace = bbox − cut-off invariant', () => {
    let checked = 0;
    for (let i = 0; i < 30 && checked < 10; i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      for (const t of tasks) {
        if (!t.nonGrid) continue;
        checked++;
        const sh = fa.shoelace(t.vertices);
        const d = fa.decomposeBBoxFrame(t.vertices);
        const cut = d.pieces.reduce((s, p) => s + p.area, 0);
        assertClose(sh, d.bboxArea - cut, 1e-9);
      }
    }
    assert(checked >= 5, `only checked ${checked} non-grid mixed tasks`);
  });

  test('non-grid mixed dispatches to frame formula', () => {
    for (let i = 0; i < 50; i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      for (const t of tasks) {
        if (!t.nonGrid) continue;
        const html = fa.MODULES.mixed.formulaHTML(t, 1, fa.MODULES.mixed.computeArea(t, 1));
        assert(/S_\{рамка\}/.test(html), 'frame formula should contain S_{рамка}');
        assert(/S_\{отрязано\}/.test(html), 'frame formula should contain S_{отрязано}');
        return;
      }
    }
    throw new Error('no non-grid mixed task sampled');
  });
});

section('non-grid generators (library level)', () => {
  test('generateTriangleNonGrid produces 3 slanted edges', () => {
    for (let i = 0; i < 20; i++) {
      const t = fa.generateTriangleNonGrid();
      assertEq(t.vertices.length, 3);
      for (let j = 0; j < 3; j++) {
        const p = t.vertices[j];
        const q = t.vertices[(j + 1) % 3];
        assert(p.x !== q.x && p.y !== q.y, 'no triangle edge may be axis-aligned');
      }
    }
  });

  test('generateParallelogramNonGrid produces a valid parallelogram', () => {
    for (let i = 0; i < 20; i++) {
      const p = fa.generateParallelogramNonGrid();
      assertEq(p.vertices.length, 4);
      const [A, B, C, D] = p.vertices;
      // Opposite sides parallel: B-A == C-D
      assertEq(B.x - A.x, C.x - D.x);
      assertEq(B.y - A.y, C.y - D.y);
      // And D-A == C-B
      assertEq(D.x - A.x, C.x - B.x);
      assertEq(D.y - A.y, C.y - B.y);
    }
  });

  test('non-grid parallelogram shoelace = ad + bc invariant', () => {
    // Area of u=(a,b), v=(-c,d) parallelogram equals ad + bc
    for (let i = 0; i < 20; i++) {
      const p = fa.generateParallelogramNonGrid();
      const sh = fa.shoelace(p.vertices);
      const d = fa.decomposeBBoxFrame(p.vertices);
      const cut = d.pieces.reduce((s, pc) => s + pc.area, 0);
      assertClose(sh, d.bboxArea - cut, 1e-9);
    }
  });
});

section('transform preservation', () => {
  test('transform preserves vertex count and in-grid constraint', () => {
    const samples = [
      fa.generateRightTriangle(),
      fa.generateAcuteTriangle(),
      fa.generateObtuseTriangle(),
      fa.generateParallelogram(),
      fa.generateRhombus(),
      fa.generateTrapezoid(),
      fa.generateHouse(),
      fa.generateTrapezoidTriangle(),
      fa.generateTriangleNonGrid(),
      fa.generateParallelogramNonGrid()
    ].filter(Boolean);
    for (const base of samples) {
      for (let i = 0; i < 8; i++) {
        const t = fa.transformFigure(base);
        assertEq(t.vertices.length, base.vertices.length);
        for (const v of t.vertices) assert(inGrid(v), `transformed vertex ${JSON.stringify(v)} out of grid`);
      }
    }
  });

  test('transform preserves shoelace area', () => {
    const samples = [
      fa.generateRightTriangle(),
      fa.generateObtuseTriangle(),
      fa.generateParallelogram(),
      fa.generateTrapezoid(),
      fa.generateHouse(),
      fa.generateTrapezoidTriangle(),
      fa.generateTriangleNonGrid(),
      fa.generateParallelogramNonGrid()
    ].filter(Boolean);
    for (const base of samples) {
      const baseArea = fa.shoelace(base.vertices);
      for (let i = 0; i < 8; i++) {
        const t = fa.transformFigure(base);
        assertClose(fa.shoelace(t.vertices), baseArea, 1e-9);
      }
    }
  });

  test('transform walks into nested shared edge arrays', () => {
    const house = fa.generateHouse();
    assert(house.sharedEdges.length === 1);
    const before = house.sharedEdges[0].map(p => ({ ...p }));
    const t = fa.transformFigure(house);
    // After transform, the edge points must still be valid points, in grid
    for (const p of t.sharedEdges[0]) {
      assert(typeof p.x === 'number' && typeof p.y === 'number');
      assert(inGrid(p));
    }
    // And at least one transform actually changes the coordinates
    let anyChanged = false;
    for (let i = 0; i < 20 && !anyChanged; i++) {
      const t2 = fa.transformFigure(house);
      if (t2.sharedEdges[0][0].x !== before[0].x || t2.sharedEdges[0][0].y !== before[0].y) {
        anyChanged = true;
      }
    }
    assert(anyChanged, 'shared edge points should transform with the shape');
  });
});

section('frame decomposition', () => {
  test('shoelace matches bbox area minus sum of cut-offs for triangles', () => {
    for (let i = 0; i < 30; i++) {
      const t = fa.transformFigure(fa.generateTriangleNonGrid());
      const sh = fa.shoelace(t.vertices);
      const d = fa.decomposeBBoxFrame(t.vertices);
      const cut = d.pieces.reduce((s, p) => s + p.area, 0);
      assertClose(sh, d.bboxArea - cut, 1e-9);
    }
  });

  test('shoelace matches bbox minus cut-offs for parallelograms', () => {
    for (let i = 0; i < 30; i++) {
      const p = fa.transformFigure(fa.generateParallelogramNonGrid());
      const sh = fa.shoelace(p.vertices);
      const d = fa.decomposeBBoxFrame(p.vertices);
      const cut = d.pieces.reduce((s, pc) => s + pc.area, 0);
      assertClose(sh, d.bboxArea - cut, 1e-9);
    }
  });

  test('triangle frame produces exactly 3 cut-off pieces', () => {
    for (let i = 0; i < 20; i++) {
      const t = fa.transformFigure(fa.generateTriangleNonGrid());
      const d = fa.decomposeBBoxFrame(t.vertices);
      assertEq(d.pieces.length, 3);
    }
  });

  test('parallelogram frame produces exactly 4 cut-off pieces', () => {
    for (let i = 0; i < 20; i++) {
      const p = fa.transformFigure(fa.generateParallelogramNonGrid());
      const d = fa.decomposeBBoxFrame(p.vertices);
      assertEq(d.pieces.length, 4);
    }
  });
});

section('trapezoid oriented labels', () => {
  test('a and b lengths sum to canonical baseA + baseB', () => {
    for (let i = 0; i < 20; i++) {
      const t = fa.transformFigure(fa.generateTrapezoid());
      const { aLen, bLen } = fa.trapezoidOrientedLabels(t);
      assertEq(aLen + bLen, t.baseA + t.baseB);
    }
  });
});

section('mixed templates — no collinear fake vertices', () => {
  function hasCollinearTriple(verts) {
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const p = verts[(i - 1 + n) % n];
      const q = verts[i];
      const r = verts[(i + 1) % n];
      const cross = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
      if (cross === 0) return true;
    }
    return false;
  }

  test('simplifyPolygon strips a known collinear triple', () => {
    const input = [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 },
      { x: 3, y: 3 }, { x: 0, y: 3 } // (3,3) is collinear with (5,3) and (0,3)
    ];
    const simplified = fa.simplifyPolygon(input);
    assertEq(simplified.length, 4);
    // The surviving vertices should be the bbox corners
    const xs = simplified.map(v => v.x).sort((a, b) => a - b);
    const ys = simplified.map(v => v.y).sort((a, b) => a - b);
    assertEq(xs[0], 0); assertEq(xs[xs.length - 1], 5);
    assertEq(ys[0], 0); assertEq(ys[ys.length - 1], 3);
  });

  test('every generated mixed compound task has no collinear triples', () => {
    for (let i = 0; i < 30; i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      for (const t of tasks) {
        if (t.nonGrid) continue;
        assert(!hasCollinearTriple(t.vertices),
          `template ${t.template} produced collinear vertices: ${JSON.stringify(t.vertices)}`);
      }
    }
  });

  test('every individual template generator avoids collinear triples', () => {
    const templates = [fa.generateHouse, fa.generateRectTrapezoid, fa.generateRectTriangleSide, fa.generateTrapezoidTriangle];
    for (const gen of templates) {
      for (let i = 0; i < 40; i++) {
        let task = gen();
        if (!task) continue;
        // finalizeMixed isn't exported, so run simplifyPolygon manually here
        // to mirror what the mixed pipeline does
        task = { ...task, vertices: fa.simplifyPolygon(task.vertices) };
        assert(!hasCollinearTriple(task.vertices),
          `${gen.name} produced collinear vertices: ${JSON.stringify(task.vertices)}`);
      }
    }
  });

  test('MIXED_TEMPLATES contains the full current template set', () => {
    const names = fa.MIXED_TEMPLATES.map(f => f.name).sort();
    const expected = [
      'generateHouse', 'generateRectTrapezoid',
      'generateTrapezoidTriangle', 'generateParaTriangle', 'generateTower',
      'generateRectObtuseTriangle', 'generateTrapRect', 'generateParaRect',
      'generateDoubleTriangle', 'generateRectTriBoth', 'generateTrapTrap',
      'generateParaTrap', 'generateStepShape', 'generateTriTrapTri'
    ].sort();
    assertEq(names.length, expected.length);
    for (let i = 0; i < expected.length; i++) assertEq(names[i], expected[i]);
  });

  test('new templates eventually appear', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      for (const t of tasks) if (t.template) seen.add(t.template);
    }
    for (const expected of ['paraTriangle', 'tower', 'rectObtuseTriangle']) {
      assert(seen.has(expected), `template ${expected} never generated across 200 batches`);
    }
  });

  test('mixed mode can generate 3-part compounds (tower)', () => {
    let saw3Parts = false;
    for (let i = 0; i < 200 && !saw3Parts; i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      for (const t of tasks) {
        if (t.subParts && t.subParts.length === 3) { saw3Parts = true; break; }
      }
    }
    assert(saw3Parts, 'mixed mode should eventually produce a 3-part compound');
  });

  test('SUBTRACTION_TEMPLATES contains the full current template set', () => {
    const names = fa.SUBTRACTION_TEMPLATES.map(f => f.name).sort();
    const expected = [
      'generateRectMinusRect', 'generateRectMinusTri', 'generateTriMinusTri',
      'generateRectMinusPara', 'generateRectMinusTrap',
      'generateParaMinusTri', 'generateTrapMinusTri',
      'generateTriMinusRect', 'generateTrapMinusRect', 'generateParaMinusRect'
    ].sort();
    assertEq(names.length, expected.length);
    for (let i = 0; i < expected.length; i++) assertEq(names[i], expected[i]);
  });

  test('mixed mode eventually generates subtraction tasks', () => {
    let sawSub = false;
    for (let i = 0; i < 200 && !sawSub; i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      for (const t of tasks) {
        if (t.subtraction) { sawSub = true; break; }
      }
    }
    assert(sawSub, 'mixed mode should eventually produce a subtraction task');
  });

  test('subtraction tasks have valid structure', () => {
    let checked = 0;
    for (let i = 0; i < 500 && checked < 20; i++) {
      const tasks = fa.generateAllTasks(10, 'mixed');
      for (const t of tasks) {
        if (!t.subtraction) continue;
        checked++;
        assert(Array.isArray(t.innerVertices) && t.innerVertices.length >= 3,
          'subtraction task must have innerVertices');
        assert(t.totalArea > 0, 'subtraction totalArea must be positive');
        assertClose(t.totalArea, t.subParts[0].area - t.subParts[1].area, 1e-9,
          'totalArea must equal S1 - S2');
        // Shoelace of outer minus inner must match totalArea
        const outerArea = fa.shoelace(t.vertices);
        const innerArea = fa.shoelace(t.innerVertices);
        assertClose(t.totalArea, outerArea - innerArea, 1e-9,
          'shoelace(outer) - shoelace(inner) must match totalArea');
        // All vertices on grid
        for (const v of t.vertices) {
          assert(v.x >= 0 && v.x <= fa.GRID_SIZE && v.y >= 0 && v.y <= fa.GRID_SIZE,
            'outer vertex must be in grid');
        }
        for (const v of t.innerVertices) {
          assert(v.x >= 0 && v.x <= fa.GRID_SIZE && v.y >= 0 && v.y <= fa.GRID_SIZE,
            'inner vertex must be in grid');
        }
      }
    }
    assert(checked >= 5, `expected at least 5 subtraction tasks, got ${checked}`);
  });

  test('subtraction tasks survive transform', () => {
    let checked = 0;
    for (let i = 0; i < 500 && checked < 10; i++) {
      const tasks = fa.generateAllTasks(10, 'mixed');
      for (const t of tasks) {
        if (!t.subtraction) continue;
        checked++;
        assert(Array.isArray(t.innerVertices), 'innerVertices must survive transform');
        // After transform, area invariant still holds
        const outerArea = fa.shoelace(t.vertices);
        const innerArea = fa.shoelace(t.innerVertices);
        assertClose(t.totalArea, outerArea - innerArea, 1e-9,
          'area invariant must hold after transform');
      }
    }
    assert(checked >= 3, `expected at least 3 transformed subtraction tasks, got ${checked}`);
  });
});

section('counter-clockwise vertex ordering', () => {
  test('toCounterClockwise flips CW lists and leaves CCW lists alone', () => {
    // Rectangle in CCW grid order
    const ccw = [{x:0,y:0},{x:4,y:0},{x:4,y:3},{x:0,y:3}];
    assert(fa.signedArea(ccw) > 0, 'rectangle CCW should have positive signed area');
    assert(fa.toCounterClockwise(ccw) === ccw, 'CCW input should be returned unchanged');
    // CW input gets flipped
    const cw = [{x:0,y:0},{x:0,y:3},{x:4,y:3},{x:4,y:0}];
    assert(fa.signedArea(cw) < 0, 'this rectangle should be CW');
    const flipped = fa.toCounterClockwise(cw);
    assert(fa.signedArea(flipped) > 0, 'toCounterClockwise output should have positive signed area');
  });

  test('every task out of generateAllTasks has counter-clockwise vertices', () => {
    for (const modId of ['triangle', 'parallelogram', 'trapezoid', 'mixed']) {
      const tasks = fa.generateAllTasks(12, modId);
      for (const t of tasks) {
        assert(fa.signedArea(t.vertices) > 0,
          `${modId} task vertices should be CCW. signedArea=${fa.signedArea(t.vertices)}`);
      }
    }
  });
});

section('triangle height letter from apex position', () => {
  test('right triangle formula stays a/b', () => {
    for (let i = 0; i < 10; i++) {
      const t = fa.generateRightTriangle();
      const html = fa.triangleFormulaHTML(t, 1, 1);
      assert(/a \\;\\text\{\.\}\\; b/.test(html),
        'right-triangle formula should still read "a . b"');
    }
  });

  test('triangleBaseLetter matches the apex index in the vertex list', () => {
    for (let i = 0; i < 30; i++) {
      const t = fa.transformFigure(fa.generateAcuteTriangle());
      const letter = fa.triangleBaseLetter(t);
      const idx = t.vertices.findIndex(v => v.x === t.apex.x && v.y === t.apex.y);
      assertEq(letter, ['a','b','c'][idx]);
    }
  });

  test('all three letters are reachable across 8 transforms', () => {
    const seen = new Set();
    // The apex position in the CCW-reordered list varies by transform, so
    // across enough samples we should see a, b, AND c.
    for (let i = 0; i < 300 && seen.size < 3; i++) {
      const t = fa.transformFigure(fa.generateAcuteTriangle());
      seen.add(fa.triangleBaseLetter(t));
    }
    assertEq(seen.size, 3);
  });
});

section('trapezoid longer side = a', () => {
  test('aLen is always ≥ bLen regardless of orientation', () => {
    for (let i = 0; i < 20; i++) {
      const base = fa.generateTrapezoid();
      for (let k = 0; k < 10; k++) {
        const t = fa.transformFigure(base);
        const { aLen, bLen } = fa.trapezoidOrientedLabels(t);
        assert(aLen > bLen, `a should be the longer parallel side. aLen=${aLen} bLen=${bLen}`);
      }
    }
  });

  test('formula renders with the longer side as a', () => {
    for (let i = 0; i < 10; i++) {
      const t = fa.transformFigure(fa.generateTrapezoid());
      const { aLen, bLen } = fa.trapezoidOrientedLabels(t);
      const html = fa.trapezoidFormulaHTML(t, 1, (t.baseA + t.baseB) * t.height / 2);
      const re = new RegExp(`\\(${aLen} \\+ ${bLen}\\)`);
      assert(re.test(html), `formula should contain "(${aLen} + ${bLen})": ${html}`);
    }
  });
});

section('input validation', () => {
  test('rejects empty / letters / mixed', () => {
    for (const bad of ['', 'abc', '12abc', 'ten', '1.2.3', ' ', '1a', '.5', '5.']) {
      assert(!fa.isValidAnswerInput(bad), `should reject "${bad}"`);
    }
  });

  test('accepts plain numbers', () => {
    for (const good of ['0', '5', '12', '3.14', '100.25', '7']) {
      assert(fa.isValidAnswerInput(good), `should accept "${good}"`);
    }
  });
});

section('framed pentagon / hexagon variants', () => {
  test('framed pentagon produces 5 lattice vertices', () => {
    for (let i = 0; i < 20; i++) {
      const p = fa.generateFramedPentagon();
      if (!p) continue;
      assertEq(p.vertices.length, 5);
      for (const v of p.vertices) assert(inGrid(v));
    }
  });

  test('framed hexagon produces 6 lattice vertices', () => {
    for (let i = 0; i < 20; i++) {
      const h = fa.generateFramedHexagon();
      if (!h) continue;
      assertEq(h.vertices.length, 6);
      for (const v of h.vertices) assert(inGrid(v));
    }
  });

  test('framed pentagon shoelace == bbox - cutoffs (1 piece)', () => {
    for (let i = 0; i < 30; i++) {
      const p = fa.generateFramedPentagon();
      if (!p) continue;
      const sh = fa.shoelace(p.vertices);
      const d = fa.decomposeBBoxFrame(p.vertices);
      assertEq(d.pieces.length, 1);
      const cut = d.pieces.reduce((s, pc) => s + pc.area, 0);
      assertClose(sh, d.bboxArea - cut, 1e-9);
    }
  });

  test('framed hexagon shoelace == bbox - cutoffs (2 pieces)', () => {
    for (let i = 0; i < 30; i++) {
      const h = fa.generateFramedHexagon();
      if (!h) continue;
      const sh = fa.shoelace(h.vertices);
      const d = fa.decomposeBBoxFrame(h.vertices);
      assertEq(d.pieces.length, 2);
      const cut = d.pieces.reduce((s, pc) => s + pc.area, 0);
      assertClose(sh, d.bboxArea - cut, 1e-9);
    }
  });

  test('mixed mode eventually produces pentagon and hexagon tasks', () => {
    let sawPentagon = false, sawHexagon = false;
    for (let i = 0; i < 200 && !(sawPentagon && sawHexagon); i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      for (const t of tasks) {
        if (t.template === 'framedPentagon') sawPentagon = true;
        if (t.template === 'framedHexagon') sawHexagon = true;
      }
    }
    assert(sawPentagon, 'framedPentagon should appear in mixed mode');
    assert(sawHexagon, 'framedHexagon should appear in mixed mode');
  });

  test('framed pentagon/hexagon decomposition survives transform', () => {
    for (let i = 0; i < 30; i++) {
      const p = fa.transformFigure(fa.generateFramedPentagon());
      const sh = fa.shoelace(p.vertices);
      const d = fa.decomposeBBoxFrame(p.vertices);
      const cut = d.pieces.reduce((s, pc) => s + pc.area, 0);
      assertClose(sh, d.bboxArea - cut, 1e-9);
    }
    for (let i = 0; i < 30; i++) {
      const h = fa.transformFigure(fa.generateFramedHexagon());
      const sh = fa.shoelace(h.vertices);
      const d = fa.decomposeBBoxFrame(h.vertices);
      const cut = d.pieces.reduce((s, pc) => s + pc.area, 0);
      assertClose(sh, d.bboxArea - cut, 1e-9);
    }
  });
});

section('source-level UI strings', () => {
  test('button label is "Промени избора" (not the old "Нови настройки")', () => {
    assert(src.includes('Промени избора'), 'source must contain "Промени избора"');
    assert(!src.includes('Нови настройки'), 'source must not contain old "Нови настройки"');
  });

  test('all four figure-type dropdown options are present', () => {
    assert(/<option value="triangle">/.test(src));
    assert(/<option value="parallelogram">/.test(src));
    assert(/<option value="trapezoid">/.test(src));
    assert(/<option value="mixed">/.test(src));
  });
});

// -----------------------------------------------------------------
// Summary
// -----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f.name}: ${f.error.message}`);
  process.exit(1);
}
