# Embedding Model Research

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

---

## How It Would Plug Into This Project

Current pipeline:
  query → keyword match → top K chunks → Groq LLM → answer

Embedding pipeline:
  query → embed query → cosine similarity vs stored chunk vectors → top K chunks → Groq LLM → answer

The only file that changes is retriever.js.
server.js and promptBuilder.js stay exactly the same.

---

## Option 1: OpenAI text-embedding-3-small

Provider: OpenAI
Model name: text-embedding-3-small
Dimensions: 1536
Cost: $0.02 per 1 million tokens (very cheap)
API: Same key as GPT-4. POST to https://api.openai.com/v1/embeddings

Pros:
- Industry standard, extremely well documented
- Same fetch() pattern already used for Groq in server.js
- No SDK needed

Cons:
- Requires an OpenAI API key (separate from Groq)
- Embeddings must be pre-computed and stored (a build step)

Sample fetch call:
  fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: 'your text here',
    }),
  })
  // response.data[0].embedding → array of 1536 numbers

---

## Option 2: Cohere embed-english-v3.0

Provider: Cohere
Model name: embed-english-v3.0
Dimensions: 1024
Cost: Free tier available (100 calls/min)
API: POST to https://api.cohere.com/v2/embed

Pros:
- Free tier is generous for a class project
- Slightly smaller vectors (1024 vs 1536) → less storage
- input_type parameter lets you tell it whether you are embedding
  a query or a document, which improves accuracy

Cons:
- Less commonly taught, fewer Stack Overflow answers
- Requires a Cohere API key

Sample fetch call:
  fetch('https://api.cohere.com/v2/embed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'embed-english-v3.0',
      texts: ['your text here'],
      input_type: 'search_document', // or 'search_query' for the question
      embedding_types: ['float'],
    }),
  })
  // response.embeddings.float[0] → array of 1024 numbers

---

## Option 3: Ollama (fully local, no API key)

Provider: Ollama (runs on your machine)
Model name: nomic-embed-text
Dimensions: 768
Cost: Free — runs locally, no internet required after download

Pros:
- Zero API cost, zero rate limits
- Great for a class project where you do not want to spend money
- Same fetch() pattern — Ollama exposes a local REST API

Cons:
- Must have Ollama installed and running locally (ollama serve)
- Slightly lower quality than OpenAI/Cohere
- Will not work if the app is deployed to a server

Sample fetch call (after running: ollama pull nomic-embed-text):
  fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nomic-embed-text',
      prompt: 'your text here',
    }),
  })
  // response.embedding → array of 768 numbers

---

## Cosine Similarity (the math you need)

Once you have two vectors A and B, similarity is:

  cosine_similarity(A, B) = dot(A, B) / (magnitude(A) * magnitude(B))

Result is between -1 and 1. Closer to 1 = more similar.

In plain JavaScript (no libraries needed):

  function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dot / (magA * magB);
  }

This replaces the scoring loop in the current retrieve() function.

---

## Recommended Approach for This Class Project

1. Start with Ollama + nomic-embed-text (free, local, no key needed)
2. Write a one-time build script (embedder.js) that:
   - Reads every chunk from the knowledge-base/ folder
   - Calls the Ollama embeddings endpoint for each chunk
   - Saves the result to embeddings.json as [{ text, source, vector }]
3. Modify retriever.js to:
   - Load embeddings.json at startup instead of re-reading .md files
   - Embed the incoming query at request time
   - Score every chunk using cosineSimilarity()
   - Return top K by score
4. Once it works locally, swap Ollama for OpenAI or Cohere by changing
   one fetch() call and one .env variable.