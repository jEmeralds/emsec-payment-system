const { supabase } = require('../config/supabase');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sendSuccess, sendError, ErrorCodes } = require('../utils/response');

const JWT_SECRET = process.env.JWT_SECRET || 'emsec-super-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'emsec-refresh-secret-key-change-in-production';

// Generate access token (15 minutes)
function generateAccessToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

// Generate refresh token (7 days)
function generateRefreshToken(payload) {
    return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

// REGISTER
async function register(req, res) {
    try {
        const { phone_number, password, pin, first_name, last_name, email } = req.body;

        console.log('Registration attempt:', { phone_number, first_name, last_name });

        // Validate required fields
        if (!phone_number || !password || !pin || !first_name || !last_name) {
            return sendError(res, 'Missing required fields', ErrorCodes.INVALID_INPUT, 400);
        }

        // Validate phone format
        if (!phone_number.match(/^\+254\d{9}$/)) {
            return sendError(res, 'Invalid phone number format. Use +254XXXXXXXXX', ErrorCodes.INVALID_INPUT, 400);
        }

        // Validate PIN
        if (!/^\d{4}$/.test(pin)) {
            return sendError(res, 'PIN must be exactly 4 digits', ErrorCodes.INVALID_INPUT, 400);
        }

        // Validate password length
        if (password.length < 8) {
            return sendError(res, 'Password must be at least 8 characters', ErrorCodes.INVALID_INPUT, 400);
        }

        // Check if user exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('user_id')
            .eq('phone_number', phone_number)
            .maybeSingle();

        if (existingUser) {
            return sendError(res, 'Phone number already registered', ErrorCodes.USER_EXISTS, 409);
        }

        // Hash password and PIN
        const hashedPassword = await bcrypt.hash(password, 10);
        const hashedPin = await bcrypt.hash(pin, 10);

        // Create user
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{
                phone_number,
                password_hash: hashedPassword,
                pin_hash: hashedPin,
                first_name,
                last_name,
                email: email || null,
                balance: 1000.00,
                currency: 'KES',
                status: 'active'
            }])
            .select()
            .single();

        if (insertError) {
            console.error('Insert error:', insertError);
            return sendError(res, 'Registration failed: ' + insertError.message, ErrorCodes.SERVER_ERROR, 500);
        }

        console.log('User created successfully:', newUser.user_id);

        // Generate tokens
        const accessToken = generateAccessToken({ user_id: newUser.user_id });
        const refreshToken = generateRefreshToken({ user_id: newUser.user_id });

        return sendSuccess(res, {
            user_id: newUser.user_id,
            phone_number: newUser.phone_number,
            first_name: newUser.first_name,
            last_name: newUser.last_name,
            email: newUser.email,
            balance: newUser.balance,
            currency: newUser.currency,
            access_token: accessToken,
            refresh_token: refreshToken
        }, 201);

    } catch (error) {
        console.error('Registration error:', error);
        return sendError(res, 'Server error during registration', ErrorCodes.SERVER_ERROR, 500);
    }
}

// LOGIN
async function login(req, res) {
    try {
        let { phone_number, password } = req.body;

        console.log('Login attempt:', { phone_number });

        // Validate required fields
        if (!phone_number || !password) {
            return sendError(res, 'Missing phone number or password', ErrorCodes.INVALID_INPUT, 400);
        }

        // Normalize phone number
        phone_number = phone_number.trim();
        if (phone_number.startsWith('0')) {
            phone_number = '+254' + phone_number.substring(1);
        } else if (phone_number.startsWith('254') && !phone_number.startsWith('+')) {
            phone_number = '+' + phone_number;
        }

        // Validate phone format
        if (!phone_number.match(/^\+254\d{9}$/)) {
            return sendError(res, 'Invalid phone number format', ErrorCodes.INVALID_INPUT, 400);
        }

        // Get user
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('phone_number', phone_number)
            .maybeSingle();

        if (error || !user) {
            console.log('User not found:', phone_number);
            return sendError(res, 'Invalid credentials', ErrorCodes.INVALID_CREDENTIALS, 401);
        }

        // Check if user is active
        if (user.status !== 'active') {
            return sendError(res, 'Account is suspended', ErrorCodes.ACCOUNT_SUSPENDED, 403);
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            console.log('Invalid password for user:', phone_number);
            return sendError(res, 'Invalid credentials', ErrorCodes.INVALID_CREDENTIALS, 401);
        }

        console.log('Login successful:', user.user_id);

        // Generate tokens
        const accessToken = generateAccessToken({ user_id: user.user_id });
        const refreshToken = generateRefreshToken({ user_id: user.user_id });

        return sendSuccess(res, {
            user_id: user.user_id,
            phone_number: user.phone_number,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            balance: user.balance,
            currency: user.currency,
            access_token: accessToken,
            refresh_token: refreshToken
        });

    } catch (error) {
        console.error('Login error:', error);
        return sendError(res, 'Server error during login', ErrorCodes.SERVER_ERROR, 500);
    }
}

// REFRESH TOKEN
async function refreshToken(req, res) {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return sendError(res, 'Refresh token required', ErrorCodes.INVALID_INPUT, 400);
        }

        // Verify refresh token
        const decoded = jwt.verify(refresh_token, JWT_REFRESH_SECRET);

        // Generate new access token
        const accessToken = generateAccessToken({ user_id: decoded.user_id });

        return sendSuccess(res, {
            access_token: accessToken
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        return sendError(res, 'Invalid refresh token', ErrorCodes.INVALID_TOKEN, 401);
    }
}

// LOGOUT
async function logout(req, res) {
    try {
        // In a real implementation, you'd invalidate the token in a blacklist
        // For now, just return success (client will delete tokens)
        return sendSuccess(res, { message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        return sendError(res, 'Server error', ErrorCodes.SERVER_ERROR, 500);
    }
}

module.exports = {
    register,
    login,
    refreshToken,
    logout
};