
const fs = require('fs').promises;
const path = require('path');

const KNOWLEDGE_BASE_DIR = path.join(__dirname, 'knowledge-base');

async function loadKnowledgeBase() {
  const allFiles = await fs.readdir(KNOWLEDGE_BASE_DIR);
  const mdFiles = allFiles.filter((filename) => filename.endsWith('.md'));

  const chunks = await Promise.all(
    mdFiles.map(async (filename) => {
      const text = await fs.readFile(path.join(KNOWLEDGE_BASE_DIR, filename), 'utf-8');
      return { source: filename, text };
    })
  );

  return chunks;
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
