class WalletCore {
    constructor(adapter) {
        this.adapter = adapter;
    }

    async getBalance(accountId) {
        return await this.adapter.getBalance(accountId);
    }

    async getRecentTransactions(accountId, limit = 5) {
        if (!accountId) throw new Error('Account ID is required');
        return await this.adapter.getRecentTransactions(accountId, limit);
    }

    async deposit(accountId, amount, referenceId) {
        if (amount <= 0) throw new Error('Deposit amount must be > 0');
        return await this.adapter.executeDeposit(accountId, amount, referenceId);
    }

    async withdraw(accountId, amount, referenceId) {
        if (amount <= 0) throw new Error('Withdrawal amount must be > 0');
        return await this.adapter.executeWithdraw(accountId, amount, referenceId);
    }

    async transfer(fromAccountId, toAccountId, amount, referenceId) {
        if (amount <= 0) throw new Error('Transfer amount must be > 0');
        if (fromAccountId === toAccountId) throw new Error('Cannot transfer to the same account');
        return await this.adapter.executeTransfer(fromAccountId, toAccountId, amount, referenceId);
    }
}

module.exports = WalletCore;
