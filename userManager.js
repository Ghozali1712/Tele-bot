// userManager.js
const fs = require('fs');
const path = require('path');

const USER_FILE_PATH = path.join(__dirname, 'users.json');

/**
 * Memastikan file users.json ada dan dalam format yang valid.
 * Jika tidak ada atau rusak, file akan dibuat ulang.
 */
const ensureUserFile = () => {
    if (!fs.existsSync(USER_FILE_PATH)) {
        fs.writeFileSync(USER_FILE_PATH, JSON.stringify([]));
    } else {
        try {
            const data = fs.readFileSync(USER_FILE_PATH, 'utf-8');
            JSON.parse(data); // Cek apakah JSON valid
        } catch (error) {
            console.error(`⚠️ File ${USER_FILE_PATH} rusak, akan direset ke array kosong.`);
            fs.writeFileSync(USER_FILE_PATH, JSON.stringify([]));
        }
    }
};

/**
 * Memuat daftar pengguna dari file users.json.
 * @returns {Array} Array pengguna
 */
const loadUsers = () => {
    ensureUserFile();
    try {
        const data = fs.readFileSync(USER_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Gagal membaca file users.json:', error);
        return [];
    }
};

/**
 * Menyimpan daftar pengguna ke file users.json.
 * @param {Array} users - Daftar pengguna
 */
const saveUsers = (users) => {
    try {
        fs.writeFileSync(USER_FILE_PATH, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('❌ Gagal menyimpan file users.json:', error);
    }
};

/**
 * Menambahkan pengguna baru ke daftar.
 * @param {number|string} userId - ID pengguna
 * @param {string} username - Username pengguna
 * @returns {boolean} True jika berhasil, False jika user sudah ada
 */
const addUser = (userId, username) => {
    const users = loadUsers();
    userId = Number(userId);  // Pastikan userId selalu angka

    if (!users.some(user => user.id === userId)) {
        users.push({ id: userId, username });
        saveUsers(users);
        console.log(`✅ Pengguna baru ditambahkan: ${username} (ID: ${userId})`);
        return true;
    }
    console.log(`⚠️ Pengguna ${username} (ID: ${userId}) sudah terdaftar.`);
    return false;
};

/**
 * Menghapus pengguna dari daftar.
 * @param {number|string} userId - ID pengguna yang akan dihapus
 * @returns {boolean} True jika berhasil dihapus, False jika tidak ditemukan
 */
const removeUser = (userId) => {
    const users = loadUsers();
    userId = Number(userId);

    const initialLength = users.length;
    const filteredUsers = users.filter(user => user.id !== userId);
    saveUsers(filteredUsers);

    if (filteredUsers.length < initialLength) {
        console.log(`✅ Pengguna dengan ID ${userId} berhasil dihapus.`);
        return true;
    } else {
        console.log(`⚠️ Pengguna dengan ID ${userId} tidak ditemukan.`);
        return false;
    }
};

/**
 * Mengambil daftar semua pengguna.
 * @returns {Array} Daftar pengguna
 */
const listUsers = () => {
    return loadUsers();
};

module.exports = { addUser, removeUser, listUsers };