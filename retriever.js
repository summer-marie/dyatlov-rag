
const fs = require('fs').promises;
const path = require('path');

const KNOWLEDGE_BASE_DIR = path.join(__dirname, 'knowledge-base');

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

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'of', 'to',
  'and', 'or', 'what', 'which', 'who', 'how', 'did', 'do', 'does', 'for', 'about',
]);

// Maps a question-side term to the words the knowledge base actually uses for that
// concept, so e.g. "hikers"/"tent"/"found" still match chunks that say
// "group"/"camp"/"discovered". Built from grepping actual term frequency in
// knowledge-base/*.md (see tests/manual-questions.md Step 12 notes).
const SYNONYMS = {
  hiker: ['hikers', 'group', 'travellers', 'traveler', 'travelers', 'students', 'student', 'skiers', 'skier'],
  hikers: ['hiker', 'group', 'travellers', 'traveler', 'travelers', 'students', 'student', 'skiers', 'skier'],
  group: ['hikers', 'travellers', 'students', 'skiers'],
  tent: ['camp', 'campsite'],
  camp: ['tent', 'campsite'],
  found: ['discovered', 'located'],
  discovered: ['found', 'located'],
  died: ['death', 'deaths', 'perished', 'fatal'],
  death: ['died', 'deaths', 'perished', 'fatal'],
  deaths: ['died', 'death', 'perished', 'fatal'],
  fatal: ['died', 'death', 'deaths', 'perished'],
  injury: ['injuries', 'wound', 'wounds', 'trauma'],
  injuries: ['injury', 'wound', 'wounds', 'trauma'],
  wound: ['wounds', 'injury', 'injuries', 'trauma'],
  wounds: ['wound', 'injury', 'injuries', 'trauma'],
  trauma: ['injury', 'injuries', 'wound', 'wounds'],
  body: ['bodies', 'corpse', 'corpses', 'remains'],
  bodies: ['body', 'corpse', 'corpses', 'remains'],
  corpse: ['corpses', 'body', 'bodies', 'remains'],
  far: ['distance', 'metres', 'meters', 'km', 'kilometres', 'kilometers'],
  distance: ['far', 'metres', 'meters', 'km', 'kilometres', 'kilometers'],
  trip: ['expedition', 'journey', 'route'],
  journey: ['expedition', 'trip', 'route'],
  expedition: ['trip', 'journey', 'route'],
  buried: ['covered'],
  covered: ['buried'],
};

function getKeywords(question) {
  return question
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

// Expands the raw keywords with their known synonyms, deduped, so scoring counts
// occurrences of either the question's exact wording or the knowledge base's wording.
function expandKeywords(keywords) {
  const expanded = new Set(keywords);
  for (const keyword of keywords) {
    const synonyms = SYNONYMS[keyword];
    if (synonyms) {
      for (const synonym of synonyms) {
        expanded.add(synonym);
      }
    }
  }
  return [...expanded];
}

function searchChunks(question, chunks, topN = 6) {
  const keywords = expandKeywords(getKeywords(question));

  const scored = chunks
    .map((chunk) => {
      const lowerText = chunk.text.toLowerCase();
      const occurrences = keywords.reduce((total, keyword) => {
        return total + (lowerText.split(keyword).length - 1);
      }, 0);
      // Normalize by chunk length so a short, precise section isn't out-scored by a
      // long section that merely repeats keywords more often without being more relevant.
      const wordCount = lowerText.split(/\s+/).filter(Boolean).length;
      const score = wordCount > 0 ? occurrences / wordCount : 0;
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}

module.exports = { loadKnowledgeBase, searchChunks };
