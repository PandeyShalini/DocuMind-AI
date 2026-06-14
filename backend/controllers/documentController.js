const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf');
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { pipeline, env } = require('@xenova/transformers');
const { Pinecone } = require('@pinecone-database/pinecone');

// Skip local cache warning for Xenova
env.allowLocalModels = false;
env.cacheDir = '/tmp/transformers-cache';

// @desc    Upload new document and vectorise
// @route   POST /api/documents
// @access  Private
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // 1. Storage path set to 'indexeddb' for browser-side caching
    const userNamespace = `user_${req.user._id}`;
    const doc = await Document.create({
      user: req.user._id,
      filename: req.file.originalname,
      pineconeNamespace: userNamespace, // Shared namespace per user
      storagePath: 'indexeddb', // Store 'indexeddb' indicator
      status: 'processing'
    });

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
            apiKey: process.env.GEMINI_API_KEY
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

        // Vectorize & Upsert
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
        const index = pc.index(process.env.PINECONE_INDEX_NAME);

        const vectors = await Promise.all(chunks.map(async (chunk, i) => {
            const result = await extractor(chunk.pageContent, { pooling: 'mean', normalize: true });
            const embedding = Array.from(result.data);
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

module.exports = {
  uploadDocument,
  getDocuments,
  getDocumentStatus
};
