const mongoose = require('mongoose');

// --- 1. Customer Schema ---
const customerSchema = new mongoose.Schema({
    id: String,
    name: { type: String, required: true },
    address: String,
    district: String,
    state: String,
    pin: String,
    contact: String,
    email: String,
    gstin: String,
    openingBalance: { type: Number, default: 0 },
    openingBalanceType: { type: String, enum: ['Dr', 'Cr'], default: 'Dr' } // Dr = Receivable, Cr = Advance
}, { timestamps: true, strict: false });

// --- 8. Bank Account Schema ---
const bankAccountSchema = new mongoose.Schema({
    id: String,
    type: String,
    category: String,
    name: String,
    number: String,
    holderName: String,
    ifsc: String,
    openingBalance: Number,
    openingDate: String,
    isPrimary: Boolean
}, { timestamps: true, strict: false });

// --- 9. Bank Transaction Schema ---
const bankTransactionSchema = new mongoose.Schema({
    id: String,
    date: String,
    type: String,
    amount: Number,
    accountId: String,
    toAccountId: String,
    ref: String,
    remarks: String,
    beneficiary: Object,
    cleared: Boolean
}, { timestamps: true, strict: false });


// --- 2. Supplier Schema ---
const supplierSchema = new mongoose.Schema({
    id: String,
    name: { type: String },
    address: String,
    contact: String,
    email: String,
    gstin: String,
    openingBalance: { type: Number, default: 0 },
    openingBalanceType: { type: String, enum: ['Dr', 'Cr'], default: 'Cr' } // Cr = Payable, Dr = Advance
}, { timestamps: true, strict: false });

// --- 3. Item (Inventory) Schema ---
const itemSchema = new mongoose.Schema({
    id: String,
    itemCode: String,
    category: String,
    description: String,
    itemType: String,
    imei: String,
    batch: String,
    lot: String,
    serial: String,
    name: { type: String },
    hsnCode: String,
    unit: String,
    purchasePrice: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    openingStock: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 }
}, { timestamps: true, strict: false });

// --- 4. Invoice Schema ---
const invoiceSchema = new mongoose.Schema({
    invoiceNo: { type: String },
    date: { type: Date },
    customerName: String,
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    items: [],
    taxType: String, // e.g. IGST or Intra-State
    subTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    invoiceTotal: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    status: { type: String, default: 'UNPAID' }, // PAID, UNPAID, PARTIAL, CANCELLED
    remarks: String
}, { timestamps: true, strict: false });

// --- 5. Purchase Schema ---
const purchaseSchema = new mongoose.Schema({
    id: String,
    purchaseNo: String,
    supplierInv: String,
    date: { type: String, required: true },
    supplierName: String,
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    items: [], // Array of purchased items similar to invoice items
    totalAmount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    remarks: String
}, { timestamps: true, strict: false });

// --- 6. Journal Voucher Schema ---
const journalVoucherSchema = new mongoose.Schema({
    id: String,
    voucherNo: { type: String },
    voucherType: String,
    date: String,
    entries: [], // Array of ledger entries
    narration: String
}, { timestamps: true, strict: false });

// --- 7. Credit & Debit Note Schema ---
const creditDebitNoteSchema = new mongoose.Schema({
    id: String,
    noteNo: { type: String, required: true },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    invoiceNo: String,
    date: String,
    customerName: String,
    reason: String,
    taxableAmount: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    totalAmount: Number,
    status: { type: String, default: 'ACTIVE' }
}, { timestamps: true, strict: false });

// --- Scrap Schema ---
const scrapSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    date: String,
    itemName: String,
    uom: String,
    qty: Number,
    reason: String,
    remarks: String,
}, { timestamps: true, strict: false });

// --- Production Schema ---
const productionSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    date: String,
    stage: String, // e.g., 'WIP', 'Completed'
    finishedGood: String,
    materialsConsumed: Array,
}, { timestamps: true, strict: false });

// --- Expense Schema ---
const expenseSchema = new mongoose.Schema({
    id: { type: String }
}, { timestamps: true, strict: false });

// --- Employee Schema ---
const employeeSchema = new mongoose.Schema({
    id: { type: String }
}, { timestamps: true, strict: false });

// --- Dynamic Field Definition Schema ---
const customFieldSchema = new mongoose.Schema({
    moduleName: { type: String, required: true }, // e.g., 'Customer', 'Invoice', 'Item'
    fieldName: { type: String, required: true },  // internal key (e.g., 'blood_group')
    fieldLabel: { type: String, required: true }, // UI Label (e.g., 'Blood Group')
    fieldType: { type: String, enum: ['text', 'number', 'date', 'select', 'boolean'], default: 'text' },
    options: [String], // for 'select' type (e.g., ['A+', 'O+', 'B-'])
    isRequired: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
}, { timestamps: true });

// --- Generic Custom Record Schema (For entirely new UI Pages) ---
const customRecordSchema = new mongoose.Schema({
    moduleName: { type: String, required: true, index: true }
}, { timestamps: true, strict: false });

module.exports = {
    Customer: mongoose.model('Customer', customerSchema),
    Supplier: mongoose.model('Supplier', supplierSchema),
    Item: mongoose.model('Item', itemSchema),
    Invoice: mongoose.model('Invoice', invoiceSchema),
    Purchase: mongoose.model('Purchase', purchaseSchema),
    JournalVoucher: mongoose.model('JournalVoucher', journalVoucherSchema),
    CreditDebitNote: mongoose.model('CreditDebitNote', creditDebitNoteSchema),
    BankAccount: mongoose.model('BankAccount', bankAccountSchema),
    BankTransaction: mongoose.model('BankTransaction', bankTransactionSchema),
    Scrap: mongoose.model('Scrap', scrapSchema),
    Production: mongoose.model('Production', productionSchema),
    Expense: mongoose.model('Expense', expenseSchema),
    Employee: mongoose.model('Employee', employeeSchema),
    CustomField: mongoose.model('CustomField', customFieldSchema),
    CustomRecord: mongoose.model('CustomRecord', customRecordSchema)
};