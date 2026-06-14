import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Plus, FileText, UploadCloud, Settings, Database, Loader2, Copy, Check, ToggleLeft, ToggleRight, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.DEV 
  ? 'http://localhost:5000/api' 
  : '/_/backend/api';

// --- INDEXEDDB CACHING HELPERS ---
const DB_NAME = 'DocuMindCacheDB';
const STORE_NAME = 'pdfStore';

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'docId' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

const saveFileToIndexedDB = async (docId, file) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const record = { docId, file, filename: file.name, updatedAt: Date.now() };
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('IndexedDB save error:', err);
  }
};

const getFileFromIndexedDB = async (docId) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(docId);
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('IndexedDB fetch error:', err);
    return null;
  }
};

// --- HELPER COMPONENTS ---

const FormattedText = ({ text }) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

const TypewriterText = ({ text, isNew }) => {
  const [displayed, setDisplayed] = useState(isNew ? '' : text);
  
  useEffect(() => {
    if (!isNew || !text) return;
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i));
      i+=3;
      if (i > text.length) {
         setDisplayed(text);
         clearInterval(interval);
      }
    }, 15);
    return () => clearInterval(interval);
  }, [text, isNew]);

  return <FormattedText text={displayed} />;
};

const MessageBubble = ({ msg, isNewest, onSuggestClick, onSourceClick, documents }) => {
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);

  if (msg.role === 'user') {
    return <div className="message user">{msg.content}</div>;
  }

  // Parse Assistant msg JSON explicitly
  let structuredData = null;
  try {
     structuredData = JSON.parse(msg.content);
  } catch(e) {
     structuredData = { answer: msg.content, sources: [], suggestedQuestions: [] }; 
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(structuredData.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
      <div className={`message assistant`} style={{ position: 'relative', width: '100%' }}>
        
        {/* Dynamic Badges Container */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {structuredData.strictModeUsed && (
            <span className="badge badge-strict"><ToggleRight size={12} style={{marginRight: '4px'}}/> Strict Mode: ON</span>
          )}
          {structuredData.confidenceScore > 0 && (
             <span className="badge badge-confidence">🎯 {structuredData.confidenceScore}% Confidence</span>
          )}
        </div>

        <button 
          onClick={handleCopy} 
          aria-label="Copy Answer"
          title="Copy"
          style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', outline: 'none' }}
        >
           {copied ? <Check size={16} color="#10b981"/> : <Copy size={16} />}
        </button>
        
        {/* Typewriter Answer Text */}
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', paddingRight: '20px' }}>
           <TypewriterText text={structuredData.answer} isNew={isNewest} />
        </div>
        
        {/* Sources Collapse UI */}
        {structuredData.sources && structuredData.sources.length > 0 && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <div 
               onClick={() => setShowSources(!showSources)} 
               style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--primary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}
            >
               <FileText size={14} /> 
               <span>{showSources ? 'Hide Sources' : 'View Document Sources'}</span>
               {showSources ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
            
            {showSources && (
              <div className="source-card-container">
                {structuredData.sources.map((src, i) => {
                  const parentDoc = documents?.find(d => d.filename === src.source);
                  const isViewable = !!parentDoc?.storagePath;

                  return (
                    <div 
                        key={i} 
                        className={`source-card ${isViewable ? 'viewable' : 'legacy'}`}
                        onClick={() => isViewable && onSourceClick(src)}
                        style={{ cursor: isViewable ? 'pointer' : 'default', opacity: isViewable ? 1 : 0.8 }}
                        title={isViewable ? "Click to view in PDF" : "Original PDF not available for this legacy document"}
                    >
                      <div className="source-card-header">
                        📄 Page {src.page || '?'}
                        {isViewable && <Sparkles size={12} style={{marginLeft: 'auto', color: 'var(--primary)'}}/>}
                      </div>
                      <div className="source-card-snippet">"<FormattedText text={src.text || src.snippet} />"</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Small Footer Metadata */}
        {(structuredData.chunksUsed > 0) && (
          <div className="metadata-footer" style={{ marginTop: '1.5rem', opacity: 0.6, fontSize: '0.75rem' }}>
            <span>🧩 {structuredData.chunksUsed} Vector Chunks Processed</span>
          </div>
        )}
      </div>

      {/* Suggested Follow-up Questions row attached underneath message bubbles! */}
      {structuredData.suggestedQuestions && structuredData.suggestedQuestions.length > 0 && (
         <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem', marginLeft: '0.5rem' }}>
            {structuredData.suggestedQuestions.map((q, idx) => (
                <button 
                  key={idx} 
                  onClick={() => onSuggestClick(q)} 
                  className="suggest-btn" 
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-main)' }}
                >
                  <Sparkles size={14} style={{ color: 'var(--primary)' }}/> {q}
                </button>
            ))}
         </div>
      )}
    </div>
  );
};

const AuthScreen = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = isLogin ? 'login' : 'register';
      const res = await axios.post(`${API_BASE_URL}/auth/${endpoint}`, formData);
      onAuthSuccess(res.data.token, res.data.name);
    } catch (err) {
      alert(err.response?.data?.message || 'Authentication failed');
    }
    setLoading(false);
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
        <p>{isLogin ? 'Login to access your AI knowledge base.' : 'Start your journey with production-ready RAG.'}</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="auth-input-group">
              <label>Name</label>
              <input 
                className="auth-input" 
                placeholder="John Doe" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>
          )}
          <div className="auth-input-group">
            <label>Email Address</label>
            <input 
              className="auth-input" 
              type="email" 
              placeholder="name@company.com" 
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              required
            />
          </div>
          <div className="auth-input-group">
            <label>Password</label>
            <input 
              className="auth-input" 
              type="password" 
              placeholder="••••••••" 
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
              required
            />
          </div>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Processing...' : (isLogin ? 'Login to Dashboard' : 'Sign Up Free')}
          </button>
        </form>
        <div className="auth-toggle">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
          <span onClick={() => setIsLogin(!isLogin)}>{isLogin ? 'Sign Up' : 'Log In'}</span>
        </div>
      </div>
    </div>
  );
};

const PdfViewer = ({ data, onClose }) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let url = null;
    const loadPdf = async () => {
      setLoading(true);
      const record = await getFileFromIndexedDB(data.docId);
      if (record && record.file) {
        url = URL.createObjectURL(record.file);
        setPdfUrl(url);
      } else {
        setPdfUrl(null);
      }
      setLoading(false);
    };

    if (data) {
      loadPdf();
    }

    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [data]);

  if (!data) return null;

  const viewerUrl = pdfUrl ? `${pdfUrl}#page=${data.page || 1}` : null;

  return (
    <div className="pdf-viewer-panel">
      <div className="viewer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
           <FileText size={18} /> <span>Document Viewer</span>
        </div>
        <button className="close-viewer" onClick={onClose} aria-label="Close Viewer">
           <Plus size={24} style={{ transform: 'rotate(45deg)' }}/>
        </button>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--text-muted)' }}>
          <Loader2 className="animate-spin" size={32} />
          <span>Loading local PDF from cache...</span>
        </div>
      ) : viewerUrl ? (
        <iframe 
          key={viewerUrl}
          src={viewerUrl} 
          width="100%" 
          height="100%" 
          style={{ border: 'none', background: 'white' }} 
          title="PDF Viewer" 
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center', gap: '1rem', color: 'var(--text-muted)' }}>
          <FileText size={48} style={{ color: 'var(--primary)' }} />
          <h3>Preview Not Available on This Device</h3>
          <p style={{ maxWidth: '300px', fontSize: '0.9rem', lineHeight: '1.5' }}>
            The physical PDF is stored in the browser cache of the device where it was uploaded. 
            However, your vector embeddings are fully synced and active—you can still query and chat with this document!
          </p>
        </div>
      )}
    </div>
  );
};

// --- MAIN APP ---

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Upload a PDF and ask questions. Get accurate answers with source references. No hallucination. Fully explainable AI.' }
  ]);
  const [documents, setDocuments] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  // --- AUTH BYPASS MODE (FORCE DIRECT LANDING) ---
  const [userToken, setUserToken] = useState('BYPASS_TOKEN');
  const [userName, setUserName] = useState('Admin Guest');
  const [strictMode, setStrictMode] = useState(false);
  const [viewerData, setViewerData] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (userToken) fetchDocuments(userToken);
  }, [userToken]);

  const handleAuthSuccess = (token, name) => {
    setUserToken(token);
    setUserName(name);
    localStorage.setItem('rag_token', token);
    localStorage.setItem('rag_user', name);
  };

  const handleLogout = () => {
    // In bypass mode, logout just refreshes the guest session
    setUserToken("BYPASS_TOKEN");
    setUserName("Admin Guest");
    localStorage.removeItem('rag_token');
    localStorage.removeItem('rag_user');
  };

  const fetchDocuments = async (token) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(res.data || []);
    } catch (err) {
      if (err.response?.status === 401 && token !== "BYPASS_TOKEN") handleLogout();
    }
  };

  useEffect(() => {
    const processingDocs = documents.filter(d => d.status === 'processing');
    if (processingDocs.length === 0 || !userToken) return;
    const interval = setInterval(async () => {
      try {
        const promises = processingDocs.map(doc => 
          axios.get(`${API_BASE_URL}/documents/${doc._id}/status`, {
            headers: { Authorization: `Bearer ${userToken}` }
          })
        );
        const results = await Promise.all(promises);
        if (results.some(res => res.data.status !== 'processing')) fetchDocuments(userToken);
      } catch (e) {}
    }, 4000);
    return () => clearInterval(interval);
  }, [documents, userToken]);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !userToken) return;

    // Vercel Serverless payload limit is strictly 4.5MB
    const MAX_FILE_SIZE = 4.5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      alert(`File is too large (${(file.size / (1024 * 1024)).toFixed(2)}MB). Since this app is hosted on Vercel's serverless environment, uploads are strictly limited to 4.5MB. Please upload a smaller PDF or compress your document.`);
      e.target.value = null;
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setIsUploading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${userToken}` }
      });
      
      // Save uploaded file into local IndexedDB
      await saveFileToIndexedDB(res.data._id, file);

      setDocuments(prev => [res.data, ...prev]);
      setActiveDoc(res.data);
      if (viewerData) setViewerData({ docId: res.data._id, page: 1 });
      setMessages(prev => [...prev, { role: 'assistant', content: `Processing **${file.name}**... I am extracting text and building vector indexes. You can start asking questions once the status tag changes to 'Active'.` }]);
    } catch (err) {
      alert('Upload failed.');
    }
    setIsUploading(false);
    e.target.value = null;
  };

  const processQuery = async (queryText) => {
    if (!queryText.trim() || !userToken) return;
    const docId = activeDoc?._id || 'all';
    setMessages(prev => [...prev, { role: 'user', content: queryText }]);
    setInput('');
    setIsTyping(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/chat/${docId}`, 
        { message: queryText, strictMode },
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.content }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error connecting to AI engine!" }]);
    }
    setIsTyping(false);
  };

  const handleSourceClick = (source) => {
    const doc = documents.find(d => d.filename === source.source);
    if (doc) setViewerData({ docId: doc._id, page: source.page });
    else if (activeDoc) setViewerData({ docId: activeDoc._id, page: source.page });
  };

  const handleSend = (e) => {
    e.preventDefault();
    processQuery(input);
  };

  if (!userToken) return <AuthScreen onAuthSuccess={handleAuthSuccess} />;

  return (
    <div className="app-container">
      <aside className="sidebar">
        <h2><FileText size={24}/> DocuMind AI</h2>
        <button className="new-chat-btn" onClick={() => fileInputRef.current.click()} disabled={isUploading}>
           {isUploading ? <Loader2 className="animate-spin" size={20}/> : <Plus size={20} />}
           {isUploading ? 'Uploading...' : 'Upload New PDF'}
        </button>
        <div className="history-list">
          <div className={`global-search-item ${!activeDoc ? 'active' : ''}`} onClick={() => {
             setActiveDoc(null);
             setViewerData(null);
          }}>
             <Sparkles size={18} /> Search All My Knowledge
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.5rem', marginTop: '1rem', letterSpacing: '1px' }}>My Library</div>
          {documents.map(doc => (
              <div key={doc._id} className={`history-item ${activeDoc?._id === doc._id ? 'active' : ''}`} onClick={() => {
                setActiveDoc(doc);
                if (viewerData) setViewerData({ docId: doc._id, page: 1 });
              }}>
               <FileText size={18} />
               <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                 <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.filename}</span>
                 {doc.storagePath && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <Sparkles size={8}/> DEEP VIEW READY
                    </span>
                 )}
               </div>
               <span className={`status-tag status-${doc.status}`}>
                  {doc.status === 'processing' ? 'Syncing...' : (doc.status === 'completed' ? 'Active' : 'Error')}
               </span>
             </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="user-profile-avatar">{userName ? userName[0].toUpperCase() : 'U'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>{userName || 'User'}</div>
            <div onClick={handleLogout} className="signout-link">Sign Out</div>
          </div>
        </div>
      </aside>

      <div className="main-content-wrapper" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <main className="chat-area" style={{ flex: viewerData ? 0.6 : 1, transition: 'flex 0.4s ease' }}>
          <header className="chat-header">
            <div className="document-info">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {activeDoc ? <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeDoc.status === 'completed' ? '#10b981' : '#f59e0b' }}></span> : <Sparkles size={16} className="sparkles-icon" />}
                {activeDoc ? <span>Focus: <strong>{activeDoc.filename}</strong></span> : <span>Mode: <strong>Cross-Document Library Search</strong></span>}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <div onClick={() => setStrictMode(!strictMode)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: strictMode ? '#10b981' : 'var(--text-muted)', fontSize: '0.9rem', userSelect: 'none' }}>
                {strictMode ? <ToggleRight size={24} color="#10b981" /> : <ToggleLeft size={24} />}
                <span style={{ fontWeight: '500' }}>Strict Mode</span>
              </div>
              <input type="file" accept="application/pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            </div>
          </header>

          <div className="messages-container">
            {messages.map((msg, idx) => (
              <MessageBubble 
                  key={idx} 
                  msg={msg} 
                  isNewest={idx === messages.length - 1} 
                  onSuggestClick={processQuery} 
                  onSourceClick={handleSourceClick}
                  documents={documents}
              />
            ))}
            {isTyping && (
              <div className="message assistant" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '1rem' }}>
                <Loader2 className="animate-spin" size={16} /> Retrieving chunks & synthesizing knowledge...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <form className="input-box" onSubmit={handleSend}>
              <textarea placeholder={activeDoc ? `Ask about ${activeDoc.filename}...` : "Query entire document library..."} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }} />
              <button className="send-btn" type="submit" disabled={isTyping || !input.trim()}><Send size={18} /></button>
            </form>
            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>DocuMind AI can hallucinate. Cross-check with cited sources.</p>
          </div>
        </main>
        {viewerData && <PdfViewer data={viewerData} onClose={() => setViewerData(null)} />}
      </div>
    </div>
  );
}

export default App;
