# Embedding & Vector Lookup Plan — Dyatlov RAG

## What Is an Embedding?

An embedding is a function that converts a piece of text into a fixed-length
array of numbers (a vector). Semantically similar texts produce vectors that
are mathematically close to each other. This replaces keyword matching with
meaning-based matching.

Example:
- "Who died in the ravine?" → [0.12, -0.84, 0.33, ...]
- "The four bodies found in the stream" → [0.11, -0.81, 0.30, ...]
These two vectors are close → they would be retrieved together.

The current keyword retriever in retriever.js CANNOT do this.

***

## Why This App Needs Embeddings

The questions users ask and the way historical documents are written almost never
share the same words. Someone asking "Was there a military cover-up?" won't
keyword-match a chunk that says "Soviet authorities restricted access to the
investigation files" — but semantically, those two things are the same idea.

Embeddings fix exactly this. The LLM (Groq) is already good at generating
answers — the weak link is the retrieval step. If retriever.js sends the wrong
chunks because it only matched surface-level words, Groq gets bad context and
hallucinates or gives vague answers. Better retrieval = dramatically better
answers, even with the exact same Groq model.

***

## Pipeline Comparison

**Current pipeline:**
```
query → keyword match → top K chunks → Groq LLM → answer
```

**Embedding pipeline:**
```
query → embed query → cosine similarity vs stored chunk vectors → top K chunks → Groq LLM → answer
```

The only file that changes is `retriever.js`.
`server.js` and `promptBuilder.js` stay exactly the same.

***

## Recommended Approach: OpenAI text-embedding-3-small + Keep Groq for Generation

Use OpenAI exclusively for embeddings, keep Groq for LLM generation.
This is a smart split — best tool for each job.

**Why not Ollama:** Ollama runs locally and won't work when the app is deployed.

**Why not Cohere:** OpenAI credits are already available and text-embedding-3-small
is the industry standard with better documentation.

### Cost Reality Check

- Model: `text-embedding-3-small`
- Cost: $0.02 per 1 million tokens
- The entire Dyatlov knowledge base is a few hundred KB at most
- Embedding it once costs literal cents
- $6.00 in OpenAI credits covers: the full one-time build step, re-embedding
  any new chunks added later, and thousands of user queries at runtime

***

## Embedding Model Reference

| Option | Dimensions | Cost | Works Deployed? | Notes |
|--------|-----------|------|-----------------|-------|
| OpenAI text-embedding-3-small | 1536 | $0.02/1M tokens | ✅ Yes | **Recommended** |
| Cohere embed-english-v3.0 | 1024 | Free tier | ✅ Yes | Less documented |
| Ollama nomic-embed-text | 768 | Free (local) | ❌ No | Class project only |

***

## Implementation Plan

### Step 1 — Write embedder.js (one-time build script)

This script runs once whenever the knowledge base is updated.

```js
// embedder.js
import fs from 'fs';
import path from 'path';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHUNKS_DIR = './knowledge-base';
const OUTPUT_FILE = './embeddings.json';

async function embedText(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });
  const data = await res.json();
  return data.data[0].embedding; // array of 1536 numbers
}

async function buildEmbeddings() {
  const files = fs.readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.md'));
  const results = [];

  for (const file of files) {
    const text = fs.readFileSync(path.join(CHUNKS_DIR, file), 'utf8');
    console.log(`Embedding ${file}...`);
    const vector = await embedText(text);
    results.push({ text, source: file, vector });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Done. Wrote ${results.length} embeddings to ${OUTPUT_FILE}`);
}

buildEmbeddings();
```

Run it with:
```bash
node embedder.js
```

***

### Step 2 — Add embeddings.json to .gitignore (optional but recommended)

The file can be large and is re-generatable. Add to `.gitignore`:
```
embeddings.json
```

***

### Step 3 — Rewrite retriever.js

Replace the keyword scoring logic with vector lookup.

```js
// retriever.js
import fs from 'fs';
import path from 'path';

// Load pre-computed embeddings at startup (not on every request)
const embeddings = JSON.parse(
  fs.readFileSync('./embeddings.json', 'utf8')
);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Cosine similarity — no libraries needed
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

async function embedQuery(query) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: query,
    }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

export async function retrieve(query, topK = 5) {
  const queryVector = await embedQuery(query);

  const scored = embeddings.map(chunk => ({
    ...chunk,
    score: cosineSimilarity(queryVector, chunk.vector),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
```

***

## Cosine Similarity (the math)

Once you have two vectors A and B, similarity is:

```
cosine_similarity(A, B) = dot(A, B) / (magnitude(A) * magnitude(B))
```

Result is between -1 and 1. Closer to 1 = more similar.
This replaces the scoring loop in the current retrieve() function.

***

## Environment Variables Needed

Add to `.env`:
```
OPENAI_API_KEY=your_key_here
GROQ_API_KEY=your_existing_key_here   # unchanged
```

***

## What Does NOT Change

- `server.js` — no changes needed
- `promptBuilder.js` — no changes needed
- Groq model for generation — stays exactly the same
- Knowledge base `.md` files — no changes needed

***

## Order of Operations

1. Add `OPENAI_API_KEY` to `.env`
2. Write and run `embedder.js` → produces `embeddings.json`
3. Verify `embeddings.json` has correct shape: `[{ text, source, vector }]`
4. Rewrite `retriever.js` using the template above
5. Test a query — confirm better semantic results vs. old keyword matching
6. (Optional) Add `embeddings.json` to `.gitignore`