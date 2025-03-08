const fs = require('fs').promises;
const path = require('path');
const workerpool = require('workerpool');
const os = require('os');
const PQueue = require('p-queue').default; // 🔹 Import library antrian
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
let numWorkers = Math.min(4, os.cpus().length); // Batasi maksimal 4 worker
if (numWorkers < 1) {
    numWorkers = 2; // Default ke 2 worker jika hasilnya tidak valid
}
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
        await sendWithRetry(bot, ADMIN_TELEGRAM_ID, null, message, { parse_mode: "Markdown" });
        log.info(`✅ Laporan dikirim ke admin: ${message}`);
    } catch (error) {
        log.error("❌ Gagal mengirim laporan ke admin:", error);
    }
}

// **Fungsi untuk Mengirim Pesan dengan Retry dan Backoff**
async function sendWithRetry(bot, chatId, filePath, caption, options = {}, retries = 3, backoff = 1000) {
    try {
        if (filePath) {
            await bot.sendPhoto(chatId, filePath, { caption, ...options });
        } else {
            await bot.sendMessage(chatId, caption, options);
        }
    } catch (error) {
        if (error.response && error.response.statusCode === 429 && retries > 0) {
            const waitTime = error.response.body.parameters?.retry_after * 1000 || backoff; // Gunakan retry_after dari Telegram atau default backoff
            log.warn(`⚠️ Rate limit terdeteksi. Menunggu ${waitTime}ms sebelum mencoba lagi...`);
            await delay(waitTime);
            return sendWithRetry(bot, chatId, filePath, caption, options, retries - 1, backoff * 2); // Exponential backoff
        } else {
            throw error; // Lempar error jika bukan 429 atau retries habis
        }
    }
}

// **Fungsi untuk Mengirim Pesan dengan Antrian**
const queue = new PQueue({ concurrency: 1, interval: 1000 }); // 1 pesan per detik

async function sendWithQueue(bot, chatId, filePath, caption, options = {}) {
    await queue.add(() => sendWithRetry(bot, chatId, filePath, caption, options));
}

// **Fungsi untuk Delay**
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

                    // **Buat caption dengan deskripsi produk**
                    const caption = `
🔍 *Hasil Pencarian:*
🏷️ *PLU:* ${item.plu}
📦 *Barcode:* ${item.barcode}
📝 *Deskripsi:* ${item.deskripsi || "Tidak ada deskripsi"}
                    `.trim();

                    // **Mengirim gambar barcode dengan atau tanpa proteksi**
                    await sendWithQueue(bot, chatId, filePath, {
                        caption: caption,
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
            await sendWithQueue(bot, chatId, null, notFoundMessage);

            // **Kirim laporan ke admin untuk setiap PLU yang tidak ditemukan**
            for (const plu of notFoundPLUs) {
                await sendTelegramReport(bot, plu, username);
            }
        }

        log.info(`✅ Semua barcode yang ditemukan telah diproses dan dikirim.`);

    } catch (error) {
        log.error(`⚠️ Kesalahan pencarian barcode untuk "${kodeList}": ${error.message}`);
        await sendWithQueue(bot, chatId, null, `⚠️ Terjadi kesalahan saat mencari barcode.`);
    }
}

module.exports = { cariKodeDiExcelV2 };
