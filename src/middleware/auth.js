const jwt = require('jsonwebtoken');
const { sendError, ErrorCodes } = require('../utils/response');

/**
 * Middleware to verify JWT token
 */
async function authenticateToken(req, res, next) {
    try {
        // Get token from Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return sendError(
                res,
                'No authentication token provided',
                ErrorCodes.UNAUTHORIZED,
                401
            );
        }

        // Verify token
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                if (err.name === 'TokenExpiredError') {
                    return sendError(
                        res,
                        'Token has expired',
                        ErrorCodes.TOKEN_EXPIRED,
                        401
                    );
                }
                return sendError(
                    res,
                    'Invalid token',
                    ErrorCodes.INVALID_TOKEN,
                    401
                );
            }

            // Attach user info to request
            req.user = {
                user_id: decoded.user_id,
                phone_number: decoded.phone_number
            };

            next();
        });
    } catch (error) {
        console.error('Auth middleware error:', error);
        return sendError(
            res,
            'Authentication failed',
            ErrorCodes.UNAUTHORIZED,
            401
        );
    }
}

/**
 * Generate JWT access token
 * @param {Object} payload - Token payload
 * @returns {string} JWT token
 */
function generateAccessToken(payload) {
    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
    );
}

/**
 * Generate JWT refresh token
 * @param {Object} payload - Token payload
 * @returns {string} Refresh token
 */
function generateRefreshToken(payload) {
    return jwt.sign(
        payload,
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
}

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {Object} Decoded token
 */
function verifyRefreshToken(token) {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = {
    authenticateToken,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken
};
