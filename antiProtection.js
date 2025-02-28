// **antiProtection.js**

const ADMIN_LIST = new Set([5183628785, 987654321]); // 🔹 Ganti dengan daftar ID admin

// **Fungsi untuk Mengaktifkan Proteksi Bot**
function antiProtection(bot) {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text?.trim();

        // **Admin Dikecualikan dari Proteksi**
        if (ADMIN_LIST.has(userId)) {
            return; // Jika pengguna adalah admin, lewati semua proteksi
        }

        // **Blokir Forward Message (Pesan yang diteruskan)**
        if (msg.forward_from || msg.forward_from_chat) {
            return sendProtectedMessage(bot, chatId, "⚠️ *Pesan yang diteruskan tidak diizinkan!*");
        }

        // **Blokir Pengguna yang Berusaha Forward atau Quote Pesan Bot**
        if (msg.reply_to_message && msg.reply_to_message.from.id === bot.id) {
            return sendProtectedMessage(bot, chatId, "⚠️ *Anda tidak dapat meneruskan atau mengutip pesan bot!*");
        }

        // **Blokir Pengiriman Media (Foto, Video, Dokumen, Stiker, Voice, GIF, dll.)**
        if (msg.photo || msg.video || msg.audio || msg.document || msg.sticker || msg.voice || msg.animation) {
            return sendProtectedMessage(bot, chatId, "⚠️ *Mengirim media tidak diizinkan!*");
        }

        // **Blokir Tautan (Prevent URL Sharing)**
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        if (urlPattern.test(text)) {
            return sendProtectedMessage(bot, chatId, "⚠️ *Berbagi tautan tidak diizinkan!*");
        }
    });
}

// **Fungsi untuk Mengirim Pesan dengan Proteksi**
async function sendProtectedMessage(bot, chatId, message, options = {}) {
    try {
        // **Cek apakah user adalah admin**
        const chatMember = await bot.getChatMember(chatId, chatId);
        const isAdmin = ADMIN_LIST.has(chatMember.user.id);

        // **Admin tidak dikenakan proteksi**
        await bot.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            protect_content: !isAdmin, // 🔒 Non-admin tidak bisa forward, admin bebas
            disable_web_page_preview: true,
            ...options
        });
    } catch (error) {
        console.error(`❌ Gagal mengirim pesan ke ${chatId}:`, error);
    }
}

// **Pastikan Fungsi Diekspor dengan Benar**
module.exports = { antiProtection, sendProtectedMessage };
