
const fs = require('fs').promises;
const path = require('path');

const KNOWLEDGE_BASE_DIR = path.join(__dirname, 'knowledge-base');
const EMBEDDINGS_FILE = path.join(__dirname, 'embeddings.json');
const EMBEDDING_MODEL = 'text-embedding-3-small';
const MIN_SIMILARITY = 0.2;

const MIN_SECTION_WORDS = 10;

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function splitIntoSections(text) {
  // Split on lines starting with "## " so each markdown section becomes its own chunk,
  // keeping the heading attached to the section that follows it. Sections shorter than
  // MIN_SECTION_WORDS (e.g. a lone "# Title" line before the first "##") are merged into
  // the next section instead of becoming their own tiny, density-inflated chunk.
  const lines = text.split('\n');
  const sections = [];
  let current = [];

  for (const line of lines) {
    if (line.startsWith('## ') && wordCount(current.join(' ')) >= MIN_SECTION_WORDS) {
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

async function loadEmbeddings() {
  let raw;
  try {
    raw = await fs.readFile(EMBEDDINGS_FILE, 'utf-8');
  } catch (err) {
    throw new Error(`Missing ${EMBEDDINGS_FILE}. Run "node embedder.js" first to generate it.`);
  }
  return JSON.parse(raw);
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

async function embedQuery(question) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in .env');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: question,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embedding error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

const QUERY_STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'of', 'to',
  'and', 'or', 'what', 'which', 'who', 'how', 'did', 'do', 'does', 'for',
  'about', 'that', 'this', 'many', 'much', 'be', 'been', 'being', 'as', 'by',
  'with', 'from', 'into', 'than', 'then', 'there', 'their', 'they', 'them',
]);

function getQueryKeywords(question) {
  return question
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 2 && !QUERY_STOP_WORDS.has(word));
}

// Rewards a chunk for containing rare query terms verbatim (names, numbers, "women"/
// "men", short factual phrases) so a strong lexical match can rescue a chunk that
// scores low on pure semantic similarity. A keyword's contribution is inversely
// proportional to how many chunks contain it, so common words add almost nothing.
const KEYWORD_BOOST_SCALE = 0.3;

function keywordBoost(chunkText, keywords, docFrequency) {
  const lowerText = chunkText.toLowerCase();
  return keywords.reduce((boost, keyword) => {
    if (lowerText.includes(keyword)) {
      return boost + KEYWORD_BOOST_SCALE / docFrequency[keyword];
    }
    return boost;
  }, 0);
}

async function searchChunks(question, embeddings, topN = 8) {
  const queryVector = await embedQuery(question);
  const keywords = getQueryKeywords(question);

  const docFrequency = {};
  for (const keyword of keywords) {
    const count = embeddings.filter((chunk) => chunk.text.toLowerCase().includes(keyword)).length;
    docFrequency[keyword] = count || 1;
  }

  const scored = embeddings
    .map((chunk) => {
      const similarity = cosineSimilarity(queryVector, chunk.vector);
      const boost = keywordBoost(chunk.text, keywords, docFrequency);
      return { ...chunk, score: similarity + boost };
    })
    .filter((chunk) => chunk.score >= MIN_SIMILARITY);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}

module.exports = { loadKnowledgeBase, loadEmbeddings, searchChunks };
