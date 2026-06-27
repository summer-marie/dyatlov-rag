const fs = require('fs');
const path = require('path');

/**
 * Reads all `.md` files in a folder and splits each file into chunks
 * based on the `##` (sub-header) markers.
 *
 * Each chunk is stored as: { text, source, title }
 */
function loadKnowledgeBase(folderPath) {
  const files = fs.readdirSync(folderPath).filter((f) => f.endsWith('.md'));
  const documents = [];

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract the main title from the first `#` header
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : file;

    // Split the file's content by the `##` regex
    const sections = content.split(/^##\s/m);

    for (const section of sections) {
      const text = section.trim();
      if (text.length > 0) {
        documents.push({ text, source: file, title });
      }
    }
  }

  return documents;
}

/**
 * Keyword-based retrieval.
 *
 * Lowercases the query, splits it into words, and scores each chunk
 * by how many query words appear in the chunk's words.
 *
 * Returns the top K chunks with a score greater than 0.
 */
function retrieve(query, documents, topK = 3) {
  const queryWords = query.toLowerCase().split(/\W+/).filter(Boolean);

  const scored = documents.map((doc) => {
    const docWords = new Set(doc.text.toLowerCase().split(/\W+/).filter(Boolean));
    let score = 0;
    for (const word of queryWords) {
      if (docWords.has(word)) {
        score += 1;
      }
    }
    return { doc, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.doc);
}

module.exports = { loadKnowledgeBase, retrieve };