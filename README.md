# 📄 DocuMind AI – Your Intelligent Research Companion

**DocuMind AI** is an advanced **Retrieval-Augmented Generation (RAG)** platform designed to help users interact with their documents in a smarter way. Simply upload your PDFs, and DocuMind AI transforms them into a searchable knowledge base, allowing you to ask questions, explore insights, and receive context-aware answers powered by **Google Gemini** and **Pinecone Vector Search**.

Whether you're analyzing research papers, technical documentation, reports, or study material, DocuMind AI makes information retrieval fast, accurate, and intuitive.

---

## ✨ What Makes DocuMind AI Special?

### 📚 Intelligent Document Understanding

Uploaded PDFs are automatically processed, divided into meaningful chunks, and converted into vector embeddings for highly relevant semantic search.

### 🤖 Flexible AI Response Modes

Choose how the AI responds:

* **Strict Mode** – Answers are generated only from the uploaded documents.
* **Helpful Mode** – Combines document context with the model’s broader knowledge when necessary.

### 🔍 Source-Aware Responses

Every answer includes references to the exact sections of the document it was derived from. Users can instantly jump to the corresponding PDF page for verification and deeper exploration.

### ⚡ Fully Serverless-Friendly Architecture

Designed with modern deployment platforms in mind, DocuMind AI avoids disk-based storage operations, making it ideal for environments like **Vercel**, **AWS Lambda**, and other serverless infrastructures.

### 💾 Smart Browser-Side Storage

Documents are securely cached using **IndexedDB**, enabling faster loading times, reduced server costs, and a smoother user experience without relying on persistent cloud storage.

### 🛡️ Built-in Reliability & Safety

* Automatic payload-size validation to prevent deployment limitations.
* Intelligent retry mechanisms for improved API reliability.
* Direct-fetch architecture for stable and efficient communication with AI services.
* Automatic development server recovery to reduce downtime during local development.

---

## 🛠️ Technology Stack

### Frontend

* React (Vite)
* Axios
* Lucide React Icons

### Backend

* Node.js
* Express.js

### Databases

* MongoDB – User management and application data
* Pinecone – Vector database for semantic search

### AI & Machine Learning

* Google Gemini – Large Language Model
* Xenova Transformers – Local embedding generation
* Cohere – Result reranking and relevance optimization

---

## 🚀 Getting Started

# Prerequisites

Before running the project, make sure you have:

* Node.js (v18 or higher)
* MongoDB (Local Instance or MongoDB Atlas)
* Pinecone Account
* Google AI Studio API Key

---

### Installation

Clone the repository and install dependencies for both frontend and backend applications.

```bash
# Backend Setup
cd backend
npm install

# Frontend Setup
cd ../frontend
npm install
```

---

### Environment Configuration

Create a `.env` file inside the **backend** directory and add the following variables:

```env
PORT=5000
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_secret_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=your_index_name
GEMINI_API_KEY=your_google_ai_key
```

---

### Running the Application

Start both frontend and backend servers:

```bash
# Backend
npm run dev

# Frontend
npm run dev
```

Once both services are running, open the frontend URL provided by Vite in your browser.

---

## 📂 Project Structure

```text
frontend/
├── src/
├── public/

backend/
├── controllers/
├── models/
├── routes/
├── middleware/
└── services/
```

### Key Directories

* **frontend/** – User interface built with React and Vite.
* **backend/** – API server and business logic.
* **controllers/** – Chat processing and document management logic.
* **models/** – MongoDB schemas and database models.
* **services/** – AI integrations and vector search operations.

---

## 🔒 Security & Performance

Security and performance were considered from the ground up:

* **JWT Authentication** for secure user sessions.
* **Local Embedding Generation** for faster processing and reduced external dependency costs.
* **Direct-Fetch Architecture** for reliable API communication.
* **Client-Side Document Isolation** using IndexedDB, ensuring uploaded PDFs remain within the user's browser whenever possible.
* **Serverless-Ready Design** that minimizes infrastructure complexity while maintaining scalability.

---

## 🎯 Use Cases

DocuMind AI is ideal for:

* Research Paper Analysis
* Technical Documentation Search
* Legal & Compliance Document Review
* Academic Study Assistance
* Internal Knowledge Base Exploration
* Enterprise Document Intelligence

By combining modern AI with efficient retrieval systems, DocuMind AI turns static documents into interactive, searchable knowledge sources.
