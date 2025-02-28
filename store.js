const { makeInMemoryStore } = require('@whiskeysockets/baileys');
const pino = require('pino');

// Membuat store untuk menyimpan kredensial dan status
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

module.exports = { store };
