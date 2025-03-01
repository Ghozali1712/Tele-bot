const fs = require('fs');
const path = require('path');

// Path ke file JSON untuk menyimpan data broadcast
const broadcastDataPath = path.join(__dirname, 'broadcastData.json');

// Fungsi untuk membaca data broadcast
function readBroadcastData() {
    if (!fs.existsSync(broadcastDataPath)) {
        // Jika file tidak ada, buat file baru dengan struktur default
        fs.writeFileSync(broadcastDataPath, JSON.stringify({ users: [], groups: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(broadcastDataPath, 'utf-8'));
}

// Fungsi untuk menyimpan data broadcast
function saveBroadcastData(data) {
    fs.writeFileSync(broadcastDataPath, JSON.stringify(data, null, 2));
}

// Fungsi untuk menambahkan pengguna/grup ke daftar broadcast
function addToBroadcastList(chatId, userId) {
    const data = readBroadcastData();

    // Tambahkan pengguna jika belum ada
    if (userId && !data.users.includes(userId)) {
        data.users.push(userId);
    }

    // Tambahkan grup jika belum ada
    if ((chatId.toString().startsWith('-100') || chatId.toString().startsWith('-')) && !data.groups.includes(chatId)) {
        data.groups.push(chatId);
    }

    saveBroadcastData(data);
}

// Fungsi untuk mengirim pesan broadcast
async function sendBroadcast(bot, message, options = {}) {
    const data = readBroadcastData();

    try {
        // Kirim ke semua pengguna
        for (const userId of data.users) {
            await bot.sendMessage(userId, message, options)
                .then(() => console.log(`✅ Pesan terkirim ke user ${userId}`))
                .catch((error) => console.error(`❌ Gagal mengirim ke user ${userId}:`, error.message));
        }

        // Kirim ke semua grup
        for (const groupId of data.groups) {
            await bot.sendMessage(groupId, message, options)
                .then(() => console.log(`✅ Pesan terkirim ke grup ${groupId}`))
                .catch((error) => console.error(`❌ Gagal mengirim ke grup ${groupId}:`, error.message));
        }

        console.log("✅ Broadcast selesai!");
    } catch (error) {
        console.error("❌ Gagal melakukan broadcast:", error);
    }
}

module.exports = {
    readBroadcastData,
    saveBroadcastData,
    addToBroadcastList,
    sendBroadcast
};
