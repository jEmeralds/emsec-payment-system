// routes/payment.js - Payment Processing Route
const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * POST /api/v1/payments/process
 * Process payment with GPS fraud detection
 */
router.post('/process', authenticateToken, async (req, res) => {
    console.log('💳 PAYMENT ROUTE HIT');
    console.log('User from token:', req.user);
    console.log('Request body:', req.body);
    
    try {
        const userId = req.user.user_id;
        const {
            merchant_id,
            device_id,
            destination_stop,
            amount,
            pin,
            gps_latitude,
            gps_longitude,
            route_id,
            origin_stop
        } = req.body;

        console.log('Extracted userId:', userId);

        // Validate required fields
        if (!merchant_id || !amount || !pin) {
            console.log('❌ Missing required fields');
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        console.log('✅ Required fields validated');
        console.log('Querying user from database...');

        // Get user data and verify PIN
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('user_id, balance, pin_hash')
            .eq('user_id', userId)
            .single();

        console.log('User query result:', { userData, userError });

        if (userError || !userData) {
            console.log('❌ USER NOT FOUND');
            console.log('Error:', userError);
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log('✅ User found:', userData.user_id);
        console.log('Verifying PIN...');

        // Verify PIN
        const pinValid = await bcrypt.compare(pin, userData.pin_hash);
        
        console.log('PIN validation result:', pinValid);

        if (!pinValid) {
            console.log('❌ Invalid PIN');
            return res.status(401).json({
                success: false,
                error: 'Invalid PIN'
            });
        }

        console.log('✅ PIN validated');

        // Check sufficient balance
        if (parseFloat(userData.balance) < parseFloat(amount)) {
            console.log('❌ Insufficient balance');
            return res.status(400).json({
                success: false,
                error: 'Insufficient balance'
            });
        }

        console.log('✅ Balance check passed');

        // Get merchant commission rate
        const { data: merchantData } = await supabase
            .from('merchants')
            .select('commission_rate')
            .eq('merchant_id', merchant_id)
            .single();

        const commissionRate = merchantData?.commission_rate || 0.05;
        const merchantCommission = parseFloat(amount) * commissionRate;
        const netAmount = parseFloat(amount) - merchantCommission;

        // Calculate new balance
        const balanceBefore = parseFloat(userData.balance);
        const balanceAfter = balanceBefore - parseFloat(amount);

        // Generate reference code
        const referenceCode = generateReferenceCode();

        console.log('Creating transaction...');

        // Create transaction
        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .insert({
                transaction_id: crypto.randomUUID(),
                user_id: userId,
                merchant_id: merchant_id,
                device_id: device_id,
                transaction_type: 'payment',
                amount: parseFloat(amount),
                currency: 'KES',
                route_id: route_id,
                origin_stop: origin_stop || 'Unknown',
                destination_stop: destination_stop,
                status: 'success',  // Changed from 'completed' to 'success'
                merchant_commission: merchantCommission,
                net_amount: netAmount,
                reference_code: referenceCode,
                gps_boarding_latitude: gps_latitude,
                gps_boarding_longitude: gps_longitude,
                auto_detected_origin: origin_stop ? true : false,
                user_balance_before: balanceBefore,
                user_balance_after: balanceAfter,
                processed_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (txError) {
            console.error('❌ Transaction creation error:', txError);
            return res.status(500).json({
                success: false,
                error: 'Failed to create transaction'
            });
        }

        console.log('✅ Transaction created:', transaction.transaction_id);
        console.log('Updating user balance...');

        // Update user balance
        const { error: balanceError } = await supabase
            .from('users')
            .update({ balance: balanceAfter })
            .eq('user_id', userId);

        if (balanceError) {
            console.error('❌ Balance update error:', balanceError);
        } else {
            console.log('✅ Balance updated successfully');
        }

        // Create audit log
        await supabase
            .from('audit_logs')
            .insert({
                log_id: crypto.randomUUID(),
                user_id: userId,
                action: 'payment_processed',
                entity_type: 'transaction',
                entity_id: transaction.transaction_id,
                details: {
                    amount: amount,
                    merchant_id: merchant_id,
                    reference: referenceCode
                },
                ip_address: req.ip,
                created_at: new Date().toISOString()
            });

        console.log('✅ Payment successful!');

        // Return success
        return res.status(200).json({
            success: true,
            data: {
                transaction_id: transaction.transaction_id,
                reference_code: referenceCode,
                amount: parseFloat(amount),
                new_balance: balanceAfter,
                timestamp: transaction.created_at
            }
        });

    } catch (error) {
        console.error('💥 PAYMENT ERROR:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({
            success: false,
            error: 'Payment processing failed: ' + error.message
        });
    }
});

/**
 * Helper: Generate unique reference code
 */
function generateReferenceCode() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `EM${timestamp}${random}`;
}

module.exports = router;