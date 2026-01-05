// routes/qr.js - QR Code Scanning Route
// Place this in: G:\EMSEC\emsec-backend\routes\qr.js

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
/**
 * POST /api/v1/qr/scan
 * Validates QR code and returns merchant/route info
 */
router.post('/scan', authenticateToken, async (req, res) => {
    try {
        const { device_token, user_gps_latitude, user_gps_longitude } = req.body;

        // Validate required fields
        if (!device_token) {
            return res.status(400).json({
                success: false,
                error: 'Device token required'
            });
        }

        // Query device, merchant, and route info
        const { data: deviceData, error: deviceError } = await supabase
            .from('devices')
            .select(`
                device_id,
                device_token,
                device_name,
                merchant_id,
                route_id,
                status,
                merchants (
                    merchant_id,
                    business_name,
                    matatu_plate,
                    merchant_type
                ),
                routes (
                    route_id,
                    route_name,
                    route_number,
                    stops
                )
            `)
            .eq('device_token', device_token)
            .eq('status', 'active')
            .single();

        if (deviceError || !deviceData) {
            return res.status(404).json({
                success: false,
                error: 'Invalid QR code'
            });
        }

        // Update device GPS location
        if (user_gps_latitude && user_gps_longitude) {
            await supabase
                .from('devices')
                .update({
                    last_gps_latitude: user_gps_latitude,
                    last_gps_longitude: user_gps_longitude,
                    last_gps_updated_at: new Date().toISOString()
                })
                .eq('device_id', deviceData.device_id);
        }

        // Parse route stops
        const stops = deviceData.routes?.stops || [];

        // Detect nearest stop based on GPS
        let boarding_stop = 'Unknown';
        if (user_gps_latitude && user_gps_longitude && stops.length > 0) {
            boarding_stop = findNearestStop(
                user_gps_latitude, 
                user_gps_longitude, 
                stops
            );
        }

        // Return merchant and route info
        return res.status(200).json({
            success: true,
            data: {
                device_id: deviceData.device_id,
                device_token: deviceData.device_token,
                merchant_id: deviceData.merchants.merchant_id,
                merchant_name: deviceData.merchants.business_name,
                vehicle_plate: deviceData.merchants.matatu_plate,
                route_id: deviceData.routes.route_id,
                route_name: deviceData.routes.route_name,
                route_number: deviceData.routes.route_number,
                boarding_stop: boarding_stop,
                stops: stops,
                user_gps_latitude,
                user_gps_longitude
            }
        });

    } catch (error) {
        console.error('QR scan error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process QR code'
        });
    }
});

/**
 * Helper: Find nearest stop to user's GPS location
 */
function findNearestStop(userLat, userLng, stops) {
    if (!stops || stops.length === 0) return 'Unknown';

    let nearestStop = stops[0].name;
    let minDistance = Infinity;

    stops.forEach(stop => {
        if (stop.gps && stop.gps.lat && stop.gps.lng) {
            const distance = calculateDistance(
                userLat, 
                userLng, 
                stop.gps.lat, 
                stop.gps.lng
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearestStop = stop.name;
            }
        }
    });

    return nearestStop;
}

/**
 * Helper: Calculate distance between two GPS coordinates (Haversine formula)
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

module.exports = router;