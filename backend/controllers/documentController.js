const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf');
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { Pinecone } = require('@pinecone-database/pinecone');

// @desc    Upload new document and vectorise
// @route   POST /api/documents
// @access  Private
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const clientApiKey = req.headers['x-gemini-api-key'] || req.headers['x-api-key'];
    const geminiApiKey = clientApiKey || process.env.GEMINI_API_KEY;

    // 1. Storage path set to 'indexeddb' for browser-side caching
    const userNamespace = `user_${req.user._id}`;
    const doc = await Document.create({
      user: req.user._id,
      filename: req.file.originalname,
      pineconeNamespace: userNamespace, // Shared namespace per user
      storagePath: 'indexeddb', // Will be updated to actual disk path below
      status: 'processing'
    });

    // Save physical file copy to MongoDB for serverless-safe downloads
    try {
      doc.fileData = req.file.buffer;
      doc.storagePath = 'mongodb';
      await doc.save();
    } catch (saveErr) {
      console.error('Failed to save file buffer in MongoDB:', saveErr.message);
    }

    // Send immediate response
    res.status(202).json(doc);

    // 3. Heavy processing in the background (RAG logic remains unchanged)
    (async () => {
      try {
        const blob = new Blob([req.file.buffer], { type: 'application/pdf' });
        const loader = new PDFLoader(blob, { splitPages: true });
        const pageDocs = await loader.load();
        const rawText = pageDocs.map(d => d.pageContent).join('\n');

        // 3. Generate Summary (Optional - handles Quota Errors gracefully)
        try {
          const llm = new ChatGoogleGenerativeAI({
            model: "gemini-2.5-flash", 
            apiVersion: "v1beta",
            apiKey: geminiApiKey
          });
          // Limit to first 6000 chars roughly to stay in small token window for summary
          const IntroText = rawText.substring(0, 6000);
          const summaryPrompt = `Briefly summarize this document in 3-4 sentences. Focus on the core purpose. Text:\n\n${IntroText}`;
          const sumResponse = await llm.invoke(summaryPrompt);
          doc.summary = sumResponse.content;
        } catch (llmErr) {
          console.warn("LLM Quota or Service Error - Skipping Summary:", llmErr.message);
          doc.summary = "Summary unavailable (API Rate Limit or Token Limit reached).";
        }

        // 4. Chunking (Continues even if summary fails)
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
        });
        const docsWithMetadata = pageDocs.map(d => {
           d.metadata = { 
             ...d.metadata, 
             source: req.file.originalname, 
             docId: doc._id.toString(), 
             userId: req.user._id.toString() 
           };
           return d;
        });
        const chunks = await textSplitter.splitDocuments(docsWithMetadata);

        // Vectorize & Upsert using Gemini text-embedding-004 API (384 dimensions)
        const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
        const index = pc.index(process.env.PINECONE_INDEX_NAME);

        const getGeminiEmbedding = async (text) => {
          const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiApiKey}`;
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

        const vectors = await Promise.all(chunks.map(async (chunk, i) => {
            const embedding = await getGeminiEmbedding(chunk.pageContent);
            const page = chunk.metadata?.loc?.pageNumber || 1;
            const metadata = { ...chunk.metadata, text: chunk.pageContent, page: page };
            if (metadata.loc) delete metadata.loc;
            if (metadata.pdf) delete metadata.pdf;
            
            return {
                id: `${doc._id}_chunk_${i}`,
                values: embedding,
                metadata: metadata,
            };
        }));

        const batchSize = 100;
        for (let i = 0; i < vectors.length; i += batchSize) {
           const batch = vectors.slice(i, i + batchSize);
           await index.namespace(userNamespace).upsert(batch);
        }

        doc.status = 'completed';
        await doc.save();
      } catch (err) {
        console.error(`Processing failed:`, err);
        doc.status = 'failed';
        await doc.save();
      }
    })();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get specific document status
// @route   GET /api/documents/:id/status
const getDocumentStatus = async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, user: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    res.json({ status: doc.status, summary: doc.summary });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching status' });
  }
};

// @desc    Get user documents
// @route   GET /api/documents
// @access  Private
const getDocuments = async (req, res) => {
  const documents = await Document.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(documents);
};

// @desc    Download PDF file on demand
// @route   GET /api/documents/:id/download
// @access  Private
const downloadDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, user: req.user._id });
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Serve directly from MongoDB if available
    if (doc.fileData && (doc.storagePath === 'mongodb' || !doc.storagePath || doc.storagePath === 'indexeddb')) {
      res.contentType('application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);
      return res.send(doc.fileData);
    }

    let filePath = path.join(__dirname, '..', doc.storagePath || '');
    if (!fs.existsSync(filePath) || doc.storagePath === 'indexeddb') {
      // Fallback: search uploads directory for filename matching exactly or with a prefix
      const uploadsDir = path.join(__dirname, '../uploads');
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        const match = files.find(f => f === doc.filename || f.endsWith(`_${doc.filename}`));
        if (match) {
          filePath = path.join(uploadsDir, match);
        }
      }
    }

    // Secondary fallback: if physical file doesn't exist on disk, check if we have MongoDB data (for safety)
    if (!fs.existsSync(filePath)) {
      if (doc.fileData) {
        res.contentType('application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);
        return res.send(doc.fileData);
      }
      return res.status(404).json({ message: 'Physical PDF file not found on server' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Server Error downloading document' });
  }
};

module.exports = {
  uploadDocument,
  getDocuments,
  getDocumentStatus,
  downloadDocument
};
