const express = require('express');
const path = require('path');
const { loadEmbeddings, searchChunks } = require('./retriever');
const { buildPrompt } = require('./promptBuilder');
const { generateAnswer } = require('./generator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let embeddings = [];

app.post('/ask', async (req, res) => {
  const { question } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Question is required.' });
  }

  const relevantChunks = await searchChunks(question, embeddings);

  if (relevantChunks.length === 0) {
    return res.json({
      answer: "I don't know. The case files don't contain information relevant to that question.",
      sources: [],
    });
  }

  try {
    const messages = buildPrompt(question, relevantChunks);
    const answer = await generateAnswer(messages);
    const sources = [...new Set(relevantChunks.map((chunk) => chunk.source))];

    res.json({ answer, sources });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate an answer. Please try again.' });
  }
});

async function startServer() {
  embeddings = await loadEmbeddings();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
