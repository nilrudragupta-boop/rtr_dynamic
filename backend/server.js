require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const { Customer, Invoice, Item, Supplier, Purchase, CreditDebitNote, BankAccount, BankTransaction, JournalVoucher, Scrap, Production, Expense, Employee, CustomField, CustomRecord } = require('./index');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const simpleParser = require('mailparser').simpleParser;

const app = express();
// Render will supply process.env.PORT, otherwise it falls back to 5000 locally
const PORT = process.env.PORT || 5000;

// --- Middleware ---
// Allow cross-origin requests from your frontend
app.use(cors());
// Parse incoming JSON requests. Increased limit to 50mb to handle base64 attachments/images.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy to get accurate client IP addresses if hosted on platforms like Render or Heroku
app.set('trust proxy', true);

// Serve static files (HTML, CSS, JS, Images) from the frontend directory
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Redirect the root URL to your login page
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'login.html'));
});

// --- Database Connection ---
// Create a .env file in your root folder and add your MongoDB Atlas connection string:
// MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/rtr_database

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Successfully connected to MongoDB');
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err);
    });

// --- Admin Credentials Model ---
const adminCredsSchema = new mongoose.Schema({
    id: { type: String, default: 'global_creds', unique: true },
    adminUser: String,
    adminEmail: String,
    adminEmailPass: String,
    adminPass: String,
    adminUsers: { type: Array, default: [{ username: "Admin", password: "", role: "Admin" }] },
    emailProvider: String,
    smtpHost: String,
    smtpPort: String,
    imapHost: String,
    imapPort: String
});
const AdminCreds = mongoose.model('AdminCreds', adminCredsSchema);

// --- API Routes ---
app.get('/api/status', (req, res) => {
    res.json({ success: true, message: 'RTR Backend API is running successfully!' });
});

// --- Admin Creds Routes (Login Validation) ---
app.get('/api/admin-creds', async (req, res) => {
    try {
        const creds = await AdminCreds.findOne({ id: 'global_creds' });
        if (creds) {
            res.json({ success: true, ...creds.toObject() });
        } else {
            // Fallback for new databases
            res.json({ success: true, adminUsers: [{ username: "Admin", password: "", role: "Admin" }] });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin-creds', async (req, res) => {
    try {
        const payload = req.body;
        const updated = await AdminCreds.findOneAndUpdate({ id: 'global_creds' }, payload, { new: true, upsert: true });
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// --- Customer Routes ---
// Fetch all customers
app.get('/api/customers', async (req, res) => {
    try {
        const customers = await Customer.find().sort({ createdAt: -1 }); // Newest first
        res.json({ success: true, data: customers });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Create a new customer
app.post('/api/customers', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await Customer.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newCustomer = new Customer(payload);
            await newCustomer.save();
            res.status(201).json({ success: true, data: newCustomer });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// --- Invoice Routes ---
// Fetch all invoices
app.get('/api/invoices', async (req, res) => {
    try {
        const invoices = await Invoice.find().sort({ date: -1 }); // Newest date first
        res.json({ success: true, data: invoices });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Create a new invoice
app.post('/api/invoices', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.invoice_no || payload.invoiceNo) {
            // Update existing invoice
            const updated = await Invoice.findOneAndUpdate({ invoiceNo: payload.invoice_no || payload.invoiceNo }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newInvoice = new Invoice(payload);
            await newInvoice.save();
            res.status(201).json({ success: true, data: newInvoice });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/invoices/:id', async (req, res) => {
    try {
        await Invoice.findOneAndDelete({ $or: [{ id: req.params.id }, { invoiceNo: req.params.id }, { invoice_no: req.params.id }] });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Supplier Routes ---
app.get('/api/suppliers', async (req, res) => {
    try {
        const suppliers = await Supplier.find().sort({ createdAt: -1 });
        res.json({ success: true, data: suppliers });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/suppliers', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await Supplier.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newSupplier = new Supplier(payload);
            await newSupplier.save();
            res.status(201).json({ success: true, data: newSupplier });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        await Supplier.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Item Routes ---
app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find().sort({ createdAt: -1 });
        res.json({ success: true, data: items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/items', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await Item.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newItem = new Item(payload);
            await newItem.save();
            res.status(201).json({ success: true, data: newItem });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/items/:id', async (req, res) => {
    try {
        await Item.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Purchase Routes ---
app.get('/api/purchases', async (req, res) => {
    try {
        const purchases = await Purchase.find().sort({ date: -1 });
        res.json({ success: true, data: purchases });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/purchases', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await Purchase.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newPurchase = new Purchase(payload);
            await newPurchase.save();
            res.status(201).json({ success: true, data: newPurchase });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/purchases/:id', async (req, res) => {
    try {
        await Purchase.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Credit/Debit Note Routes ---
app.get('/api/credit-debit-notes', async (req, res) => {
    try {
        const notes = await CreditDebitNote.find().sort({ date: -1 });
        res.json({ success: true, data: notes });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/credit-debit-notes', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await CreditDebitNote.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newNote = new CreditDebitNote(payload);
            await newNote.save();
            res.status(201).json({ success: true, data: newNote });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/credit-debit-notes/:id', async (req, res) => {
    try {
        await CreditDebitNote.findOneAndDelete({ $or: [{ id: req.params.id }, { noteNo: req.params.id }, { note_no: req.params.id }] });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Bank Account Routes ---
app.get('/api/bank-accounts', async (req, res) => {
    try {
        const accounts = await BankAccount.find().sort({ createdAt: -1 });
        res.json({ success: true, data: accounts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/bank-accounts', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await BankAccount.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newAccount = new BankAccount(payload);
            await newAccount.save();
            res.status(201).json({ success: true, data: newAccount });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/bank-accounts/:id', async (req, res) => {
    try {
        await BankAccount.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Bank Transaction Routes ---
app.get('/api/bank-transactions', async (req, res) => {
    try {
        const transactions = await BankTransaction.find().sort({ date: -1 });
        res.json({ success: true, data: transactions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/bank-transactions', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await BankTransaction.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newTx = new BankTransaction(payload);
            await newTx.save();
            res.status(201).json({ success: true, data: newTx });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/bank-transactions/:id', async (req, res) => {
    try {
        await BankTransaction.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Journal Voucher Routes ---
app.get('/api/journal-vouchers', async (req, res) => {
    try {
        const vouchers = await JournalVoucher.find().sort({ date: -1 });
        res.json({ success: true, data: vouchers });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/journal-vouchers', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await JournalVoucher.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newVoucher = new JournalVoucher(payload);
            await newVoucher.save();
            res.status(201).json({ success: true, data: newVoucher });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/journal-vouchers/:id', async (req, res) => {
    try {
        await JournalVoucher.findOneAndDelete({ $or: [{ id: req.params.id }, { voucher_no: req.params.id }] });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Scrap Routes ---
app.get('/api/scraps', async (req, res) => {
    try {
        const scraps = await Scrap.find().sort({ createdAt: -1 });
        res.json({ success: true, data: scraps });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/scraps', async (req, res) => {
    try {
        const payload = req.body;
        // Use upsert to create or update based on a unique 'id'
        const updated = await Scrap.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/scraps/:id', async (req, res) => {
    try {
        await Scrap.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Production Routes ---
// This is read-only for the scrap page's stock calculation
app.get('/api/production', async (req, res) => {
    try {
        const productions = await Production.find().sort({ date: -1 });
        res.json({ success: true, data: productions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Expense Routes ---
app.get('/api/expenses', async (req, res) => {
    try {
        const expenses = await Expense.find().sort({ createdAt: -1 });
        res.json({ success: true, data: expenses });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/expenses', async (req, res) => {
    try {
        const payload = req.body;
        const lookupId = payload.expense_id || payload.id;
        if (lookupId) {
            const updated = await Expense.findOneAndUpdate({ $or: [{ id: lookupId }, { expense_id: lookupId }] }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newExpense = new Expense(payload);
            await newExpense.save();
            res.status(201).json({ success: true, data: newExpense });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/expenses/:id', async (req, res) => {
    try {
        await Expense.findOneAndDelete({ $or: [{ id: req.params.id }, { expense_id: req.params.id }] });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Employee Routes ---
app.get('/api/employees', async (req, res) => {
    try {
        const employees = await Employee.find().sort({ createdAt: -1 });
        res.json({ success: true, data: employees });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/employees', async (req, res) => {
    try {
        const payload = req.body;
        if (payload.id) {
            const updated = await Employee.findOneAndUpdate({ id: payload.id }, payload, { new: true, upsert: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newEmployee = new Employee(payload);
            await newEmployee.save();
            res.status(201).json({ success: true, data: newEmployee });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/employees/:id', async (req, res) => {
    try {
        await Employee.findOneAndDelete({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Custom Field Routes ---
app.get('/api/custom-fields', async (req, res) => {
    try {
        const fields = await CustomField.find().sort({ moduleName: 1, order: 1 });
        res.json({ success: true, data: fields });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/custom-fields', async (req, res) => {
    try {
        const payload = req.body;
        if (payload._id) {
            const updated = await CustomField.findByIdAndUpdate(payload._id, payload, { new: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newField = new CustomField(payload);
            await newField.save();
            res.status(201).json({ success: true, data: newField });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/custom-fields/:id', async (req, res) => {
    try {
        await CustomField.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/custom-fields/reorder', async (req, res) => {
    try {
        const updates = req.body; // Expecting array of [{_id, order}]
        const bulkOps = updates.map(update => ({
            updateOne: {
                filter: { _id: update._id },
                update: { $set: { order: update.order } }
            }
        }));
        await CustomField.bulkWrite(bulkOps);
        res.json({ success: true, message: 'Order updated successfully.' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- Generic Custom Records Routes (For entirely new UI Pages) ---
app.get('/api/custom-records/:module', async (req, res) => {
    try {
        const records = await CustomRecord.find({ moduleName: req.params.module }).sort({ createdAt: -1 });
        res.json({ success: true, data: records });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/custom-records', async (req, res) => {
    try {
        const payload = req.body;
        if (payload._id) {
            const updated = await CustomRecord.findByIdAndUpdate(payload._id, payload, { new: true });
            res.status(200).json({ success: true, data: updated });
        } else {
            const newRecord = new CustomRecord(payload);
            await newRecord.save();
            res.status(201).json({ success: true, data: newRecord });
        }
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/custom-records/:id', async (req, res) => {
    try {
        await CustomRecord.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- System Info & Security Fingerprinting ---
// Replaces Electron's os.cpus(), os.networkInterfaces() and MAC address tracking
app.post('/api/system-info', (req, res) => {
    // 1. IP Address
    const clientIp = req.ip || req.socket.remoteAddress;

    // 2. User-Agent (Browser, OS, and Device details)
    const userAgent = req.headers['user-agent'] || 'Unknown Browser';

    // 3. Client-side details sent from the frontend (Screen size, Timezone, Language)
    const { screenWidth, screenHeight, timeZone, language } = req.body;

    // Create a unique fingerprint string
    const rawFingerprint = `${clientIp}-${userAgent}-${screenWidth}x${screenHeight}-${timeZone}-${language}`;

    // Optional: Hash the fingerprint for a clean ID
    const fingerprintId = require('crypto').createHash('sha256').update(rawFingerprint).digest('hex').substring(0, 16);

    res.json({
        success: true,
        data: {
            fingerprintId,
            ip: clientIp,
            userAgent,
            resolution: screenWidth && screenHeight ? `${screenWidth}x${screenHeight}` : 'Unknown',
            timeZone: timeZone || 'Unknown',
            language: language || 'Unknown'
        }
    });
});

// --- Web Authentication & OTP (Replaces Electron IPC) ---
app.post('/api/auth/login', (req, res) => {
    const { username } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;

    // Log to console or future DB collection
    console.log(`[AUTH] User '${username}' logged in from IP: ${clientIp}`);
    res.json({ success: true, message: "Login tracked" });
});

// --- Secure OTP Nodemailer Transporter ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

// In-memory store for active OTPs (Use Redis or MongoDB if you scale to multiple servers)
const otpStore = new Map();

app.post('/api/request-otp', async (req, res) => {
    const { action, email } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;

    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP securely with a 10-minute expiration
    otpStore.set(email, { otp, action, expires: Date.now() + 10 * 60 * 1000 });

    try {
        await transporter.sendMail({
            from: `"Security Alert" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `🔐 Security Verification: ${action}`,
            text: `Your security verification OTP for the action "${action}" is: ${otp}\n\nRequest Source: IP ${clientIp}\n\nThis OTP is valid for 10 minutes.`
        });
        console.log(`[OTP] Sent OTP ${otp} to ${email} (Action: ${action}, IP: ${clientIp})`);
        res.json({ success: true, targetEmail: email, message: "OTP sent successfully to your email." });
    } catch (error) {
        console.error("[OTP] Error sending email:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP email. Please check server configuration." });
    }
});

// Verify OTP Route
app.post('/api/verify-otp', (req, res) => {
    const { action, email, otp } = req.body;
    const record = otpStore.get(email);

    if (!record || record.action !== action) return res.status(400).json({ success: false, message: "Invalid or expired OTP request." });
    if (Date.now() > record.expires) {
        otpStore.delete(email);
        return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }
    if (record.otp === otp) {
        otpStore.delete(email); // Clear upon success
        return res.json({ success: true, message: "OTP verified successfully." });
    }
    res.status(400).json({ success: false, message: "Incorrect OTP." });
});

// --- Renewal OTP Routes ---
app.post('/api/request-renewal-otp', async (req, res) => {
    const { adminId, renewalCode, duration, amount, currentExpiry } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;

    // Hardcoded security check matching main.js
    if (adminId !== "NANCY@2012") {
        return res.status(400).json({ success: false, message: "Invalid Admin ID." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set('RENEWAL_' + clientIp, { otp, duration, currentExpiry, expires: Date.now() + 10 * 60 * 1000 });

    try {
        await transporter.sendMail({
            from: `"Security Alert" <${process.env.EMAIL_USER}>`,
            to: process.env.DEVELOPER_EMAIL || 'nilrudragupta@gmail.com',
            subject: `🔐 Renewal OTP Request: ${renewalCode}`,
            text: `Admin Renewal Request Initiated.\n\nOTP: ${otp}\n\nRenewal Code: ${renewalCode}\nDuration: ${duration} days\nAmount: ${amount}\nIP: ${clientIp}\nCurrent Expiry: ${currentExpiry}\n\nThis OTP is valid for 10 minutes.`
        });
        res.json({ success: true, message: "Renewal OTP sent to Developer." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to send Renewal OTP email." });
    }
});

app.post('/api/verify-renewal-otp', (req, res) => {
    const { otp } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;
    const record = otpStore.get('RENEWAL_' + clientIp);

    if (!record) return res.status(400).json({ success: false, message: "Invalid or expired OTP request." });
    if (Date.now() > record.expires) {
        otpStore.delete('RENEWAL_' + clientIp);
        return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }
    if (record.otp === otp) {
        otpStore.delete('RENEWAL_' + clientIp); // Clear upon success

        let baseDate = new Date();
        if (record.currentExpiry) {
            const parsedExpiry = new Date(record.currentExpiry);
            if (!isNaN(parsedExpiry.getTime()) && parsedExpiry > baseDate) {
                baseDate = parsedExpiry;
            }
        }

        const newExpiryDate = new Date(baseDate);
        newExpiryDate.setDate(newExpiryDate.getDate() + parseInt(record.duration || 370));

        return res.json({ success: true, newExpiry: newExpiryDate.toISOString(), message: "License Renewed Successfully!" });
    }
    res.status(400).json({ success: false, message: "Incorrect OTP." });
});

// --- IMAP Email Routes ---
app.get('/api/emails/inbox', async (req, res) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
        return res.status(400).json({ success: false, error: "Server email configuration is missing." });
    }

    const client = new ImapFlow({
        host: process.env.IMAP_HOST || 'imap.gmail.com',
        port: parseInt(process.env.IMAP_PORT) || 993,
        secure: (parseInt(process.env.IMAP_PORT) || 993) === 993,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD },
        logger: false
    });

    try {
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
        res.json({ success: true, emails });
    } catch (error) {
        console.error("IMAP Fetch Error:", error);
        if (error.message && error.message.includes('AUTHENTICATIONFAILED')) {
            return res.status(401).json({ success: false, error: "Authentication failed. Check your server App Password." });
        }
        res.status(500).json({ success: false, error: "Failed to fetch Inbox: " + error.message });
    }
});

app.get('/api/emails/unread-count', async (req, res) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) return res.json({ success: false });

    const client = new ImapFlow({ host: process.env.IMAP_HOST || 'imap.gmail.com', port: 993, secure: true, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD }, logger: false });
    try {
        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        let unread = 0;
        try { const list = await client.search({ seen: false }); unread = list ? list.length : 0; } finally { lock.release(); }
        await client.logout();
        res.json({ success: true, unread });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/emails/mark-read', async (req, res) => {
    const { uid } = req.body;
    if (!uid || !process.env.EMAIL_USER) return res.json({ success: false });
    const client = new ImapFlow({ host: process.env.IMAP_HOST || 'imap.gmail.com', port: 993, secure: true, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD }, logger: false });
    try {
        await client.connect(); let lock = await client.getMailboxLock('INBOX');
        try { await client.messageFlagsAdd({ uid: uid }, ['\\Seen'], { uid: true }); } finally { lock.release(); }
        await client.logout(); res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});