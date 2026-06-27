require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { loadKnowledgeBase } = require('./retriever');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const OUTPUT_FILE = path.join(__dirname, 'embeddings.json');

async function embedText(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embedding error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function buildEmbeddings() {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY in .env');
  }

  const chunks = await loadKnowledgeBase();
  const records = [];

  for (const chunk of chunks) {
    console.log(`Embedding section from ${chunk.source}...`);
    const vector = await embedText(chunk.text);
    records.push({ text: chunk.text, source: chunk.source, vector });
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(records, null, 2));
  console.log(`Done. Wrote ${records.length} embeddings to ${OUTPUT_FILE}`);
}

buildEmbeddings().catch((err) => {
  console.error(err);
  process.exit(1);
});
