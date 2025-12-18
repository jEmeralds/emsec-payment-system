# EmSec Backend API

Complete Node.js + Express backend for the EmSec QR Payment System with GPS-based fraud prevention.

## Features

✅ **Authentication System**
- User registration with validation
- JWT-based authentication
- Refresh token support
- Secure password hashing (bcrypt)

✅ **GPS Fraud Prevention**
- Automatic origin detection using matatu GPS
- Haversine distance calculations
- Confidence scoring
- Fraud alert system

✅ **Payment Processing**
- Idempotency support (prevent duplicate charges)
- Real-time balance updates
- Commission calculations
- Transaction audit trail

✅ **Security**
- Helmet.js security headers
- Rate limiting (100 req/min)
- Input validation
- CORS protection

## Tech Stack

- **Node.js** v18+
- **Express.js** - Web framework
- **Supabase** - PostgreSQL database
- **JWT** - Authentication
- **bcrypt** - Password hashing

## Project Structure

```
emsec-backend/
├── src/
│   ├── config/
│   │   └── supabase.js          # Database connection
│   ├── controllers/
│   │   ├── authController.js     # Register, login, logout
│   │   └── paymentController.js  # QR scan, payment processing
│   ├── middleware/
│   │   ├── auth.js               # JWT authentication
│   │   └── validation.js         # Input validation
│   ├── routes/
│   │   ├── auth.js               # Auth endpoints
│   │   └── payment.js            # Payment endpoints
│   ├── utils/
│   │   ├── gps.js                # GPS distance calculations
│   │   └── response.js           # Standard API responses
│   └── server.js                 # Main application entry
├── package.json
├── .env.example
└── README.md
```

## Installation

### Prerequisites

- Node.js v18 or higher
- npm or yarn
- Supabase account with EmSec database

### Step 1: Install Dependencies

```bash
cd emsec-backend
npm install
```

### Step 2: Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
# Server
PORT=3000
NODE_ENV=development

# Supabase (get these from your Supabase dashboard)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT (change these to random strings in production)
JWT_SECRET=your-secret-key-change-this
JWT_REFRESH_SECRET=your-refresh-secret-change-this
```

**Where to find Supabase credentials:**
1. Go to your Supabase project dashboard
2. Click "Settings" → "API"
3. Copy:
   - Project URL → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### Step 3: Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

You should see:
```
🚀 EmSec Backend API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Server running on port 3000
✅ Environment: development
✅ Database: Connected
```

## API Endpoints

### Authentication

**POST /api/v1/auth/register**
Register a new user

```json
{
  "phone_number": "+254712345678",
  "password": "SecurePass123!",
  "first_name": "John",
  "last_name": "Doe",
  "pin": "1234",
  "email": "john@example.com"
}
```

**POST /api/v1/auth/login**
Login with phone and password

```json
{
  "phone_number": "+254712345678",
  "password": "SecurePass123!"
}
```

### QR & Payments

**POST /api/v1/qr/scan**
Scan QR code (requires authentication)

Headers:
```
Authorization: Bearer <your_jwt_token>
```

Body:
```json
{
  "device_token": "EMSEC_TOKEN_001_ROUTE_111",
  "user_gps_latitude": -1.2864,
  "user_gps_longitude": 36.8172
}
```

**POST /api/v1/payments/process**
Process payment (requires authentication)

```json
{
  "device_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "route_id": "d4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a",
  "origin_stop": "cbd",
  "destination_stop": "kawangware",
  "amount": 50.00,
  "pin": "1234",
  "idempotency_key": "unique-uuid",
  "gps_latitude": -1.2864,
  "gps_longitude": 36.8172
}
```

## Testing with Postman/cURL

### 1. Register a new user

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+254700000001",
    "password": "TestPass123!",
    "first_name": "Test",
    "last_name": "User",
    "pin": "1234",
    "email": "test@emsec.test"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+254700000001",
    "password": "TestPass123!"
  }'
```

Save the `access_token` from the response!

### 3. Scan QR Code

```bash
curl -X POST http://localhost:3000/api/v1/qr/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "device_token": "EMSEC_TOKEN_001_ROUTE_111"
  }'
```

### 4. Process Payment

```bash
curl -X POST http://localhost:3000/api/v1/payments/process \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "device_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "route_id": "d4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a",
    "origin_stop": "cbd",
    "destination_stop": "kawangware",
    "amount": 50.00,
    "pin": "1234",
    "idempotency_key": "test-payment-001",
    "gps_latitude": -1.2864,
    "gps_longitude": 36.8172
  }'
```

## GPS Fraud Prevention

The system automatically detects fraudulent boarding point selection:

1. **Matatu GPS**: Conductor app continuously updates device GPS
2. **Origin Detection**: When passenger scans QR, backend finds nearest stop
3. **Validation**: During payment, system verifies selected origin matches GPS
4. **Fraud Alerts**: Suspicious transactions flagged in `fraud_alerts` table

**Example:**
- Matatu is at Kawangware (GPS: -1.2921, 36.8219)
- Passenger scans QR → Origin auto-set to "Kawangware"
- Passenger tries to change origin to "Satellite" (closer to destination)
- **BLOCKED**: System detects 2km+ discrepancy and rejects payment

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_CREDENTIALS` | Wrong phone/password |
| `INSUFFICIENT_BALANCE` | Not enough money |
| `INVALID_PIN` | Wrong payment PIN |
| `FRAUD_DETECTED` | Suspicious activity |
| `ORIGIN_MISMATCH` | GPS doesn't match selected origin |
| `INVALID_QR` | QR code revoked or not found |
| `GPS_UNAVAILABLE` | Matatu GPS not updated recently |

## What You Learned

### Coding Skills
- ✅ Node.js async/await patterns
- ✅ Express.js routing and middleware
- ✅ RESTful API design
- ✅ Error handling and validation
- ✅ Database queries with Supabase

### Networking
- ✅ HTTP methods and status codes
- ✅ Request/response cycle
- ✅ API authentication with JWT
- ✅ CORS and security headers

### Cybersecurity
- ✅ Password hashing with bcrypt
- ✅ JWT token security
- ✅ Rate limiting
- ✅ Input validation
- ✅ Fraud detection algorithms
- ✅ Idempotency (prevent replay attacks)

### Database
- ✅ SQL queries
- ✅ Transactions and ACID properties
- ✅ Data integrity
- ✅ Indexing for performance

## Next Steps

1. **Add More Endpoints**:
   - GET /wallet/balance
   - POST /wallet/topup (M-Pesa integration)
   - GET /payments/history

2. **Implement M-Pesa**:
   - STK Push for wallet top-ups
   - Callback handling
   - Payment verification

3. **Add SMS Notifications**:
   - Africa's Talking integration
   - Send payment receipts
   - Balance alerts

4. **Build Mobile App**:
   - React Native user app
   - QR scanner
   - Payment flow

5. **Deploy to Production**:
   - AWS / DigitalOcean
   - Environment configuration
   - SSL certificates
   - Monitoring

## Troubleshooting

**Database connection fails:**
- Check SUPABASE_URL and keys in `.env`
- Verify Supabase project is active
- Test connection in Supabase dashboard

**JWT errors:**
- Ensure JWT_SECRET is set in `.env`
- Token might be expired (use refresh token)

**GPS calculations wrong:**
- Verify route stops have latitude/longitude in database
- Check GPS coordinates format (decimal degrees)

## Support

For questions or issues:
- Email: dev@emsec.co.ke
- Documentation: See `emsec_api_documentation.docx`

## License

MIT License - EmSec Team 2024
