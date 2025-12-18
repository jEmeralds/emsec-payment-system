// GPS and geolocation utilities for fraud prevention

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // Distance in meters
    
    return Math.round(distance);
}

/**
 * Find nearest stop to GPS coordinates from route stops
 * @param {number} latitude - User/device GPS latitude
 * @param {number} longitude - User/device GPS longitude
 * @param {Array} stops - Array of stop objects with GPS coordinates
 * @returns {Object} Nearest stop with distance
 */
function findNearestStop(latitude, longitude, stops) {
    if (!stops || stops.length === 0) {
        return null;
    }

    let nearest = null;
    let minDistance = Infinity;

    for (const stop of stops) {
        // Skip stops without GPS coordinates
        if (!stop.latitude || !stop.longitude) {
            continue;
        }

        const distance = calculateDistance(
            latitude,
            longitude,
            stop.latitude,
            stop.longitude
        );

        if (distance < minDistance) {
            minDistance = distance;
            nearest = {
                ...stop,
                distance_meters: distance
            };
        }
    }

    return nearest;
}

/**
 * Determine confidence level based on distance
 * @param {number} distanceMeters - Distance in meters
 * @returns {string} Confidence level: 'high', 'medium', 'low'
 */
function getConfidenceLevel(distanceMeters) {
    const threshold = parseInt(process.env.GPS_CONFIDENCE_THRESHOLD_METERS) || 100;
    
    if (distanceMeters < threshold) {
        return 'high';
    } else if (distanceMeters < threshold * 2) {
        return 'medium';
    } else {
        return 'low';
    }
}

/**
 * Validate GPS coordinates
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {boolean} True if valid
 */
function isValidCoordinates(latitude, longitude) {
    return (
        typeof latitude === 'number' &&
        typeof longitude === 'number' &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
    );
}

/**
 * Check if coordinates are within Kenya (rough bounding box)
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {boolean} True if within Kenya
 */
function isWithinKenya(latitude, longitude) {
    // Kenya bounding box (approximate)
    const kenyaBounds = {
        minLat: -4.9,
        maxLat: 4.6,
        minLon: 33.9,
        maxLon: 41.9
    };

    return (
        latitude >= kenyaBounds.minLat &&
        latitude <= kenyaBounds.maxLat &&
        longitude >= kenyaBounds.minLon &&
        longitude <= kenyaBounds.maxLon
    );
}

module.exports = {
    calculateDistance,
    findNearestStop,
    getConfidenceLevel,
    isValidCoordinates,
    isWithinKenya
};
