const fs = require('fs');
const path = require('path');

const rakFilePath = path.join(__dirname, 'raks.json');

// Fungsi untuk memuat data rak dari file
function loadRaksFromFile() {
    try {
        if (!fs.existsSync(rakFilePath)) {
            fs.writeFileSync(rakFilePath, '{}', 'utf-8');
            return {};
        }
        const fileContent = fs.readFileSync(rakFilePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error("Gagal memuat data rak:", error);
        return {};
    }
}

// Fungsi untuk menyimpan data rak ke file
function saveRaksToFile(data) {
    try {
        fs.writeFileSync(rakFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error("Gagal menyimpan data rak:", error);
    }
}

// Fungsi untuk mendapatkan rak berdasarkan ID pengguna
function getUserRaks(userId) {
    const raksData = loadRaksFromFile();
    return raksData[userId] || {};
}

// Fungsi untuk menyimpan rak pengguna
function saveUserRaks(userId, raks) {
    const raksData = loadRaksFromFile();
    raksData[userId] = raks;
    saveRaksToFile(raksData);
}

// Fungsi untuk menghapus rak berdasarkan nama rak
function deleteRak(userId, rakName) {
    const raksData = loadRaksFromFile();
    if (raksData[userId] && raksData[userId][rakName]) {
        delete raksData[userId][rakName];
        saveRaksToFile(raksData);
        return true;
    }
    return false;
}

module.exports = {
    loadRaksFromFile,
    saveRaksToFile,
    getUserRaks,
    saveUserRaks,
    deleteRak
};
