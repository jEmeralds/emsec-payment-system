// Add to routes/wallet.js or create routes/transactions.js

/**
 * GET /api/v1/transactions/history
 * Get user's transaction history
 */
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { limit = 20, offset = 0 } = req.query;

        // Get user transactions
        const { data: transactions, error: txError } = await supabase
            .from('transactions')
            .select(`
                transaction_id,
                amount,
                currency,
                status,
                transaction_type,
                origin_stop,
                destination_stop,
                reference_code,
                created_at,
                merchants (
                    business_name,
                    matatu_plate
                ),
                routes (
                    route_name
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (txError) {
            console.error('Transaction history error:', txError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch transactions'
            });
        }

        // Format transactions
        const formattedTransactions = (transactions || []).map(tx => ({
            transaction_id: tx.transaction_id,
            reference_code: tx.reference_code,
            amount: parseFloat(tx.amount),
            currency: tx.currency || 'KES',
            status: tx.status,
            type: tx.transaction_type,
            merchant_name: tx.merchants?.business_name || 'Unknown',
            vehicle_plate: tx.merchants?.matatu_plate || '-',
            route_name: tx.routes?.route_name || '-',
            origin: tx.origin_stop || '-',
            destination: tx.destination_stop || '-',
            timestamp: tx.created_at
        }));

        return res.status(200).json({
            success: true,
            data: {
                transactions: formattedTransactions,
                total: formattedTransactions.length,
                limit: limit,
                offset: offset
            }
        });

    } catch (error) {
        console.error('Transaction history error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch transaction history'
        });
    }
});

module.exports = router;