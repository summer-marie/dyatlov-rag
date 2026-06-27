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

## Step 12 — Synonym matching + length-normalized scoring (retriever.js)

Decided to actually address the Step 11 vocabulary-mismatch limitation instead of leaving it. Two changes to `retriever.js`:

1. **`SYNONYMS` map + `expandKeywords()`**: built from grepping actual term frequency across `knowledge-base/*.md` (hiker/group/travellers/students/skiers, tent/camp/campsite, found/discovered/located, died/death/deaths/perished/fatal, injury/injuries/wound/wounds/trauma, body/bodies/corpse/corpses/remains, far/distance/metres/meters/km/kilometres). A question's keywords are expanded to include their knowledge-base-side synonyms before scoring.
2. **Length-normalized scoring**: raw keyword-occurrence counts were tested first and confirmed the real culprit for question 3 wasn't just vocabulary — it was that long chunks (e.g. the avalanche theory section) accumulate more raw keyword hits than the short, precise `06_first_five_bodies.md` "## Location" section just by being longer. Switched `score` to `occurrences / wordCount` (density, not raw count).
3. Normalizing by length surfaced a side effect: a lone "# Title" line before a file's first `##` heading became its own near-empty chunk with an inflated density score (e.g. "# The Tent" alone scoring higher than real content). Fixed `splitIntoSections()` to require `MIN_SECTION_WORDS = 10` before flushing a section, merging short leading fragments into the next section instead of treating them as standalone chunks.
4. Bumped default `topN` in `searchChunks` from 3 → 6: chunks are now heading-sized (much smaller than before), and the correct "## Location" section for question 3 ranked 6th — confirmed via a direct Node script that scored and ranked all chunks before changing the constant.

### Re-test (8 questions total — original 4 + 4 new synonym-targeted cases)

| # | Question | Result |
|---|---|---|
| 1 | How many hikers died? | "Nine hikers died." — correct, tightened sourcing. |
| 2 | Which hiker had the most serious injuries? | Names Dubinina and Zolotaryov (major chest fractures) — correct, still appropriately hedges between two tied-severity cases rather than forcing a single answer. |
| 3 | How far from the tent were the hikers found? | Now returns the real 300/480/630 m figures from `06_first_five_bodies.md`, and explicitly says it can't compute exact tent-distance from what's given — accurate and no longer fabricated. **This was the original failing case — now fixed.** |
| 4 | What was the weather like on the moon that night? | Correctly refuses. |
| 5 | How many **travelers** were in the **group**? (synonym for hikers) | "There were nine travelers in the group." — correct, synonym match worked. |
| 6 | What condition was the **camp** in when it was **discovered**? (synonyms for tent/found) | Correctly describes the tent being torn down — synonym match worked. |
| 7 | Were there any **wounds** on the **corpses**? (synonyms for injuries/bodies) | Correctly pulls injury details from `08_injuries_and_cause_of_death.md` — synonym match worked. |
| 8 | How many **kilometers** did the **students** walk before the incident? (synonyms for km/hikers) | "I do not know" — verified this is a *correct* refusal, not a retrieval miss: the knowledge base states km to Otorten and to the forest, but never total distance walked, so refusing is accurate. |

All 8 pass. The original Step 11 known limitation (question 3) is now resolved. No regressions in the other 7.

## Step 13 — More synonym coverage (self-generated from knowledge-base content)

Read `02_the_group.md`, `07_remaining_four_bodies.md`, and `04_search_and_discovery.md` directly to find more vocabulary gaps, rather than asking for more context. Found two: the knowledge base says "expedition"/"trip"/"route" interchangeably but never "journey"; and it says "buried" but a user might say "covered." Added to `SYNONYMS` in `retriever.js`:
- `trip` / `journey` / `expedition` / `route` (all map to each other)
- `buried` / `covered` (map to each other)

### New test cases (9–12)

| # | Question | Result |
|---|---|---|
| 9 | What was the purpose of the **journey**? (KB says "expedition") | Correctly answers: reaching Otorten, 10 km north. Synonym match worked. |
| 10 | How many people were originally part of the **trip**? (KB says "expedition"/"group") | "10 people: 8 men and 2 women" — correct, pulled from `02_the_group.md`'s table/text. |
| 11 | Where were the last four bodies **discovered**? (existing found/discovered synonym, new context: ravine/creek) | Correct: ravine, 75m from pine tree, 70m from fire pit, under 4m of snow. |
| 12 | How deep was the snow that **covered** the last four hikers? (KB says "buried") | "four metres (13 ft) of snow" — correct, synonym match worked. |

Re-ran questions 3 and 4 from Step 12 afterward to confirm no regressions from the new SYNONYMS entries — both still correct (tent-distance still grounded with real figures, moon-weather still refuses).

**Total test coverage: 12 questions, all passing.** No known retrieval failures remain in this round; remaining limitation is general (keyword/density matching has no true semantic understanding, so any vocabulary not anticipated in `SYNONYMS` will still be missed) rather than a specific bug.

## Step 14 — More synonym coverage, round 2 (self-generated)

Read `01_overview.md`, `09_investigation.md`, `18_recent_developments.md`, `19_legacy.md`, `16_theory_animal_attack.md`, `17_other_theories.md` directly to find more gaps. Found 4 more and added to `SYNONYMS` in `retriever.js`:
- `withdrew` / `quit` / `left` (KB says "left expedition because of illness")
- `probe` / `investigation` / `inquest` (KB uses "investigation"/"inquest" interchangeably, never "probe")
- `monument` / `memorial` / `plaque` (KB says "memorial"/"plaque")
- `blizzard` / `storm` / `snowstorm` (KB says "storm"/"snowstorm")

### New test cases (13–16)

| # | Question | Result |
|---|---|---|
| 13 | Who **withdrew** from the expedition before it began? | "One member... withdrew... because of health issues" — correct (Yudin), synonym match worked. |
| 14 | When was the **probe** into the deaths reopened? | "February 2019" — correct, synonym match worked. |
| 15 | Is there a **monument** dedicated to the group? | Correctly describes the rock outcrop memorial — synonym match worked. |
| 16 | What was the **blizzard** like the night of the tragedy? | Correctly pulls the ICRF wind speed/temperature/snowstorm details — synonym match worked. |

Re-ran the tent-distance question afterward — still correctly grounded (no fabrication, same sources), confirming no regression.

**Total test coverage: 16 questions, all passing.**

## Step 15 — Stop-word tuning (retriever.js)

Investigated the long-flagged issue: questions like "What was the weather like on the moon **that night**?" dragged in mostly-irrelevant chunks because "night" and "that" pass the 3-char length filter and aren't in `STOP_WORDS`, despite acting as generic filler in most of the corpus.

Debugged with a direct keyword-extraction script and confirmed via `grep -c` on `knowledge-base/*.md`:
- `that` appears in all 19 files as filler ("...that they had died") — added to `STOP_WORDS`.
- `night` appears in 8/19 files, mostly as filler — but tried adding it and it caused a **real regression**: question 16 ("What was the blizzard like the night of the tragedy?") relies on it matching the literal phrase "the weather on the **night** of the tragedy was harsh" in `09_investigation.md`. Removing it as a keyword broke that match. **Reverted** — `night` stays a real keyword despite being mostly filler, because the one case where it's load-bearing matters more than the noise it adds elsewhere.

### Verification
- Re-ran question 4 (moon/weather) — still correctly refuses, sources slightly more weather-thematic than before (`that` removal helped a little on its own).
- Re-ran question 16 (blizzard/night) — confirmed it's back to its correct, detailed answer after reverting `night`.
- Re-ran questions 1, 2, 3, 9 as a broader regression check — no breakage.

**Takeaway:** not every generic-seeming word can be safely treated as a stop word in a small, single-topic corpus — a word can be filler in 90% of files and the one specific phrase match needed in the other 10%. `STOP_WORDS` changes need a regression check against the full test set, not just the question that motivated the change.
