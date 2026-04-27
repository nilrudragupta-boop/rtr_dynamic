/**
 * CreditDebitService.js
 * Handles business logic for GST-compliant Credit and Debit Notes.
 */

class CreditDebitService {
    constructor() {
        // Predefined reasons for Credit/Debit Notes
        this.defaultReasons = [
            "Sales Return",
            "Post Sale Discount",
            "Deficiency in Service",
            "Correction in Invoice",
            "Change in POS",
            "Finalization of Provisional Assessment",
            "Others"
        ];
    }

    /**
     * Get list of reasons (User defined or Default)
     */
    getReasons() {
        const stored = localStorage.getItem('cdn_reasons');
        return stored ? JSON.parse(stored) : [...this.defaultReasons];
    }

    saveReasons(reasons) {
        localStorage.setItem('cdn_reasons', JSON.stringify(reasons));
    }

    /**
     * Generates a new Note Number (e.g., CN/23-24/0001)
     * Resets sequence every financial year.
     * @param {string} type - 'CREDIT' or 'DEBIT'
     * @param {Array} existingNotes - List of all existing notes to find the last sequence
     */
    generateNoteNumber(type, existingNotes) {
        const prefix = type === 'CREDIT' ? 'CN' : 'DN';
        const today = new Date();
        const month = today.getMonth() + 1; // 1-12
        const year = today.getFullYear();

        // Calculate Financial Year (e.g., 23-24)
        let fyStart = month >= 4 ? year : year - 1;
        let fyEnd = (fyStart + 1).toString().slice(-2);
        const fyString = `${fyStart.toString().slice(-2)}-${fyEnd}`;

        const pattern = new RegExp(`^${prefix}/${fyString}/(\\d{4})$`);

        let maxSeq = 0;
        existingNotes.forEach(note => {
            const match = note.note_no.match(pattern);
            if (match) {
                const seq = parseInt(match[1], 10);
                if (seq > maxSeq) maxSeq = seq;
            }
        });

        const newSeq = (maxSeq + 1).toString().padStart(4, '0');
        return `${prefix}/${fyString}/${newSeq}`;
    }

    /**
     * Calculates tax details for the note based on the original invoice structure.
     * @param {number} taxableAmount - The amount being adjusted
     * @param {object} originalInvoice - The invoice object to inherit tax rates from
     * @returns {object} - { cgst, sgst, igst, total }
     */
    calculateTax(taxableAmount, originalInvoice) {
        // Detect Tax Type from original invoice
        const isInterState = (originalInvoice.igst_total > 0) ||
            (originalInvoice.tax_type === 'IGST') ||
            (originalInvoice.gstType === 'Inter-State');

        // Derive rate from invoice items or header (simplified logic)
        // Assuming average rate or taking from first item if not stored globally
        // For precise calculation, this should be done per-item in the UI
        let taxRate = 0;
        if (originalInvoice.items && originalInvoice.items.length > 0) {
            // Use the highest tax rate found in invoice for safety, or pass specific rate
            taxRate = Math.max(...originalInvoice.items.map(i => parseFloat(i.gst || i.gst_rate || 0)));
        }

        let cgst = 0, sgst = 0, igst = 0;

        if (isInterState) {
            igst = taxableAmount * (taxRate / 100);
        } else {
            cgst = taxableAmount * ((taxRate / 2) / 100);
            sgst = taxableAmount * ((taxRate / 2) / 100);
        }

        return {
            taxable_amount: taxableAmount,
            gst_rate: taxRate,
            cgst: parseFloat(cgst.toFixed(2)),
            sgst: parseFloat(sgst.toFixed(2)),
            igst: parseFloat(igst.toFixed(2)),
            total_amount: parseFloat((taxableAmount + cgst + sgst + igst).toFixed(2))
        };
    }

    /**
     * Validates if a Credit Note can be created.
     * @param {object} invoice - Original Invoice
     * @param {number} noteAmount - Amount of the new note
     * @param {Array} existingNotes - All notes linked to this invoice
     * @returns {object} { valid: boolean, message: string }
     */
    validateCreditNote(invoice, noteAmount, existingNotes) {
        if (invoice.status === 'CANCELLED') {
            return { valid: false, message: "Cannot create note for a cancelled invoice." };
        }

        const invoiceTotal = parseFloat(invoice.invoice_total || invoice.total || 0);

        // Sum existing ACTIVE Credit Notes
        const existingCNTotal = existingNotes
            .filter(n => n.type === 'CREDIT' && n.status !== 'CANCELLED' && n.invoice_no === invoice.invoice_no)
            .reduce((sum, n) => sum + parseFloat(n.total_amount), 0);

        // Sum existing ACTIVE Debit Notes (Debit notes increase the limit technically, but usually we cap at invoice value for return)
        // However, strictly speaking, you cannot return more than you bought.

        if ((existingCNTotal + noteAmount) > invoiceTotal) {
            return {
                valid: false,
                message: `Total Credit Notes (₹${existingCNTotal + noteAmount}) cannot exceed Invoice Value (₹${invoiceTotal}).`
            };
        }

        return { valid: true };
    }

    /**
     * Checks if a Note Number already exists to prevent duplicates.
     * @param {string} noteNo - The note number to check
     * @param {Array} existingNotes - List of all existing notes
     * @returns {boolean} - True if exists, False otherwise
     */
    isDuplicateNoteNumber(noteNo, existingNotes) {
        if (!noteNo) return false;
        return existingNotes.some(n => n.note_no.trim().toLowerCase() === noteNo.trim().toLowerCase());
    }

    /**
     * Converts a number to words (Indian Rupee format)
     */
    convertNumberToWords(amount) {
        var a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        var b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        function numToWords(n) {
            if ((n = n.toString()).length > 9) return 'overflow';
            var n_array = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
            if (!n_array) return;
            var str = '';
            str += (n_array[1] != 0) ? (a[Number(n_array[1])] || b[n_array[1][0]] + ' ' + a[n_array[1][1]]) + 'Crore ' : '';
            str += (n_array[2] != 0) ? (a[Number(n_array[2])] || b[n_array[2][0]] + ' ' + a[n_array[2][1]]) + 'Lakh ' : '';
            str += (n_array[3] != 0) ? (a[Number(n_array[3])] || b[n_array[3][0]] + ' ' + a[n_array[3][1]]) + 'Thousand ' : '';
            str += (n_array[4] != 0) ? (a[Number(n_array[4])] || b[n_array[4][0]] + ' ' + a[n_array[4][1]]) + 'Hundred ' : '';
            str += (n_array[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n_array[5])] || b[n_array[5][0]] + ' ' + a[n_array[5][1]]) : '';
            return str;
        }
        const [intPart, decPart] = parseFloat(amount).toFixed(2).split('.');
        let words = numToWords(parseInt(intPart));
        if (!words || words.trim() === '') words = "Zero ";
        words += "Rupees";
        if (parseInt(decPart) > 0) words += " and " + numToWords(parseInt(decPart)) + "Paise";
        return words + " Only";
    }

    /**
     * Returns the structure for a new Note object
     */
    createNoteObject(type, invoice, data) {
        return {
            id: Date.now().toString(), // Simple ID
            note_no: data.note_no,
            type: type, // 'CREDIT' or 'DEBIT'
            invoice_id: invoice.id || invoice.invoice_no,
            invoice_no: invoice.invoice_no,
            invoice_date: invoice.invoice_date,
            customer_id: invoice.customer_id || null,
            customer_name: invoice.customer_name,
            gstin: invoice.gstin || "",
            note_date: data.date || new Date().toISOString().split('T')[0],
            reason: data.reason,
            remarks: data.remarks || "",

            // Amounts
            taxable_amount: data.taxable_amount,
            non_taxable_amount: parseFloat(data.non_taxable_amount || 0),
            gst_rate: data.gst_rate,
            cgst: data.cgst,
            sgst: data.sgst,
            igst: data.igst,
            total_amount: data.total_amount,

            stock_effect: data.stock_effect || false,
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            created_by: data.user || 'Admin'
        };
    }

    /**
     * Generates PDF for the Credit/Debit Note
     * @param {object} note - The note object
     */
    printNote(note) {
        if (!window.jspdf) {
            alert("jsPDF library not loaded!");
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Company Details
        let companyName = "Company Name";
        let addressLine1 = "";
        let addressLine2 = "";
        let contact = "";

        if (window.getBrandSettings) {
            const brand = window.getBrandSettings();
            if (brand.companyName) companyName = brand.companyName;
            if (brand.addressLine1) addressLine1 = brand.addressLine1;
            if (brand.addressLine2) addressLine2 = brand.addressLine2;
            if (brand.contactNumber) contact = brand.contactNumber;
        }

        // Header
        doc.setFontSize(18);
        doc.setTextColor(44, 62, 80);
        doc.text(companyName, 105, 15, { align: "center" });

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(addressLine1, 105, 22, { align: "center" });
        doc.text(addressLine2, 105, 27, { align: "center" });
        if (contact) doc.text(`Mo: ${contact}`, 105, 32, { align: "center" });

        doc.setDrawColor(200);
        doc.line(10, 36, 200, 36);

        // Title
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont(undefined, 'bold');
        const title = note.type === 'CREDIT' ? 'TAX CREDIT NOTE' : 'TAX DEBIT NOTE';
        doc.text(title, 105, 45, { align: "center" });

        // Note Info
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        const leftX = 14;
        const rightX = 140;
        let y = 55;

        doc.text(`Note No: ${note.note_no}`, leftX, y);
        doc.text(`Date: ${new Date(note.note_date).toLocaleDateString('en-GB')}`, rightX, y);
        y += 6;

        doc.text(`Original Invoice: ${note.invoice_no}`, leftX, y);
        doc.text(`Invoice Date: ${new Date(note.invoice_date).toLocaleDateString('en-GB')}`, rightX, y);
        y += 10;

        // Customer
        doc.setFont(undefined, 'bold');
        doc.text("To:", leftX, y);
        y += 5;
        doc.setFont(undefined, 'normal');
        doc.text(note.customer_name, leftX, y);
        y += 5;

        const customers = JSON.parse(localStorage.getItem('customers')) || [];
        const suppliers = JSON.parse(localStorage.getItem('suppliers')) || [];
        const party = customers.find(c => c.name === note.customer_name) || suppliers.find(s => s.name === note.customer_name) || {};

        let addressText = party.address || "";
        let locParts = [];
        if (party.district) locParts.push(party.district);
        if (party.state) locParts.push(party.state);
        if (party.pin) locParts.push(`PIN: ${party.pin}`);
        if (locParts.length > 0) addressText += (addressText ? "\n" : "") + locParts.join(", ");

        if (addressText) {
            const splitAddr = doc.splitTextToSize(addressText, 100);
            doc.text(splitAddr, leftX, y);
            y += (splitAddr.length * 5);
        }

        let contactStr = party.contact ? `Mob: ${party.contact}` : "";
        if (contactStr) { doc.text(contactStr, leftX, y); y += 5; }

        let gstin = note.gstin || party.gst || party.gstin || "";
        if (gstin) { doc.text(`GSTIN: ${gstin}`, leftX, y); y += 5; }

        y += 5;

        // Reason and Remarks
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text("Reason:", leftX, y);
        doc.setFont(undefined, 'normal');
        doc.text(note.reason || '-', leftX + 17, y);
        y += 6;

        doc.setFont(undefined, 'bold');
        doc.text("Remarks:", leftX, y);
        doc.setFont(undefined, 'normal');
        doc.text(note.remarks || '-', leftX + 17, y);
        y += 10;

        // Table
        const head = [['Description', 'Amount (Rs.)']];
        const body = [
            [`Taxable Adjustment (@ ${note.gst_rate || 0}%)`, parseFloat(note.taxable_amount || 0).toFixed(2)],
            ['CGST', parseFloat(note.cgst || 0).toFixed(2)],
            ['SGST', parseFloat(note.sgst || 0).toFixed(2)],
            ['IGST', parseFloat(note.igst || 0).toFixed(2)],
            ['Non-Taxable / Other Adjustment', parseFloat(note.non_taxable_amount || 0).toFixed(2)],
            [{ content: 'Total Amount', styles: { fontStyle: 'bold', halign: 'right', fillColor: [233, 236, 239] } }, { content: parseFloat(note.total_amount || 0).toFixed(2), styles: { fontStyle: 'bold', halign: 'right', fillColor: [233, 236, 239] } }]
        ];

        doc.autoTable({
            startY: y,
            head: head,
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            styles: { fontSize: 10, cellPadding: 4 },
            columnStyles: {
                0: { halign: 'left' },
                1: { halign: 'right' }
            },
            didParseCell: function (data) {
                if (data.section === 'head') {
                    if (data.column.index === 1) data.cell.styles.halign = 'right';
                }
            }
        });

        // Amount in words
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text("Amount in Words:", 14, finalY);
        doc.setFont(undefined, 'normal');
        const amtWords = this.convertNumberToWords(note.total_amount || 0);
        const splitWords = doc.splitTextToSize(amtWords, 110);
        doc.text(splitWords, 14, finalY + 6);

        // Authorised Signatory
        const sigY = finalY + 25;
        doc.text(`For ${companyName}`, 195, sigY, { align: "right" });
        doc.text("Authorized Signatory", 195, sigY + 15, { align: "right" });

        // Footer
        const bottomY = doc.internal.pageSize.height - 20;
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text("Issued under Section 34 of the CGST Act.", 105, bottomY, { align: "center" });

        doc.save(`${note.note_no.replace(/[\/\\]/g, '_')}.pdf`);
    }
}

window.creditDebitService = new CreditDebitService();
