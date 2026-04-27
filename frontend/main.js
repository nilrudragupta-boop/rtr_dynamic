const { app, BrowserWindow, shell, Menu, ipcMain, net, session, globalShortcut, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const os = require('os');
const { exec } = require('child_process');
const getEmailConfig = require('./emailConfig');
const { sendPaymentConfirmation } = require('./emailService');

// Add optional dependencies for receiving email (Inbox)
let ImapFlow, simpleParser;
try {
    ImapFlow = require('imapflow').ImapFlow;
    simpleParser = require('mailparser').simpleParser;
} catch (e) {
    console.warn("Optional dependencies 'imapflow' or 'mailparser' are missing. Inbox functionality will be disabled.");
}

// CHANGE THIS if your html file name is different
const HTML_FILE = 'login.html';

let isQuitting = false; // Flag to track backup status
let whatsNewWindow = null; // Track What's New window instance

function createWindow() {
    // Remove the application menu (File, Edit, View, etc.) globally
    Menu.setApplicationMenu(null);

    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "RTR Reminder",
        icon: path.join(__dirname, 'logo.png'),
        autoHideMenuBar: true,      // hides menu bar completely
        menuBarVisible: false,      // ensures it is not visible
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false
        }
    });


    // Load your HTML file
    win.loadFile(HTML_FILE);

    // Completely remove the menu bar
    win.removeMenu();

    // IMPORTANT: Open WhatsApp/External links in the default browser (Chrome/Edge)
    // instead of inside the app window.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                webPreferences: {
                    preload: path.join(__dirname, 'preload.js'),
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false,
                    webSecurity: false
                }
            }
        };
    });

    // --- AUTO CLOUD BACKUP ON CLOSE ---
    win.on('close', async (e) => {
        if (isQuitting) return;
        e.preventDefault(); // Stop window from closing immediately

        // Hide window so user feels it closed instantly
        win.hide();

        try {
            // 1. Extract LocalStorage Data from Renderer
            const storageJson = await win.webContents.executeJavaScript(`
                (function() {
                    const data = {};
                    if (typeof localStorage !== 'undefined') {
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            data[key] = localStorage.getItem(key);
                        }
                    }
                    return JSON.stringify(data);
                })()
            `);

            const storage = JSON.parse(storageJson);

            // --- AUTO LOCAL BACKUP ON EXIT ---
            try {
                const documentsPath = app.getPath('documents');
                const settings = getPersistentSettings();
                const safeCompanyName = (settings.COMPANY_NAME || "RISE Tech Revolution").replace(/[^a-z0-9]/gi, '_');
                const backupDir = path.join(documentsPath, `${safeCompanyName}_Backups`);
                if (!fs.existsSync(backupDir)) { fs.mkdirSync(backupDir, { recursive: true }); }

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const fileName = `AutoBackup-Exit-${timestamp}.json`;
                const filePath = path.join(backupDir, fileName);

                fs.writeFileSync(filePath, storageJson, 'utf-8');
                cleanupOldBackups(backupDir);
            } catch (err) { console.error("Auto local backup failed:", err); }

            // Use Legacy Script URL
            const cloudUrl = storage.cloudBackupUrl;
            if (cloudUrl && cloudUrl.startsWith('http')) {
                savePersistentSettings({ LAST_CLOUD_BACKUP_TIME: Date.now() });
                await new Promise((resolve) => {
                    const request = net.request({
                        method: 'POST',
                        url: cloudUrl,
                        headers: { 'Content-Type': 'text/plain' }
                    });

                    request.on('response', (response) => {
                        response.on('data', () => { }); // Consume data
                        response.on('end', resolve);
                    });
                    request.on('error', (err) => { console.error("Backup failed:", err); resolve(); });

                    request.write(JSON.stringify({ method: "drive", ...storage }));
                    request.end();
                    setTimeout(resolve, 5000); // 5s Timeout
                });
            }
        } catch (err) { console.error("Auto-backup error:", err); }
        finally { isQuitting = true; win.close(); }
    });
}

// Helper to get company name
function getCompanyNameFromSettings() {
    try {
        const settings = getPersistentSettings();
        return settings.COMPANY_NAME || "Your Company Name";
    } catch (e) { console.error("Error reading company name:", e); }
    return "Your Company Name";
}

// --- PERSISTENT EMAIL SCHEDULING & DB HELPERS ---

const localDbPath = path.join(app.getPath('userData'), 'app_database.json');

function readLocalDatabase() {
    try {
        if (fs.existsSync(localDbPath)) {
            return JSON.parse(fs.readFileSync(localDbPath, 'utf-8'));
        }
    } catch (e) { console.error("Error reading DB:", e); }
    return {};
}

function writeToLocalDatabase(key, value) {
    try {
        const db = readLocalDatabase();
        db[key] = value;
        fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error("Error writing to DB for schedule:", e);
        return false;
    }
}

async function sendAndRemoveScheduled(emailJob) {
    const transporter = getTransporter();
    if (!transporter) {
        console.error(`Cannot send scheduled email "${emailJob.id}", email is not configured. It will be retried on next app start.`);
        return; // Don't remove, retry on next launch
    }

    try {
        await transporter.sendMail(emailJob.mailOptions);
        console.log(`Sent scheduled email: ${emailJob.id}`);
    } catch (error) {
        console.error(`Failed to send scheduled email ${emailJob.id}:`, error);
        // Don't remove it, so it can be retried on next app start.
        return;
    }

    const db = readLocalDatabase();
    const scheduledEmails = (db.scheduledEmails || []).filter(e => e.id !== emailJob.id);
    
    // Log the successful scheduled email
    const sentEmails = db.sentEmails || [];
    sentEmails.unshift({
        id: `sent_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        from: emailJob.mailOptions.from,
        to: emailJob.mailOptions.to,
        subject: emailJob.mailOptions.subject,
        html: emailJob.mailOptions.html,
        text: emailJob.mailOptions.text,
        hasAttachments: emailJob.mailOptions.attachments && emailJob.mailOptions.attachments.length > 0,
        attachmentNames: emailJob.mailOptions.attachments && emailJob.mailOptions.attachments.length > 0 ? emailJob.mailOptions.attachments.map(a => a.filename || (a.path ? path.basename(a.path) : 'Attachment')).join(', ') : '',
        sentAt: new Date().toISOString()
    });
    if (sentEmails.length > 100) sentEmails.length = 100; // Limit log size
    
    db.scheduledEmails = scheduledEmails;
    db.sentEmails = sentEmails;
    fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2), 'utf-8');
}

function scheduleTimeout(emailJob) {
    const now = Date.now();
    const sendTime = new Date(emailJob.scheduledTime).getTime();
    const delay = sendTime - now;

    if (delay <= 0) {
        sendAndRemoveScheduled(emailJob);
    } else if (delay < 2147483647) { // setTimeout limit (~24.8 days)
        setTimeout(() => sendAndRemoveScheduled(emailJob), delay);
    }
}

function processAllScheduledEmails() {
    const db = readLocalDatabase();
    (db.scheduledEmails || []).forEach(scheduleTimeout);
}

app.whenReady().then(() => {
    // --- STEP 7: Developer Override Shortcut ---
    globalShortcut.register('CommandOrControl+Shift+Alt+D', () => {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            windows[0].webContents.send('force-open-dev-panel');
        }
    });

    createWindow();

    // Process any emails that were scheduled in previous sessions
    processAllScheduledEmails();

    // Run daily database backup check on application startup
    performDailyDatabaseBackup();
    // Check periodically every 6 hours (in case the app is left open for days)
    setInterval(performDailyDatabaseBackup, 6 * 60 * 60 * 1000);

    // Schedule Daily Cloud Backup
    setTimeout(performDailyCloudBackup, 5 * 60 * 1000); // Check 5 mins after startup
    setInterval(performDailyCloudBackup, 60 * 60 * 1000); // Check every hour

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- SECURE RENEWAL LOGIC ---

// In-memory storage for security (not accessible by renderer)
let renewalState = {
    otp: null,
    expiry: null,
    pendingDuration: 0,
    attempts: 0,
    isLocked: false,
    lockTime: null,
    lastOtpTime: 0,
    currentLicenseExpiry: null
};

// ============================================================
// 📧 EMAIL CONFIGURATION SECTION
// ============================================================
function getEmailSettings() {
    // 1. Try Persistent Settings (User Data)
    try {
        const settings = getPersistentSettings();
        if (settings.ADMIN_EMAIL && settings.ADMIN_EMAIL_PASS) {
            return { user: settings.ADMIN_EMAIL, pass: settings.ADMIN_EMAIL_PASS };
        }
    } catch (e) { }

    // 2. Fallback to legacy config
    try {
        const config = getEmailConfig();
        return config.auth;
    } catch (e) { return { user: null, pass: null }; }
}

function getTransporter() {
    const auth = getEmailSettings();
    if (!auth.user || !auth.pass) return null;

    const settings = getPersistentSettings();
    let transporterOptions = {
        service: 'gmail',
        auth: auth,
        tls: { rejectUnauthorized: false }
    };

    if (settings.EMAIL_PROVIDER === 'Custom') {
        transporterOptions = {
            host: settings.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(settings.SMTP_PORT) || 465,
            secure: parseInt(settings.SMTP_PORT) === 465,
            auth: auth,
            tls: { rejectUnauthorized: false }
        };
    }

    return nodemailer.createTransport(transporterOptions);
}

function parseEmailError(error) {
    if (!error) return "Unknown email error occurred.";
    
    const errorString = String(error.message || "") + " " + String(error.response || "") + " " + String(error.code || "");
    
    if (errorString.includes('EAUTH') || errorString.includes('535') || errorString.includes('Invalid login')) {
        return "Authentication failed. Please verify your Admin Email and App Password in Settings.";
    }
    if (errorString.includes('ENOTFOUND') || errorString.includes('EDNS') || errorString.includes('getaddrinfo')) {
        return "Network error. Please check your internet connection.";
    }
    if (errorString.includes('ETIMEDOUT') || errorString.includes('ESOCKET')) {
        return "Connection timed out. Your firewall or antivirus might be blocking the connection.";
    }
    if (errorString.includes('Message size exceeds')) {
        return "The email size exceeds the limit. Try reducing the attachment size.";
    }
    if (errorString.includes('No recipients defined')) {
        return "No valid recipient email address was provided.";
    }
    if (errorString.includes('EENVELOPE')) {
        return "Invalid email address format in recipients.";
    }
    
    return error.message || "Failed to send email due to an unknown error.";
}

// 4. ADMIN ID HASH (For validating admin identity during renewal requests)
const ADMIN_ID_HASH = "NANCY@2012"; // Admin ID as per requirements
const FIXED_ADMIN_EMAIL = null; // TODO: Enter your hardcoded email here. Set to null to allow editing.

// 5. SECURE CLOUD URL (Paste Developer Google Script Web App URL here 1. Sending Secure Renewal OTPs 2. Potential Update Checks 3. UI Peermission Tracking)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxnbOTetUcmv22txVFGCb8pHkZI3snpimqMtcdZWvVRv-z2x4bHfVC0K2AxlOXvz8C4/exec"; // CHANGE THIS to your Google Script URL (must be HTTPS)


ipcMain.handle('request-renewal', async (event, { adminId, renewalCode, duration, amount, scriptUrl, currentExpiry }) => {
    try {
        // 1. Check Lockout
        if (renewalState.isLocked) {
            const now = Date.now();
            if (now - renewalState.lockTime > 24 * 60 * 60 * 1000) {
                renewalState.isLocked = false;
                renewalState.attempts = 0;
            } else {
                return { success: false, message: "Renewal locked due to too many failed attempts. Try again in 24 hours." };
            }
        }

        // 1.5 Check Resend Cooldown (60 seconds)
        if (Date.now() - renewalState.lastOtpTime < 60000) {
            return { success: false, message: "Please wait 60 seconds before resending OTP." };
        }

        // 2. Validate Credentials
        if (adminId !== ADMIN_ID_HASH) {
            return { success: false, message: "Invalid Admin ID." };
        }
        const settings = getPersistentSettings();
        const validContacts = (settings.CONTACT_NUMBER || "").split(',').map(s => s.trim()).filter(s => s);
        if (!renewalCode || !validContacts.some(num => renewalCode === `RTR-${num}`)) {
            return { success: false, message: `Invalid Renewal Code. Required format: RTR-<Contact Number> (e.g. RTR-${validContacts[0] || 'Admin Contact Number'})` };
        }

        // 3. Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        renewalState.otp = otp;
        renewalState.expiry = Date.now() + 10 * 60 * 1000; // 10 minutes
        renewalState.pendingDuration = parseInt(duration) || 370; // Default 370 days if not specified
        renewalState.currentLicenseExpiry = currentExpiry ? new Date(currentExpiry) : null;

        let machineId = process.env.COMPUTERNAME || process.env.HOSTNAME || "Unknown PC";
        // Append IP Address for security tracking
        try {
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        machineId += ` (IP: ${iface.address})`;
                        break;
                    }
                }
            }
        } catch (e) { }
        // const formattedAmount = Number(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

        // Use the hardcoded URL if not passed, or prefer hardcoded for security
        const targetUrl = GOOGLE_SCRIPT_URL || scriptUrl;

        // 4. Send via Google Script (Secure Method - No Sent Item for User)
        // We enforce this method to prevent OTP from appearing in the Admin's Sent folder.
        if (targetUrl && targetUrl.startsWith('http')) {
            try {
                await new Promise((resolve, reject) => {
                    const request = net.request({
                        method: 'POST',
                        url: targetUrl,
                        headers: { 'Content-Type': 'application/json' }
                    });

                    // Add 15s timeout to prevent hanging
                    const timer = setTimeout(() => {
                        request.abort();
                        reject(new Error("Network timeout"));
                    }, 15000);

                    request.on('response', (response) => {
                        // Check for permission errors (403) or server errors (500)
                        if (response.statusCode >= 400) {
                            clearTimeout(timer);
                            reject(new Error(`Server Error ${response.statusCode} (Check Permissions)`));
                        }
                        response.on('data', () => { }); // Consume data
                        response.on('end', () => { clearTimeout(timer); resolve(); });
                    });
                    request.on('error', (error) => { clearTimeout(timer); reject(error); });
                    request.write(JSON.stringify({
                        method: 'send_renewal_otp',
                        otp, renewalCode, machineId, duration, amount: amount || 0
                    }));
                    request.end();
                });
                renewalState.lastOtpTime = Date.now();
                return { success: true, message: "Renewal OTP sent to Developer." };
            } catch (e) {
                console.error("Script send failed", e);
                const msg = e.message === "Network timeout" ? "Connection timed out. Please check internet." : "Failed to send OTP. Please check internet connection.";
                return { success: false, message: msg };
            }
        }

        return { success: false, message: "Secure Renewal Configuration Missing (Script URL)." };
    } catch (error) {
        console.error("Renewal Error:", error);
        return { success: false, message: `Failed to process request: ${error.message}` };
    }
});

ipcMain.handle('verify-renewal-otp', async (event, inputOtp) => {
    if (renewalState.isLocked) return { success: false, message: "System locked." };

    // 1. Check Expiry
    if (Date.now() > renewalState.expiry) {
        renewalState.otp = null;
        return { success: false, message: "OTP has expired. Please request a new one." };
    }

    // 2. Verify OTP
    if (inputOtp === renewalState.otp) {
        // Success
        let baseDate = new Date();
        // Advance Renewal: If current expiry is valid and in the future, extend from there
        if (renewalState.currentLicenseExpiry && !isNaN(renewalState.currentLicenseExpiry.getTime()) && renewalState.currentLicenseExpiry > baseDate) {
            baseDate = new Date(renewalState.currentLicenseExpiry);
        }

        const newExpiryDate = new Date(baseDate);
        newExpiryDate.setDate(newExpiryDate.getDate() + renewalState.pendingDuration);

        // Clear state
        renewalState.otp = null;
        renewalState.expiry = null;
        renewalState.attempts = 0;
        renewalState.currentLicenseExpiry = null;

        return { success: true, newExpiry: newExpiryDate.toISOString() };
    } else {
        // Failure
        renewalState.attempts++;
        if (renewalState.attempts >= 5) {
            renewalState.isLocked = true;
            renewalState.lockTime = Date.now();
            return { success: false, message: "Too many failed attempts. Renewal locked for 24 hours." };
        }
        return { success: false, message: `Invalid OTP. Attempts remaining: ${5 - renewalState.attempts}` };
    }
});

// --- GENERIC USER OTP LOGIC (Bank Details, etc.) ---
let userOtpState = {
    otp: null,
    expiry: null,
    action: null,
    attempts: 0,
    email: null, // To hold the user's email during the forgot password flow
    resetToken: null, // Single-use token for authorizing password reset
    resetTokenExpiry: null
};

ipcMain.handle('request-otp', async (event, action, userEmail) => {
    try {
        // For 'Forgot Password', first check if the user exists in the database.
        if (action === 'Forgot Password') {
            if (!userEmail || !userEmail.includes('@')) {
                return { success: false, message: "A valid email is required." };
            }
            const emailSettings = getEmailSettings();
            // Restrict to configured Admin Email
            if (userEmail.trim().toLowerCase() !== emailSettings.user.trim().toLowerCase()) {
                return { success: false, message: "Access Denied: This email is not authorized for password recovery." };
            }
            // Bypassing database check as this app version uses local storage for password.
        }

        const emailSettings = getEmailSettings();
        const transporter = getTransporter();
        if (!transporter) {
            console.error("Email Config Missing:", {
                hasUser: !!emailSettings.user,
                hasPass: !!emailSettings.pass
            });
            return { success: false, message: "Email configuration missing. Please set Admin Email and Password (or Login with Google) in Settings." };
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        userOtpState.otp = otp;
        userOtpState.expiry = Date.now() + 10 * 60 * 1000; // 10 minutes
        userOtpState.action = action;
        userOtpState.attempts = 0;
        userOtpState.email = userEmail; // Store email for the session
        userOtpState.resetToken = null; // Invalidate any previous token

        // Determine recipient: Use provided email if valid, otherwise fallback to Admin Email
        let recipient = (userEmail && userEmail.includes('@')) ? userEmail : emailSettings.user;

        if (!recipient || !recipient.includes('@')) {
            return { success: false, message: "Invalid Recipient Email. Please check Admin Email in Settings." };
        }

        const companyName = (getCompanyNameFromSettings() || "Your Company").replace(/"/g, '');

        // Get Machine Name and IP Address for Security Tracking
        const machineName = process.env.COMPUTERNAME || process.env.HOSTNAME || "Unknown Device";
        let ipAddress = "Unknown IP";
        try {
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) { ipAddress = iface.address; break; }
                }
                if (ipAddress !== "Unknown IP") break;
            }
        } catch (e) { }

        await transporter.sendMail({
            from: `"${companyName} Security" <${emailSettings.user}>`,
            to: recipient,
            subject: `🔐 Security Alert: ${action} Request`,
            text: `Your security verification OTP for the action "${action}" is: ${otp}\n\nRequest Source: ${machineName} (IP: ${ipAddress})\n\nThis OTP is valid for 10 minutes.`
        });

        return { success: true, targetEmail: recipient };
    } catch (error) {
        console.error("OTP Request Error:", error);
            return { success: false, message: "Failed to send OTP: " + parseEmailError(error) };
    }
});

ipcMain.handle('verify-otp', async (event, action, otp) => {
    if (userOtpState.action !== action) return { success: false, message: "Invalid action context." };
    if (Date.now() > userOtpState.expiry) {
        userOtpState.otp = null; // Clear expired OTP
        return { success: false, message: "OTP has expired. Please request a new one." };
    }

    if (userOtpState.otp === otp) {
        userOtpState.otp = null; // Clear OTP after successful verification
        userOtpState.attempts = 0;

        // For 'Forgot Password', generate a secure, single-use token for the next step
        if (action === 'Forgot Password') {
            const token = crypto.randomBytes(32).toString('hex');
            userOtpState.resetToken = token;
            userOtpState.resetTokenExpiry = Date.now() + 5 * 60 * 1000; // Token is valid for 5 minutes
            return { success: true, resetToken: token };
        }

        return { success: true, message: 'OTP verified successfully.' };
    } else {
        userOtpState.attempts++;
        if (userOtpState.attempts >= 5) {
            userOtpState.otp = null; // Lock out by clearing OTP
            return { success: false, message: "Too many failed attempts. Please request a new OTP." };
        }
        return { success: false, message: `Invalid OTP. Attempts remaining: ${5 - userOtpState.attempts}` };
    }
});

ipcMain.handle('test-email-config', async (event, { email, password, emailProvider, smtpHost, smtpPort }) => {
    if (!email || !password) return { success: false, message: "Missing credentials" };
    try {
        let transporterOptions = {
            service: 'gmail',
            auth: { user: email, pass: password },
            tls: { rejectUnauthorized: false }
        };

        if (emailProvider === 'Custom') {
            transporterOptions = {
                host: smtpHost || 'smtp.gmail.com',
                port: parseInt(smtpPort) || 465,
                secure: parseInt(smtpPort) === 465,
                auth: { user: email, pass: password },
                tls: { rejectUnauthorized: false }
            };
        }

        const transporter = nodemailer.createTransport(transporterOptions);

        // Verify connection configuration
        await transporter.verify();

        // Send a test email to self
        await transporter.sendMail({
            from: `"Test" <${email}>`,
            to: email,
            subject: "Test Email",
            text: "Dear Valued User, if you are able to see this Test Email, it confirms that your software configuration for receiving 'OTP emails' is functioning correctly. -- Best regards, Support Team"
        });
        return { success: true, message: "Success! Test email sent to your inbox." };
    } catch (error) {
        console.error("Email Test Error:", error);
            return { success: false, message: parseEmailError(error) };
    }
});

// New handler for sending payment confirmations via emailService.js
ipcMain.handle('send-payment-confirmation', async (event, clientEmail, paymentDetails) => {
    try {
        const info = await sendPaymentConfirmation(clientEmail, paymentDetails);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("Payment Confirmation Error:", error);
        return { success: false, error: error.message };
    }
});

// New handler for dispatching custom emails from the email_sender.html UI
ipcMain.handle('send-email', async (event, payload) => {
    try {
        const emailSettings = getEmailSettings();
        const appSettings = getPersistentSettings();
        const transporter = getTransporter();

        if (!transporter) {
            return { success: false, error: "Email configuration missing. Please check Settings." };
        }

        const companyName = (getCompanyNameFromSettings() || "Your Company").replace(/"/g, '');

        let finalBcc = payload.bcc || "";
        // Guarantee the default BCC is attached to the backend payload (avoiding duplicates)
        if (appSettings.DEFAULT_BCC) {
            if (!finalBcc.toLowerCase().includes(appSettings.DEFAULT_BCC.toLowerCase())) {
                finalBcc = finalBcc ? `${finalBcc}, ${appSettings.DEFAULT_BCC}` : appSettings.DEFAULT_BCC;
            }
        }

        const mailOptions = {
            from: `"${companyName}" <${emailSettings.user}>`,
            to: payload.to,
            cc: payload.cc || undefined,
            bcc: finalBcc || undefined,
            subject: payload.subject,
            text: payload.text,
            html: payload.html,
            attachments: (payload.attachments || []).map(att => typeof att === 'string' ? { path: att } : att)
        };

        if (payload.readReceipt) {
            mailOptions.headers = {
                'Disposition-Notification-To': emailSettings.user
            };
        }

        // Handle Scheduled Emails (In-memory, single session scope)
        if (payload.isScheduled && payload.scheduledTime) {
            const now = Date.now();
            const sendTime = new Date(payload.scheduledTime).getTime();
            if (sendTime > now) {
                const db = readLocalDatabase();
                const scheduledEmails = db.scheduledEmails || [];
                const newEmailJob = {
                    id: `email_${now}_${Math.random().toString(36).substring(2)}`,
                    mailOptions: mailOptions,
                    scheduledTime: payload.scheduledTime
                };
                scheduledEmails.push(newEmailJob);
                if (writeToLocalDatabase('scheduledEmails', scheduledEmails)) {
                    scheduleTimeout(newEmailJob);
                    return { success: true, message: "Email scheduled successfully." };
                } else {
                    return { success: false, error: "Failed to save scheduled email to disk." };
                }
            }
        }

        // Send immediately
        await transporter.sendMail(mailOptions);
        
        // Log the successful immediate email
        const db = readLocalDatabase();
        const sentEmails = db.sentEmails || [];
        sentEmails.unshift({
            id: `sent_${Date.now()}_${Math.random().toString(36).substring(2)}`,
            from: mailOptions.from,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
            hasAttachments: payload.attachments && payload.attachments.length > 0,
            attachmentNames: payload.attachments && payload.attachments.length > 0 ? payload.attachments.map(a => a.filename || (a.path ? path.basename(a.path) : 'Attachment')).join(', ') : '',
            sentAt: new Date().toISOString()
        });
        if (sentEmails.length > 100) sentEmails.length = 100; // Limit log size
        writeToLocalDatabase('sentEmails', sentEmails);
        
        return { success: true };
    } catch (error) {
        console.error("Send Email Error:", error);
            return { success: false, error: parseEmailError(error) };
    }
});

ipcMain.handle('get-sent-emails', async () => {
    const db = readLocalDatabase();
    return { success: true, emails: db.sentEmails || [] };
});

ipcMain.handle('delete-sent-email', async (event, id) => {
    const db = readLocalDatabase();
    let sentEmails = db.sentEmails || [];
    sentEmails = sentEmails.filter(e => e.id !== id);
    writeToLocalDatabase('sentEmails', sentEmails);
    return { success: true };
});

ipcMain.handle('save-payment-receipt', async (event, receiptData) => {
    const db = readLocalDatabase();
    const receipts = db.paymentReceipts || [];
    receipts.unshift({ id: `rect_${Date.now()}_${Math.random().toString(36).substring(2)}`, ...receiptData, generatedAt: new Date().toISOString() });
    if (receipts.length > 500) receipts.length = 500; // Limit history size
    writeToLocalDatabase('paymentReceipts', receipts);
    return { success: true };
});

ipcMain.handle('get-payment-receipts', async () => {
    const db = readLocalDatabase();
    return { success: true, receipts: db.paymentReceipts || [] };
});

// New handler for fetching the Inbox via IMAP
ipcMain.handle('get-inbox-emails', async () => {
    if (!ImapFlow || !simpleParser) {
        return { success: false, error: "Receiving emails requires 'imapflow' and 'mailparser'. Please run: npm install imapflow mailparser" };
    }
    
    try {
        const emailSettings = getEmailSettings();
        if (!emailSettings.user || !emailSettings.pass) {
            return { success: false, error: "Email configuration missing. Please check your App Settings." };
        }

        const settings = getPersistentSettings();
        const imapHost = settings.EMAIL_PROVIDER === 'Custom' ? (settings.IMAP_HOST || 'imap.gmail.com') : 'imap.gmail.com';
        const imapPort = settings.EMAIL_PROVIDER === 'Custom' ? (parseInt(settings.IMAP_PORT) || 993) : 993;

        const client = new ImapFlow({
            host: imapHost,
            port: imapPort,
            secure: imapPort === 993,
            auth: { user: emailSettings.user, pass: emailSettings.pass },
            logger: false
        });

        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        const emails = [];
        
        try {
            const exists = client.mailbox.exists;
            if (exists > 0) {
                const startSeq = Math.max(1, exists - 14); // Fetch the last 15 emails
                for await (let message of client.fetch(`${startSeq}:*`, { source: true, flags: true, uid: true })) {
                    const parsed = await simpleParser(message.source);
                    
                    const emailAttachments = [];
                    if (parsed.attachments && parsed.attachments.length > 0) {
                        parsed.attachments.forEach(att => {
                            emailAttachments.push({
                                filename: att.filename || 'Unknown_File',
                                contentType: att.contentType || 'application/octet-stream',
                                size: att.size || 0,
                                content: att.content ? att.content.toString('base64') : null
                            });
                        });
                    }

                    emails.unshift({
                        id: message.seq,
                        uid: message.uid,
                        isUnread: !message.flags.has('\\Seen'),
                        subject: parsed.subject,
                        from: parsed.from ? parsed.from.text : 'Unknown',
                        fromAddress: parsed.from && parsed.from.value.length > 0 ? parsed.from.value[0].address : '',
                        to: parsed.to ? parsed.to.text : 'Me',
                        date: parsed.date,
                        html: parsed.html,
                        text: parsed.text,
                        attachments: emailAttachments
                    });
                }
            }
        } finally {
            lock.release();
        }
        await client.logout();

        return { success: true, emails: emails };
    } catch (error) {
        console.error("IMAP Fetch Error:", error);
        if (error.message && error.message.includes('AUTHENTICATIONFAILED')) {
            return { success: false, error: "Authentication failed. Check your App Password." };
        }
        return { success: false, error: "Failed to fetch Inbox: " + error.message };
    }
});

// New handler to check for unread emails rapidly
ipcMain.handle('check-new-emails', async () => {
    if (!ImapFlow) return { success: false, error: "Missing imapflow" };
    try {
        const emailSettings = getEmailSettings();
        if (!emailSettings.user || !emailSettings.pass) return { success: false };
        
        const settings = getPersistentSettings();
        const imapHost = settings.EMAIL_PROVIDER === 'Custom' ? (settings.IMAP_HOST || 'imap.gmail.com') : 'imap.gmail.com';
        const imapPort = settings.EMAIL_PROVIDER === 'Custom' ? (parseInt(settings.IMAP_PORT) || 993) : 993;

        const client = new ImapFlow({
            host: imapHost,
            port: imapPort,
            secure: imapPort === 993,
            auth: { user: emailSettings.user, pass: emailSettings.pass },
            logger: false
        });

        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        let unread = 0;
        try {
            const list = await client.search({ seen: false });
            unread = list ? list.length : 0;
        } finally {
            lock.release();
        }
        await client.logout();

        return { success: true, unread };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// New handler for marking an email as read
ipcMain.handle('mark-email-read', async (event, uid) => {
    if (!ImapFlow) return { success: false };
    try {
        const emailSettings = getEmailSettings();
        if (!emailSettings.user || !emailSettings.pass) return { success: false };
        
        const settings = getPersistentSettings();
        const imapHost = settings.EMAIL_PROVIDER === 'Custom' ? (settings.IMAP_HOST || 'imap.gmail.com') : 'imap.gmail.com';
        const imapPort = settings.EMAIL_PROVIDER === 'Custom' ? (parseInt(settings.IMAP_PORT) || 993) : 993;

        const client = new ImapFlow({
            host: imapHost,
            port: imapPort,
            secure: imapPort === 993,
            auth: { user: emailSettings.user, pass: emailSettings.pass },
            logger: false
        });

        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        try { await client.messageFlagsAdd({ uid: uid }, ['\\Seen'], { uid: true }); } finally { lock.release(); }
        await client.logout();
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

// New handler for resetting the password after OTP verification
ipcMain.handle('reset-password', async (event, { newPassword, resetToken }) => {
    if (!userOtpState.resetToken || userOtpState.resetToken !== resetToken) {
        return { success: false, message: 'Invalid or missing password reset token.' };
    }
    if (Date.now() > userOtpState.resetTokenExpiry) {
        return { success: false, message: 'Password reset token has expired. Please try again.' };
    }

    const email = userOtpState.email;
    if (!email) return { success: false, message: 'User session not found. Please start over.' };

    // Invalidate the token immediately after checking it
    userOtpState.resetToken = null;

    // The login password is not hashed, so we send the plain password.
    // The renderer will store it in localStorage.
    try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            // FIX: Update persistent settings so the new password works on restart/reload
            const s = getPersistentSettings();
            const updates = {};

            // 1. Update legacy password field
            updates.ADMIN_LOGIN_PASS = newPassword;

            // 2. Update password for the main admin user in ADMIN_USERS
            // We assume the main admin is the one defined by ADMIN_USERNAME
            let users = s.ADMIN_USERS || [];
            const mainUser = s.ADMIN_USERNAME || "Admin";
            const idx = users.findIndex(u => u.username === mainUser);
            if (idx !== -1) {
                users[idx].password = newPassword;
                updates.ADMIN_USERS = users;
            }
            savePersistentSettings(updates);

            windows[0].webContents.send('update-password', newPassword);
            return { success: true, message: 'Password reset process initiated.' };
        } else {
            return { success: false, message: 'Application window not found.' };
        }
    } catch (error) {
        console.error('Password Reset Error:', error);
        return { success: false, message: 'Failed to reset password due to an application error.' };
    }
});
// --- SETTINGS MANAGEMENT ---

// NEW: Helper to handle persistent settings in User Data folder
function getPersistentSettings() {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    try {
        if (fs.existsSync(settingsPath)) {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            // Force the fixed email if set
            if (FIXED_ADMIN_EMAIL) {
                data.ADMIN_EMAIL = FIXED_ADMIN_EMAIL;
            }
            return data;
        }
    } catch (e) { console.error("Settings read error:", e); }

    // Default values if file doesn't exist
    return {
        SELLER_STATE: "",
        COMPANY_NAME: "Your Company Name",
        ADDRESS_LINE_1: "",
        ADDRESS_LINE_2: "",
        CONTACT_NUMBER: "",
        ADMIN_USERNAME: "Admin",
        ADMIN_EMAIL: "",
        ADMIN_EMAIL_PASS: "",
        DEFAULT_BCC: "",
        PRINT_OPTIONS: {},
        ADMIN_USERS: [{ username: "Admin", password: "", role: "Admin" }],
        ADMIN_EMAIL: FIXED_ADMIN_EMAIL || "", // Default if file doesn't exist
        APP_MODE: "Trading / Business", // --- STEP 6: Default Protection ---
        CUSTOM_FEATURES: {},
        EMAIL_PROVIDER: "Gmail",
        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: 465,
        IMAP_HOST: "imap.gmail.com",
        IMAP_PORT: 993
    };
}

function savePersistentSettings(data) {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    const current = getPersistentSettings();
    const updated = { ...current, ...data };
    fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 4), 'utf-8');
}

ipcMain.handle('get-app-settings', async () => {
    try {
        const s = getPersistentSettings();
        return {
            success: true,
            sellerState: s.SELLER_STATE,
            companyName: s.COMPANY_NAME,
            printOptions: s.PRINT_OPTIONS || {},
            addressLine1: s.ADDRESS_LINE_1,
            addressLine2: s.ADDRESS_LINE_2,
            contactNumber: s.CONTACT_NUMBER,
            district: s.DISTRICT,
            companyGstin: s.COMPANY_GSTIN,
            companyEmail: s.COMPANY_EMAIL,
            defaultBcc: s.DEFAULT_BCC,
            companyWebsite: s.COMPANY_WEBSITE,
            logoPath: s.LOGO_PATH,
            adminUser: s.ADMIN_USERNAME,
            adminEmail: s.ADMIN_EMAIL,
            adminUsers: s.ADMIN_USERS || [],
            loginHistory: s.LOGIN_HISTORY || [],
            appMode: s.APP_MODE || "Trading / Business",
            customFeatures: s.CUSTOM_FEATURES || {},
            googleScriptUrl: GOOGLE_SCRIPT_URL
        };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// New IPC Handler for System Info
ipcMain.handle('get-system-info', async () => {
    const getDiskSpace = () => new Promise((resolve) => {
        // Get the drive letter from the app path (e.g., 'C:')
        const drive = path.parse(app.getAppPath()).root.substring(0, 2);
        if (process.platform !== 'win32') {
            // Basic implementation for non-windows for completeness
            exec('df -k .', (err, stdout) => {
                if (err) return resolve({ free: 'N/A', total: 'N/A' });
                const lines = stdout.trim().split('\n');
                const parts = lines[lines.length - 1].split(/\s+/);
                const free = parseInt(parts[3]) * 1024;
                const total = parseInt(parts[1]) * 1024;
                resolve({ free, total });
            });
            return;
        }
        // For Windows
        const cmd = `powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_LogicalDisk -Filter \\"DeviceID='${drive}'\\" | Select-Object FreeSpace,Size | ConvertTo-Json"`;
        exec(cmd, (err, stdout) => {
            if (err) {
                console.error('Error getting disk space:', err);
                return resolve({ free: 'N/A', total: 'N/A' });
            }
            try {
                const data = JSON.parse(stdout);
                const disk = Array.isArray(data) ? data[0] : data;
                resolve({ free: disk.FreeSpace, total: disk.Size });
            } catch (e) {
                resolve({ free: 'N/A', total: 'N/A' });
            }
        });
    });

    const getDotNetVersion = () => new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve('N/A');
        }
        const command = 'reg query "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full" /v Release';
        exec(command, (err, stdout) => {
            if (err) {
                return resolve('Not Found');
            }
            const match = stdout.match(/Release\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
            if (!match) return resolve('Not Found');

            const release = parseInt(match[1], 16);
            if (release >= 528040) return resolve('4.8 or later');
            if (release >= 461808) return resolve('4.7.2');
            if (release >= 461308) return resolve('4.7.1');
            if (release >= 460798) return resolve('4.7');
            if (release >= 394802) return resolve('4.6.2');
            if (release >= 394254) return resolve('4.6.1');
            if (release >= 393295) return resolve('4.6');
            if (release >= 379893) return resolve('4.5.2');
            if (release >= 378675) return resolve('4.5.1');
            if (release >= 378389) return resolve('4.5');
            return resolve('Older than 4.5');
        });
    });

    const getOsVersion = () => new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve({ label: `${os.type()} ${os.release()}`, version: os.release() });
        }
        // Use PowerShell to get the real OS version, bypassing compatibility shims
        const cmd = `powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object Caption, Version | ConvertTo-Json"`;
        exec(cmd, (err, stdout) => {
            if (err) {
                // Fallback to Node.js os module if PowerShell fails
                return resolve({ label: `Windows ${os.release()}`, version: os.release() });
            }
            try {
                const data = JSON.parse(stdout);
                const osItem = Array.isArray(data) ? data[0] : data;
                resolve({ label: osItem.Caption.trim(), version: osItem.Version });
            } catch (e) {
                resolve({ label: `Windows ${os.release()}`, version: os.release() });
            }
        });
    });

    try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const cpus = os.cpus();
        const disk = await getDiskSpace();
        const dotNet = await getDotNetVersion();
        const osInfo = await getOsVersion();

        return {
            success: true,
            os: `${osInfo.label} (${osInfo.version})`,
            cpu: `${cpus[0].model} (${cpus.length} cores)`,
            cpuSpeed: cpus[0].speed,
            cpuCores: cpus.length,
            memory: os.totalmem(),
            display: `${primaryDisplay.size.width}x${primaryDisplay.size.height}`,
            displayWidth: primaryDisplay.size.width,
            displayHeight: primaryDisplay.size.height,
            diskFree: disk.free,
            diskTotal: disk.total,
            dotNetVersion: dotNet
        };
    } catch (error) {
        console.error('System Info Error:', error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('save-app-settings', async (event, params) => {
    try {
        const updates = {};
        if (params.sellerState !== undefined) updates.SELLER_STATE = params.sellerState;
        if (params.district !== undefined) updates.DISTRICT = params.district;
        if (params.companyName !== undefined) updates.COMPANY_NAME = params.companyName;
        if (params.addressLine1 !== undefined) updates.ADDRESS_LINE_1 = params.addressLine1;
        if (params.addressLine2 !== undefined) updates.ADDRESS_LINE_2 = params.addressLine2;
        if (params.contactNumber !== undefined) updates.CONTACT_NUMBER = params.contactNumber;
        if (params.companyGstin !== undefined) updates.COMPANY_GSTIN = params.companyGstin;
        if (params.companyEmail !== undefined) updates.COMPANY_EMAIL = params.companyEmail;
        if (params.defaultBcc !== undefined) updates.DEFAULT_BCC = params.defaultBcc;
        if (params.companyWebsite !== undefined) updates.COMPANY_WEBSITE = params.companyWebsite;
        if (params.logoPath !== undefined) updates.LOGO_PATH = params.logoPath;
        if (params.printOptions !== undefined) updates.PRINT_OPTIONS = params.printOptions;
        if (params.loginHistory !== undefined) updates.LOGIN_HISTORY = params.loginHistory;
        if (params.appMode !== undefined) updates.APP_MODE = params.appMode;
        if (params.customFeatures !== undefined) updates.CUSTOM_FEATURES = params.customFeatures;
        if (params.modifiedBy !== undefined) updates.LAST_MODIFIED_BY = params.modifiedBy;
        updates.LAST_MODIFIED_DATE = new Date().toISOString();

        savePersistentSettings(updates);

        // Broadcast to all windows
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('app-settings-changed', {
                companyName: params.companyName,
                addressLine1: params.addressLine1,
                addressLine2: params.addressLine2,
                contactNumber: params.contactNumber,
                sellerState: params.sellerState,
                district: params.district,
                companyGstin: params.companyGstin,
                companyEmail: params.companyEmail,
                companyWebsite: params.companyWebsite,
                logoPath: params.logoPath
            });
        });

        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// --- Developer Handlers for Admin Credentials ---
ipcMain.handle('request-dev-login-otp', async (event, devId) => {
    if (devId !== ADMIN_ID_HASH) {
        return { success: false, message: "Invalid Developer ID." };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Reuse userOtpState for generic OTP verification logic (verify-otp)
    userOtpState.otp = otp;
    userOtpState.expiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    userOtpState.action = 'Developer Login';
    userOtpState.attempts = 0;
    userOtpState.email = "Developer"; // Placeholder

    let machineId = process.env.COMPUTERNAME || process.env.HOSTNAME || "Unknown PC";
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    machineId += ` (IP: ${iface.address})`;
                    break;
                }
            }
        }
    } catch (e) { }

    if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.startsWith('http')) {
        try {
            await new Promise((resolve, reject) => {
                const request = net.request({
                    method: 'POST',
                    url: GOOGLE_SCRIPT_URL,
                    headers: { 'Content-Type': 'application/json' }
                });

                request.on('response', (response) => {
                    response.on('data', () => { });
                    response.on('end', resolve);
                });
                request.on('error', (error) => reject(error));

                request.write(JSON.stringify({
                    method: 'send_dev_login_otp',
                    otp,
                    machineId
                }));
                request.end();
            });
            return { success: true, message: "OTP sent to Developer Email." };
        } catch (e) {
            console.error("Dev OTP send failed", e);
            return { success: false, message: "Failed to send OTP. Check internet connection." };
        }
    }
    return { success: false, message: "Cloud configuration missing." };
});

ipcMain.handle('verify-dev-id', async (event, devId) => {
    return { success: devId === ADMIN_ID_HASH };
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('get-admin-creds', async () => {
    try {
        const s = getPersistentSettings();
        return {
            success: true,
            adminUser: s.ADMIN_USERNAME || "Admin",
            adminEmail: s.ADMIN_EMAIL || "",
            adminEmailPass: s.ADMIN_EMAIL_PASS || "",
            adminPass: s.ADMIN_LOGIN_PASS || "",
            isEmailFixed: !!FIXED_ADMIN_EMAIL, // Tell frontend if email is locked
            adminUsers: s.ADMIN_USERS || [],
            emailProvider: s.EMAIL_PROVIDER || "Gmail",
            smtpHost: s.SMTP_HOST || "smtp.gmail.com",
            smtpPort: s.SMTP_PORT || 465,
            imapHost: s.IMAP_HOST || "imap.gmail.com",
            imapPort: s.IMAP_PORT || 993
        };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('save-admin-creds', async (event, params) => {
    if (params.isLoginUpdate && params.usernameToUpdate) {
        const s = getPersistentSettings();
        let users = s.ADMIN_USERS || [];
        if (users.length === 0 && s.ADMIN_USERNAME) users.push({ username: s.ADMIN_USERNAME, password: s.ADMIN_LOGIN_PASS || "" });

        const idx = users.findIndex(u => u.username === params.usernameToUpdate);
        if (idx !== -1) {
            users[idx].lastLogin = new Date().toISOString();

            // Update Login History
            let history = s.LOGIN_HISTORY || [];
            const machineName = process.env.COMPUTERNAME || process.env.HOSTNAME || "Unknown Device";
            history.unshift({
                username: params.usernameToUpdate,
                timestamp: new Date().toISOString(),
                machine: machineName
            });
            if (history.length > 20) history = history.slice(0, 20);

            savePersistentSettings({ ADMIN_USERS: users, LOGIN_HISTORY: history });
            return { success: true };
        }
        return { success: false, message: "User not found" };
    }

    if (params.devId !== ADMIN_ID_HASH && params.devId !== "OTP_VERIFIED") {
        return { success: false, message: "Invalid Developer ID." };
    }

    try {
        const updates = {};
        if (params.adminUser !== undefined) updates.ADMIN_USERNAME = String(params.adminUser).trim();

        // Only update email if it's NOT fixed
        if (params.adminEmail !== undefined) {
            if (FIXED_ADMIN_EMAIL) updates.ADMIN_EMAIL = FIXED_ADMIN_EMAIL;
            else updates.ADMIN_EMAIL = String(params.adminEmail).trim();
        }

        if (params.adminEmailPass) updates.ADMIN_EMAIL_PASS = String(params.adminEmailPass).trim();
        if (params.adminPass) updates.ADMIN_LOGIN_PASS = params.adminPass;
        if (params.adminUsers !== undefined) updates.ADMIN_USERS = params.adminUsers;
        
        if (params.emailProvider !== undefined) updates.EMAIL_PROVIDER = params.emailProvider;
        if (params.smtpHost !== undefined) updates.SMTP_HOST = params.smtpHost;
        if (params.smtpPort !== undefined) updates.SMTP_PORT = params.smtpPort;
        if (params.imapHost !== undefined) updates.IMAP_HOST = params.imapHost;
        if (params.imapPort !== undefined) updates.IMAP_PORT = params.imapPort;

        savePersistentSettings(updates);

        if (params.adminPass) {
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
                windows[0].webContents.send('update-password', params.adminPass);
            }
        }

        return { success: true, message: 'Admin credentials updated successfully.' };
    } catch (error) {
        console.error('Save Admin Creds Error:', error);
        return { success: false, message: 'Failed to save admin credentials.' };
    }
});

ipcMain.handle('check-for-updates', async (event, customUrl) => {
    try {
        const currentVersion = app.getVersion(); // Automatically reads version from package.json

        // Use custom URL if provided, else fallback to hardcoded
        let targetUrl = (customUrl && customUrl.startsWith('http')) ? customUrl : GOOGLE_SCRIPT_URL;

        // Append action parameter correctly
        const separator = targetUrl.includes('?') ? '&' : '?';
        const updateUrl = targetUrl + separator + "action=check_update";

        const responseData = await new Promise((resolve, reject) => {
            const request = net.request({
                method: 'GET',
                url: updateUrl
            });

            request.on('response', (response) => {
                if (response.statusCode !== 200) {
                    response.on('data', () => { }); // Consume data
                    response.on('end', () => reject(new Error(`Server returned status ${response.statusCode}`)));
                    return;
                }
                let data = '';
                response.on('data', (chunk) => data += chunk);
                response.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch (e) {
                        console.error("Update check failed. Response was:", data);
                        reject(new Error("Invalid server response"));
                    }
                });
            });
            request.on('error', (error) => reject(error));
            request.end();
        });

        if (responseData && responseData.version && responseData.version !== currentVersion) {
            return {
                success: true,
                updateAvailable: true,
                currentVersion: currentVersion,
                remoteVersion: responseData.version,
                releaseDate: responseData.release_date,
                downloadUrl: responseData.url,
                message: responseData.notes || "New version available.",
                releaseNotes: responseData.notes, // Pass notes explicitly
                advanceNotice: responseData.advance_notice
            };
        }

        return {
            success: true,
            updateAvailable: false,
            currentVersion: currentVersion,
            message: "You are using the latest version.",
            releaseNotes: responseData ? responseData.notes : "Maintenance update.", // Pass notes explicitly
            advanceNotice: responseData ? responseData.advance_notice : null
        };
    } catch (error) {
        console.error("Update check error:", error);
        return { success: false, message: error.message };
    }
});

// --- DEVELOPER REMOTE LICENSE CONTROL ---
ipcMain.handle('check-remote-license', async (event, username) => {
    if (!GOOGLE_SCRIPT_URL || !GOOGLE_SCRIPT_URL.startsWith('http')) {
        return { success: false, message: "Cloud configuration missing." };
    }
    try {
        const settings = getPersistentSettings();
        let rawContacts = settings.CONTACT_NUMBER || "";

        const responseData = await new Promise((resolve, reject) => {
            const request = net.request({
                method: 'POST',
                url: GOOGLE_SCRIPT_URL,
                headers: { 'Content-Type': 'application/json' }
            });

            request.on('response', (response) => {
                let data = '';
                response.on('data', (chunk) => data += chunk);
                response.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        if (parsedData.suspended) {
                            dialog.showErrorBox("Account Suspended", parsedData.message || "Your account has been suspended for Non-Payment of AMC.");
                            app.quit();
                        } else if (parsedData.alertMessages && parsedData.alertMessages.length > 0) {
                            const currentSettings = getPersistentSettings();
                            const today = new Date().toISOString().split('T')[0];
                            const combinedMessages = parsedData.alertMessages.join(' || ');

                            if (currentSettings.LAST_ALERT_DATE !== today || currentSettings.LAST_ALERT_MESSAGE !== combinedMessages) {

                                // Send a background notification to the developer immediately
                                const notifyReq = net.request({
                                    method: 'POST',
                                    url: GOOGLE_SCRIPT_URL,
                                    headers: { 'Content-Type': 'application/json' }
                                });
                                notifyReq.write(JSON.stringify({
                                    method: 'alert_seen',
                                    username: username,
                                    contactNumber: rawContacts,
                                    alertMessage: combinedMessages
                                }));
                                notifyReq.end();

                                savePersistentSettings({ LAST_ALERT_DATE: today, LAST_ALERT_MESSAGE: combinedMessages });
                            }
                        }

                        // Start Heartbeat automatically if license check is successful
                        if (parsedData.success) {
                            startHeartbeat(username, rawContacts);

                            // Save remote permissions globally if provided by the server
                            if (parsedData.remotePermissions) {
                                const s = getPersistentSettings();
                                let allRemotePerms = s.REMOTE_PERMISSIONS || {};
                                allRemotePerms[username] = parsedData.remotePermissions;
                                savePersistentSettings({ REMOTE_PERMISSIONS: allRemotePerms });
                            }
                        }


                        resolve(parsedData);
                    }
                    catch (e) {
                        console.error("License check local error:", e);
                        resolve({ success: false });
                    }
                });
            });
            request.on('error', (err) => reject(err));
            request.write(JSON.stringify({
                method: 'check_license',
                username: username,
                contactNumber: rawContacts
            }));
            request.end();
        });
        return responseData;
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('show-whats-new', () => {
    if (whatsNewWindow && !whatsNewWindow.isDestroyed()) {
        if (whatsNewWindow.isMinimized()) whatsNewWindow.restore();
        whatsNewWindow.focus();
        return { success: true };
    }

    whatsNewWindow = new BrowserWindow({
        width: 900,
        height: 700,
        title: "What's New",
        icon: path.join(__dirname, 'logo.png'),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    whatsNewWindow.loadFile('whatsnew.html');
    whatsNewWindow.removeMenu();

    whatsNewWindow.on('closed', () => {
        whatsNewWindow = null;
    });

    return { success: true };
});

// --- LOCAL BACKUP MANAGEMENT ---
function cleanupOldBackups(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) return;

        const files = fs.readdirSync(dirPath);
        const now = Date.now();
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

        files.forEach(file => {
            if ((file.startsWith("AllData-") || file.startsWith("Backup_") || file.startsWith("AutoBackup-") || file.startsWith("DB_Backup_")) && file.endsWith(".json")) {
                const filePath = path.join(dirPath, file);
                try {
                    const stats = fs.statSync(filePath);
                    if (now - stats.mtimeMs > thirtyDaysInMs) {
                        fs.unlinkSync(filePath);
                        console.log(`Deleted old backup: ${file}`);
                    }
                } catch (e) { console.error(`Failed to delete ${file}:`, e); }
            }
        });
    } catch (err) { console.error("Error cleaning up backups:", err); }
}

ipcMain.handle('save-local-backup', async (event, { fileName, data }) => {
    try {
        const documentsPath = app.getPath('documents');

        // Get company name from settings or default to RISE Tech Revolution
        const settings = getPersistentSettings();
        const safeCompanyName = (settings.COMPANY_NAME || "RISE Tech Revolution").replace(/[^a-z0-9]/gi, '_');
        const backupDir = path.join(documentsPath, `${safeCompanyName}_Backups`);

        if (!fs.existsSync(backupDir)) { fs.mkdirSync(backupDir, { recursive: true }); }

        const filePath = path.join(backupDir, fileName);
        fs.writeFileSync(filePath, data, 'utf-8');

        // Trigger cleanup
        cleanupOldBackups(backupDir);

        return { success: true, path: filePath };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// --- LOCAL DATABASE (JSON FILE) ---
// This saves to: C:\Users\<User>\AppData\Roaming\rise-tech-revolution\app_database.json (on Windows)

function performDailyDatabaseBackup() {
    try {
        if (!fs.existsSync(localDbPath)) return; // No DB to backup yet

        const documentsPath = app.getPath('documents');
        const settings = getPersistentSettings();
        const safeCompanyName = (settings.COMPANY_NAME || "RISE Tech Revolution").replace(/[^a-z0-9]/gi, '_');

        // Create a specific sub-folder for Database Backups
        const backupDir = path.join(documentsPath, `${safeCompanyName}_Backups`, 'Database_Backups');
        if (!fs.existsSync(backupDir)) { fs.mkdirSync(backupDir, { recursive: true }); }

        const today = new Date().toISOString().split('T')[0]; // Format: DD-MM-YYYY
        const backupFilePath = path.join(backupDir, `DB_Backup_${today}.json`);

        // If today's backup doesn't exist, safely copy the DB file
        if (!fs.existsSync(backupFilePath)) {
            fs.copyFileSync(localDbPath, backupFilePath);
            cleanupOldBackups(backupDir); // Clean up backups older than 30 days
        }
    } catch (e) { console.error("Daily DB backup failed:", e); }
}

ipcMain.handle('trigger-database-backup', async () => {
    try {
        if (!fs.existsSync(localDbPath)) return { success: false, message: "No database file exists yet." };

        const documentsPath = app.getPath('documents');
        const settings = getPersistentSettings();
        const safeCompanyName = (settings.COMPANY_NAME || "RISE Tech Revolution").replace(/[^a-z0-9]/gi, '_');

        const backupDir = path.join(documentsPath, `${safeCompanyName}_Backups`, 'Database_Backups');
        if (!fs.existsSync(backupDir)) { fs.mkdirSync(backupDir, { recursive: true }); }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFilePath = path.join(backupDir, `DB_Backup_Manual_${timestamp}.json`);

        fs.copyFileSync(localDbPath, backupFilePath);
        cleanupOldBackups(backupDir);
        return { success: true, path: backupFilePath };
    } catch (e) { return { success: false, message: e.message }; }
});

ipcMain.handle('restore-database', async (event, jsonContent) => {
    try {
        JSON.parse(jsonContent); // Validate JSON format
        fs.writeFileSync(localDbPath, jsonContent, 'utf-8');
        return { success: true };
    } catch (e) { return { success: false, message: e.message }; }
});

ipcMain.handle('db-read', async (event, key) => {
    const db = readLocalDatabase();
    return key ? db[key] : db;
});

ipcMain.handle('db-write', async (event, key, value) => {
    return { success: writeToLocalDatabase(key, value) };
});

// --- SCHEDULED CLOUD BACKUP ---
async function performDailyCloudBackup() {
    try {
        const settings = getPersistentSettings();
        const lastCloudBackup = settings.LAST_CLOUD_BACKUP_TIME || 0;
        const now = Date.now();

        // 24 hours = 24 * 60 * 60 * 1000 = 86400000 ms
        if (now - lastCloudBackup > 86400000) {
            const windows = BrowserWindow.getAllWindows();
            if (windows.length === 0) return;
            const win = windows[0]; // grab the active renderer

            const storageJson = await win.webContents.executeJavaScript(`
                (function() {
                    const data = {};
                    if (typeof localStorage !== 'undefined') {
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            data[key] = localStorage.getItem(key);
                        }
                    }
                    return JSON.stringify(data);
                })()
            `);

            const storage = JSON.parse(storageJson);
            const cloudUrl = storage.cloudBackupUrl;

            if (cloudUrl && cloudUrl.startsWith('http')) {
                await new Promise((resolve) => {
                    const request = net.request({
                        method: 'POST',
                        url: cloudUrl,
                        headers: { 'Content-Type': 'text/plain' }
                    });
                    request.on('response', (response) => {
                        response.on('data', () => { }); // Consume data
                        response.on('end', resolve);
                    });
                    request.on('error', (err) => {
                        console.error("Scheduled Cloud Backup failed:", err);
                        resolve();
                    });

                    request.write(JSON.stringify({ method: "drive", ...storage }));
                    request.end();
                    setTimeout(resolve, 10000); // 10s Timeout
                });

                // Update the tracked last backup time
                savePersistentSettings({ LAST_CLOUD_BACKUP_TIME: now });
                console.log("Scheduled Cloud Backup completed successfully.");
            }
        }
    } catch (err) {
        console.error("Scheduled Cloud Backup error:", err);
    }
}


function startHeartbeat(username) {
    // Replace this with your actual deployed Google Apps Script Web App URL
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxnbOTetUcmv22txVFGCb8pHkZI3snpimqMtcdZWvVRv-z2x4bHfVC0K2AxlOXvz8C4/exec";

    // Ping the server every 2 minutes (120,000 milliseconds)
    setInterval(() => {
        fetch(SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
                method: "heartbeat",
                username: username // e.g., "Milan"
            })
        }).catch(err => console.error("Heartbeat failed:", err));
    }, 120000);
}

// Example: Trigger this right after your license check passes
// startHeartbeat("Milan");