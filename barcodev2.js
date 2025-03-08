const fs = require('fs').promises;
const path = require('path');
const workerpool = require('workerpool');
const os = require('os');
const { sendProtectedMessage } = require('./antiProtection'); // 🔹 Import proteksi

const barcodeCache = new Map();
let barcodeData = [];

// 🔹 Konfigurasi
const config = {
    ADMIN_LIST: new Set([5183628785, 987654321]), // 🔹 Ganti dengan daftar ID admin
    ADMIN_TELEGRAM_ID: 5183628785, // 🔹 Ganti dengan ID Telegram Admin
    MAX_WORKERS: Math.min(4, os.cpus().length), // Batasi maksimal 4 worker
    TEMP_DIR: path.join(__dirname, 'temp'), // Direktori untuk menyimpan file sementara
    BARCODE_FILE: path.join(__dirname, 'barcode.json'), // File data barcode
    LOG_FILE: path.join(__dirname, 'app.log'), // File untuk menyimpan log
    MESSAGE_DELAY: 2000 // 🔹 Jeda 2 detik antara pengiriman pesan
};

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

// 🔹 Fungsi untuk Mengirim Pesan dengan Jeda
async function sendWithDelay(bot, chatId, filePath, caption, options = {}) {
    try {
        if (filePath) {
            await bot.sendPhoto(chatId, filePath, { caption, ...options });
        } else {
            await bot.sendMessage(chatId, caption, options);
        }
    } catch (error) {
        if (error.response && error.response.statusCode === 429) {
            const waitTime = error.response.body.parameters?.retry_after * 1000 || config.MESSAGE_DELAY;
            await log.warn(`⚠️ Rate limit terdeteksi. Menunggu ${waitTime}ms sebelum mencoba lagi...`);
            await delay(waitTime);
            return sendWithDelay(bot, chatId, filePath, caption, options); // Coba lagi setelah menunggu
        } else {
            throw error; // Lempar error jika bukan 429
        }
    }
}

// 🔹 Fungsi untuk Delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 🔹 Fungsi Pencarian Barcode
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

        // 🔹 Kirim gambar barcode yang ditemukan satu per satu
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

                    // 🔹 Kirim pesan dengan jeda
                    await sendWithDelay(bot, chatId, filePath, caption, {
                        parse_mode: "Markdown",
                        protect_content: !isAdmin // 🔒 Non-admin tidak bisa forward, admin bebas
                    });

                    // 🔹 Tunggu jeda waktu sebelum mengirim pesan berikutnya
                    await delay(config.MESSAGE_DELAY);

                } catch (workerError) {
                    await log.error(`❌ Gagal membuat barcode untuk ${item.plu}: ${workerError.message}`);
                    notFoundPLUs.add(kode); // Tambahkan ke daftar PLU gagal diproses
                }
            }
        }

        // 🔹 Kirim notifikasi ke pengguna tentang PLU yang tidak ditemukan
        if (notFoundPLUs.size > 0) {
            const notFoundMessage = `
⚠️ *PLU Berikut Tidak Ditemukan:*
${[...notFoundPLUs].join(', ')}
            `.trim();

            await sendWithDelay(bot, chatId, null, notFoundMessage, { 
                parse_mode: "Markdown", 
                protect_content: !isAdmin 
            });
        }

        await log.info(`✅ Semua barcode yang ditemukan telah diproses dan dikirim.`);

    } catch (error) {
        await log.error(`⚠️ Kesalahan pencarian barcode untuk "${kodeList}": ${error.message}`);
        await sendWithDelay(bot, chatId, null, `⚠️ Terjadi kesalahan saat mencari barcode.`, { protect_content: !isAdmin });
    }
}

// 🔹 Muat data barcode saat aplikasi dimulai
loadBarcodeData().catch(async (error) => {
    await log.error(`❌ Gagal memuat data barcode: ${error.message}`);
});

module.exports = { cariKodeDiExcelV2 };
