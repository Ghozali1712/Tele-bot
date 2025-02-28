const fs = require('fs');
const path = require('path');
const { sendProtectedMessage } = require('./antiProtection');
const { userState } = require('./respon'); // Impor userState dari respon.js

// Fungsi untuk mendapatkan daftar rak pengguna
function getUserRaks(userId) {
    const raksFilePath = `./raks_${userId}.json`;
    if (!fs.existsSync(raksFilePath)) {
        return {};
    }
    const data = fs.readFileSync(raksFilePath, 'utf8');
    return JSON.parse(data);
}

// Fungsi untuk menyimpan daftar rak pengguna
function saveUserRaks(userId, raks) {
    const raksFilePath = `./raks_${userId}.json`;
    fs.writeFileSync(raksFilePath, JSON.stringify(raks, null, 2), 'utf8');
}

// Handler untuk menambah rak
async function handleTambahRak(bot, chatId, userId) {
    await sendProtectedMessage(bot, chatId, "📌 Masukkan nama rak baru:", {}, userId);
    userState.set(chatId, { handler: processTambahRak });
}

async function processTambahRak(bot, chatId, message, userId) {
    const rakName = message.trim();
    if (!rakName) {
        return sendProtectedMessage(bot, chatId, "⚠️ Nama rak tidak boleh kosong.", {}, userId);
    }

    const userRaks = getUserRaks(userId);
    if (userRaks[rakName]) {
        return sendProtectedMessage(bot, chatId, "⚠️ Rak dengan nama tersebut sudah ada.", {}, userId);
    }

    userRaks[rakName] = [];
    saveUserRaks(userId, userRaks);

    await sendProtectedMessage(bot, chatId, `✅ Rak *${rakName}* berhasil ditambahkan.`, { parse_mode: "Markdown" }, userId);
}

// Handler untuk menambah PLU ke rak
async function handleTambahPLUKeRak(bot, chatId, userId, rakName) {
    await sendProtectedMessage(bot, chatId, `📌 Kirim kode PLU yang ingin ditambahkan ke rak *${rakName}*:`, { parse_mode: "Markdown" }, userId);
    userState.set(chatId, { handler: (bot, chatId, message, userId) => processTambahPLUKeRak(bot, chatId, message, userId, rakName) });
}

async function processTambahPLUKeRak(bot, chatId, message, userId, rakName) {
    const pluList = [...new Set(message.split(/[\s,;\n]+/).filter(kode => /^\d+$/.test(kode)))];

    if (!pluList.length) {
        return sendProtectedMessage(bot, chatId, "⚠️ Tidak ada kode PLU valid yang ditemukan.", {}, userId);
    }

    try {
        const userRaks = getUserRaks(userId);
        if (!userRaks[rakName]) {
            userRaks[rakName] = [];
        }
        userRaks[rakName].push(...pluList);
        saveUserRaks(userId, userRaks);

        await sendProtectedMessage(bot, chatId, `✅ PLU berhasil ditambahkan ke rak *${rakName}*:\n${pluList.join("\n")}`, { parse_mode: "Markdown" }, userId);
    } catch (error) {
        console.error("❌ Gagal menambahkan PLU ke rak:", error);
        await sendProtectedMessage(bot, chatId, "❌ Gagal menambahkan PLU ke rak. Silakan coba lagi.", {}, userId);
    }
}

// Handler untuk memilih rak
async function handlePilihRak(bot, chatId, userId) {
    const userRaks = getUserRaks(userId);
    const rakNames = Object.keys(userRaks);

    if (!rakNames.length) {
        return sendProtectedMessage(bot, chatId, "⚠️ Anda belum memiliki rak.", {}, userId);
    }

    await sendProtectedMessage(bot, chatId, "📌 Pilih rak:", {
        reply_markup: {
            inline_keyboard: rakNames.map(rakName => [{ text: rakName, callback_data: `select_rak:${rakName}` }])
        }
    }, userId);
}

// Handler untuk menghapus rak
async function handleDeleteRak(bot, chatId, userId, rakName) {
    const userRaks = getUserRaks(userId);
    if (!userRaks[rakName]) {
        return sendProtectedMessage(bot, chatId, "⚠️ Rak tidak ditemukan.", {}, userId);
    }

    delete userRaks[rakName];
    saveUserRaks(userId, userRaks);

    await sendProtectedMessage(bot, chatId, `✅ Rak *${rakName}* berhasil dihapus.`, { parse_mode: "Markdown" }, userId);
}

module.exports = {
    handleTambahRak,
    handlePilihRak,
    handleDeleteRak,
    processTambahRak,
    processTambahPLUKeRak
};
