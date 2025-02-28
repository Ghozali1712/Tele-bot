const bwipjs = require('bwip-js');

/**
 * Fungsi untuk memproses kode PLU dan mengonversinya menjadi gambar barcode
 * @param {object} bot - Instance dari node-telegram-bot-api
 * @param {string} chatId - ID chat pengguna di Telegram
 * @param {string|number} kodePLU - Kode PLU yang akan diproses
 */
async function processMonitoringPriceTag(bot, chatId, kodePLU) {
    try {
        console.log(`🔍 Memproses PLU: ${kodePLU}`);

        // Validasi kodePLU
        if (!kodePLU || (typeof kodePLU !== 'string' && typeof kodePLU !== 'number')) {
            throw new Error("Kode PLU tidak valid.");
        }

        // Pastikan kodePLU adalah string sebelum dikirim ke bwip-js
        const barcodeData = String(kodePLU).trim();

        // Generate barcode dengan bwip-js
        const barcodeBuffer = await bwipjs.toBuffer({
            bcid: 'code128',          // Jenis barcode
            text: barcodeData,
            scale: 8,                 // Skala optimal untuk kejelasan
            height: 8,               // Tinggi lebih besar agar mudah dipindai
            includetext: true,        // Tampilkan teks di bawah barcode
            textxalign: 'center',     // Posisikan teks di tengah
            backgroundcolor: 'FFFFFF', // Latar belakang putih
            foregroundcolor: '000000', // Garis hitam
            paddingwidth: 10,         // Padding untuk visibilitas lebih baik
            paddingheight: 5          // Padding atas dan bawah
        }).catch(error => {
            console.error("❌ Gagal menghasilkan barcode:", error.message);
            throw new Error("Gagal menghasilkan barcode. Pastikan kode PLU valid.");
        });

        // Validasi buffer gambar
        if (!barcodeBuffer || barcodeBuffer.length === 0) {
            throw new Error("Buffer gambar barcode kosong.");
        }

        // Kirim gambar barcode ke Telegram
        await bot.sendPhoto(chatId, barcodeBuffer, {
            caption: `📌 *PLU:* ${barcodeData}`,
            parse_mode: "Markdown",
        });

        console.log(`✅ Gambar barcode untuk PLU ${barcodeData} berhasil dikirim.`);
    } catch (error) {
        console.error(`❌ Kesalahan saat memproses PLU ${kodePLU}:`, error.message);
        try {
            await bot.sendMessage(chatId, `⚠️ Terjadi kesalahan dalam memproses PLU: ${kodePLU}.\nError: ${error.message}`);
        } catch (err) {
            console.error("❌ Gagal mengirim pesan ke Telegram:", err.message);
        }
    }
}

module.exports = { processMonitoringPriceTag };