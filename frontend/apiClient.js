/**
 * apiClient.js
 * Handles all communication between the Frontend and the Express Backend.
 */

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_BASE_URL = localStorage.getItem('backendApiUrl') || (isLocal
    ? 'http://localhost:5000/api'
    : 'https://rtr-crm-online.onrender.com/api'); // Fallback Render URL

const apiClient = {
    // --- Authentication ---
    login: async (username, password) => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            return await response.json();
        } catch (error) {
            console.error('Error during login:', error);
            return { success: false, message: error.message };
        }
    },

    // --- Customers ---
    getCustomers: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/customers`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Error fetching customers:', error);
            return [];
        }
    },

    saveCustomer: async (customerData) => {
        try {
            const response = await fetch(`${API_BASE_URL}/customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customerData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving customer:', error);
            return { success: false, message: error.message };
        }
    },

    // --- Invoices ---
    getInvoices: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/invoices`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Error fetching invoices:', error);
            return [];
        }
    },

    saveInvoice: async (invoiceData) => {
        try {
            const response = await fetch(`${API_BASE_URL}/invoices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(invoiceData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving invoice:', error);
            return { success: false, message: error.message };
        }
    },
    deleteInvoice: (id) => apiClient._deleteCollection('invoices', id),

    // --- Credit/Debit Notes ---
    getCreditDebitNotes: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/credit-debit-notes`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Error fetching credit/debit notes:', error);
            return [];
        }
    },
    saveCreditDebitNote: async (data) => apiClient._saveCollection('credit-debit-notes', data),
    deleteCreditDebitNote: async (id) => apiClient._deleteCollection('credit-debit-notes', id),

    // --- Generic Fetch / Save for other collections ---
    _getCollection: async (collectionName) => {
        try {
            const response = await fetch(`${API_BASE_URL}/${collectionName}`);
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error(`Error fetching ${collectionName}:`, error);
            return [];
        }
    },
    _saveCollection: async (collectionName, data) => {
        try {
            const response = await fetch(`${API_BASE_URL}/${collectionName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error(`Error saving ${collectionName}:`, error);
            return { success: false, message: error.message };
        }
    },
    _deleteCollection: async (collectionName, id) => {
        try {
            const response = await fetch(`${API_BASE_URL}/${collectionName}/${id}`, { method: 'DELETE' });
            return await response.json();
        } catch (error) {
            console.error(`Error deleting from ${collectionName}:`, error);
            return { success: false, message: error.message };
        }
    },

    getItems: () => apiClient._getCollection('items'),
    saveItem: (data) => apiClient._saveCollection('items', data),
    deleteItem: (id) => apiClient._deleteCollection('items', id),

    getPurchases: () => apiClient._getCollection('purchases'),
    savePurchase: (data) => apiClient._saveCollection('purchases', data),
    deletePurchase: (id) => apiClient._deleteCollection('purchases', id),

    getSuppliers: () => apiClient._getCollection('suppliers'),
    saveSupplier: (data) => apiClient._saveCollection('suppliers', data),
    deleteSupplier: (id) => apiClient._deleteCollection('suppliers', id),

    getBankAccounts: () => apiClient._getCollection('bank-accounts'),
    saveBankAccount: (data) => apiClient._saveCollection('bank-accounts', data),
    deleteBankAccount: (id) => apiClient._deleteCollection('bank-accounts', id),

    getBankTransactions: () => apiClient._getCollection('bank-transactions'),
    saveBankTransaction: (data) => apiClient._saveCollection('bank-transactions', data),
    deleteBankTransaction: (id) => apiClient._deleteCollection('bank-transactions', id),

    getJournalVouchers: () => apiClient._getCollection('journal-vouchers'),
    saveJournalVoucher: (data) => apiClient._saveCollection('journal-vouchers', data),
    deleteJournalVoucher: (id) => apiClient._deleteCollection('journal-vouchers', id),

    getExpenses: () => apiClient._getCollection('expenses'),
    saveExpense: (data) => apiClient._saveCollection('expenses', data),
    deleteExpense: (id) => apiClient._deleteCollection('expenses', id),

    getEmployees: () => apiClient._getCollection('employees'),
    saveEmployee: (data) => apiClient._saveCollection('employees', data),

    // --- Scraps & Production (for stock calculation) ---
    getScraps: () => apiClient._getCollection('scraps'),
    saveScrap: (data) => apiClient._saveCollection('scraps', data),
    deleteScrap: (id) => apiClient._deleteCollection('scraps', id),

    getProductions: () => apiClient._getCollection('production'),

    // --- Replaced Electron IPC Calls ---
    sendEmail: async (payload) => {
        try {
            const response = await fetch(`${API_BASE_URL}/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // --- Email Inbox & IMAP ---
    getInboxEmails: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/emails/inbox`);
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    checkNewEmails: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/emails/unread-count`);
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    markEmailRead: async (uid) => {
        try {
            const response = await fetch(`${API_BASE_URL}/emails/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid })
            });
            return await response.json();
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};