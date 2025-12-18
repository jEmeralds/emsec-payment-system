const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { sendSuccess, sendError, ErrorCodes } = require('../utils/response');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');

/**
 * Register new user
 * POST /auth/register
 */
async function register(req, res) {
    try {
        const { phone_number, email, password, first_name, last_name, pin } = req.body;

        // Check if phone number already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('user_id')
            .eq('phone_number', phone_number)
            .single();

        if (existingUser) {
            return sendError(
                res,
                'Phone number already registered',
                ErrorCodes.PHONE_EXISTS,
                409
            );
        }

        // Hash password and PIN
        const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const password_hash = await bcrypt.hash(password, bcryptRounds);
        const pin_hash = await bcrypt.hash(pin, bcryptRounds);

        // Create user
        const user_id = uuidv4();
        const { data: newUser, error } = await supabase
            .from('users')
            .insert({
                user_id,
                phone_number,
                email: email || null,
                password_hash,
                pin_hash,
                first_name,
                last_name,
                balance: 0.00,
                kyc_status: 'pending',
                status: 'active'
            })
            .select('user_id, phone_number, email, first_name, last_name, balance, kyc_status, status')
            .single();

        if (error) {
            console.error('User creation error:', error);
            return sendError(
                res,
                'Failed to create account',
                ErrorCodes.SERVER_ERROR,
                500
            );
        }

        // Generate tokens
        const tokenPayload = {
            user_id: newUser.user_id,
            phone_number: newUser.phone_number
        };
        
        const access_token = generateAccessToken(tokenPayload);
        const refresh_token = generateRefreshToken(tokenPayload);

        // Store session (optional - for token revocation)
        const token_hash = await bcrypt.hash(access_token, 10);
        await supabase.from('sessions').insert({
            user_id: newUser.user_id,
            token_hash,
            expires_at: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
        });

        return sendSuccess(
            res,
            {
                ...newUser,
                access_token,
                refresh_token,
                token_expires_in: 1800 // 30 minutes in seconds
            },
            'Account created successfully',
            201
        );

    } catch (error) {
        console.error('Registration error:', error);
        return sendError(
            res,
            'Server error during registration',
            ErrorCodes.SERVER_ERROR,
            500
        );
    }
}

/**
 * Login user
 * POST /auth/login
 */
async function login(req, res) {
    try {
        const { phone_number, password } = req.body;

        // Get user from database
        const { data: user, error } = await supabase
            .from('users')
            .select('user_id, phone_number, email, password_hash, first_name, last_name, balance, kyc_status, status')
            .eq('phone_number', phone_number)
            .single();

        if (error || !user) {
            return sendError(
                res,
                'Invalid phone number or password',
                ErrorCodes.INVALID_CREDENTIALS,
                401
            );
        }

        // Check account status
        if (user.status === 'suspended') {
            return sendError(
                res,
                'Account has been suspended. Contact support.',
                ErrorCodes.ACCOUNT_SUSPENDED,
                403
            );
        }

        if (user.status === 'closed') {
            return sendError(
                res,
                'Account has been closed',
                ErrorCodes.ACCOUNT_CLOSED,
                403
            );
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!passwordMatch) {
            return sendError(
                res,
                'Invalid phone number or password',
                ErrorCodes.INVALID_CREDENTIALS,
                401
            );
        }

        // Generate tokens
        const tokenPayload = {
            user_id: user.user_id,
            phone_number: user.phone_number
        };
        
        const access_token = generateAccessToken(tokenPayload);
        const refresh_token = generateRefreshToken(tokenPayload);

        // Store session
        const token_hash = await bcrypt.hash(access_token, 10);
        await supabase.from('sessions').insert({
            user_id: user.user_id,
            token_hash,
            expires_at: new Date(Date.now() + 30 * 60 * 1000)
        });

        // Remove sensitive data
        delete user.password_hash;

        return sendSuccess(res, {
            ...user,
            access_token,
            refresh_token,
            token_expires_in: 1800
        });

    } catch (error) {
        console.error('Login error:', error);
        return sendError(
            res,
            'Server error during login',
            ErrorCodes.SERVER_ERROR,
            500
        );
    }
}

/**
 * Refresh access token
 * POST /auth/refresh
 */
async function refresh(req, res) {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return sendError(
                res,
                'Refresh token required',
                ErrorCodes.INVALID_INPUT,
                400
            );
        }

        // Verify refresh token
        const decoded = verifyRefreshToken(refresh_token);

        // Generate new tokens
        const tokenPayload = {
            user_id: decoded.user_id,
            phone_number: decoded.phone_number
        };

        const new_access_token = generateAccessToken(tokenPayload);
        const new_refresh_token = generateRefreshToken(tokenPayload);

        return sendSuccess(res, {
            access_token: new_access_token,
            refresh_token: new_refresh_token,
            token_expires_in: 1800
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        return sendError(
            res,
            'Invalid or expired refresh token',
            ErrorCodes.TOKEN_EXPIRED,
            401
        );
    }
}

/**
 * Logout user
 * POST /auth/logout
 */
async function logout(req, res) {
    try {
        const { user_id } = req.user;

        // Revoke all active sessions for this user
        await supabase
            .from('sessions')
            .update({ is_active: false, revoked_at: new Date() })
            .eq('user_id', user_id)
            .eq('is_active', true);

        return sendSuccess(res, null, 'Logged out successfully');

    } catch (error) {
        console.error('Logout error:', error);
        return sendError(
            res,
            'Server error during logout',
            ErrorCodes.SERVER_ERROR,
            500
        );
    }
}

module.exports = {
    register,
    login,
    refresh,
    logout
};
