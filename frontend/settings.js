// Global Google Apps Script URL for Cloud Sync, OTP & Registration
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxnbOTetUcmv22txVFGCb8pHkZI3snpimqMtcdZWvVRv-z2x4bHfVC0K2AxlOXvz8C4/exec";

var APP_SETTINGS = {
    SELLER_STATE: "",
    DISTRICT: "",
    COMPANY_NAME: "",
    COMPANY_GSTIN: "",
    COMPANY_EMAIL: "",
    COMPANY_WEBSITE: "",
    ADDRESS_LINE_1: "",
    ADDRESS_LINE_2: "",
    CONTACT_NUMBER: "",
    ADMIN_USERNAME: "",
    ADMIN_LOGIN_PASS: "",
    DEFAULT_BCC: "",
    LOGO_PATH: "", // Added for logo support
    PRINT_OPTIONS: {},
    FINANCIAL_YEAR_LOCK: false,
    APP_MODE: "Trading / Business",
    CUSTOM_FEATURES: {},
    CUSTOM_FIELDS: {}, // Registry for Dynamic Schema Fields
    ADMIN_USERS: [
        { username: "", password: "", role: "Admin" }
    ],
    ADMIN_EMAIL: "",
    ADMIN_EMAIL_PASS: "",
};

// --- STEP 7: Architecture Rule (Enum & Config Map) ---
const APP_MODES = {
    TRADING: "Trading / Business",
    EDUCATION: "Educational Institute",
    SERVICE: "Service Based",
    CUSTOM: "Custom"
};

const APP_MODE_CONFIG = {
    "Trading / Business": {
        features: {
            invoice: true,
            inventory: true,
            gst: true,
            student_management: false,
            fee_management: false,
            class_reporting: false,
            quotation: true
        },
        labels: {
            customer: "Customer",
            invoice: "Invoice",
            gstin: "GSTIN"
        }
    },
    "Educational Institute": {
        features: {
            invoice: true, // Uses the invoice engine
            inventory: true, // Optional
            gst: false, // Hidden by default
            student_management: true,
            fee_management: true,
            class_reporting: true,
            quotation: false
        },
        labels: {
            customer: "Student",
            invoice: "Fee Receipt",
            gstin: "Roll No",
            quotation: "Estimate"
        }
    },
    "Service Based": {
        features: {
            invoice: true,
            inventory: false,
            gst: true,
            student_management: false,
            fee_management: false,
            class_reporting: false,
            quotation: true
        },
        labels: {
            customer: "Client",
            invoice: "Bill",
            gstin: "GSTIN"
        }
    },
    "Custom": {
        features: {}, // Will load from APP_SETTINGS.CUSTOM_FEATURES
        labels: {}
    }
};

// --- STEP 3: Global Config Manager ---
const AppConfigManager = {
    getAppMode() {
        return APP_SETTINGS.APP_MODE || APP_MODES.TRADING;
    },

    async setAppMode(newMode) {
        if (!Object.values(APP_MODES).includes(newMode)) {
            console.error("Invalid App Mode:", newMode);
            return false;
        }

        APP_SETTINGS.APP_MODE = newMode;

        // Persist to backend
        if (window.electronAPI && window.electronAPI.saveAppSettings) {
            await window.electronAPI.saveAppSettings({
                appMode: newMode,
                modifiedBy: localStorage.getItem('currentUser') || 'System'
            });
        }

        return true;
    },

    getConfig(mode) {
        return APP_MODE_CONFIG[mode] || APP_MODE_CONFIG[APP_MODES.TRADING];
    }
};

// --- Feature Toggle Engine (Updated to use AppConfigManager) ---
const FeatureManager = {
    init() {
        this.apply();
    },

    getFlags() {
        const mode = AppConfigManager.getAppMode();
        if (mode === APP_MODES.CUSTOM) {
            // Merge default trading features with custom overrides
            return { ...APP_MODE_CONFIG[APP_MODES.TRADING].features, ...APP_SETTINGS.CUSTOM_FEATURES };
        }
        return AppConfigManager.getConfig(mode).features;
    },

    getLabels() {
        const mode = AppConfigManager.getAppMode();
        return AppConfigManager.getConfig(mode).labels;
    },

    isEnabled(featureKey) {
        const flags = this.getFlags();
        return flags[featureKey] !== false; // Default to true if undefined
    },

    apply() {
        // 1. Update UI Labels (Step 5)
        updateIndustryLabels();
        // 2. Re-apply UI Permissions (Step 4)
        applyUIPermissions();
    }
};

// --- Audit Trail Logic (Global Helper) ---
const AuditManager = {
    getAuditTrail(isUpdate = false) {
        const user = localStorage.getItem('currentUser') || 'System';
        const timestamp = new Date().toISOString();
        if (isUpdate) {
            return { editedBy: user, editedDate: timestamp };
        }
        return { createdBy: user, createdDate: timestamp };
    }
};

// --- STEP 5: Dynamic Label System ---
function updateIndustryLabels() {
    const labels = FeatureManager.getLabels();

    // Look for elements with data-industry-label attribute
    document.querySelectorAll('[data-industry-label]').forEach(el => {
        const key = el.getAttribute('data-industry-label');
        if (labels[key]) {
            // Update text content but preserve icons if they exist in separate elements
            // Simple replacement for now
            if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
                el.textContent = labels[key];
            } else {
                // If complex structure, try to find a text node or span
                const span = el.querySelector('span.label-text');
                if (span) span.textContent = labels[key];
            }
        }
    });

    // Specific overrides for common IDs if data attributes aren't added yet
    if (labels.invoice === "Fee Receipt") {
        const invTitle = document.getElementById('pageTitle');
        if (invTitle && invTitle.textContent.includes('Invoice')) invTitle.textContent = labels.invoice;
    }
}

// --- STEP 9: Navigation Logic for Invoice Module ---
function openInvoiceModule() {
    const mode = AppConfigManager.getAppMode();

    // Check if we are in Education Mode
    if (mode === APP_MODES.EDUCATION) {
        window.location.href = 'invoice_Inst.html'; // Redirect to Fee Receipt
    } else {
        window.location.href = 'invoice.html'; // Default Trading Invoice
    }
}

var STATE_MASTER_LIST = [
    { name: "Andaman and Nicobar Islands", code: "35" },
    { name: "Andhra Pradesh", code: "37" },
    { name: "Arunachal Pradesh", code: "12" },
    { name: "Assam", code: "18" },
    { name: "Bihar", code: "10" },
    { name: "Chandigarh", code: "04" },
    { name: "Chhattisgarh", code: "22" },
    { name: "Dadra and Nagar Haveli and Daman and Diu", code: "26" },
    { name: "Delhi", code: "07" },
    { name: "Goa", code: "30" },
    { name: "Gujarat", code: "24" },
    { name: "Haryana", code: "06" },
    { name: "Himachal Pradesh", code: "02" },
    { name: "Jammu and Kashmir", code: "01" },
    { name: "Jharkhand", code: "20" },
    { name: "Karnataka", code: "29" },
    { name: "Kerala", code: "32" },
    { name: "Ladakh", code: "38" },
    { name: "Lakshadweep", code: "31" },
    { name: "Madhya Pradesh", code: "23" },
    { name: "Maharashtra", code: "27" },
    { name: "Manipur", code: "14" },
    { name: "Meghalaya", code: "17" },
    { name: "Mizoram", code: "15" },
    { name: "Nagaland", code: "13" },
    { name: "Odisha", code: "21" },
    { name: "Puducherry", code: "34" },
    { name: "Punjab", code: "03" },
    { name: "Rajasthan", code: "08" },
    { name: "Sikkim", code: "11" },
    { name: "Tamil Nadu", code: "33" },
    { name: "Telangana", code: "36" },
    { name: "Tripura", code: "16" },
    { name: "Uttar Pradesh", code: "09" },
    { name: "Uttarakhand", code: "05" },
    { name: "West Bengal", code: "19" },
    { name: "Other Territory", code: "97" }
];

var BANK_DETAILS_MASTER = {
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    branchName: "",
    upiId: "",
    accountHolder: ""
};

var UNIT_MASTER_LIST = [
    " ", "Bag", "Box", "Bucket", "Bundle", "Carton", "Case", "Cm", "Dozen", "Each", "Foot",
    "Gm", "Inches", "Kg", "Kit", "Lot", "Ltr", "Mtr", "Nos", "Pack", "Pair", "Pcs",
    "Rack", "Set", "Sheet", "SqrFt", "SqrMtr", "Ton", "Unit", "Yard", "OTH"
];


var DISTRICTS_MASTER_LIST = {
    "West Bengal": ["Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling", "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kalimpong", "Kolkata", "Malda", "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Paschim Medinipur", "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur"],
    "Bihar": ["Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"],
    "Jharkhand": ["Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa", "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahibganj", "Seraikela-Kharsawan", "Simdega", "West Singhbhum"],
    "Odisha": ["Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack", "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghpur", "Jajpur", "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Kendujhar", "Khordha", "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur", "Subarnapur", "Sundargarh"],
    "Assam": ["Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang", "Dhemaji", "Dhubri", "Dibrugarh", "Dima Hasao", "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat", "Kamrup", "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", "Morigaon", "Nagaon", "Nalbari", "Sivasagar", "Sonitpur", "South Salmara-Mankachar", "Tinsukia", "Udalguri", "West Karbi Anglong"],
    "Sikkim": ["East Sikkim", "North Sikkim", "South Sikkim", "West Sikkim"],
    "Tripura": ["Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura", "Unakoti", "West Tripura"],
    "Meghalaya": ["East Garo Hills", "East Jaintia Hills", "East Khasi Hills", "North Garo Hills", "Ri Bhoi", "South Garo Hills", "South West Garo Hills", "South West Khasi Hills", "West Garo Hills", "West Jaintia Hills", "West Khasi Hills"],
    "Manipur": ["Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Jiribam", "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl", "Senapati", "Tamenglong", "Tengnoupal", "Thoubal", "Ukhrul"],
    "Nagaland": ["Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Peren", "Phek", "Tuensang", "Wokha", "Zunheboto"],
    "Arunachal Pradesh": ["Anjaw", "Changlang", "Dibang Valley", "East Kameng", "East Siang", "Kamle", "Kra Daadi", "Kurung Kumey", "Lepa Rada", "Lohit", "Longding", "Lower Dibang Valley", "Lower Siang", "Lower Subansiri", "Namsai", "Pakke Kessang", "Papum Pare", "Shi Yomi", "Siang", "Tawang", "Tirap", "Upper Siang", "Upper Subansiri", "West Kameng", "West Siang"],
    "Mizoram": ["Aizawl", "Champhai", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saiha", "Serchhip"],
    "Maharashtra": ["Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal"],
    "Delhi": ["Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi", "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi"],
    "Karnataka": ["Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikkaballapura", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayapura", "Yadgir"],
    "Tamil Nadu": ["Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kanchipuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar"],
    "Gujarat": ["Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", "Bhavnagar", "Botad", "Chhota Udaipur", "Dahod", "Dang", "Devbhoomi Dwarka", "Gandhinagar", "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar", "Tapi", "Vadodara", "Valsad"],
    "Uttar Pradesh": ["Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Ayodhya", "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria", "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar", "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kheri", "Kushinagar", "Lalitpur", "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh", "Prayagraj", "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar", "Shahjahanpur", "Shamli", "Shravasti", "Siddharthnagar", "Sitapur", "Sonbhadra", "Sultanpur", "Unnao", "Varanasi"],
    "Rajasthan": ["Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara", "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Dholpur", "Dungarpur", "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Kota", "Nagaur", "Pali", "Pratapgarh", "Rajsamand", "Sawai Madhopur", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur"],
    "Punjab": ["Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", "Ludhiana", "Mansa", "Moga", "Muktsar", "Pathankot", "Patiala", "Rupnagar", "Sahibzada Ajit Singh Nagar", "Sangrur", "Shahid Bhagat Singh Nagar", "Sri Muktsar Sahib", "Tarn Taran"],
    "Haryana": ["Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram", "Hisar", "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh", "Nuh", "Palwal", "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar"],
    "Madhya Pradesh": ["Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind", "Bhopal", "Burhanpur", "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", "Harda", "Hoshangabad", "Indore", "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone", "Mandla", "Mandsaur", "Morena", "Narsinghpur", "Neemuch", "Panna", "Raisen", "Rajgarh", "Ratlam", "Rewa", "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh", "Ujjain", "Umaria", "Vidisha"],
    "Chhattisgarh": ["Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur", "Bilaspur", "Dantewada", "Dhamtari", "Durg", "Gariaband", "Gaurela-Pendra-Marwahi", "Janjgir-Champa", "Jashpur", "Kabirdham", "Kanker", "Kondagaon", "Korba", "Koriya", "Mahasamund", "Mungeli", "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sukma", "Surajpur", "Surguja"],
    "Uttarakhand": ["Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi"],
    "Himachal Pradesh": ["Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul and Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una"],
    "Jammu and Kashmir": ["Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu", "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri", "Ramban", "Reasi", "Samba", "Shopian", "Srinagar", "Udhampur"],
    "Goa": ["North Goa", "South Goa"],
    "Kerala": ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"],
    "Telangana": ["Adilabad", "Bhadradri Kothagudem", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Komaram Bheem", "Mahabubabad", "Mahabubnagar", "Mancherial", "Medak", "Medchal-Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal", "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Ranga Reddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad", "Wanaparthy", "Warangal", "Yadadri Bhuvanagiri"],
    "Andhra Pradesh": ["Anantapur", "Chittoor", "East Godavari", "Guntur", "Krishna", "Kurnool", "Prakasam", "Sri Potti Sriramulu Nellore", "Srikakulam", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR Kadapa"]
};

// --- Expense Ledger Structure (Indian Accounting Standard) ---
var EXPENSE_LEDGER_SCHEMA = {
    masterParent: "Expenses",
    groups: [
        {
            id: "grp_direct",
            name: "Direct Expenses",
            reportTarget: "Trading Account",
            nature: "Revenue",
            description: "Direct costs of production/purchase (e.g., Wages, Freight Inward)",
            subCategories: ["Wages", "Freight Inward", "Power & Fuel", "Factory Rent", "Manufacturing Costs"]
        },
        {
            id: "grp_admin",
            name: "Administrative Expenses",
            reportTarget: "Profit & Loss",
            nature: "Revenue",
            description: "Office running costs (e.g., Rent, Salaries, Electricity)",
            subCategories: ["Office Rent", "Staff Salary", "Internet & Telephone", "Printing & Stationery", "Office Electricity"]
        },
        {
            id: "grp_selling",
            name: "Selling & Distribution Expenses",
            reportTarget: "Profit & Loss",
            nature: "Revenue",
            description: "Sales promotion costs (e.g., Ads, Delivery)",
            subCategories: ["Advertisement", "Delivery Charges", "Sales Commission", "Packing Material"]
        },
        {
            id: "grp_financial",
            name: "Financial Expenses",
            reportTarget: "Profit & Loss",
            nature: "Revenue",
            description: "Finance costs (e.g., Bank Charges, Interest)",
            subCategories: ["Bank Charges", "Interest on Loan", "Processing Fees"]
        },
        {
            id: "grp_statutory",
            name: "Statutory & Compliance Expenses",
            reportTarget: "Profit & Loss",
            nature: "Revenue",
            description: "Govt fees (e.g., GST Late Fees, Audit Fees)",
            subCategories: ["GST Late Fees", "Audit Fees", "Legal Charges", "License Renewal"]
        },
        {
            id: "grp_repair",
            name: "Repair & Maintenance Expenses",
            reportTarget: "Profit & Loss",
            nature: "Revenue",
            description: "Asset upkeep (e.g., AMC, Repairs)",
            subCategories: ["Computer Repair", "AC Maintenance", "Office Repairs", "Vehicle Maintenance"]
        },
        {
            id: "grp_capital",
            name: "Capital Expenditure",
            reportTarget: "Balance Sheet",
            nature: "Asset",
            description: "Fixed Asset purchases (e.g., Machinery, Computers)",
            subCategories: ["Computers & Laptops", "Furniture & Fixtures", "Office Equipment", "Vehicles"]
        }
    ]
};

// --- UI Permission System ---
var UI_PERMISSION_REGISTRY = [
    { id: 'perm_quick_entry', label: 'Quick Daily Entry', feature: 'invoice' },
    { id: 'perm_make_invoice', label: 'Smart Invoice', feature: 'invoice' },
    { id: 'perm_regular_invoice', label: 'Regular Invoice', feature: 'invoice' },
    { id: 'perm_quotation', label: 'Quotation', feature: 'quotation' },
    { id: 'perm_restaurant_pos', label: 'Restaurant POS' },
    { id: 'perm_restaurant_kds', label: 'Kitchen Display (KDS)' },
    { id: 'perm_invoice_report', label: 'Invoice Report', feature: 'invoice' },
    { id: 'perm_manage_customers', label: 'Manage Customers' }, // Core feature
    { id: 'perm_manage_items', label: 'Manage Items', feature: 'inventory' },
    { id: 'perm_purchase_entries', label: 'Purchase Entries', feature: 'inventory' },
    { id: 'perm_manage_bom', label: 'Manage BOM', feature: 'inventory' },
    { id: 'perm_production_entry', label: 'Production Entries', feature: 'inventory' },
    { id: 'perm_order_sheet', label: 'Order Sheet', feature: 'inventory' },
    { id: 'perm_stock_report', label: 'Stock Report', feature: 'inventory' },
    { id: 'perm_profit_loss', label: 'Profit & Loss', feature: 'invoice' },
    { id: 'perm_balance_sheet', label: 'Balance Sheet', feature: 'invoice' },
    { id: 'perm_expense_manager', label: 'Expense Manager', feature: 'invoice' },
    { id: 'perm_supplier_manager', label: 'Supplier Manager', feature: 'inventory' },
    { id: 'perm_reminder', label: 'Reminder' },
    { id: 'perm_summary_chart', label: 'Summary & Chart' },
    { id: 'perm_gst_report', label: 'GST Report', feature: 'gst' },
    { id: 'perm_ledger_report', label: 'Ledger Report' },
    { id: 'perm_settings', label: 'Settings' },
    { id: 'perm_credit_debit_notes', label: 'Credit/Debit Notes' },
    { id: 'perm_return_management', label: 'Returns Management' },
    { id: 'perm_scrap_inventory', label: 'Scrap Inventory', feature: 'inventory' },
    { id: 'perm_change_password', label: 'Change Password' },
    { id: 'perm_feature_locks', label: 'Feature Locks' },
    { id: 'perm_bank_details', label: 'Bank Details' },
    { id: 'perm_check_updates', label: 'Check Updates' },
    { id: 'perm_backup_data', label: 'Backup Data' },
    { id: 'perm_restore_data', label: 'Restore Data' },
    { id: 'perm_cloud_backup', label: 'Cloud Backup' },
    { id: 'perm_cloud_restore', label: 'Cloud Restore' },
    { id: 'perm_close_all_windows', label: 'Close All Windows' },
    { id: 'perm_lock_dashboard', label: 'Lock Dashboard' },
    { id: 'perm_renew_license', label: 'License Renewal' },
    { id: 'perm_admin_creds', label: 'Admin Credentials' },
    { id: 'perm_logout', label: 'Logout' },
    { id: 'perm_print', label: 'Print Button' },
    { id: 'perm_export_excel', label: 'Export Excel' },
    { id: 'perm_delete_action', label: 'Delete Actions' },
    { id: 'perm_help', label: 'Help & Support' },
    { id: 'perm_payment_receipt_log', label: 'Payment Receipt Log' },
    { id: 'perm_manage_company_info', label: 'Settings: Manage Company Info' },
    { id: 'perm_manage_security_creds', label: 'Settings: Manage Security Credentials' },
    { id: 'perm_manage_users', label: 'Settings: Manage Users' },
    { id: 'perm_view_login_history', label: 'Settings: View Login History' },
    { id: 'perm_factory_reset', label: 'Settings: Factory Reset' },
    { id: 'perm_tally_gateway', label: 'Tally Gateway' },
    { id: 'perm_banking', label: 'Banking Module' },
    { id: 'perm_journal_voucher', label: 'Journal Voucher' },
    { id: 'perm_day_book', label: 'Day Book' },
    { id: 'perm_cash_flow', label: 'Cash Flow' },
    { id: 'perm_custom_fields', label: 'Custom Field Settings' }
];

function getCurrentUser() {
    return localStorage.getItem('currentUser') || (APP_SETTINGS.ADMIN_USERS[0] ? APP_SETTINGS.ADMIN_USERS[0].username : 'admin');
}

function getUIPermissions() {
    const user = getCurrentUser();
    const key = `ui_permissions_${user}`;
    let stored = localStorage.getItem(key);

    // Fallback to legacy key if user-specific not found (backward compatibility)
    if (!stored) stored = localStorage.getItem('ui_permissions');

    const permissions = stored ? JSON.parse(stored) : {};
    UI_PERMISSION_REGISTRY.forEach(item => {
        if (permissions[item.id] === undefined) permissions[item.id] = true; // Default visible
    });

    // --- ENFORCE REMOTE PERMISSIONS GLOBALLY ---
    try {
        const remoteStr = localStorage.getItem("remotePermissions_" + user);
        if (remoteStr) {
            const remotePerms = JSON.parse(remoteStr);
            for (const [permId, isAllowed] of Object.entries(remotePerms)) {
                if (isAllowed === false) {
                    permissions[permId] = false; // Force disable
                } else if (isAllowed === true) {
                    permissions[permId] = true; // Force enable
                }
            }
        }
    } catch (e) {
        console.error("Error applying global remote permissions:", e);
    }

    return permissions;
}

function saveUIPermissions(permissions) {
    const user = getCurrentUser();
    const key = `ui_permissions_${user}`;
    localStorage.setItem(key, JSON.stringify(permissions));
}

// --- STEP 4: UI Protection Layer ---
function applyUIPermissions() {
    const permissions = getUIPermissions();
    const flags = FeatureManager.getFlags();

    document.querySelectorAll('[data-permission-id]').forEach(el => {
        const id = el.getAttribute('data-permission-id');

        // 1. Check Industry Feature Flag (Master Switch)
        const permDef = UI_PERMISSION_REGISTRY.find(p => p.id === id);
        const isFeatureDisabled = permDef && permDef.feature && flags[permDef.feature] === false;

        // 2. Check User Permission
        const isUserDisabled = permissions[id] === false;

        if (isFeatureDisabled || isUserDisabled) {
            el.style.display = 'none';
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') el.disabled = true;
        } else {
            if (el.style.display === 'none') el.style.display = '';
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') el.disabled = false;
        }
    });
}

// Auto-apply on load and sync across windows
window.addEventListener('DOMContentLoaded', async () => {
    applyUIPermissions();
    await fetchDeveloperSettings();
    updateDeveloperUI();
    await fetchGeneralAppSettings();
    renderAppModeControl(); // --- STEP 1: Inject UI ---
    FeatureManager.init(); // Initialize Industry Mode
});
window.addEventListener('storage', (e) => {
    const user = getCurrentUser();
    if (e.key === `ui_permissions_${user}`) applyUIPermissions();
});

// Listen for Developer Override (Step 7)
if (window.electronAPI) {
    window.electronAPI.onForceOpenDevPanel && window.electronAPI.onForceOpenDevPanel(() => {
        // Logic to open your developer modal here
        // e.g., $('#developerModal').modal('show');
        alert("Developer Override Activated");
    });
}

// --- Developer Modal Data Fetch & Save ---

async function fetchDeveloperSettings() {
    if (window.electronAPI && window.electronAPI.getAdminCreds) {
        try {
            const data = await window.electronAPI.getAdminCreds();
            if (data.success) {
                APP_SETTINGS.ADMIN_USERNAME = data.adminUser;
                APP_SETTINGS.ADMIN_EMAIL = data.adminEmail;
                APP_SETTINGS.ADMIN_EMAIL_PASS = data.adminEmailPass;
                APP_SETTINGS.ADMIN_USERS = data.adminUsers || [];
                updateDeveloperUI();
                return data;
            }
        } catch (error) {
            console.error("Error fetching developer settings:", error);
        }
    }
    return null;
}

async function saveDeveloperSettings(payload) {
    // payload: { devId, adminUser, adminPass, adminEmail, adminEmailPass, adminUsers }
    if (window.electronAPI && window.electronAPI.saveAdminCreds) {
        try {
            const result = await window.electronAPI.saveAdminCreds(payload);
            if (result.success) {
                // Refresh local settings after save
                await fetchDeveloperSettings();
                alert("Developer settings saved successfully.");
            }
            return result;
        } catch (error) {
            console.error("Error saving developer settings:", error);
            return { success: false, message: error.message };
        }
    }
    return { success: false, message: "API unavailable" };
}

async function fetchGeneralAppSettings() {
    if (window.electronAPI && window.electronAPI.getAppSettings) {
        try {
            const data = await window.electronAPI.getAppSettings();
            if (data.success) {
                APP_SETTINGS.SELLER_STATE = data.sellerState || APP_SETTINGS.SELLER_STATE;
                APP_SETTINGS.COMPANY_NAME = data.companyName || APP_SETTINGS.COMPANY_NAME;
                APP_SETTINGS.ADDRESS_LINE_1 = data.addressLine1 || APP_SETTINGS.ADDRESS_LINE_1;
                APP_SETTINGS.ADDRESS_LINE_2 = data.addressLine2 || APP_SETTINGS.ADDRESS_LINE_2;
                APP_SETTINGS.CONTACT_NUMBER = data.contactNumber || APP_SETTINGS.CONTACT_NUMBER;
                APP_SETTINGS.PRINT_OPTIONS = data.printOptions || APP_SETTINGS.PRINT_OPTIONS;
                APP_SETTINGS.DISTRICT = data.district || APP_SETTINGS.DISTRICT;
                APP_SETTINGS.COMPANY_GSTIN = data.companyGstin || APP_SETTINGS.COMPANY_GSTIN;
                APP_SETTINGS.COMPANY_EMAIL = data.companyEmail || APP_SETTINGS.COMPANY_EMAIL;
                APP_SETTINGS.DEFAULT_BCC = data.defaultBcc || APP_SETTINGS.DEFAULT_BCC;
                APP_SETTINGS.COMPANY_WEBSITE = data.companyWebsite || APP_SETTINGS.COMPANY_WEBSITE;
                APP_SETTINGS.APP_MODE = data.appMode || "Trading / Business";
                APP_SETTINGS.CUSTOM_FEATURES = data.customFeatures || {};
            }
        } catch (error) {
            console.error("Error fetching general settings:", error);
        }
    }
}

function updateDeveloperUI() {
    // Populate inputs with IDs matching the data keys
    const fields = {
        'adminUser': APP_SETTINGS.ADMIN_USERNAME,
        'adminEmail': APP_SETTINGS.ADMIN_EMAIL,
        'adminEmailPass': APP_SETTINGS.ADMIN_EMAIL_PASS
    };
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = val || "";
    }

    // Update App Mode Dropdown if it exists
    const modeSelect = document.getElementById('appModeSelect');
    if (modeSelect) modeSelect.value = AppConfigManager.getAppMode();
}

// --- STEP 1 & 8: Developer Panel UI Injection ---
function renderAppModeControl() {
    // Locate the container where developer settings are (assuming a specific ID or appending to a known section)
    // For this implementation, we'll assume there is a container with ID 'developerSettingsContainer'
    // If not, we append to the body of the developer modal for now.

    const container = document.getElementById('developerSettingsContainer') || document.querySelector('.modal-body');
    if (!container) return;

    // Check if already rendered
    if (document.getElementById('appModeSection')) return;

    const sectionHtml = `
        <div id="appModeSection" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
            <h5 style="color: #2c3e50; font-weight: 600; margin-bottom: 10px;">Application Control</h5>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
                <label for="appModeSelect" style="display: block; font-weight: 500; margin-bottom: 8px; color: #495057;">App Mode</label>
                <select id="appModeSelect" class="form-control" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ced4da;">
                    <option value="${APP_MODES.TRADING}">Trading / Business (Default)</option>
                    <option value="${APP_MODES.EDUCATION}">Educational Institute</option>
                    <option value="${APP_MODES.SERVICE}">Service Based</option>
                </select>
                <small style="display: block; margin-top: 8px; color: #6c757d;">
                    <i class="fas fa-info-circle"></i> App Mode controls which modules and workflows are active in the software.
                </small>
            </div>
        </div>
    `;

    // Insert before the save button or at the end
    const saveBtn = container.querySelector('button.btn-primary') || container.lastElementChild;
    if (saveBtn) {
        const div = document.createElement('div');
        div.innerHTML = sectionHtml;
        container.insertBefore(div, saveBtn);
    } else {
        container.insertAdjacentHTML('beforeend', sectionHtml);
    }

    // Attach Event Listener
    document.getElementById('appModeSelect').addEventListener('change', (e) => {
        confirmAndChangeAppMode(e.target.value);
    });
}

// --- STEP 4: Safety Logic ---
async function confirmAndChangeAppMode(newMode) {
    const currentMode = AppConfigManager.getAppMode();

    // Prevent unnecessary change
    if (newMode === currentMode) return;

    // Confirmation Dialog
    const confirmed = confirm(`⚠️ CAUTION: Changing App Mode to "${newMode}" may enable or disable certain modules and change data visibility.\n\nAre you sure you want to continue?`);

    if (confirmed) {
        const success = await AppConfigManager.setAppMode(newMode);
        if (success) {
            alert("✅ App Mode updated successfully.\n\nThe application needs to restart to apply structural changes.");
            // Optional: Trigger restart via IPC if available, or just reload
            window.location.reload();
        } else {
            alert("Failed to save App Mode.");
            document.getElementById('appModeSelect').value = currentMode; // Revert UI
        }
    } else {
        document.getElementById('appModeSelect').value = currentMode; // Revert UI
    }
}