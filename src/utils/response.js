// Standardized API response utilities

/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {Object} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendSuccess(res, data, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
        success: true,
        data,
        message
    });
}

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {number} statusCode - HTTP status code (default: 400)
 */
function sendError(res, message, code = 'ERROR', statusCode = 400) {
    return res.status(statusCode).json({
        success: false,
        error: message,
        code
    });
}

/**
 * Common error codes
 */
const ErrorCodes = {
    // Authentication
    INVALID_TOKEN: 'INVALID_TOKEN',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    UNAUTHORIZED: 'UNAUTHORIZED',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    
    // User
    PHONE_EXISTS: 'PHONE_EXISTS',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
    ACCOUNT_CLOSED: 'ACCOUNT_CLOSED',
    
    // Payment
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    INVALID_PIN: 'INVALID_PIN',
    FRAUD_DETECTED: 'FRAUD_DETECTED',
    ORIGIN_MISMATCH: 'ORIGIN_MISMATCH',
    DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
    
    // Merchant
    INVALID_QR: 'INVALID_QR',
    MERCHANT_INACTIVE: 'MERCHANT_INACTIVE',
    GPS_UNAVAILABLE: 'GPS_UNAVAILABLE',
    
    // Validation
    INVALID_INPUT: 'INVALID_INPUT',
    MISSING_FIELD: 'MISSING_FIELD',
    INVALID_PHONE: 'INVALID_PHONE',
    WEAK_PASSWORD: 'WEAK_PASSWORD',
    
    // General
    SERVER_ERROR: 'SERVER_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
};

module.exports = {
    sendSuccess,
    sendError,
    ErrorCodes
};
