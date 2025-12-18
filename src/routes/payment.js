const express = require('express');
const router = express.Router();
const { scanQR, processPayment } = require('../controllers/paymentController');
const { qrScanValidation, paymentValidation, checkValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

// All payment routes require authentication
router.post('/qr/scan', authenticateToken, qrScanValidation, checkValidation, scanQR);
router.post('/payments/process', authenticateToken, processPayment);

module.exports = router;
