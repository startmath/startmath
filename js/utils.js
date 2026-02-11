// ===== DOM Helpers =====

export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

export function $$(selector, parent = document) {
  return [...parent.querySelectorAll(selector)];
}

export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') el.className = val;
    else if (key === 'innerHTML') el.innerHTML = val;
    else if (key === 'textContent') el.textContent = val;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), val);
    else el.setAttribute(key, val);
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

// ===== Array Helpers =====

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickN(arr, n) {
  return shuffle(arr).slice(0, n);
}

// ===== URL Params =====

export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ===== Local Storage =====

const STORAGE_PREFIX = 'startmath_';

export function saveProgress(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) { /* quota exceeded or private mode */ }
}

export function loadProgress(key) {
  try {
    const val = localStorage.getItem(STORAGE_PREFIX + key);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    return null;
  }
}

// ===== Bulgarian Number Formatting =====

export function formatBG(num) {
  // Convert number to string with Bulgarian comma separator
  const str = String(num);
  return str.replace('.', ',');
}

export function parseBGInput(input) {
  // Accept both comma and period as decimal separator
  const cleaned = input.trim().replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ===== Number display for quiz =====

export function displayNumber(num) {
  // Round to avoid floating point issues, then format
  const rounded = Math.round(num * 10000) / 10000;
  return formatBG(rounded);
}
