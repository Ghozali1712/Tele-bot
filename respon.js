require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { tambahData } = require('./barcodev1');
const { cariKodeDiExcelV2 } = require('./barcodev2');
const { processMonitoringPriceTag } = require('./pluProcessor');
const { restartBot } = require('./restartBot');
const { sendProtectedMessage } = require('./antiProtection');
const { getUserRaks, saveUserRaks, deleteRak } = require('./rakManager');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
    console.error("❌ Token bot tidak ditemukan! Pastikan variabel TELEGRAM_BOT_TOKEN sudah diset.");
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

const userState = new Map();
const ADMIN_LIST = new Set([5183628785, 987654321]);
const ALLOWED_GROUPS = new Set([-1001234567890, -1009876543210]);

const isAdmin = (userId) => ADMIN_LIST.has(userId);
const isAllowedGroup = (chatId) => ALLOWED_GROUPS.has(chatId);

const getMainMenuKeyboard = (isAdmin) => ({
    reply_markup: {
        keyboard: isAdmin
            ? [["Tambah Data", "Pencarian Barcode"], ["Monitoring Price Tag", "Restart Bot", "Tambah Rak Simpan", "Pilih Rak"]]
            : [["Pencarian Barcode", "Monitoring Price Tag", "Tambah Rak Simpan", "Pilih Rak"]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
});

// **Antrian Pesan**
const messageQueue = [];
let isProcessingQueue = false;

const processQueue = async () => {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    const { chatId, message, options } = messageQueue.shift();
    try {
        await bot.sendMessage(chatId, message, options);
    } catch (error) {
        if (error.response && error.response.statusCode === 429) {
            const retryAfter = error.response.body.parameters.retry_after || 1;
            console.log(`⚠️ Terkena rate limit. Menunggu ${retryAfter} detik...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            messageQueue.unshift({ chatId, message, options }); // Masukkan kembali ke antrian
        } else {
            console.error(`❌ Gagal mengirim pesan ke ${chatId}:`, error);
        }
    }

    isProcessingQueue = false;
    setTimeout(processQueue, 1000); // Jeda 1 detik sebelum mengirim pesan berikutnya
};

const sendMessageWithQueue = (chatId, message, options = {}) => {
    messageQueue.push({ chatId, message, options });
    processQueue();
};

// **Handler untuk /start**
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
        if (!isAllowedGroup(chatId)) {
            return sendMessageWithQueue(chatId, "⚠️ *Grup ini tidak diizinkan menggunakan bot!*");
        }
    }

    const menuKeyboard = getMainMenuKeyboard(isAdmin(userId));
    await sendMessageWithQueue(chatId, "👋 Selamat datang! Tekan tombol *Start* untuk membuka menu utama.", {
        reply_markup: { inline_keyboard: [[{ text: "🚀 Start", callback_data: "open_main_menu" }]] }
    });

    userState.set(chatId, { menuKeyboard });
});

// **Handler untuk tombol Start**
bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data === "open_main_menu") {
        const menuKeyboard = getMainMenuKeyboard(isAdmin(userId));
        await sendMessageWithQueue(chatId, "📌 *Menu Utama:*", menuKeyboard);
    } else if (data.startsWith("select_rak:")) {
        const rakName = data.split(":")[1];
        return handleAksiRak(chatId, userId, rakName);
    } else if (data.startsWith("delete_rak:")) {
        const rakName = data.split(":")[1];
        return handleDeleteRak(chatId, userId, rakName);
    }

    bot.answerCallbackQuery(callbackQuery.id);
});

// **Fitur Mapping**
const FITUR_MAPPING = {
    "Tambah Data": { handler: handleTambahData, adminOnly: true },
    "Pencarian Barcode": { handler: handlePJR, adminOnly: false },
    "Monitoring Price Tag": { handler: handleMonitoring, adminOnly: false },
    "Restart Bot": { handler: handleRestart, adminOnly: true },
    "Tambah Rak Simpan": { handler: handleTambahRak, adminOnly: false },
    "Pilih Rak": { handler: handlePilihRak, adminOnly: false }
};

// **Handler untuk pesan masuk**
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text?.trim();

    if (!text) return;

    if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
        if (!isAllowedGroup(chatId)) {
            console.log(`❌ Grup ${chatId} tidak diizinkan.`);
            return;
        }
    }

    const fitur = FITUR_MAPPING[text];
    if (fitur) {
        if (fitur.adminOnly && !isAdmin(userId)) {
            return sendMessageWithQueue(chatId, "⚠️ *Anda tidak memiliki izin untuk fitur ini!*", getMainMenuKeyboard(false));
        }
        await fitur.handler(chatId, userId);
        return;
    }

    if (userState.has(chatId)) {
        const state = userState.get(chatId);
        if (state.handler) await state.handler(chatId, text, userId);
    }
});

// **Fungsi Tambah Data**
async function handleTambahData(chatId, userId) {
    await sendMessageWithQueue(chatId, "✅ *Tambah Data* diaktifkan.\n📌 Kirim *PLU,BARCODE* untuk ditambahkan.", {}, userId);
    userState.set(chatId, { handler: processTambahData });
}

async function processTambahData(chatId, message, userId) {
    const entries = message.split('\n').map(line => line.trim()).filter(Boolean);
    if (!entries.length) {
        return sendMessageWithQueue(chatId, "⚠️ *Format salah!* Gunakan: *PLU,BARCODE*\n📌 Contoh: *12345,6789012345678*", {}, userId);
    }

    try {
        const { berhasilDitambah, gagalDitambah } = await tambahData(entries, './barcode.json');
        let response = `✅ *Data berhasil ditambahkan:*\n${berhasilDitambah.join('\n') || "Tidak ada data baru."}`;
        if (gagalDitambah.length) response += `\n⚠️ *Data gagal ditambahkan:* ${gagalDitambah.join(', ')}`;

        await sendMessageWithQueue(chatId, response, getMainMenuKeyboard(true), userId);
    } catch (error) {
        console.error("❌ Kesalahan di processTambahData:", error);
        await sendMessageWithQueue(chatId, "❌ *Gagal menambahkan data. Silakan coba lagi.*", getMainMenuKeyboard(true), userId);
    }
}

// **Fungsi PJR**
async function handlePJR(chatId, userId) {
    await sendMessageWithQueue(chatId, "✅ *Pencarian Barcode* diaktifkan.\n📌 Kirim kode *PLU* yang ingin dicari barcode-nya.", {}, userId);
    userState.set(chatId, { handler: (chatId, message) => processPJR(chatId, message, userId) });
}

async function processPJR(chatId, message, userId) {
    const kodePLUs = message.split(/[\s,;]+/).filter(kode => /^\d+$/.test(kode));
    if (!kodePLUs.length) return sendMessageWithQueue(chatId, "⚠️ *Masukkan kode PLU yang valid!*", {}, userId);

    try {
        await Promise.all(kodePLUs.map(async (kode) => {
            await cariKodeDiExcelV2(bot, kode, chatId, userId);
        }));
    } catch (error) {
        console.error(`❌ Gagal memproses PJR untuk beberapa PLU:`, error);
    }
}

// **Fungsi Monitoring Price Tag**
async function handleMonitoring(chatId, userId) {
    await sendMessageWithQueue(chatId, "✅ *Monitoring Price Tag* diaktifkan.\n📌 Kirim kode *PLU* yang ingin diubah jadi gambar.", {}, userId);
    userState.set(chatId, { handler: (chatId, message) => processMonitoring(chatId, message, userId) });
}

async function processMonitoring(chatId, message, userId) {
    const kodePLUs = message.split(/[\s,;]+/).filter(kode => /^\d+$/.test(kode));
    if (!kodePLUs.length) return sendMessageWithQueue(chatId, "⚠️ *Masukkan kode PLU yang valid!*", {}, userId);

    try {
        await Promise.all(kodePLUs.map(async (kode) => {
            await processMonitoringPriceTag(bot, chatId, kode);
        }));
    } catch (error) {
        console.error(`❌ Gagal memproses Monitoring Price Tag untuk beberapa PLU:`, error);
    }
}

// **Fungsi Restart Bot**
async function handleRestart(chatId, userId) {
    await sendMessageWithQueue(chatId, "⏳ *Bot sedang direstart...*", {}, userId);
    restartBot(bot, chatId);
}

// **Fungsi Tambah Rak Simpan**
async function handleTambahRak(chatId, userId) {
    await sendMessageWithQueue(chatId, "📌 Silakan kirim *nama rak* yang ingin Anda buat.", { parse_mode: "Markdown" }, userId);
    userState.set(chatId, { handler: processTambahRak });
}

async function processTambahRak(chatId, rakName, userId) {
    if (!rakName.trim() || rakName.length > 50 || !/^[a-zA-Z0-9\s\-_]+$/.test(rakName)) {
        return sendMessageWithQueue(chatId, "⚠️ Nama rak tidak valid! Hanya boleh mengandung huruf, angka, spasi, -, dan _. Maksimal 50 karakter.", {}, userId);
    }

    const userRaks = getUserRaks(userId);
    if (userRaks[rakName]) {
        return sendMessageWithQueue(chatId, "⚠️ Nama rak ini sudah ada! Silakan gunakan nama lain.", {}, userId);
    }

    userRaks[rakName] = [];
    saveUserRaks(userId, userRaks);

    await sendMessageWithQueue(chatId, `✅ Rak *${rakName}* berhasil ditambahkan.\n📌 Sekarang kirimkan PLU yang ingin dimasukkan ke rak ini (pisahkan dengan koma atau baris baru).`, { parse_mode: "Markdown" }, userId);

    userState.set(chatId, { handler: (chatId, message, userId) => processTambahPLUKeRak(chatId, message, userId, rakName) });
}

async function processTambahPLUKeRak(chatId, message, userId, rakName) {
    const userRaks = getUserRaks(userId);
    if (!userRaks[rakName]) {
        return sendMessageWithQueue(chatId, "⚠️ Rak tidak ditemukan!", {}, userId);
    }

    const pluList = [...new Set(message.split(/[\s,;\n]+/).filter(kode => /^\d+$/.test(kode)))]; // Perbaikan di sini

    if (pluList.length === 0) {
        return sendMessageWithQueue(chatId, "⚠️ Tidak ada PLU valid yang ditemukan!", {}, userId);
    }

    userRaks[rakName] = [...new Set([...userRaks[rakName], ...pluList])];
    saveUserRaks(userId, userRaks);

    await sendMessageWithQueue(chatId, `✅ ${pluList.length} PLU berhasil ditambahkan ke rak *${rakName}*.\n\n📌 Anda dapat memilih rak melalui menu utama.`, { parse_mode: "Markdown" }, userId);
    userState.delete(chatId);
}

// **Fungsi Pilih Rak**
async function handlePilihRak(chatId, userId) {
    const userRaks = getUserRaks(userId);
    if (Object.keys(userRaks).length === 0) {
        return sendMessageWithQueue(chatId, "⚠️ Anda belum memiliki rak yang disimpan. Gunakan fitur *Tambah Rak Simpan* terlebih dahulu.", { parse_mode: "Markdown" }, userId);
    }

    const rakButtons = Object.keys(userRaks).map(rakName => [
        { text: rakName, callback_data: `select_rak:${rakName}` },
        { text: `❌ Hapus ${rakName}`, callback_data: `delete_rak:${rakName}` }
    ]);

    await sendMessageWithQueue(chatId, "📌 Pilih rak yang ingin Anda gunakan atau hapus:", {
        reply_markup: { inline_keyboard: rakButtons }
    }, userId);
}

// **Fungsi Aksi Rak**
async function handleAksiRak(chatId, userId, rakName) {
    const userRaks = getUserRaks(userId);
    if (!userRaks[rakName]) {
        return sendMessageWithQueue(chatId, "⚠️ Rak tidak ditemukan!", {}, userId);
    }

    const pluList = userRaks[rakName];
    if (pluList.length === 0) {
        return sendMessageWithQueue(chatId, "⚠️ Rak ini masih kosong!", {}, userId);
    }

    let pluMessage = `PLU dalam rak *${rakName}*:\n`;
    pluMessage += pluList.join("\n");
    await sendMessageWithQueue(chatId, pluMessage, { parse_mode: "Markdown" }, userId);

    await processPJR(chatId, pluList.join("\n"), userId);
}

// **Fungsi Hapus Rak**
async function handleDeleteRak(chatId, userId, rakName) {
    const isDeleted = deleteRak(userId, rakName);
    if (isDeleted) {
        await sendMessageWithQueue(chatId, `✅ Rak *${rakName}* berhasil dihapus.`, { parse_mode: "Markdown" }, userId);
    } else {
        await sendMessageWithQueue(chatId, "⚠️ Gagal menghapus rak. Rak tidak ditemukan.", {}, userId);
    }

    await handlePilihRak(chatId, userId);
}

console.log("✅ Bot Telegram berjalan...");

module.exports = { bot };
