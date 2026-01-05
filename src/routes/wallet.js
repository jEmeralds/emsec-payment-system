// routes/wallet.js - Wallet Balance Endpoint
const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/v1/wallet/balance
 * Get user's current wallet balance
 */
router.get('/balance', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.user_id;

        // Get user balance
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('balance, currency')
            .eq('user_id', userId)
            .single();

        if (userError || !userData) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                balance: parseFloat(userData.balance || 0),
                currency: userData.currency || 'KES'
            }
        });

    } catch (error) {
        console.error('Get balance error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to get balance'
        });
    }
});

module.exports = router;