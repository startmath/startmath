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
    generateMixed, generateRect, generateHouse, generateRectTrapezoid,
    generateLShape, generateRectTriangleSide,
    MODULES,
    parallelogramFormulaHTML, triangleFormulaHTML, trapezoidFormulaHTML,
    mixedFormulaHTML, frameFormulaHTML
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

  test('acute/obtuse triangle formula uses h_a', () => {
    const t = fa.generateAcuteTriangle();
    const html = fa.triangleFormulaHTML(t, 1, 1);
    assert(/h_a/.test(html), 'acute triangle formula should contain h_a');
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

  test('eventually generates compound shapes of every template', () => {
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      const tasks = fa.generateAllTasks(20, 'mixed');
      for (const t of tasks) if (t.template) seen.add(t.template);
    }
    for (const expected of ['rect', 'house', 'rectTrap', 'lshape', 'rectTriSide']) {
      assert(seen.has(expected), `template ${expected} never generated across 80 batches`);
    }
  });

  test('every compound task has subParts with positive area summing to totalArea', () => {
    const tasks = fa.generateAllTasks(40, 'mixed');
    for (const t of tasks) {
      if (t.nonGrid) continue;
      assert(Array.isArray(t.subParts) && t.subParts.length >= 1);
      let sum = 0;
      for (const p of t.subParts) {
        assert(p.area > 0, 'sub-part area must be positive');
        sum += p.area;
      }
      assertClose(sum, t.totalArea, 1e-9, 'sub-part sum must equal totalArea');
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
      assertClose(t.totalArea, fa.shoelace(t.vertices), 1e-9, `template ${t.template}`);
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
      fa.generateLShape(),
      fa.generateTriangleNonGrid(),
      fa.generateParallelogramNonGrid()
    ];
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
      fa.generateLShape(),
      fa.generateTriangleNonGrid(),
      fa.generateParallelogramNonGrid()
    ];
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
