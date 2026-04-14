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

        // Update dashboard stats if visible
        if (typeof updateDashboardStats === 'function') updateDashboardStats(allInventory);
    } catch (err) {
        console.error("Inventory error:", err);
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

/**
 * Advanced Filters
 */
function applyInventoryFilter(category, btn) {
    // Update UI active state
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (category === 'all') {
        filteredInventory = [...allInventory];
    } else {
        filteredInventory = allInventory.filter(item => item.category === category);
    }
    renderInventoryTable(filteredInventory);
}

// Search functionality integration
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

/**
 * Item Drill-down
 */
function showItemDetails(id) {
    const item = allInventory.find(i => i.id === id);
    if (!item) return;

    document.getElementById('detail-name').innerText = item.name;
    document.getElementById('detail-category').innerText = item.category;
    document.getElementById('detail-serial').innerText = item.serial_number || 'None';
    document.getElementById('detail-qty').innerText = item.qty;
    document.getElementById('detail-calibrated').innerText = item.last_calibrated_date || 'No record';
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

    const btn = document.getElementById('submitLoggerBtn');

    const name = document.getElementById('newLogName').value;
    const category = document.getElementById('newLogCat').value;
    const serial = document.getElementById('newLogSerial').value;
    const qty = document.getElementById('newLogQty').value;
    const status = document.getElementById('newLogStatus').value;

    btn.disabled = true;
    btn.innerText = 'Saving...';

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving asset...');
        const { error } = await window.supabaseClient.from('inventory').insert([{
            name,
            category,
            serial_number: category === 'Battery' ? null : serial,
            qty: parseInt(qty),
            status
        }]);

        if (error) throw error;

        if (typeof showToast === 'function') showToast('Asset added successfully!', 'success');
        closeAddLoggerModal();
        loadInventoryData();
    } catch (err) {
        console.error("Error adding asset:", err);
        if (typeof showToast === 'function') showToast('Error adding asset: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
        btn.disabled = false;
        btn.innerText = 'Save Asset';
    }
}

/**
 * Export Logic
 */
function exportInventoryToExcel() {
    if (filteredInventory.length === 0) {
        if (typeof showToast === 'function') showToast('Nothing to export!', 'error');
        return;
    }

    // Prepare data (remove system fields)
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    XLSX.writeFile(workbook, "Inventory_Report.xlsx");
    if (typeof showToast === 'function') showToast('Inventory Excel export complete.', 'success');
}

function exportInventoryToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.text("Fairbridge Technologies - Inventory Report", 14, 15);
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

    doc.save("Inventory_Report.pdf");
}

/**
 * Import Logic
 */
async function handleInventoryImport(event) {
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
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            if (json.length === 0) {
                if (typeof showToast === 'function') showToast('File is empty!', 'error');
                return;
            }

            // Map and Validate
            const itemsToInsert = json.map(row => ({
                name: row.Name || row.name || 'Unnamed Item',
                category: row.Category || row.category || 'Other',
                serial_number: row.SerialNumber || row.serial_number || null,
                qty: parseInt(row.Quantity || row.qty || 1),
                status: row.Status || row.status || 'Good',
                notes: row.Notes || row.notes || ''
            }));

            console.log("Importing items:", itemsToInsert);

            if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Importing inventory...');
            const { error } = await window.supabaseClient
                .from('inventory')
                .upsert(itemsToInsert, { onConflict: 'serial_number' });

            if (error) throw error;

            if (typeof showToast === 'function') showToast(`Successfully imported ${itemsToInsert.length} items!`, 'success');
            loadInventoryData(); // Refresh both DB and UI

        } catch (err) {
            console.error("Import error:", err);
            if (typeof showToast === 'function') showToast('Error importing file: ' + err.message, 'error');
        } finally {
            if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function deleteInventoryItem(id) {
    if (!canEditInventoryRecords()) {
        showInventoryPermissionError();
        return;
    }

    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Deleting inventory item...');
        const { error } = await window.supabaseClient.from('inventory').delete().eq('id', id);
        if (error) throw error;
        if (typeof showToast === 'function') showToast('Inventory item deleted.', 'success');
        loadInventoryData();
    } catch (err) {
        if (typeof showToast === 'function') showToast('Error deleting item: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}
