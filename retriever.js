
const fs = require('fs').promises;
const path = require('path');

const KNOWLEDGE_BASE_DIR = path.join(__dirname, 'knowledge-base');

function splitIntoSections(text) {
  // Split on lines starting with "## " so each markdown section becomes its own chunk,
  // keeping the heading attached to the section that follows it.
  const lines = text.split('\n');
  const sections = [];
  let current = [];

  for (const line of lines) {
    if (line.startsWith('## ') && current.length > 0) {
      sections.push(current.join('\n').trim());
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    sections.push(current.join('\n').trim());
  }

  return sections.filter((section) => section.length > 0);
}

async function loadKnowledgeBase() {
  const allFiles = await fs.readdir(KNOWLEDGE_BASE_DIR);
  const mdFiles = allFiles.filter((filename) => filename.endsWith('.md'));

  const chunkArrays = await Promise.all(
    mdFiles.map(async (filename) => {
      const text = await fs.readFile(path.join(KNOWLEDGE_BASE_DIR, filename), 'utf-8');
      const sections = splitIntoSections(text);
      return sections.map((sectionText) => ({ source: filename, text: sectionText }));
    })
  );

  return chunkArrays.flat();
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'of', 'to',
  'and', 'or', 'what', 'which', 'who', 'how', 'did', 'do', 'does', 'for', 'about',
]);

function getKeywords(question) {
  return question
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function searchChunks(question, chunks, topN = 3) {
  const keywords = getKeywords(question);

  const scored = chunks
    .map((chunk) => {
      const lowerText = chunk.text.toLowerCase();
      const score = keywords.reduce((total, keyword) => {
        const occurrences = lowerText.split(keyword).length - 1;
        return total + occurrences;
      }, 0);
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}

module.exports = { loadKnowledgeBase, searchChunks };
