
const fs = require('fs').promises;
const path = require('path');

const KNOWLEDGE_BASE_DIR = path.join(__dirname, 'knowledge-base');
const EMBEDDINGS_FILE = path.join(__dirname, 'embeddings.json');
const EMBEDDING_MODEL = 'text-embedding-3-small';
const MIN_SIMILARITY = 0.25;

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

async function searchChunks(question, embeddings, topN = 6) {
  const queryVector = await embedQuery(question);

  const scored = embeddings
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryVector, chunk.vector) }))
    .filter((chunk) => chunk.score >= MIN_SIMILARITY);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}

module.exports = { loadKnowledgeBase, loadEmbeddings, searchChunks };
