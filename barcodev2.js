const fs = require('fs').promises;
const path = require('path');
const workerpool = require('workerpool');
const os = require('os');
const { sendProtectedMessage } = require('./antiProtection'); // 🔹 Import proteksi

const barcodeCache = new Map();
let barcodeData = [];

const ADMIN_LIST = new Set([5183628785, 987654321]); // 🔹 Ganti dengan daftar ID admin
const ADMIN_TELEGRAM_ID = 5183628785; // 🔹 Ganti dengan ID Telegram Admin

// Logger
const log = {
    info: (msg) => console.log(`\x1b[32m[INFO]\x1b[0m ${msg}`),
    warn: (msg) => console.warn(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
    error: (msg) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
};

// **Memuat data barcode**
async function loadBarcodeData() {
    try {
        log.info("📂 Memuat data barcode...");
        const data = await fs.readFile(path.join(__dirname, 'barcode.json'), 'utf-8');
        barcodeData = JSON.parse(data)?.barcodesheet || [];

        if (barcodeData.length === 0) {
            log.warn("⚠️ Data barcode kosong atau tidak ditemukan.");
        } else {
            log.info(`✅ Data barcode berhasil dimuat (${barcodeData.length} entri).`);
        }
    } catch (error) {
        log.error(`❌ Gagal membaca barcode.json: ${error.message}`);
    }
}
loadBarcodeData();

// **Konfigurasi worker pool**
const numWorkers = Math.max(2, os.cpus().length - 2);
const pool = workerpool.pool(path.join(__dirname, 'worker.js'), { maxWorkers: numWorkers });
log.info(`🚀 Worker pool dibuat dengan ${numWorkers} pekerja.`);

// **Fungsi untuk membuat barcode**
async function createBarcodeWithWorker(barcode) {
    if (barcodeCache.has(barcode)) {
        log.info(`📌 Barcode untuk ${barcode} ditemukan di cache.`);
        return barcodeCache.get(barcode);
    }

    try {
        log.info(`🛠 Membuat barcode untuk ${barcode}...`);
        const barcodeBuffer = await pool.exec('generateBarcode', [barcode]);
        barcodeCache.set(barcode, barcodeBuffer);
        log.info(`✅ Barcode untuk ${barcode} berhasil dibuat.`);
        return barcodeBuffer;
    } catch (error) {
        log.error(`❌ Gagal membuat barcode untuk ${barcode}: ${error.message}`);
        throw error;
    }
}

// **Fungsi untuk Mengirim Laporan PLU Tidak Ditemukan ke Admin**
async function sendTelegramReport(bot, plu, username) {
    const message = `🔴 *Laporan PLU Tidak Ditemukan*\n\n📌 *PLU:* ${plu}\n👤 *Pelapor:* @${username || "Tidak ada username"}`;

    try {
        await bot.sendMessage(ADMIN_TELEGRAM_ID, message, { parse_mode: "Markdown" });
        log.info(`✅ Laporan dikirim ke admin: ${message}`);
    } catch (error) {
        log.error("❌ Gagal mengirim laporan ke admin:", error);
    }
}

// **Fungsi Pencarian Barcode (Admin Dikecualikan dari Proteksi)**
async function cariKodeDiExcelV2(bot, kodeList, chatId, userId) {
    try {
        log.info(`🔍 Memulai pencarian untuk PLU: ${kodeList}`);
        const tempDir = path.join(__dirname, 'temp');
        await fs.mkdir(tempDir, { recursive: true });

        const kodeListArray = kodeList.split(/[\s,;]+/).map(kode => kode.trim());
        const notFoundPLUs = new Set(); // Untuk menyimpan PLU yang tidak ditemukan

        const isAdmin = ADMIN_LIST.has(userId); // Cek apakah pengguna adalah admin
        const user = await bot.getChat(chatId);
        const username = user.username || user.first_name;

        for (const kode of kodeListArray) {
            const hasil = barcodeData.filter(item =>
                item.plu.toString() === kode || item.barcode.toLowerCase().includes(kode.toLowerCase())
            );

            if (hasil.length === 0) {
                log.warn(`⚠️ PLU "${kode}" tidak ditemukan di database.`);
                notFoundPLUs.add(kode);
                continue;
            }

            log.info(`✅ Ditemukan ${hasil.length} hasil untuk PLU "${kode}".`);

            for (const item of hasil) {
                const filePath = path.join(tempDir, `${item.barcode}.png`);

                try {
                    log.info(`🔄 Membuat gambar barcode untuk PLU ${item.plu} (${item.barcode})...`);
                    const barcodeBuffer = await createBarcodeWithWorker(item.barcode);
                    await fs.writeFile(filePath, barcodeBuffer);
                    log.info(`📦 Gambar barcode disimpan: ${filePath}`);

                    // **Mengirim gambar barcode dengan atau tanpa proteksi**
                    await bot.sendPhoto(chatId, filePath, {
                        caption: `🔍 *Hasil Pencarian:*\n🏷️ *PLU:* ${item.plu}\n📦 *Barcode:* ${item.barcode}`,
                        parse_mode: "Markdown",
                        protect_content: !isAdmin // 🔒 Non-admin tidak bisa forward, admin bebas
                    });

                } catch (workerError) {
                    log.error(`❌ Gagal membuat barcode untuk ${item.plu}: ${workerError.message}`);
                    notFoundPLUs.add(kode);
                }
            }
        }

        // **Kirim notifikasi jika ada PLU yang tidak ditemukan**
        if (notFoundPLUs.size > 0) {
            const notFoundMessage = `⚠️ PLU berikut tidak ditemukan di database:\n${[...notFoundPLUs].join(', ')}`;
            await sendProtectedMessage(bot, chatId, notFoundMessage);

            // **Kirim laporan ke admin untuk setiap PLU yang tidak ditemukan**
            for (const plu of notFoundPLUs) {
                await sendTelegramReport(bot, plu, username);
            }
        }

        log.info(`✅ Semua barcode yang ditemukan telah diproses dan dikirim.`);

    } catch (error) {
        log.error(`⚠️ Kesalahan pencarian barcode untuk "${kodeList}": ${error.message}`);
        await sendProtectedMessage(bot, chatId, `⚠️ Terjadi kesalahan saat mencari barcode.`);
    }
}

module.exports = { cariKodeDiExcelV2 };
