// ===== Random Number Generators =====

import { formatBG, displayNumber, shuffle, pickRandom } from './utils.js';

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randDecimal(intMin, intMax, decPlaces) {
  const places = Array.isArray(decPlaces) ? pickRandom(decPlaces) : decPlaces;
  const intPart = randInt(intMin, intMax);
  const maxDec = Math.pow(10, places) - 1;
  let decPart = randInt(1, maxDec); // Avoid .0 to keep it meaningful
  const result = intPart + decPart / Math.pow(10, places);
  return Math.round(result * Math.pow(10, places)) / Math.pow(10, places);
}

export function randDecimalNear(base, maxDiff, decPlaces) {
  const places = Array.isArray(decPlaces) ? pickRandom(decPlaces) : decPlaces;
  const factor = Math.pow(10, places);
  // Generate a value near base but not equal
  let result;
  let attempts = 0;
  do {
    const diff = (Math.random() * maxDiff * 2 - maxDiff);
    result = Math.round((base + diff) * factor) / factor;
    attempts++;
  } while ((result === base || result < 0) && attempts < 20);
  if (result < 0) result = Math.abs(result);
  if (result === base) result = base + 1 / factor;
  return Math.round(result * factor) / factor;
}

export function randDecimalSmaller(base, decPlaces) {
  const places = Array.isArray(decPlaces) ? pickRandom(decPlaces) : decPlaces;
  const factor = Math.pow(10, places);
  const max = Math.floor(base * factor) - 1;
  if (max <= 0) return Math.round(base / 2 * factor) / factor || 0.1;
  const raw = randInt(1, max);
  return raw / factor;
}

// Generate a decimal that divides evenly by a given integer divisor
export function randDecimalDivisible(divisor, intMin, intMax, decPlaces) {
  const places = Array.isArray(decPlaces) ? pickRandom(decPlaces) : decPlaces;
  const factor = Math.pow(10, places);
  // Generate the quotient first, then multiply back
  const quotientInt = randInt(Math.max(1, intMin), intMax);
  const quotientDecPart = randInt(0, factor - 1);
  const quotient = quotientInt + quotientDecPart / factor;
  const result = Math.round(quotient * divisor * factor) / factor;
  return result;
}

// Generate a decimal divisible by another decimal
export function randDecimalDivisibleByDecimal(divisor, intMin, intMax) {
  // Generate an integer quotient so result is clean
  const quotient = randInt(Math.max(2, intMin), Math.max(intMax, 10));
  const result = Math.round(quotient * divisor * 10000) / 10000;
  return result;
}

// ===== Generate Values from Template =====

export function generateValues(generateSpec) {
  const values = {};
  const keys = Object.keys(generateSpec);

  // Split into independent and dependent keys (those that reference other values)
  const independent = [];
  const dependent = [];
  for (const key of keys) {
    const spec = generateSpec[key];
    if (spec.base || spec.divisorKey) {
      dependent.push(key);
    } else {
      independent.push(key);
    }
  }

  // Generate independent values first, then dependent ones
  for (const key of [...independent, ...dependent]) {
    const spec = generateSpec[key];

    switch (spec.type) {
      case 'integer':
        values[key] = randInt(spec.min, spec.max);
        break;

      case 'decimal':
        values[key] = randDecimal(spec.intMin, spec.intMax, spec.decPlaces);
        break;

      case 'decimalSimple':
        values[key] = pickRandom(spec.values);
        break;

      case 'decimalNear':
        values[key] = randDecimalNear(values[spec.base], spec.maxDiff, spec.decPlaces);
        break;

      case 'decimalSmaller':
        values[key] = randDecimalSmaller(values[spec.base], spec.decPlaces);
        break;

      case 'decimalDivisible':
        values[key] = randDecimalDivisible(values[spec.divisorKey], spec.intMin, spec.intMax, spec.decPlaces);
        break;

      case 'decimalDivisibleByDecimal':
        values[key] = randDecimalDivisibleByDecimal(values[spec.divisorKey], spec.intMin, spec.intMax);
        break;

      case 'choice':
        values[key] = pickRandom(spec.values);
        break;

      default:
        values[key] = spec.value ?? 0;
    }
  }

  return values;
}

// ===== Answer Computation Functions =====

export function roundToPlace(num, placeName) {
  switch (placeName) {
    case 'десетици': return Math.round(num / 10) * 10;
    case 'стотици': return Math.round(num / 100) * 100;
    case 'хилядни': return Math.round(num * 1000) / 1000;
    case 'стотни': return Math.round(num * 100) / 100;
    case 'десети': return Math.round(num * 10) / 10;
    case 'цяло число': return Math.round(num);
    default: return num;
  }
}

function safeCalc(a, b, op) {
  // Use integer arithmetic to avoid floating point issues
  const factor = 1e10;
  const ai = Math.round(a * factor);
  const bi = Math.round(b * factor);
  switch (op) {
    case '+': return (ai + bi) / factor;
    case '-': return (ai - bi) / factor;
    case '*': return Math.round(a * b * 1e8) / 1e8;
    case '/': return Math.round(a / b * 1e8) / 1e8;
  }
}

// Clean trailing zeros but keep at least one decimal if needed
function cleanNum(n) {
  return parseFloat(n.toFixed(8));
}

export const answerFunctions = {
  compareDecimals(values) {
    const { a, b } = values;
    if (a > b) return '>';
    if (a < b) return '<';
    return '=';
  },

  roundNatural(values) {
    return roundToPlace(values.num, values.place);
  },

  roundDecimal(values) {
    return roundToPlace(values.num, values.place);
  },

  addDecimals(values) {
    return cleanNum(safeCalc(values.a, values.b, '+'));
  },

  subtractDecimals(values) {
    return cleanNum(safeCalc(values.a, values.b, '-'));
  },

  multiplyDecimals(values) {
    return cleanNum(safeCalc(values.a, values.b, '*'));
  },

  divideDecimals(values) {
    return cleanNum(safeCalc(values.a, values.b, '/'));
  },

  multDiv10(values) {
    const { a, op, factor } = values;
    if (op === '.') return cleanNum(a * factor);
    return cleanNum(a / factor);
  },

  solveAddSubEquation(values) {
    const { eqType, a, b } = values;
    switch (eqType) {
      case 'unknownAddend': return b;
      case 'unknownMinuend': return Math.max(a, b);
      case 'unknownSubtrahend': return cleanNum(Math.abs(a - b));
    }
  },

  solveMultDivEquation(values) {
    const { eqType, a, b } = values;
    switch (eqType) {
      case 'unknownMultiplier': return a;
      case 'unknownDividend': return cleanNum(safeCalc(a, b, '*'));
      case 'unknownDivisor': return b;
    }
  }
};

// ===== Options Generation Functions =====

function generateDistractors(correct, count, gen) {
  const set = new Set([String(correct)]);
  const results = [];
  let attempts = 0;
  while (results.length < count && attempts < 50) {
    const val = gen(attempts);
    const key = String(val);
    if (!set.has(key) && val !== undefined && val !== null) {
      set.add(key);
      results.push(val);
    }
    attempts++;
  }
  // Fill remaining with simple offsets
  while (results.length < count) {
    const offset = results.length + 1;
    let val;
    if (typeof correct === 'number') {
      val = correct + offset;
    } else {
      val = correct + '_' + offset;
    }
    if (!set.has(String(val))) {
      set.add(String(val));
      results.push(val);
    }
  }
  return results;
}

export const optionsFunctions = {
  fractionPart(values) {
    const num = values.num;
    const str = String(num);
    const decPart = str.split('.')[1] || '0';
    const correct = '0,' + decPart;

    const distractors = generateDistractors(correct, 3, (i) => {
      const parts = str.split('.');
      if (i === 0) return parts[0]; // integer part
      if (i === 1) return '0,' + (parseInt(decPart) + randInt(1, 5));
      return '0,' + String(randInt(1, 999)).padStart(decPart.length, '0');
    });

    return { correct, options: shuffle([correct, ...distractors]) };
  },

  decimalPlacesCount(values) {
    const num = values.num;
    const str = String(num);
    const decPart = str.split('.')[1] || '';
    const correct = decPart.length;

    const used = new Set([correct]);
    const distractors = [];
    for (let offset = 1; distractors.length < 3; offset++) {
      const up = correct + offset;
      const down = correct - offset;
      if (up <= 6 && !used.has(up)) { used.add(up); distractors.push(up); }
      if (distractors.length < 3 && down >= 0 && !used.has(down)) { used.add(down); distractors.push(down); }
    }

    return { correct, options: shuffle([correct, ...distractors.slice(0, 3)]) };
  },

  decimalToFraction(values) {
    const num = values.num;
    const str = String(num);
    const decPart = str.split('.')[1] || '0';
    const denominator = Math.pow(10, decPart.length);
    const numerator = parseInt(decPart);
    const correct = `${numerator}/${denominator}`;

    const distractors = generateDistractors(correct, 3, (i) => {
      if (i === 0) return `${numerator}/${denominator * 10}`;
      if (i === 1) return `${numerator * 10}/${denominator}`;
      return `${numerator + randInt(1, 5)}/${denominator}`;
    });

    return { correct, options: shuffle([correct, ...distractors]) };
  },

  betweenIntegers(values) {
    const num = values.num;
    const lower = Math.floor(num);
    const upper = lower + 1;
    const correct = `${lower} и ${upper}`;

    const distractors = [
      `${lower - 1} и ${lower}`,
      `${upper} и ${upper + 1}`,
      `${lower - 1} и ${upper + 1}`
    ];

    return { correct, options: shuffle([correct, ...distractors]) };
  },

  addProperties(values) {
    const { a, b, c } = values;
    const aF = displayNumber(a);
    const bF = displayNumber(b);
    const cF = displayNumber(c);

    // Correct: rearranged grouping
    const correct = `(${bF} + ${cF}) + ${aF}`;

    const distractors = [
      `${aF} . ${bF} + ${cF}`,
      `${aF} + ${bF} . ${cF}`,
      `(${aF} − ${bF}) + ${cF}`
    ];

    return { correct, options: shuffle([correct, ...distractors]) };
  },

  multProperties(values) {
    const { a, b, c } = values;
    const aF = displayNumber(a);

    const correct = `(${aF} . ${c}) . ${b}`;

    const distractors = [
      `${aF} + ${b} . ${c}`,
      `${aF} . ${b} + ${c}`,
      `(${aF} + ${b}) . ${c}`
    ];

    return { correct, options: shuffle([correct, ...distractors]) };
  },

  distributiveProperty(values) {
    const { a, b, c } = values;
    const aF = displayNumber(a);

    const correct = `${aF} . ${b} + ${aF} . ${c}`;

    const distractors = [
      `${aF} . ${b} . ${c}`,
      `${aF} + ${b} . ${c}`,
      `(${aF} + ${b}) . (${aF} + ${c})`
    ];

    return { correct, options: shuffle([correct, ...distractors]) };
  }
};

// ===== Build Equation Text =====

// Format number for KaTeX (use {,} for Bulgarian comma decimal)
function katexNum(n) {
  const str = String(Math.round(n * 10000) / 10000);
  return str.replace('.', '{,}');
}

export function buildEquationText(eqType, values) {
  const { a, b } = values;
  switch (eqType) {
    case 'unknownAddend': {
      const sum = cleanNum(safeCalc(a, b, '+'));
      return { text: `$x + ${katexNum(a)} = ${katexNum(sum)}$`, answer: b };
    }
    case 'unknownMinuend': {
      const big = Math.max(a, b);
      const small = Math.min(a, b);
      const diff = cleanNum(safeCalc(big, small, '-'));
      return { text: `$x - ${katexNum(small)} = ${katexNum(diff)}$`, answer: big };
    }
    case 'unknownSubtrahend': {
      const big = Math.max(a, b);
      const small = Math.min(a, b);
      const diff = cleanNum(safeCalc(big, small, '-'));
      return { text: `$${katexNum(big)} - x = ${katexNum(small)}$`, answer: diff };
    }
    case 'unknownMultiplier': {
      const product = cleanNum(safeCalc(a, b, '*'));
      return { text: `$x \\text{.}\\; ${b} = ${katexNum(product)}$`, answer: a };
    }
    case 'unknownDividend': {
      const quotient = a;
      return { text: `$x : ${b} = ${katexNum(a)}$`, answer: cleanNum(safeCalc(a, b, '*')) };
    }
    case 'unknownDivisor': {
      const product = cleanNum(safeCalc(a, b, '*'));
      return { text: `$${katexNum(product)} : x = ${katexNum(a)}$`, answer: b };
    }
  }
}
