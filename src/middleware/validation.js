const { body, validationResult } = require('express-validator');
const { sendError, ErrorCodes } = require('../utils/response');

/**
 * Validation rules for user registration
 */
const registerValidation = [
    body('phone_number')
        .matches(/^\+254[17]\d{8}$/)
        .withMessage('Invalid Kenyan phone number format (+254...)'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain uppercase, lowercase, and number'),
    body('first_name')
        .trim()
        .isLength({ min: 2 })
        .withMessage('First name required'),
    body('last_name')
        .trim()
        .isLength({ min: 2 })
        .withMessage('Last name required'),
    body('pin')
        .matches(/^\d{4,6}$/)
        .withMessage('PIN must be 4-6 digits'),
    body('email')
        .optional()
        .isEmail()
        .withMessage('Invalid email format')
];

/**
 * Validation rules for login
 */
const loginValidation = [
    body('phone_number')
        .matches(/^\+254[17]\d{8}$/)
        .withMessage('Invalid phone number format'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

/**
 * Validation rules for payment processing
 */
const paymentValidation = [
    body('device_id')
        .isUUID()
        .withMessage('Invalid device ID'),
    body('amount')
        .isFloat({ min: 1 })
        .withMessage('Amount must be at least 1 KES'),
    body('pin')
        .matches(/^\d{4,6}$/)
        .withMessage('Invalid PIN format'),
    body('idempotency_key')
        .notEmpty()
        .withMessage('Idempotency key required'),
    body('origin_stop')
        .optional()
        .isString(),
    body('destination_stop')
        .optional()
        .isString(),
    body('route_id')
        .optional()
        .isUUID(),
    body('gps_latitude')
        .optional()
        .isFloat({ min: -90, max: 90 }),
    body('gps_longitude')
        .optional()
        .isFloat({ min: -180, max: 180 })
];

/**
 * Validation rules for QR scan
 */
const qrScanValidation = [
    body('device_token')
        .notEmpty()
        .withMessage('Device token required'),
    body('user_gps_latitude')
        .optional()
        .isFloat({ min: -90, max: 90 }),
    body('user_gps_longitude')
        .optional()
        .isFloat({ min: -180, max: 180 })
];

/**
 * Middleware to check validation results
 */
function checkValidation(req, res, next) {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg).join(', ');
        return sendError(
            res,
            errorMessages,
            ErrorCodes.INVALID_INPUT,
            400
        );
    }
    
    next();
}

module.exports = {
    registerValidation,
    loginValidation,
    paymentValidation,
    qrScanValidation,
    checkValidation
};
