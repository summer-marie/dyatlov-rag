/**
 * Builds a RAG (Retrieval-Augmented Generation) prompt for the Groq LLM.
 *
 * Combines a strict system prompt with the retrieved context chunks
 * and the user's question.
 */
function buildRAGPrompt(question, chunks) {
  const systemPrompt =
    "You are an expert researcher on the Dyatlov Pass incident. " +
    "Answer the user's question using ONLY the provided context. " +
    "If the context does not contain the answer, say " +
    "'The available documents do not contain information about this.' " +
    "Do not hallucinate.";

  const context = chunks
    .map((chunk) => `[Source: ${chunk.source}]\n${chunk.text}`)
    .join('\n\n');

  const fullPrompt =
    `${systemPrompt}\n\n` +
    `Context:\n${context}\n\n` +
    `Question: ${question}\n\n` +
    `Answer:`;

  return fullPrompt;
}

module.exports = { buildRAGPrompt };