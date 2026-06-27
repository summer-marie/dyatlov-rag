# Dyatlov RAG — Backend Build Roadmap

Context doc for resuming work across sessions. Follows `AGENTS.md` rules: one small step at a time, explicit permission before moving on, no git operations by Claude.

**Frontend contract (already built, in `public/index.html`):**
- `POST http://localhost:3000/ask` with JSON body `{ question }`
- Expects JSON response `{ answer, sources }` where `sources` is an array of filenames

## Steps

- [x] **Step 1 — Ingestion**: `retriever.js` — `loadKnowledgeBase()` async function reads all `.md` files from `knowledge-base/`, returns array of `{ source, text }` chunk objects.
- [x] **Step 2 — Retrieval**: `retriever.js` — `searchChunks(question, chunks, topN)` extracts keywords from the question, scores each chunk by keyword frequency, filters out zero-score chunks, sorts by relevance, returns top matches (each still tagged with `source`).
- [x] **Step 3 — Empty Retrieval Handling**: no standalone code needed — `searchChunks()` already returns `[]` on 0 matches. The actual bypass-the-LLM check is merged into Step 6's route handler.
- [x] **Step 4 — Prompt Augmentation**: `promptBuilder.js` — `buildPrompt(question, chunks)` merges retrieved chunks into a context block and returns a `messages` array (system + user) with strict "answer ONLY from context" instructions, ready for the Groq chat completions API.
- [x] **Step 5 — Generation**: `generator.js` — `generateAnswer(messages)` sends the messages array to Groq's chat completions endpoint via native `fetch` (model: `llama-3.1-8b-instant`), throws on API errors, returns the answer text. Fully separate from retrieval/prompt logic.
- [x] **Step 6 — Routing**: `server.js` — Express app loads the knowledge base once at startup, serves `public/` statically, and exposes `POST /ask`: retrieves chunks → bypasses the LLM with a hardcoded "I don't know" on 0 results (Step 3) → builds prompt → calls Groq → returns `{ answer, sources }` (sources taken from retrieved chunks, not the LLM).
- [x] **Step 7 — Env/Config**: `.env` holds `GROQ_API_KEY` and `GROQ_MODEL`, loaded via `dotenv` in `generator.js`.
- [x] **Step 8 — Manual End-to-End Test**: server started via `node server.js`, tested `POST /ask` directly with curl — relevant question returned a grounded answer with correct `sources` array; unrelated question returned the hardcoded "I don't know" with `sources: []`. Browser test against `public/index.html` still recommended.
- [x] **Step 9 — Edge Cases**: empty question input verified (returns `400 { error: "Question is required." }`); no-matching-chunks verified (bypasses LLM, hardcoded message). Groq API error/timeout path is implemented (`try/catch` → `500`) but not live-tested (would require simulating an API failure).

## Notes
- Tech stack: Node.js + Express, CommonJS modules (`"type": "commonjs"` in `package.json`), vanilla JS, no TypeScript.
- Retrieval is basic keyword/frequency matching — no vector DB, no embeddings.
- Every chunk must carry its `source` filename through the whole pipeline (retrieval separation + source tracking rules in `AGENTS.md`).
