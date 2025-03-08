const bwipjs = require('bwip-js');
const workerpool = require('workerpool');

// Logger dengan warna
const log = {
    info: (msg) => console.log(`\x1b[32m[INFO]\x1b[0m ${msg}`),
    warn: (msg) => console.warn(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
    error: (msg) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
};

/**
 * Fungsi untuk membuat barcode berdasarkan data input.
 * @param {string} barcodeData - Data barcode yang akan dibuat.
 * @returns {Promise<Buffer>} - Buffer gambar barcode dalam format PNG.
 */
async function generateBarcode(barcodeData) {
    try {
        // Validasi input
        if (!barcodeData || typeof barcodeData !== 'string' || barcodeData.trim().length === 0) {
            throw new Error("⚠️ Input barcode tidak boleh kosong.");
        }

        if (barcodeData.length > 128) {
            throw new Error("⚠️ Barcode terlalu panjang. Maksimum 128 karakter.");
        }

        // Cegah karakter yang tidak valid dalam barcode
        const invalidChars = /[^A-Za-z0-9\-_]/g;
        if (invalidChars.test(barcodeData)) {
            throw new Error("⚠️ Barcode mengandung karakter tidak valid. Hanya A-Z, a-z, 0-9, '-', dan '_' yang diperbolehkan.");
        }

        log.info(`🔄 Membuat barcode untuk data: "${barcodeData}"`);

        // Generate barcode dengan bwip-js
        const barcodeBuffer = await bwipjs.toBuffer({
            bcid: 'code128',          // Jenis barcode
            text: barcodeData,
            scale: 50,                 // Skala optimal untuk kejelasan
            height: 15,               // Tinggi lebih besar agar mudah dipindai
            includetext: true,        // Tampilkan teks di bawah barcode
            textxalign: 'center',     // Posisikan teks di tengah
            backgroundcolor: 'FFFFFF', // Latar belakang putih
            foregroundcolor: '000000', // Garis hitam
            paddingwidth: 15,         // Padding untuk visibilitas lebih baik
            paddingheight: 10
        });

        log.info(`✅ Barcode untuk "${barcodeData}" berhasil dibuat.`);

        return barcodeBuffer;
    } catch (error) {
        log.error(`❌ Gagal membuat barcode untuk "${barcodeData}": ${error.message || error}`);
        throw new Error(`❌ Gagal membuat barcode untuk "${barcodeData}". Periksa input dan coba lagi.`);
    }
}

// Daftarkan fungsi ke workerpool
workerpool.worker({
    generateBarcode
});
