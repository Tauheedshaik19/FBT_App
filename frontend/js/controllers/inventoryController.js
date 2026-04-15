let allInventory = [];
let filteredInventory = [];

function canEditInventoryRecords() {
    return typeof hasAppPermission === 'function' ? hasAppPermission('canEditInventory') : true;
}

function showInventoryPermissionError(message = 'Your role cannot change inventory records.') {
    if (typeof showToast === 'function') showToast(message, 'error');
}

async function loadInventoryData() {
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Loading inventory...');
        const { data, error } = await window.supabaseClient
            .from('inventory')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        allInventory = data || [];
        filteredInventory = [...allInventory];
        renderInventoryTable(filteredInventory);

        if (typeof updateDashboardStats === 'function') updateDashboardStats(allInventory);
    } catch (err) {
        console.error('Inventory error:', err);
        if (typeof showToast === 'function') showToast('Failed to load inventory: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function renderInventoryTable(items) {
    const tableBody = document.getElementById('inventory-table-body');
    if (!tableBody) return;

    const canEditInventory = canEditInventoryRecords();

    tableBody.innerHTML = items.map(item => `
        <tr onclick="showItemDetails('${item.id}')" style="cursor: pointer;">
            <td>
                <div style="font-weight: 600;">${item.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">${item.category}</div>
            </td>
            <td><code>${item.serial_number || 'N/A'}</code></td>
            <td>${item.qty}</td>
            <td><span class="badge ${item.status === 'Booked In' ? 'badge-blue' : item.status === 'Good' ? 'badge-green' : item.status === 'Booked Out' ? 'badge-orange' : 'badge-red'}">${item.status === 'Booked In' ? 'Booked In' : item.status === 'Good' ? 'In Stock' : item.status || 'Unknown'}</span></td>
            <td>
                ${canEditInventory ? `<button class="btn btn-small" onclick="event.stopPropagation(); deleteInventoryItem('${item.id}')">Delete</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function applyInventoryFilter(category, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (category === 'all') {
        filteredInventory = [...allInventory];
    } else {
        filteredInventory = allInventory.filter(item => item.category === category);
    }
    renderInventoryTable(filteredInventory);
}

document.addEventListener('input', (e) => {
    if (e.target.id === 'inventory-search') {
        const query = e.target.value.toLowerCase();
        const searchResults = allInventory.filter(item =>
            item.name.toLowerCase().includes(query) ||
            (item.serial_number && item.serial_number.toLowerCase().includes(query)) ||
            item.category.toLowerCase().includes(query)
        );
        renderInventoryTable(searchResults);
    }
});

function showItemDetails(id) {
    const item = allInventory.find(i => i.id === id);
    if (!item) return;

    document.getElementById('detail-name').innerText = item.name;
    document.getElementById('detail-category').innerText = item.category;
    document.getElementById('detail-serial').innerText = item.serial_number || 'None';
    document.getElementById('detail-qty').innerText = item.qty;
    document.getElementById('detail-calibrated').innerText = item.calibration_date || 'No record';
    document.getElementById('detail-recalibration').innerText = item.re_calibration_date || 'No record';
    document.getElementById('detail-site').innerText = item.current_site_name || 'N/A';
    document.getElementById('detail-customer').innerText = item.current_customer || 'N/A';
    document.getElementById('detail-technician').innerText = item.current_technician_name || 'N/A';
    document.getElementById('detail-protocol').innerText = item.current_protocol_number || 'N/A';
    document.getElementById('detail-movement').innerText = item.last_movement_id || 'N/A';
    document.getElementById('detail-notes').innerText = item.notes || 'No extra notes available.';

    const badge = document.getElementById('detail-badge');
    badge.innerHTML = `<span class="badge ${item.status === 'Booked In' ? 'badge-blue' : item.status === 'Good' ? 'badge-green' : item.status === 'Warning' ? 'badge-orange' : 'badge-red'}">${item.status}</span>`;

    document.getElementById('itemDetailsModal').style.display = 'flex';
}

function openAddLoggerModal() {
    if (!canEditInventoryRecords()) {
        showInventoryPermissionError();
        return;
    }

    document.getElementById('addLoggerModal').style.display = 'flex';
}

function closeAddLoggerModal() {
    document.getElementById('addLoggerModal').style.display = 'none';
    document.getElementById('addLoggerForm').reset();
}

function handleCategoryChange(select) {
    const sw = document.getElementById('serialNumberWrapper');
    if (select.value === 'Battery') {
        sw.style.display = 'none';
    } else {
        sw.style.display = 'block';
    }
}

async function submitNewLogger(event) {
    event.preventDefault();
    if (!canEditInventoryRecords()) {
        showInventoryPermissionError();
        return;
    }

    const getVal = (id) => document.getElementById(id)?.value || '';

    const name = getVal('newLogName');
    const category = getVal('newLogCat');
    const serial = getVal('newLogSerial');
    const qty = Number.parseInt(getVal('newLogQty'), 10) || 1;
    const status = getVal('newLogStatus');
    const calibration_date = getVal('newLogCalDate');
    const re_calibration_date = getVal('newLogReCalDate');
    const current_site_name = getVal('newLogSite');
    const current_customer = getVal('newLogCustomer');
    const current_technician_name = getVal('newLogTech');
    const current_protocol_number = getVal('newLogProtocol');
    const ch_number = getVal('newLogCH');
    const cert_number = getVal('newLogCert');

    if (!serial) {
        showToast('Serial Number is required', 'error');
        return;
    }

    const registerTable = document.getElementById('batch-table-body-register');
    const isBatchRegisterActive = registerTable && (registerTable.offsetParent !== null || document.getElementById('sub-view-register')?.style.display !== 'none');

    if (isBatchRegisterActive) {
        if (typeof addSerialToBatch === 'function') {
            addSerialToBatch(serial, 'register', false, {
                category,
                name,
                qty,
                status,
                ch_number,
                calibration_cert: cert_number,
                calibration_date,
                re_calibration_date,
                current_site_name,
                current_customer,
                current_technician_name,
                current_protocol_number
            });
            if (typeof renderBatchTable === 'function') renderBatchTable('register');
            if (typeof showToast === 'function') showToast(`Added ${serial} to the register list.`, 'success');
        }
        return;
    }

    const submitButton = event.submitter || document.getElementById('submitLoggerBtn');

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerText = 'Saving...';
        }

        if (typeof showToast === 'function') showToast(`Saving ${serial} to inventory...`, 'info');
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Verifying serial number...');

        const { data: existing, error: checkError } = await window.supabaseClient
            .from('inventory')
            .select('serial_number')
            .eq('serial_number', serial)
            .maybeSingle();

        if (checkError) throw checkError;
        if (existing) {
            if (typeof showToast === 'function') showToast(`Asset with serial ${serial} already exists in the system.`, 'error');
            return;
        }

        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving asset...');
        const { error } = await window.supabaseClient.from('inventory').insert([{
            name,
            category,
            serial_number: category === 'Battery' ? null : serial,
            qty,
            status,
            calibration_date,
            re_calibration_date,
            current_site_name,
            current_customer,
            current_technician_name,
            current_protocol_number,
            ch_number,
            calibration_cert: cert_number,
            updated_at: new Date().toISOString()
        }]);

        if (error) throw error;

        if (typeof showRegistrationSuccess === 'function') {
            showRegistrationSuccess('Asset Registered Successfully!');
        }
        if (typeof showToast === 'function') showToast(`Asset ${serial} saved successfully.`, 'success');

        closeAddLoggerModal();
        await loadInventoryData();
        if (typeof loadInventoryDashboard === 'function') await loadInventoryDashboard();
        if (typeof loadAdvancedAssets === 'function') await loadAdvancedAssets();
    } catch (err) {
        console.error('Error adding asset:', err);
        if (typeof showToast === 'function') showToast('Failed to save asset: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerText = 'Save Asset';
        }
    }
}

function exportInventoryToExcel() {
    if (filteredInventory.length === 0) {
        if (typeof showToast === 'function') showToast('Nothing to export!', 'error');
        return;
    }

    const exportData = filteredInventory.map(item => ({
        Name: item.name,
        Category: item.category,
        SerialNumber: item.serial_number || '',
        Quantity: item.qty,
        Status: item.status,
        LastCalibrated: item.last_calibrated_date || '',
        Notes: item.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
    XLSX.writeFile(workbook, 'Inventory_Report.xlsx');
    if (typeof showToast === 'function') showToast('Inventory Excel export complete.', 'success');
}

function exportInventoryToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.text('Fairbridge Technologies - Inventory Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);

    const tableData = filteredInventory.map(item => [
        item.name, item.category, item.serial_number || '-', item.qty, item.status
    ]);

    doc.autoTable({
        head: [['Name', 'Category', 'Serial', 'Qty', 'Status']],
        body: tableData,
        startY: 30,
        theme: 'striped'
    });

    doc.save('Inventory_Report.pdf');
}

async function handleBulkSpreadsheetImport(event) {
    if (!canEditInventoryRecords()) {
        showInventoryPermissionError('Your role cannot import inventory records.');
        event.target.value = '';
        return;
    }

    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { defval: null });

            if (json.length === 0) {
                if (typeof showToast === 'function') showToast('File is empty!', 'error');
                return;
            }

            if (typeof showToast === 'function') showToast(`Importing ${file.name}...`, 'info');
            if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Processing Bulk Import...');

            const normalizeExcelDate = (val) => {
                if (!val) return null;
                if (val instanceof Date) {
                    try {
                        return val.toISOString().split('T')[0];
                    } catch (error) {
                        return null;
                    }
                }
                return String(val).trim();
            };

            const itemsToBatch = json.map(row => {
                let rawStatus = row.Status || row.status || 'In Stock';
                if (String(rawStatus).toLowerCase().includes('stock') || String(rawStatus).toLowerCase().includes('booked in')) {
                    rawStatus = 'In Stock';
                }

                return {
                    ch_number: row.CH_Number || row['CH Number'] || null,
                    serial_number: row.Serial_Number || row['Serial Number'] || row.Serial || null,
                    calibration_cert_number: row.Calibration_Certificate_Number || row['Calibration Certificate Number'] || null,
                    calibration_date: normalizeExcelDate(row.Calibration_Date || row['Calibration Date']),
                    re_calibration_date: normalizeExcelDate(row.Re_Calibration_Date || row['Re-Calibration_Date'] || row['Re-Calibration Date']),
                    status: rawStatus,
                    current_site_name: row.Current_Site_Name || row['Current Site Name'] || null,
                    current_customer: row.Current_Customer || row['Current Customer'] || null,
                    current_technician_name: row.Current_Technician || row['Current Technician'] || null,
                    current_protocol_number: row.Current_Protocol_Number || row['Current Protocol Number'] || null,
                    last_movement_id: row.Last_Movement_ID || row['Last Movement ID'] || null,
                    updated_by: row.Updated_By || row['Updated By'] || null,
                    name: row.Name || row['Asset Name'] || (row.CH_Number ? `Asset ${row.CH_Number}` : 'Unnamed Asset'),
                    category: row.Category || 'Logger',
                    qty: row.Quantity || 1
                };
            }).filter(item => item.serial_number);

            itemsToBatch.forEach(item => {
                if (typeof addSerialToBatch === 'function') {
                    addSerialToBatch(item.serial_number, 'register', true, item);
                }
            });

            if (typeof renderBatchTable === 'function') {
                renderBatchTable('register');
            }

            if (typeof verifyBatchList === 'function') {
                showToast(`Successfully appended ${itemsToBatch.length} assets. Verifying one-by-one...`, 'success');
                await verifyBatchList('register');
            }
        } catch (err) {
            console.error('Bulk Import error:', err);
            if (typeof showToast === 'function') showToast('Error during bulk import: ' + err.message, 'error');
        } finally {
            if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

async function handleInventoryImport(event) {
    handleBulkSpreadsheetImport(event);
}

async function deleteInventoryItem(id) {
    if (!canEditInventoryRecords()) {
        showInventoryPermissionError();
        return;
    }

    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
        if (typeof showToast === 'function') showToast('Deleting inventory item...', 'info');
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Deleting inventory item...');
        const { error } = await window.supabaseClient.from('inventory').delete().eq('id', id);
        if (error) throw error;
        if (typeof showToast === 'function') showToast('Inventory item deleted.', 'success');
        await loadInventoryData();
        if (typeof loadInventoryDashboard === 'function') await loadInventoryDashboard();
        if (typeof loadAdvancedAssets === 'function') await loadAdvancedAssets();
    } catch (err) {
        if (typeof showToast === 'function') showToast('Error deleting item: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}
