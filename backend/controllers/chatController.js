const ChatSession = require('../models/ChatSession');
const Message = require('../models/Message');
const Document = require('../models/Document');
// No more AI libraries - using native fetch for extreme resilience
const { Pinecone } = require('@pinecone-database/pinecone');
const NodeCache = require('node-cache');
const { CohereClient } = require('cohere-ai');

const chatCache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

// @desc    Send a message and get AI response using RAG
// @route   POST /api/chat/:documentId
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { message, strictMode } = req.body;
    const documentId = req.params.documentId;

    if (!message) return res.status(400).json({ message: 'No query provided' });

    const isGlobalSearch = documentId === 'all';
    let doc = null;

    if (!isGlobalSearch) {
      doc = await Document.findOne({ _id: documentId, user: req.user._id });
      if (!doc) return res.status(404).json({ message: 'Document not found' });
    }

    // 1. Ensure a Chat Session exists
    let session = await ChatSession.findOne({ user: req.user._id, document: isGlobalSearch ? null : documentId });
    if (!session) {
      session = await ChatSession.create({
        user: req.user._id,
        document: isGlobalSearch ? null : documentId,
        title: isGlobalSearch ? "Global Library Search" : (message.substring(0, 30) + '...')
      });
    }

    // Request Caching Loop
    const cacheKey = `chat_${documentId}_${message.trim().toLowerCase()}_${strictMode}`;
    const cachedResponse = chatCache.get(cacheKey);

    if (cachedResponse) {
      console.log(`\n--- RAG CACHE HIT: Bypassing LLM & Pinecone ---`);
      await Message.create({ chatSession: session._id, role: 'user', content: message });
      const aiMessage = await Message.create({
        chatSession: session._id, role: 'assistant', content: cachedResponse, sources: [] 
      });
      return res.status(200).json(aiMessage);
    }

    // 2. Save user message
    await Message.create({
      chatSession: session._id,
      role: 'user',
      content: message,
    });

    // 2.5 Fetch past conversation memory (last 6 messages)
    const rawHistory = await Message.find({ chatSession: session._id })
      .sort({ createdAt: -1 })
      .limit(6);
    const historyText = rawHistory.reverse().map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

    // 3. Search Vector Database (Pinecone)
    const userNamespace = `user_${req.user._id}`;
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pc.index(process.env.PINECONE_INDEX_NAME);
    
    // Generate embedding for user query using Gemini text-embedding-004 (384 dimensions)
    const getGeminiEmbedding = async (text) => {
      const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`;
      let retries = 3;
      while (retries > 0) {
        try {
          const res = await fetch(embedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: { parts: [{ text }] },
              outputDimensionality: 384
            })
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Embedding status ${res.status}: ${errText}`);
          }
          const data = await res.json();
          return data.embedding.values;
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    };
    const queryEmbedding = await getGeminiEmbedding(message);
    
    // Build query with metadata filters
    const queryOptions = {
      topK: 15,
      vector: queryEmbedding,
      includeMetadata: true,
    };

    if (!isGlobalSearch) {
      queryOptions.filter = { docId: documentId };
    }

    const queryResponse = await index.namespace(userNamespace).query(queryOptions);

    let bestMatches = queryResponse.matches;

    // Optional Re-Ranking Phase
    if (process.env.COHERE_API_KEY && queryResponse.matches.length > 0) {
      try {
        const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
        const pineconeDocs = queryResponse.matches.map(m => m.metadata.text || "Empty Chunk");
        
        const reranked = await cohere.rerank({
          documents: pineconeDocs,
          query: message,
          model: 'rerank-english-v3.0',
          topN: 5 // Keep top 5 for global search diversity
        });
        
        bestMatches = reranked.results.map(r => queryResponse.matches[r.index]);
      } catch (err) {
        console.error("Cohere Reranking Failed:", err.message);
        bestMatches = queryResponse.matches.slice(0, 5);
      }
    } else {
        bestMatches = queryResponse.matches.slice(0, 5);
    }

    // 4. Construct Context
    // For global search, we include document source filenames in context
    let contextText = isGlobalSearch ? "GLOBAL SEARCH CONTEXT (Multiple Documents):\n" : `DOCUMENT SUMMARY: ${doc?.summary || 'N/A'}\n\n`;
    const sources = [];
    if (bestMatches.length > 0) {
      contextText += bestMatches.map(match => {
        const page = match.metadata.page || 'N/A';
        const sourceName = match.metadata.source || 'Unknown';
        sources.push({ page: page, text: match.metadata.text.substring(0, 150), source: sourceName });
        return `[Source: ${sourceName} | Page: ${page}]\n${match.metadata.text}`;
      }).join('\n\n--- \n\n');
    }

    console.log(`\n--- RAG PIPELINE DEBUG [${isGlobalSearch ? 'GLOBAL' : 'SINGLE'}] ---`);
    console.log(`Chunks Scanned: ${queryResponse.matches.length}`);
    console.log(`Chunks Filtered: ${bestMatches.length}`);
    console.log(`--------------------------\n`);

    // 5. Call LLM with Context
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is missing from environment variables.");
    }

    // Token Optimization
    const historyLines = historyText.split('\n');
    const optimizedHistory = historyLines.slice(-10).join('\n');

    const prompt = `You are a professional RAG AI Assistant.
    
    SYSTEM RULES:
    1. CURRENT MODE: ${strictMode ? 'STRICT (Document Only)' : 'HELPFUL (General Knowledge Allowed)'}
    
    INSTRUCTIONS FOR MODE "${strictMode ? 'STRICT' : 'HELPFUL'}":
    ${strictMode 
      ? "- Only answer using the provided Context below. If the answer is not in the context, explicitly state that the document does not contain this information. DO NOT use your internal training data." 
      : "- First, try to answer using the provided Context. If the context is missing or insufficient, you ARE ALLOWED and encouraged to use your general knowledge to provide a complete answer. If you use general knowledge, briefly mention that it's not in the document."}

    CONTEXT FROM DOCUMENTS:
    ${contextText}

    CONVERSATION HISTORY:
    ${optimizedHistory}

    USER QUESTION:
    ${message}

    RESPONSE REQUIREMENTS:
    - Output MUST be valid JSON.
    - The "answer" field should use Markdown for formatting (bold, lists).
    - If you use general knowledge in HELPFUL mode, set "sources" to an empty array [].
    - If you use document context, include the "sources" correctly.

    JSON FORMAT:
    {
      "answer": "...",
      "sources": [{"page": number, "source": "filename", "snippet": "..."}],
      "suggestedQuestions": ["Question 1", "Question 2"],
      "confidenceScore": 0-100
    }`;

    let aiText = "";
    let finalModelName = "";

    const callDirectFetchAI = async (modelName, retryCount = 0) => {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        console.log(`>>> [AI] Attempting ${modelName} | URL: ${url.split('?')[0]}`);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
              temperature: strictMode ? 0 : 0.7,
              maxOutputTokens: 2048
            }
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          const errMsg = data.error?.message || `HTTP ${response.status}`;
          console.error(`>>> [AI ERROR] ${modelName}: ${errMsg}`);
          throw new Error(errMsg);
        }

        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
          console.error(">>> [AI ERROR] Unexpected response format:", JSON.stringify(data));
          throw new Error("Invalid AI response format");
        }

        finalModelName = modelName;
        return data.candidates[0].content.parts[0].text;
      } catch (err) {
        const errorMsg = err.message || "Unknown error";
        
        // Advanced Fallback Chain for 2026 environment
        const nextModelMap = {
          "gemini-2.0-flash": "gemini-3-flash-preview",
          "gemini-3-flash-preview": "gemini-flash-latest",
          "gemini-flash-latest": "gemini-pro-latest"
        };

        const nextModel = nextModelMap[modelName];
        if (nextModel) {
           console.warn(`>>> [AI FALLBACK] ${modelName} failed, trying ${nextModel}...`);
           return await callDirectFetchAI(nextModel, 0);
        }

        // Rate Limit Handling (429)
        if (errorMsg.includes("429") && retryCount < 2) {
          const waitTime = Math.pow(2, retryCount) * 1000;
          console.warn(`>>> [AI RETRY] Rate limit on ${modelName}. Waiting ${waitTime}ms...`);
          await new Promise(r => setTimeout(r, waitTime));
          return await callDirectFetchAI(modelName, retryCount + 1);
        }

        throw err;
      }
    };

    aiText = await callDirectFetchAI("gemini-2.0-flash");
    console.log(`>>> [AI SUCCESS] Model: ${finalModelName}`);
    
    let parsedResponse = {
      answer: "I encountered an error trying to process the answer.",
      sources: [],
      suggestedQuestions: [],
      confidenceScore: 0
    };

    try {
       let cleanTxt = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
       parsedResponse = JSON.parse(cleanTxt);
    } catch(err) {
       console.log('Failed to parse LLM JSON:', err.message, '\nRaw:\n', aiText);
       parsedResponse.answer = aiText; 
    }

    // 6. Save AI Response
    const storePayload = JSON.stringify({
      answer: parsedResponse.answer,
      sources: parsedResponse.sources || [],
      suggestedQuestions: parsedResponse.suggestedQuestions || [],
      confidenceScore: parsedResponse.confidenceScore || 0,
      chunksUsed: bestMatches.length,
      strictModeUsed: strictMode 
    });

    const aiMessage = await Message.create({
      chatSession: session._id,
      role: 'assistant',
      content: storePayload,
      sources: [] 
    });

    chatCache.set(cacheKey, storePayload);

    res.status(200).json(aiMessage);
  } catch (error) {
    console.error('CHAT ERROR:', error);
    res.status(500).json({ message: 'Server Error during chat', error: error.message });
  }
};

// @desc    Get chat history for a document
// @route   GET /api/chat/:documentId
// @access  Private
const getHistory = async (req, res) => {
  try {
    const isGlobalSearch = req.params.documentId === 'all';
    const session = await ChatSession.findOne({ user: req.user._id, document: isGlobalSearch ? null : req.params.documentId });
    if (!session) return res.json([]);

    const messages = await Message.find({ chatSession: session._id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = {
  sendMessage,
  getHistory
};
