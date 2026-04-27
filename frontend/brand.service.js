(function () {

    const DEFAULT_BRAND = {
        name: " ",
        address: " ",
        phone: " ",
        gst: " ",
        logo: ""
    };

    function getBrand() {
        const settings = window.APP_SETTINGS || {};

        let addr1 = settings.ADDRESS_LINE_1 || localStorage.getItem('addressLine1') || "";
        let addr2 = settings.ADDRESS_LINE_2 || localStorage.getItem('addressLine2') || "";
        let address = addr1;
        if (addr2) {
            address += (address ? "<br>" : "") + addr2;
        }

        return {
            name: settings.COMPANY_NAME || localStorage.getItem('companyName') || DEFAULT_BRAND.name,
            address: address || DEFAULT_BRAND.address,
            phone: settings.CONTACT_NUMBER || localStorage.getItem('contactNumber') || "",
            gst: settings.COMPANY_GSTIN || localStorage.getItem('companyGstin') || "",
            logo: settings.LOGO_PATH || localStorage.getItem('logoPath') || ""
        };
    }

    function applyBrand() {
        const b = getBrand();

        document.querySelectorAll("[data-brand='name']")
            .forEach(e => e.innerHTML = b.name);

        document.querySelectorAll("[data-brand='address']")
            .forEach(e => e.innerHTML = b.address);

        document.querySelectorAll("[data-brand='phone']")
            .forEach(e => e.innerHTML = b.phone);

        document.querySelectorAll("[data-brand='gst']")
            .forEach(e => e.innerHTML = b.gst);

        document.querySelectorAll("[data-brand='logo']")
            .forEach(e => {
                if (b.logo) {
                    e.src = b.logo;
                    e.style.display = "";
                } else {
                    e.style.display = "none";
                }
            });

        if (b.name && b.name.trim()) {
            document.title = b.name + " - " + (document.title.split(' - ')[1] || document.title);
        }

        // Fetch from Electron API if available to keep it synced
        if (window.electronAPI && window.electronAPI.getAppSettings) {
            window.electronAPI.getAppSettings().then(res => {
                if (res.success) {
                    if (typeof APP_SETTINGS === 'undefined') window.APP_SETTINGS = {};
                    Object.assign(window.APP_SETTINGS, {
                        COMPANY_NAME: res.companyName || window.APP_SETTINGS.COMPANY_NAME,
                        ADDRESS_LINE_1: res.addressLine1 || window.APP_SETTINGS.ADDRESS_LINE_1,
                        ADDRESS_LINE_2: res.addressLine2 || window.APP_SETTINGS.ADDRESS_LINE_2,
                        CONTACT_NUMBER: res.contactNumber || window.APP_SETTINGS.CONTACT_NUMBER,
                        COMPANY_GSTIN: res.companyGstin || window.APP_SETTINGS.COMPANY_GSTIN,
                        COMPANY_EMAIL: res.companyEmail || window.APP_SETTINGS.COMPANY_EMAIL,
                        LOGO_PATH: res.logoPath || window.APP_SETTINGS.LOGO_PATH
                    });
                    
                    // Re-apply brand to reflect updated Electron settings (without looping)
                    const updatedB = getBrand();
                    document.querySelectorAll("[data-brand='name']").forEach(e => e.innerHTML = updatedB.name);
                    document.querySelectorAll("[data-brand='address']").forEach(e => e.innerHTML = updatedB.address);
                    document.querySelectorAll("[data-brand='phone']").forEach(e => e.innerHTML = updatedB.phone);
                    document.querySelectorAll("[data-brand='gst']").forEach(e => e.innerHTML = updatedB.gst);
                    document.querySelectorAll("[data-brand='logo']").forEach(e => {
                        if (updatedB.logo) { e.src = updatedB.logo; e.style.display = ""; }
                        else { e.style.display = "none"; }
                    });
                }
            }).catch(() => {});
        }
    }

    window.BrandService = { applyBrand, getBrand };

})();
