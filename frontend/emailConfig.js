const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Check if running in development mode (not packaged)
const isDev = !app.isPackaged;

// FIXED EMAIL (Optional: Override for specific builds if needed)
const FIXED_ADMIN_EMAIL = null;

// Development Configuration (Used when running 'electron .')
const devConfig = {
    service: 'gmail',
    auth: {
        user: 'dev-test@gmail.com', // TODO: Replace with your Dev Email
        pass: 'dev-app-password'    // TODO: Replace with your Dev App Password
    }
};

/**
 * Returns email configuration based on the current environment.
 */
function getEmailConfig() {
    // 1. Return Dev Config if in Dev Mode
    if (isDev) {
        // console.log('📧 Using Development Email Configuration');
        return devConfig;
    }

    // 2. Production: Load from settings.json in User Data folder
    try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

            let user = (settings.ADMIN_EMAIL || '').trim();
            const pass = (settings.ADMIN_EMAIL_PASS || '').trim();

            // Apply Fixed Email Override if set
            if (FIXED_ADMIN_EMAIL) {
                user = FIXED_ADMIN_EMAIL;
            }

            return {
                service: 'gmail',
                auth: { user, pass }
            };
        }
    } catch (error) {
        console.error("Error loading production email settings:", error);
    }

    // Fallback empty config
    return { service: 'gmail', auth: { user: '', pass: '' } };
}

module.exports = getEmailConfig;