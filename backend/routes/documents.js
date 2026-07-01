const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const { uploadDocument, getDocuments, updateActiveDocument, getDocumentStatus, downloadDocument } = require('../controllers/documentController');

// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB Limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
       cb(null, true);
    } else {
       cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

router.route('/')
  .get(protect, getDocuments)
  .post(protect, upload.single('file'), uploadDocument);

router.put('/active', protect, updateActiveDocument);
router.get('/:id/status', protect, getDocumentStatus);
router.get('/:id/download', protect, downloadDocument);

module.exports = router;
