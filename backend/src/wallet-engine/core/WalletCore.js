class WalletCore {
    constructor(adapter) {
        this.adapter = adapter;
    }

    async initSchema() {
        if (typeof this.adapter.initSchema === 'function') {
            await this.adapter.initSchema();
        }
    }

    async getBalance(accountId) {
        return await this.adapter.getBalance(accountId);
    }

    async getRecentTransactions(accountId, limit = 5) {
        if (!accountId) throw new Error('Account ID is required');
        return await this.adapter.getRecentTransactions(accountId, limit);
    }

    async deposit(accountId, amount, referenceId, options = {}) {
        if (amount <= 0) throw new Error('Deposit amount must be > 0');
        return await this.adapter.executeDeposit(accountId, amount, referenceId, options);
    }

    async withdraw(accountId, amount, referenceId, options = {}) {
        if (amount <= 0) throw new Error('Withdrawal amount must be > 0');
        return await this.adapter.executeWithdraw(accountId, amount, referenceId, options);
    }

    async requestWithdrawal(accountId, amount, options = {}) {
        if (!accountId) throw new Error('Account ID is required');
        if (amount <= 0) throw new Error('Withdrawal amount must be > 0');

        const referenceId = String(options.referenceId || '').trim();
        if (!referenceId) throw new Error('referenceId is required');

        return await this.adapter.createWithdrawalRequest({
            accountId,
            amount,
            referenceId,
            idempotencyKey: options.idempotencyKey,
            method: options.method,
            accountDetails: options.accountDetails,
            trustedUser: Boolean(options.trustedUser),
            kycVerified: Boolean(options.kycVerified),
            ipAddress: options.ipAddress,
            userAgent: options.userAgent
        });
    }

    async getUserWithdrawals(accountId, limit = 10) {
        if (!accountId) throw new Error('Account ID is required');
        return await this.adapter.getWithdrawalRequestsForUser(accountId, limit);
    }

    async getWithdrawalsForAdmin(filters = {}) {
        return await this.adapter.getWithdrawalsForAdmin(filters);
    }

    async approveWithdrawal(withdrawalId, options = {}) {
        if (!withdrawalId) throw new Error('withdrawalId is required');
        return await this.adapter.approveWithdrawal(withdrawalId, {
            adminId: options.adminId,
            force: Boolean(options.force)
        });
    }

    async rejectWithdrawal(withdrawalId, options = {}) {
        if (!withdrawalId) throw new Error('withdrawalId is required');
        return await this.adapter.rejectWithdrawal(withdrawalId, {
            adminId: options.adminId,
            reason: options.reason
        });
    }

    async getAdminLogs(limit = 50, offset = 0) {
        return await this.adapter.getAdminLogs(limit, offset);
    }

    async getEscrowSummary() {
        return await this.adapter.getEscrowSummary();
    }

    async transfer(fromAccountId, toAccountId, amount, referenceId, options = {}) {
        if (amount <= 0) throw new Error('Transfer amount must be > 0');
        if (fromAccountId === toAccountId) throw new Error('Cannot transfer to the same account');
        return await this.adapter.executeTransfer(fromAccountId, toAccountId, amount, referenceId, options);
    }

    async createSupportTicket(accountId, subject, description) {
        if (!accountId) throw new Error('Account ID is required');
        if (!subject || !description) throw new Error('subject and description are required');

        return await this.adapter.createSupportTicket(accountId, subject, description);
    }

    async getSupportTickets(accountId, limit = 20) {
        if (!accountId) throw new Error('Account ID is required');
        return await this.adapter.listSupportTicketsForUser(accountId, limit);
    }
}

module.exports = WalletCore;
