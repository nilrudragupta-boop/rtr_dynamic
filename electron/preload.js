const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ... existing methods ...
    requestRenewal: (adminId, renewalCode, duration, amount, scriptUrl, currentExpiry) => ipcRenderer.invoke('request-renewal', { adminId, renewalCode, duration, amount, scriptUrl, currentExpiry }),
    verifyRenewalOtp: (otp) => ipcRenderer.invoke('verify-renewal-otp', otp),
    getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
    saveAppSettings: (newState) => ipcRenderer.invoke('save-app-settings', newState),
    checkRemoteLicense: (username) => ipcRenderer.invoke('check-remote-license', username),

    // New OTP Methods
    requestOtp: (action, email) => ipcRenderer.invoke('request-otp', action, email),
    verifyOtp: (action, otp) => ipcRenderer.invoke('verify-otp', action, otp),
    resetPassword: (data) => ipcRenderer.invoke('reset-password', data),
    testEmailConfig: (creds) => ipcRenderer.invoke('test-email-config', creds),
    onUpdatePassword: (callback) => ipcRenderer.on('update-password', (_event, value) => callback(value)),
    onAppSettingsChanged: (callback) => ipcRenderer.on('app-settings-changed', (_event, value) => callback(value)),

    // Admin Credentials & Updates
    verifyDevId: (devId) => ipcRenderer.invoke('verify-dev-id', devId),
    requestDevLoginOtp: (devId) => ipcRenderer.invoke('request-dev-login-otp', devId),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getAdminCreds: () => ipcRenderer.invoke('get-admin-creds'),
    saveAdminCreds: (data) => ipcRenderer.invoke('save-admin-creds', data),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    saveLocalBackup: (fileName, data) => ipcRenderer.invoke('save-local-backup', { fileName, data }),
    showWhatsNew: () => ipcRenderer.invoke('show-whats-new'),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    dbRead: (key) => ipcRenderer.invoke('db-read', key),
    dbWrite: (key, value) => ipcRenderer.invoke('db-write', key, value),
    triggerDatabaseBackup: () => ipcRenderer.invoke('trigger-database-backup'),
    restoreDatabase: (jsonContent) => ipcRenderer.invoke('restore-database', jsonContent),

    // Payment Confirmation Service
    sendPaymentConfirmation: (clientEmail, paymentDetails) => ipcRenderer.invoke('send-payment-confirmation', clientEmail, paymentDetails),

    // Email Sender
    sendEmail: (payload) => ipcRenderer.invoke('send-email', payload),
    getSentEmails: () => ipcRenderer.invoke('get-sent-emails'),
    deleteSentEmail: (id) => ipcRenderer.invoke('delete-sent-email', id),
    savePaymentReceipt: (data) => ipcRenderer.invoke('save-payment-receipt', data),
    getPaymentReceipts: () => ipcRenderer.invoke('get-payment-receipts'),
        getInboxEmails: () => ipcRenderer.invoke('get-inbox-emails'),
    checkNewEmails: () => ipcRenderer.invoke('check-new-emails'),
    markEmailRead: (uid) => ipcRenderer.invoke('mark-email-read', uid),
    deleteInboxEmail: (id) => ipcRenderer.invoke('delete-inbox-email', id),
});
