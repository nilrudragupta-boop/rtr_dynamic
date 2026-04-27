(function () {
    function updateBrand(settings) {
        if (!settings) return;

        // Update localStorage with fresh settings from main process if available
        // This ensures that synchronous functions like getBrandSettings() have access to the latest data.
        if (settings.companyName) localStorage.setItem('companyName', settings.companyName);
        if (settings.addressLine1) localStorage.setItem('addressLine1', settings.addressLine1);
        if (settings.addressLine2) localStorage.setItem('addressLine2', settings.addressLine2);
        if (settings.contactNumber) localStorage.setItem('contactNumber', settings.contactNumber);
        if (settings.companyEmail) localStorage.setItem('companyEmail', settings.companyEmail);
        if (settings.companyWebsite) localStorage.setItem('companyWebsite', settings.companyWebsite);
        if (settings.companyGstin) localStorage.setItem('companyGstin', settings.companyGstin);
        if (settings.district) localStorage.setItem('district', settings.district);
        if (settings.sellerState) localStorage.setItem('sellerState', settings.sellerState);
        if (settings.logoPath) localStorage.setItem('logoPath', settings.logoPath);


        // 1. Update Company Name
        const nameElements = document.querySelectorAll('[data-brand="name"]');
        nameElements.forEach(el => {
            if (settings.companyName) el.innerText = settings.companyName;
        });

        // 2. Update Company Address & Details
        const addressElements = document.querySelectorAll('[data-brand="address"]');
        addressElements.forEach(el => {
            let lines = [];
            if (settings.addressLine1) lines.push(settings.addressLine1);

            let addr2 = settings.addressLine2 || "";
            if (addr2) lines.push(addr2);

            let distStateParts = [];
            if (settings.district) distStateParts.push(`Dist: ${settings.district}`);
            if (settings.sellerState) distStateParts.push(`State: ${settings.sellerState}`);
            let distState = distStateParts.join(", ");
            if (distState) lines.push(distState);

            let contactParts = [];
            if (settings.contactNumber) contactParts.push(`Ph: ${settings.contactNumber}`);
            if (settings.companyEmail) contactParts.push(`Email: ${settings.companyEmail}`);
            if (contactParts.length > 0) lines.push(contactParts.join(' | '));

            if (settings.companyWebsite) lines.push(settings.companyWebsite);
            if (settings.companyGstin) lines.push(`GSTIN: ${settings.companyGstin}`);

            el.innerHTML = lines.join('<br>');
        });

        // 3. Update Individual Fields (Granular Control)
        document.querySelectorAll('[data-brand="phone"]').forEach(el => {
            if (settings.contactNumber) el.innerText = settings.contactNumber;
        });
        document.querySelectorAll('[data-brand="email"]').forEach(el => {
            if (settings.companyEmail) el.innerText = settings.companyEmail;
        });
        document.querySelectorAll('[data-brand="gst"]').forEach(el => {
            if (settings.companyGstin) el.innerText = settings.companyGstin;
        });

        // 4. Update Logo
        const logoElements = document.querySelectorAll('[data-brand="logo"]');
        logoElements.forEach(el => {
            const src = settings.logoPath || settings.logo;
            if (src) {
                el.src = src;
                el.style.display = '';
            } else {
                el.style.display = 'none';
            }
        });
    }

    function loadFromStorage() {
        return {
            companyName: localStorage.getItem('companyName'),
            addressLine1: localStorage.getItem('addressLine1'),
            addressLine2: localStorage.getItem('addressLine2'),
            contactNumber: localStorage.getItem('contactNumber'),
            companyEmail: localStorage.getItem('companyEmail'),
            companyWebsite: localStorage.getItem('companyWebsite'),
            companyGstin: localStorage.getItem('companyGstin'),
            district: localStorage.getItem('district'),
            sellerState: localStorage.getItem('sellerState'),
            logoPath: localStorage.getItem('logoPath')
        };
    }

    // Expose for PDF generation
    window.getBrandSettings = loadFromStorage;

    document.addEventListener('DOMContentLoaded', () => {
        // 1. Fast Load from LocalStorage
        updateBrand(loadFromStorage());

        // 2. Sync with Electron API (if available)
        if (window.electronAPI && window.electronAPI.getAppSettings) {
            window.electronAPI.getAppSettings().then(res => {
                if (res.success) updateBrand(res);
            });
            if (window.electronAPI.onAppSettingsChanged) {
                window.electronAPI.onAppSettingsChanged(updateBrand);
            }
        }
    });
})();
