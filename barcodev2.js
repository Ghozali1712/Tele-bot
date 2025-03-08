const fs = require('fs').promises;
const path = require('path');
const workerpool = require('workerpool');
const os = require('os');
const PQueue = require('p-queue').default; // 🔹 Import library antrian
const { sendProtectedMessage } = require('./antiProtection'); // 🔹 Import proteksi

const barcodeCache = new Map();
let barcodeData = [];

// 🔹 Pindahkan konfigurasi ke file terpisah
const config = {
    ADMIN_LIST: new Set([5183628785, 987654321]), // 🔹 Ganti dengan daftar ID admin
    ADMIN_TELEGRAM_ID: 5183628785, // 🔹 Ganti dengan ID Telegram Admin
    MAX_WORKERS: Math.min(2, os.cpus().length), // Batasi maksimal 4 worker
    TEMP_DIR: path.join(__dirname, 'temp'), // Direktori untuk menyimpan file sementara
    BARCODE_FILE: path.join(__dirname, 'barcode.json'), // File data barcode
    LOG_FILE: path.join(__dirname, 'app.log') // File untuk menyimpan log
};

// 🔹 Validasi jumlah worker
if (config.MAX_WORKERS < 1) {
    config.MAX_WORKERS = 1; // Default ke 2 worker jika hasilnya tidak valid
}

// 🔹 Logger yang menyimpan log ke file
const log = {
    info: async (msg) => {
        const logMsg = `\x1b[32m[INFO]\x1b[0m ${msg}`;
        console.log(logMsg);
        await fs.appendFile(config.LOG_FILE, `${new Date().toISOString()} - ${logMsg}\n`);
    },
    warn: async (msg) => {
        const logMsg = `\x1b[33m[WARNING]\x1b[0m ${msg}`;
        console.warn(logMsg);
        await fs.appendFile(config.LOG_FILE, `${new Date().toISOString()} - ${logMsg}\n`);
    },
    error: async (msg) => {
        const logMsg = `\x1b[31m[ERROR]\x1b[0m ${msg}`;
        console.error(logMsg);
        await fs.appendFile(config.LOG_FILE, `${new Date().toISOString()} - ${logMsg}\n`);
    }
};

// 🔹 Memuat data barcode
async function loadBarcodeData() {
    try {
        await log.info("📂 Memuat data barcode...");
        const data = await fs.readFile(config.BARCODE_FILE, 'utf-8');
        barcodeData = JSON.parse(data)?.barcodesheet || [];

        if (barcodeData.length === 0) {
            await log.warn("⚠️ Data barcode kosong atau tidak ditemukan.");
        } else {
            await log.info(`✅ Data barcode berhasil dimuat (${barcodeData.length} entri).`);
        }
    } catch (error) {
        await log.error(`❌ Gagal membaca barcode.json: ${error.message}`);
        throw error;
    }
}

// 🔹 Konfigurasi worker pool
const pool = workerpool.pool(path.join(__dirname, 'worker.js'), { maxWorkers: config.MAX_WORKERS });
log.info(`🚀 Worker pool dibuat dengan ${config.MAX_WORKERS} pekerja.`);

// 🔹 Fungsi untuk membuat barcode
async function createBarcodeWithWorker(barcode) {
    if (barcodeCache.has(barcode)) {
        await log.info(`📌 Barcode untuk ${barcode} ditemukan di cache.`);
        return barcodeCache.get(barcode);
    }

    try {
        await log.info(`🛠 Membuat barcode untuk ${barcode}...`);
        const barcodeBuffer = await pool.exec('generateBarcode', [barcode]);
        barcodeCache.set(barcode, barcodeBuffer);
        await log.info(`✅ Barcode untuk ${barcode} berhasil dibuat.`);
        return barcodeBuffer;
    } catch (error) {
        await log.error(`❌ Gagal membuat barcode untuk ${barcode}: ${error.message}`);
        throw error;
    }
}

// 🔹 Fungsi untuk Mengirim Laporan PLU Tidak Ditemukan ke Admin
async function sendTelegramReport(bot, pluList, username) {
    const message = `
🔴 *Laporan PLU Tidak Ditemukan*
👤 *Pelapor:* @${username || "Tidak ada username"}
📌 *PLU yang Tidak Ditemukan:*
${pluList.join(', ')}
    `.trim();

    try {
        await sendWithRetry(bot, config.ADMIN_TELEGRAM_ID, null, message, { parse_mode: "Markdown" });
        await log.info(`✅ Laporan dikirim ke admin: ${message}`);
    } catch (error) {
        await log.error("❌ Gagal mengirim laporan ke admin:", error);
    }
}

// 🔹 Fungsi untuk Mengirim Pesan dengan Retry dan Backoff
async function sendWithRetry(bot, chatId, filePath, caption, options = {}, retries = 3, backoff = 1000) {
    try {
        if (filePath) {
            // 🔹 Kirim gambar dengan caption
            await bot.sendPhoto(chatId, filePath, { caption, ...options });
        } else {
            // 🔹 Kirim pesan teks biasa
            await bot.sendMessage(chatId, caption, options);
        }
    } catch (error) {
        if (error.response && error.response.statusCode === 429 && retries > 0) {
            const waitTime = error.response.body.parameters?.retry_after * 1000 || backoff; // Gunakan retry_after dari Telegram atau default backoff
            await log.warn(`⚠️ Rate limit terdeteksi. Menunggu ${waitTime}ms sebelum mencoba lagi...`);
            await delay(waitTime);
            return sendWithRetry(bot, chatId, filePath, caption, options, retries - 1, backoff * 2); // Exponential backoff
        } else {
            throw error; // Lempar error jika bukan 429 atau retries habis
        }
    }
}

// 🔹 Fungsi untuk Mengirim Pesan dengan Antrian
const queue = new PQueue({ concurrency: 1, interval: 1000 }); // 1 pesan per detik

async function sendWithQueue(bot, chatId, filePath, caption, options = {}) {
    await queue.add(() => sendWithRetry(bot, chatId, filePath, caption, options));
}

// 🔹 Fungsi untuk Delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 🔹 Fungsi Pencarian Barcode (Admin Dikecualikan dari Proteksi)
async function cariKodeDiExcelV2(bot, kodeList, chatId, userId) {
    try {
        await log.info(`🔍 Memulai pencarian untuk PLU: ${kodeList}`);
        await fs.mkdir(config.TEMP_DIR, { recursive: true });

        const kodeListArray = kodeList.split(/[\s,;]+/).map(kode => kode.trim());
        const notFoundPLUs = new Set(); // Untuk menyimpan PLU yang tidak ditemukan
        const foundPLUs = []; // Untuk menyimpan PLU yang ditemukan

        const isAdmin = config.ADMIN_LIST.has(userId); // Cek apakah pengguna adalah admin
        const user = await bot.getChat(chatId);
        const username = user.username || user.first_name;

        // 🔹 Periksa semua PLU dan kumpulkan yang tidak ditemukan
        for (const kode of kodeListArray) {
            // 🔹 Validasi input PLU
            if (!kode || !/^\d+$/.test(kode)) {
                await log.warn(`⚠️ PLU "${kode}" tidak valid.`);
                notFoundPLUs.add(kode); // Tambahkan ke daftar PLU tidak valid
                continue;
            }

            const hasil = barcodeData.filter(item =>
                item.plu.toString() === kode || item.barcode.toLowerCase().includes(kode.toLowerCase())
            );

            if (hasil.length === 0) {
                await log.warn(`⚠️ PLU "${kode}" tidak ditemukan di database.`);
                notFoundPLUs.add(kode); // Tambahkan ke daftar PLU tidak ditemukan
            } else {
                foundPLUs.push({ kode, hasil }); // Simpan PLU yang ditemukan beserta hasilnya
            }
        }

        // 🔹 Kirim gambar barcode yang ditemukan
        const sendPromises = []; // Untuk menyimpan semua promise pengiriman gambar
        for (const { kode, hasil } of foundPLUs) {
            await log.info(`✅ Ditemukan ${hasil.length} hasil untuk PLU "${kode}".`);

            for (const item of hasil) {
                const filePath = path.join(config.TEMP_DIR, `${item.barcode}.png`);

                try {
                    await log.info(`🔄 Membuat gambar barcode untuk PLU ${item.plu} (${item.barcode})...`);
                    const barcodeBuffer = await createBarcodeWithWorker(item.barcode);
                    await fs.writeFile(filePath, barcodeBuffer);
                    await log.info(`📦 Gambar barcode disimpan: ${filePath}`);

                    // 🔹 Buat caption dengan deskripsi produk
                    const caption = `
🔍 *Hasil Pencarian:*
🏷️ *PLU:* ${item.plu}
📦 *Barcode:* ${item.barcode}
📝 *Deskripsi:* ${item.deskripsi || "Tidak ada deskripsi"}
                    `.trim();

                    // 🔹 Tambahkan promise pengiriman gambar ke dalam array
                    const sendPromise = sendWithQueue(bot, chatId, filePath, caption, {
                        parse_mode: "Markdown",
                        protect_content: !isAdmin // 🔒 Non-admin tidak bisa forward, admin bebas
                    });
                    sendPromises.push(sendPromise);

                } catch (workerError) {
                    await log.error(`❌ Gagal membuat barcode untuk ${item.plu}: ${workerError.message}`);
                    notFoundPLUs.add(kode); // Tambahkan ke daftar PLU gagal diproses
                }
            }
        }

        // 🔹 Tunggu semua gambar selesai dikirim
        await Promise.all(sendPromises);

        // 🔹 Kirim notifikasi ke pengguna tentang PLU yang tidak ditemukan setelah semua gambar dikirim
        if (notFoundPLUs.size > 0) {
            const notFoundMessage = `
⚠️ *PLU Berikut Tidak Ditemukan:*
${[...notFoundPLUs].join(', ')}
            `.trim();

            await sendWithQueue(bot, chatId, null, notFoundMessage, { 
                parse_mode: "Markdown", 
                protect_content: !isAdmin 
            });

            // 🔹 Kirim laporan ke admin untuk semua PLU yang tidak ditemukan
            await sendTelegramReport(bot, [...notFoundPLUs], username);
        }

        await log.info(`✅ Semua barcode yang ditemukan telah diproses dan dikirim.`);

    } catch (error) {
        await log.error(`⚠️ Kesalahan pencarian barcode untuk "${kodeList}": ${error.message}`);
        await sendWithQueue(bot, chatId, null, `⚠️ Terjadi kesalahan saat mencari barcode.`, { protect_content: !isAdmin });
    }
}

// 🔹 Muat data barcode saat aplikasi dimulai
loadBarcodeData().catch(async (error) => {
    await log.error(`❌ Gagal memuat data barcode: ${error.message}`);
});

module.exports = { cariKodeDiExcelV2 };
