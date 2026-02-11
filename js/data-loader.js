// ===== Data Loader with Cache =====

const cache = new Map();

function getBasePath() {
  // Detect if we're in /pages/ subfolder
  const path = window.location.pathname;
  if (path.includes('/pages/')) {
    return '../data/';
  }
  return 'data/';
}

async function fetchJSON(url) {
  if (cache.has(url)) return cache.get(url);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  const data = await response.json();
  cache.set(url, data);
  return data;
}

export async function loadGrades() {
  return fetchJSON(getBasePath() + 'grades.json');
}

export async function loadTopics(gradeId) {
  return fetchJSON(getBasePath() + `grade-${gradeId}/topics.json`);
}

export async function loadSummary(gradeId, topicId) {
  return fetchJSON(getBasePath() + `grade-${gradeId}/${topicId}/summary.json`);
}

export async function loadQuiz(gradeId, topicId) {
  return fetchJSON(getBasePath() + `grade-${gradeId}/${topicId}/quiz.json`);
}
