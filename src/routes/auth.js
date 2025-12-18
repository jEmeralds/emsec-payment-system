const express = require('express');
const router = express.Router();
const { register, login, refresh, logout } = require('../controllers/authController');
const { registerValidation, loginValidation, checkValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

// Public routes
router.post('/register', registerValidation, checkValidation, register);
router.post('/login', loginValidation, checkValidation, login);
router.post('/refresh', refresh);

// Protected routes
router.post('/logout', authenticateToken, logout);

module.exports = router;
