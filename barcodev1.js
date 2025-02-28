const fs = require('fs').promises;
const path = require('path');

async function tambahData(entries, filePath) {
    try {
        filePath = path.resolve(filePath);

        try {
            await fs.access(filePath);
        } catch {
            await fs.writeFile(filePath, JSON.stringify({ barcodesheet: [] }, null, 4));
        }

        let data;
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            data = JSON.parse(fileContent);
        } catch (error) {
            console.error(`❌ Gagal membaca file JSON: ${error.message}`);
            throw new Error('⚠️ File JSON tidak dapat dibaca atau rusak.');
        }

        const existingPLUs = new Set(data.barcodesheet.map(item => item.plu));
        const existingBarcodes = new Set(data.barcodesheet.map(item => item.barcode));

        let berhasilDitambah = [];
        let gagalDitambah = [];

        for (const entry of entries) {
            const parts = entry.split(',').map(e => e.trim());

            if (parts.length !== 2) {
                gagalDitambah.push({ entry, alasan: "Format tidak valid (harus 'PLU, Barcode')" });
                continue;
            }

            const [plu, barcode] = parts;

            if (!/^\d+$/.test(plu) || !/^\d+$/.test(barcode)) {
                gagalDitambah.push({ entry, alasan: "PLU atau barcode harus berupa angka" });
                continue;
            }

            if (existingPLUs.has(plu) || existingBarcodes.has(barcode)) {
                gagalDitambah.push({ entry, alasan: "PLU atau barcode sudah ada" });
                continue;
            }

            data.barcodesheet.push({ plu, barcode });
            berhasilDitambah.push(entry);
            existingPLUs.add(plu);
            existingBarcodes.add(barcode);
        }

        try {
            await fs.writeFile(filePath, JSON.stringify(data, null, 4));
        } catch (error) {
            console.error(`❌ Gagal menyimpan data ke file JSON: ${error.message}`);
            throw new Error('⚠️ Gagal menyimpan perubahan ke file.');
        }

        console.log(`✅ Data berhasil ditambahkan: ${berhasilDitambah.length > 0 ? berhasilDitambah.join(', ') : "Tidak ada data baru."}`);

        if (gagalDitambah.length > 0) {
            console.log(`⚠️ Data gagal ditambahkan:`);
            gagalDitambah.forEach(item => {
                console.log(`❌ Gagal: ${item.entry} → Alasan: ${item.alasan}`);
            });
        }

        return { berhasilDitambah, gagalDitambah };
    } catch (err) {
        console.error(`❌ Gagal menambah data: ${err.message}`);
        throw new Error('⚠️ Terjadi kesalahan saat memproses data.');
    }
}

module.exports = { tambahData };
