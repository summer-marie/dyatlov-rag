function buildPrompt(question, chunks) {
  const context = chunks
    .map((chunk) => `Source: ${chunk.source}\n${chunk.text}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You are a research assistant analyzing case files about the Dyatlov Pass incident.
Answer using ONLY the provided context below. If the answer is not contained in the context, state that you do not know.
Do not use outside knowledge and do not speculate beyond what is written in the context.

Context:
${context}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ];
}

module.exports = { buildPrompt };
