# Manual QA — Natural Language Question Tests

Run by sending `POST /ask` to the live server (`node server.js`) and recording the raw response.
Goal: check whether keyword-frequency retrieval + strict-context prompting can handle direct,
comparative, and spatial questions, and correctly refuse out-of-scope ones.

## Results

### 1. Direct fact lookup
**Q:** How many hikers died?
**Response:**
```json
{"answer":"Nine hikers died.","sources":["13_theory_paradoxical_undressing.md","09_investigation.md","12_theory_wind_carousel.md"]}
```
**Verdict:** Pass. Correct answer, though sources are theory files rather than `02_the_group.md` — keyword scoring picked chunks that happen to repeat "nine"/"hikers" more often, not necessarily the most authoritative source.

### 2. Comparative / superlative
**Q:** Which hiker had the most serious injuries?
**Response:**
```json
{"answer":"I don't know, based on the context, Lyudmila Dubinina and Semyon Zolotaryov had fatal injuries.","sources":["09_investigation.md","07_remaining_four_bodies.md","08_injuries_and_cause_of_death.md"]}
```
**Verdict:** Partial pass. The model hedges ("I don't know") but still surfaces the right two names from `08_injuries_and_cause_of_death.md`. Keyword matching has no concept of "most" — it can't rank injury severity itself, it just retrieves chunks that mention injuries, leaving the comparison to the LLM, which it does reasonably well here but isn't guaranteed to.

### 3. Spatial / numeric detail
**Q:** How far from the tent were the hikers found?
**Response (after a request was rate-limited and retried):**
```json
{"answer":"70 meters from the tent near a fireplace for the 4 hikers who were trying to find or build a better camping place, and at a Siberian pine tree, near a fire pit, for the 2 hikers who were found only in their underwear and pyjamas.","sources":["10_theory_avalanche.md","05_the_tent.md","15_theory_military.md"]}
```
**Verdict:** Fail (factually wrong). `06_first_five_bodies.md` actually states distances of 300/480/630 m *from the cedar tree*, not the tent, and no source mentions "70 meters." The LLM appears to have blended details from unrelated retrieved chunks. This is a real grounding weakness: keyword retrieval pulled three only loosely-relevant files (none of which contains the actual distance figures), and the LLM filled the gap with a plausible-sounding but unsupported number.

### 4. Out-of-scope (should refuse)
**Q:** What was the weather like on the moon that night?
**Response:**
```json
{"answer":"I do not know. The provided context does not mention the weather on the moon that night.","sources":["10_theory_avalanche.md","09_investigation.md","18_recent_developments.md"]}
```
**Verdict:** Pass on the answer (correctly refused), but worth noting: the question matched on the word "night" (not a stop word) and pulled 3 unrelated chunks into context/sources instead of hitting the 0-result bypass. The strict prompt saved it here, but the `sources` array is misleading — it lists files that have nothing to do with the actual answer.

## Operational note
Two requests sent back-to-back returned `{"error":"Failed to generate an answer. Please try again."}` — this was Groq API rate-limiting, not a server/retrieval bug. Confirmed by re-sending the same question seconds later and getting a normal answer. Not something to fix without being asked; just don't mistake it for a retrieval failure when re-testing.

## Takeaways (not yet acted on — flagging for discussion)
- "night", "moon", "weather" all pass the stop-word filter and can drag in irrelevant chunks for keyword-only matching. Stop word list could grow over time but that's a retrieval tuning decision, not done here.
- `sources` can include chunks that didn't actually contribute to the answer (case 4), which is misleading to a user reading the citations.
- Case 3 shows the LLM will still produce a confident-sounding number even when the right chunk wasn't retrieved — a known risk of keyword-frequency retrieval over numeric/spatial facts.

## Re-test after heading-based chunking (retriever.js)

`retriever.js` now splits each `.md` file into chunks by `##` heading instead of one chunk per file, and `server.js` dedupes the `sources` array. Re-ran all four questions:

1. **How many hikers died?** → "nine hikers... six died of hypothermia, while three died of fatal injuries." More precise than before, still correctly grounded.
2. **Which hiker had the most serious injuries?** → "Thibeaux-Brignolles had major skull damage." No more hedging — names one hiker directly from `08_injuries_and_cause_of_death.md`.
3. **How far from the tent were the hikers found?** → No longer hallucinates a number (previously fabricated "70 meters"), but still doesn't retrieve the actual distance figures (300/480/630 m from the cedar tree, in `06_first_five_bodies.md`'s "## Location" section). Root cause confirmed via direct scoring test: that section never uses the words "tent," "hikers," or "found" — it says "camp," "corpses," "bodies" instead — so it scores too low to be retrieved regardless of chunk size. This is a **vocabulary-mismatch limitation of keyword matching**, not a chunking problem, and chunking alone can't fix it.
4. **What was the weather like on the moon that night?** → "I do not know." Still correctly refuses; answer is cleaner than before.

**Net result:** chunking by heading fixed the hallucination (LLM no longer invents facts not present in any retrieved chunk) and tightened answers 1 and 2. It did not fix question 3, because that's a synonym/terminology gap, which keyword-frequency matching fundamentally can't bridge without either a synonym list or semantic (embedding-based) retrieval — out of scope for the current "no embeddings, no vector DB" tech stack decision. Flagging for a future decision rather than acting on it now.
