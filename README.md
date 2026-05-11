# 📄 DocuMind AI - Advanced RAG Research Assistant

DocuMind AI is a professional **Retrieval-Augmented Generation (RAG)** tool. It allows users to upload PDF documents, index them into a Vector Database, and have intelligent conversations with their data using **Gemini 3.1** and **Pinecone**.

---

## ✨ Key Features
- **Smart PDF Indexing**: Automatically splits PDF text into chunks and generates vector embeddings.
- **Hybrid AI Engine**: Switch between **Strict Mode** (PDF-only data) and **Helpful Mode** (General knowledge allowed).
- **Deep View Citations**: Click on AI-generated sources to view the exact page in the PDF viewer.
- **Resilient Connectivity**: Built-in retry logic and direct-fetch architecture for 100% AI uptime.
- **Stability Pro**: Integrated OS-level port recovery to prevent common dev-server crashes.

---

## 🛠️ Technology Stack
- **Frontend**: React (Vite), Lucide Icons, Axios.
- **Backend**: Node.js, Express.js.
- **Database**: MongoDB (User Data), Pinecone (Vector Search).
- **AI/ML**: Google Gemini (LLM), Xenova (Local Embeddings), Cohere (Reranking).

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- MongoDB (Local or Atlas)
- Pinecone Account (Free Tier)
- Google AI Studio Key (Gemini)

### 2. Installation
Clone the repository and install dependencies for both frontend and backend:

```bash
# Install Backend
cd backend
npm install

# Install Frontend
cd ../frontend
npm install
```

### 3. Environment Setup
Create a `.env` file in the **backend** folder:
```env
PORT=5000
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_secret_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=your_index_name
GEMINI_API_KEY=your_google_ai_key
```

### 4. Running the App
Run both servers simultaneously:
```bash
# In /backend
npm run dev

# In /frontend
npm run dev
```

---

## 📂 Project Structure
- `/frontend`: React application (Vite).
- `/backend`: Node.js server, API routes, and RAG logic.
- `/backend/controllers`: Core logic for Chat and Document processing.
- `/backend/models`: Mongoose schemas.

---

## 🔒 Security & Performance
- **JWT Authentication**: Secure user sessions.
- **Local Embeddings**: Faster vector generation using `@xenova/transformers`.
- **Direct-Fetch**: Bypasses library overhead for stable API communication.
