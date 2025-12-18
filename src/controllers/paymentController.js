const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { sendSuccess, sendError, ErrorCodes } = require('../utils/response');
const { calculateDistance, findNearestStop, getConfidenceLevel, isValidCoordinates } = require('../utils/gps');

/**
 * Scan QR code and get merchant details with GPS-detected origin
 * POST /qr/scan
 */
async function scanQR(req, res) {
    try {
        const { device_token, user_gps_latitude, user_gps_longitude } = req.body;

        // Get device and merchant info
        const { data: device, error: deviceError } = await supabase
            .from('devices')
            .select(`
                device_id,
                merchant_id,
                route_id,
                status,
                last_gps_latitude,
                last_gps_longitude,
                last_gps_updated_at,
                gps_enabled,
                merchants (
                    merchant_id,
                    merchant_type,
                    business_name,
                    matatu_plate,
                    status,
                    saccos (
                        sacco_name
                    )
                ),
                routes (
                    route_id,
                    route_number,
                    route_name,
                    stops
                )
            `)
            .eq('device_token', device_token)
            .single();

        if (deviceError || !device) {
            return sendError(
                res,
                'Invalid QR code',
                ErrorCodes.INVALID_QR,
                404
            );
        }

        // Check device status
        if (device.status !== 'active') {
            return sendError(
                res,
                'QR code has been revoked or expired',
                ErrorCodes.INVALID_QR,
                403
            );
        }

        // Check merchant status
        if (device.merchants.status !== 'active') {
            return sendError(
                res,
                'Merchant account is suspended',
                ErrorCodes.MERCHANT_INACTIVE,
                403
            );
        }

        const responseData = {
            merchant_id: device.merchants.merchant_id,
            merchant_type: device.merchants.merchant_type,
            business_name: device.merchants.business_name,
            matatu_plate: device.merchants.matatu_plate
        };

        // If transport merchant, process route and GPS detection
        if (device.merchants.merchant_type === 'transport' && device.routes) {
            responseData.sacco_name = device.merchants.saccos?.sacco_name;
            responseData.route = {
                route_id: device.routes.route_id,
                route_number: device.routes.route_number,
                route_name: device.routes.route_name
            };

            // GPS-based origin detection
            if (device.gps_enabled && device.last_gps_latitude && device.last_gps_longitude) {
                // Check if GPS is recent (within 10 minutes)
                const gpsAge = Date.now() - new Date(device.last_gps_updated_at).getTime();
                const maxAge = 10 * 60 * 1000; // 10 minutes

                if (gpsAge > maxAge) {
                    return sendError(
                        res,
                        'Matatu GPS not updated recently. Please try again.',
                        ErrorCodes.GPS_UNAVAILABLE,
                        503
                    );
                }

                // Parse route stops (JSONB array)
                const stops = device.routes.stops || [];

                // Find nearest stop
                const nearestStop = findNearestStop(
                    device.last_gps_latitude,
                    device.last_gps_longitude,
                    stops
                );

                if (nearestStop) {
                    responseData.gps_detection = {
                        detected_origin: nearestStop.id,
                        detected_origin_name: nearestStop.name,
                        confidence: getConfidenceLevel(nearestStop.distance_meters),
                        distance_meters: nearestStop.distance_meters,
                        matatu_gps: {
                            latitude: device.last_gps_latitude,
                            longitude: device.last_gps_longitude
                        }
                    };

                    // Get available destinations (stops after detected origin)
                    const originIndex = stops.findIndex(s => s.id === nearestStop.id);
                    const availableDestinations = stops
                        .filter((s, idx) => idx > originIndex)
                        .map(stop => ({
                            id: stop.id,
                            name: stop.name
                        }));

                    // Fetch fares for each destination
                    if (availableDestinations.length > 0) {
                        const { data: fares } = await supabase
                            .from('fare_rules')
                            .select('destination_stop_id, fare_amount')
                            .eq('route_id', device.routes.route_id)
                            .eq('origin_stop_id', nearestStop.id)
                            .is('effective_until', null); // Active fares

                        if (fares) {
                            responseData.available_destinations = availableDestinations.map(dest => {
                                const fare = fares.find(f => f.destination_stop_id === dest.id);
                                return {
                                    ...dest,
                                    fare: fare ? parseFloat(fare.fare_amount) : null
                                };
                            });
                        } else {
                            responseData.available_destinations = availableDestinations;
                        }
                    }
                }
            } else {
                // GPS not available - manual selection required
                responseData.gps_detection = {
                    status: 'unavailable',
                    message: 'GPS unavailable. Please select boarding point manually.',
                    all_stops: device.routes.stops || []
                };
            }
        } else if (device.merchants.merchant_type === 'shop') {
            // Shop merchant - requires amount input
            responseData.requires_amount_input = true;
            responseData.commission_rate = parseFloat(device.merchants.commission_rate);
        }

        return sendSuccess(res, responseData);

    } catch (error) {
        console.error('QR scan error:', error);
        return sendError(
            res,
            'Server error during QR scan',
            ErrorCodes.SERVER_ERROR,
            500
        );
    }
}

/**
 * Process payment with GPS validation and fraud detection
 * POST /payments/process
 */
async function processPayment(req, res) {
    try {
        // DEBUG: Log what we received
        console.log('Payment request body:', JSON.stringify(req.body, null, 2));
        
        const { user_id } = req.user;
        const {
            device_id,
            route_id,
            origin_stop,
            destination_stop,
            amount,
            pin,
            idempotency_key,
            gps_latitude,
            gps_longitude
        } = req.body;

        // Check for duplicate transaction (idempotency)
        const { data: existingTxn } = await supabase
            .from('transactions')
            .select('transaction_id, status, amount')
            .eq('reference_code', idempotency_key)
            .single();

        if (existingTxn) {
            return sendSuccess(res, existingTxn, 'Transaction already processed');
        }

        // Get user details
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('balance, pin_hash, status')
            .eq('user_id', user_id)
            .single();

        if (userError || !user) {
            return sendError(res, 'User not found', ErrorCodes.USER_NOT_FOUND, 404);
        }

        // Check user status
        if (user.status !== 'active') {
            return sendError(res, 'Account is not active', ErrorCodes.ACCOUNT_SUSPENDED, 403);
        }

        // Verify PIN
        const pinMatch = await bcrypt.compare(pin, user.pin_hash);
        if (!pinMatch) {
            return sendError(res, 'Incorrect PIN', ErrorCodes.INVALID_PIN, 401);
        }

        // Check balance
        if (parseFloat(user.balance) < amount) {
            return sendError(
                res,
                'Insufficient balance',
                ErrorCodes.INSUFFICIENT_BALANCE,
                400
            );
        }

        // Get device and merchant info
        const { data: device } = await supabase
            .from('devices')
            .select(`
                device_id,
                merchant_id,
                merchants (
                    business_name,
                    matatu_plate,
                    commission_rate
                )
            `)
            .eq('device_id', device_id)
            .single();

        if (!device) {
            return sendError(res, 'Invalid device', ErrorCodes.INVALID_QR, 404);
        }

        // Calculate commission
        const commission_rate = parseFloat(device.merchants.commission_rate);
        const merchant_commission = amount * commission_rate;
        const net_amount = amount - merchant_commission;

        // GPS fraud detection (if coordinates provided)
        let auto_detected_origin = true;
        let nearest_stop_distance_meters = null;

        if (route_id && origin_stop && gps_latitude && gps_longitude) {
            // Get route stops
            const { data: route } = await supabase
                .from('routes')
                .select('stops')
                .eq('route_id', route_id)
                .single();

            if (route) {
                const stops = route.stops || [];
                const selectedStop = stops.find(s => s.id === origin_stop);
                
                if (selectedStop && selectedStop.latitude && selectedStop.longitude) {
                    const distance = calculateDistance(
                        gps_latitude,
                        gps_longitude,
                        selectedStop.latitude,
                        selectedStop.longitude
                    );

                    nearest_stop_distance_meters = distance;

                    // Fraud check: if distance too large, flag it
                    const maxDistance = parseInt(process.env.GPS_MAX_DISTANCE_METERS) || 500;
                    if (distance > maxDistance) {
                        // Create fraud alert
                        await supabase.from('fraud_alerts').insert({
                            user_id,
                            transaction_id: null, // Will update after txn created
                            alert_type: 'suspicious_origin',
                            risk_score: 75,
                            alert_level: 'high',
                            details: {
                                gps_latitude,
                                gps_longitude,
                                selected_origin: origin_stop,
                                distance_meters: distance
                            }
                        });

                        return sendError(
                            res,
                            'Origin location mismatch detected. Please verify your boarding point.',
                            ErrorCodes.ORIGIN_MISMATCH,
                            400
                        );
                    }
                }
            }
        }

        // Create transaction
        const transaction_id = uuidv4();
        const balance_before = parseFloat(user.balance);
        const balance_after = balance_before - amount;

        const { data: transaction, error: txnError } = await supabase
            .from('transactions')
            .insert({
                transaction_id,
                user_id,
                merchant_id: device.merchant_id,
                device_id,
                transaction_type: 'payment',
                amount,
                currency: 'KES',
                route_id: route_id || null,
                origin_stop: origin_stop || null,
                destination_stop: destination_stop || null,
                status: 'success',
                merchant_commission,
                net_amount,
                reference_code: idempotency_key,
                gps_boarding_latitude: gps_latitude || null,
                gps_boarding_longitude: gps_longitude || null,
                auto_detected_origin,
                nearest_stop_distance_meters,
                user_balance_before: balance_before,
                user_balance_after: balance_after,
                processed_at: new Date()
            })
            .select()
            .single();

        if (txnError) {
            console.error('Transaction creation error:', txnError);
            return sendError(res, 'Payment failed', ErrorCodes.SERVER_ERROR, 500);
        }

        // Update user balance
        await supabase
            .from('users')
            .update({ balance: balance_after })
            .eq('user_id', user_id);

        // Queue notifications (SMS to user and push to merchant)
        await supabase.from('notifications').insert([
            {
                user_id,
                transaction_id,
                notification_type: 'sms',
                recipient: req.user.phone_number,
                message: `EmSec Payment: KES ${amount.toFixed(2)} paid to ${device.merchants.business_name}. Balance: KES ${balance_after.toFixed(2)}`,
                status: 'queued'
            },
            {
                merchant_id: device.merchant_id,
                transaction_id,
                notification_type: 'push',
                recipient: 'merchant_device_token', // Would be actual device token
                message: `Payment received: KES ${amount.toFixed(2)}`,
                status: 'queued'
            }
        ]);

        return sendSuccess(
            res,
            {
                transaction_id,
                status: 'success',
                amount,
                merchant_name: device.merchants.business_name,
                merchant_plate: device.merchants.matatu_plate,
                origin: origin_stop,
                destination: destination_stop,
                balance_before,
                balance_after,
                timestamp: transaction.created_at,
                reference: idempotency_key
            },
            'Payment successful',
            201
        );

    } catch (error) {
        console.error('Payment processing error:', error);
        return sendError(
            res,
            'Server error during payment',
            ErrorCodes.SERVER_ERROR,
            500
        );
    }
}

module.exports = {
    scanQR,
    processPayment
};
