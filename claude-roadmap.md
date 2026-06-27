# Dyatlov RAG — Backend Build Roadmap

Context doc for resuming work across sessions. Follows `AGENTS.md` rules: one small step at a time, explicit permission before moving on, no git operations by Claude.

**Frontend contract (already built, in `public/index.html`):**
- `POST http://localhost:3000/ask` with JSON body `{ question }`
- Expects JSON response `{ answer, sources }` where `sources` is an array of filenames

## Steps

- [x] **Step 1 — Ingestion**: `retriever.js` — `loadKnowledgeBase()` async function reads all `.md` files from `knowledge-base/`, returns array of `{ source, text }` chunk objects.
- [x] **Step 2 — Retrieval**: `retriever.js` — `searchChunks(question, chunks, topN)` extracts keywords from the question, scores each chunk by keyword frequency, filters out zero-score chunks, sorts by relevance, returns top matches (each still tagged with `source`).
- [ ] **Step 3 — Empty Retrieval Handling**: ensure the retrieval function (or its caller) can signal "0 results" so the server can short-circuit and skip the LLM call.
- [ ] **Step 4 — Prompt Augmentation**: `promptBuilder.js` — function that takes the question + retrieved chunks and builds a strict system prompt (instructs the LLM to answer ONLY from context, say "I don't know" otherwise).
- [ ] **Step 5 — Generation**: a Groq API call function (native `fetch`, no SDK) that sends the built prompt and returns the LLM's answer. Keep this separate from retrieval logic.
- [ ] **Step 6 — Routing**: `server.js` — Express app with `POST /ask` endpoint wiring together: retrieve chunks → check empty → build prompt → call Groq → return `{ answer, sources }`.
- [ ] **Step 7 — Env/Config**: confirm `.env` holds `GROQ_API_KEY` (and any other config), loaded via `dotenv`.
- [ ] **Step 8 — Manual End-to-End Test**: run server, use `public/index.html` in browser, verify a real question returns an answer + correct sources, and an unanswerable question returns the hardcoded "I don't know".
- [ ] **Step 9 — Edge Cases**: empty question input, no matching chunks, Groq API errors/timeouts.

## Notes
- Tech stack: Node.js + Express, CommonJS modules (`"type": "commonjs"` in `package.json`), vanilla JS, no TypeScript.
- Retrieval is basic keyword/frequency matching — no vector DB, no embeddings.
- Every chunk must carry its `source` filename through the whole pipeline (retrieval separation + source tracking rules in `AGENTS.md`).
