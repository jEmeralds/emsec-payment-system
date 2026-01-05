const { supabase } = require('../config/supabase');
const { sendSuccess, sendError, ErrorCodes } = require('../utils/response');

async function getBalance(req, res) {
    try {
        const { user_id } = req.user;

        const { data: user, error } = await supabase
            .from('users')
            .select('balance, currency, first_name, last_name')
            .eq('user_id', user_id)
            .single();

        if (error || !user) {
            return sendError(res, 'User not found', ErrorCodes.USER_NOT_FOUND, 404);
        }

        return sendSuccess(res, {
            balance: parseFloat(user.balance),
            currency: user.currency || 'KES',
            user_name: `${user.first_name} ${user.last_name}`,
            last_updated: new Date().toISOString()
        });

    } catch (error) {
        console.error('Get balance error:', error);
        return sendError(res, 'Server error', ErrorCodes.SERVER_ERROR, 500);
    }
}

async function getHistory(req, res) {
    try {
        const { user_id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        
        if (page < 1 || limit < 1 || limit > 100) {
            return sendError(res, 'Invalid pagination', ErrorCodes.INVALID_INPUT, 400);
        }

        const offset = (page - 1) * limit;

        const { count } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user_id);

        const { data: transactions, error } = await supabase
            .from('transactions')
            .select(`
                transaction_id,
                transaction_type,
                amount,
                currency,
                status,
                origin_stop,
                destination_stop,
                created_at,
                reference_code,
                merchants (
                    business_name,
                    matatu_plate
                ),
                routes (
                    route_number,
                    route_name
                )
            `)
            .eq('user_id', user_id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('History query error:', error);
            return sendError(res, 'Failed to fetch history', ErrorCodes.SERVER_ERROR, 500);
        }

        const formattedTransactions = transactions.map(txn => {
            const formatted = {
                transaction_id: txn.transaction_id,
                type: txn.transaction_type,
                amount: parseFloat(txn.amount),
                currency: txn.currency,
                status: txn.status,
                timestamp: txn.created_at,
                reference: txn.reference_code
            };

            if (txn.merchants) {
                formatted.merchant_name = txn.merchants.business_name;
                if (txn.merchants.matatu_plate) {
                    formatted.matatu_plate = txn.merchants.matatu_plate;
                }
            }

            if (txn.routes) {
                formatted.route = `${txn.routes.route_number} - ${txn.routes.route_name}`;
                formatted.origin = txn.origin_stop;
                formatted.destination = txn.destination_stop;
            }

            return formatted;
        });

        const totalPages = Math.ceil(count / limit);

        return sendSuccess(res, {
            transactions: formattedTransactions,
            pagination: {
                page,
                limit,
                total: count,
                pages: totalPages,
                has_next: page < totalPages,
                has_prev: page > 1
            }
        });

    } catch (error) {
        console.error('Get history error:', error);
        return sendError(res, 'Server error', ErrorCodes.SERVER_ERROR, 500);
    }
}

module.exports = {
    getBalance,
    getHistory
};