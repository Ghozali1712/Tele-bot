const { exec } = require('child_process');

/**
 * Fungsi untuk merestart bot dengan aman.
 * @param {TelegramBot} bot - Instance bot Telegram.
 * @param {string} chatId - ID chat pengguna yang meminta restart.
 */
async function restartBot(bot, chatId) {
    try {
        await bot.sendMessage(chatId, "⏳ *Bot sedang direstart...*");

        // ✅ Hentikan polling sebelum restart
        await bot.stopPolling();
        console.log("🔄 Polling dihentikan sebelum restart...");

        // **Cek apakah PM2 tersedia**
        exec("pm2 list", (pm2Error) => {
            if (!pm2Error) {
                console.log("🛠 PM2 terdeteksi, melakukan restart dengan PM2...");
                exec("pm2 restart bot", (error, stdout) => {
                    if (error) {
                        console.error(`❌ Gagal restart bot dengan PM2: ${error.message}`);
                        bot.sendMessage(chatId, "❌ *Gagal restart bot! Periksa server.*");
                        return;
                    }
                    console.log(`✅ Bot berhasil direstart dengan PM2: ${stdout}`);
                    
                    // Kirim pesan konfirmasi setelah restart
                    setTimeout(() => {
                        bot.sendMessage(chatId, "✅ *Bot telah berhasil direstart!*");
                    }, 5000);
                });
            } else {
                console.log("⚠️ PM2 tidak tersedia. Menggunakan restart manual...");
                setTimeout(() => {
                    bot.sendMessage(chatId, "✅ *Bot akan direstart secara manual...*").then(() => {
                        console.log("✅ Bot keluar dari proses, siap direstart...");
                        process.exit(1);
                    });
                }, 3000);
            }
        });

    } catch (error) {
        console.error("❌ Terjadi kesalahan saat restart bot:", error);
        await bot.sendMessage(chatId, "❌ *Gagal restart bot. Coba lagi nanti!*");
    }
}

module.exports = { restartBot };
