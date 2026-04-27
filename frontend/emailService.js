const nodemailer = require('nodemailer');
const getEmailConfig = require('./emailConfig');

/**
 * Sends a payment confirmation email to the client.
 * 
 * @param {string} clientEmail - The recipient's email address.
 * @param {object} paymentDetails - Object containing { amount, transactionId, customerName }.
 * @returns {Promise} - Resolves with info object if successful.
 */
async function sendPaymentConfirmation(clientEmail, paymentDetails) {
    if (!clientEmail) {
        console.log('No client email provided, skipping confirmation email.');
        return;
    }

    // Get fresh config based on environment (Dev/Prod)
    const config = getEmailConfig();
    const transporter = nodemailer.createTransport(config);

    const mailOptions = {
        from: `"Admin" <${config.auth.user}>`,
        to: clientEmail,
        subject: 'Payment Received - Confirmation',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #2c3e50;">Payment Confirmation</h2>
                <p>Dear ${paymentDetails.customerName || 'Client'},</p>
                <p>We have successfully received your payment. Below are the details:</p>
                
                <table style="width: 100%; max-width: 500px; border-collapse: collapse; margin-top: 15px;">
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Amount Paid:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;">₹${paymentDetails.amount}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Transaction ID:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${paymentDetails.transactionId || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Date:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date().toLocaleDateString()}</td>
                    </tr>
                </table>
                
                <p style="margin-top: 20px;">Thank you for your business!</p>
            </div>
        `
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log('Payment confirmation email sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending payment confirmation email:', error);
        throw error;
    }
}

module.exports = { sendPaymentConfirmation };