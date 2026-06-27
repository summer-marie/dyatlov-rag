require('dotenv').config();
const express = require('express');
const path = require('path');
const { loadKnowledgeBase, retrieve } = require('./retriever');
const { buildRAGPrompt } = require('./promptBuilder');

const app = express();
const PORT = 3000;

// Load the knowledge base once at startup
const KNOWLEDGE_BASE_PATH = path.join(__dirname, 'knowledge-base');
const documents = loadKnowledgeBase(KNOWLEDGE_BASE_PATH);
console.log(`Loaded ${documents.length} chunks from the knowledge base.`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/ask', async (req, res) => {
  try {
    const question = req.body.question;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'A "question" string is required in the request body.' });
    }

    // Retrieve relevant chunks
    const chunks = retrieve(question, documents);

    if (chunks.length === 0) {
      return res.status(404).json({
        error: 'No relevant information found in the knowledge base for that question.',
      });
    }

    // Build the RAG prompt
    const prompt = buildRAGPrompt(question, chunks);

    // Call the Groq API using native fetch
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', response.status, errorText);
      return res.status(502).json({ error: 'The LLM service returned an error.' });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() ?? '';

    const sources = chunks.map((chunk) => chunk.source);

    return res.json({ answer, sources });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
});

app.listen(PORT, () => {
  console.log(`Dyatlov Pass RAG server running at http://localhost:${PORT}`);
});