
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

module.exports = { loadKnowledgeBase };
