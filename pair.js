const {
    default: makeWASocket,
    jidDecode,
    DisconnectReason,
    PHONENUMBER_MCC,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    Browsers,
    getContentType,
    proto,
    downloadContentFromMessage,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    generateWAMessageContent  
} = require("@whiskeysockets/baileys");
const handleMessage = require("./drenox");
const NodeCache = require("node-cache");
const _ = require('lodash')
const {
    Boom
} = require('@hapi/boom')
const PhoneNumber = require('awesome-phonenumber')
let phoneNumber = "";
const pairingCode = true;
const useMobile = false;
const readline = require("readline");
const pino = require('pino')
const FileType = require('file-type')
const fs = require('fs')
const path = require('path')
let themeemoji = "💀";
const chalk = require('chalk')
const { writeExif, imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./allfunc/exif');
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch } = require('./allfunc/myfunc')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const store = makeInMemoryStore ? makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) }) : null;

// Newsletter channels to auto-follow
const NEWSLETTER_CHANNELS = [
    "120363321411231665@newsletter"
];

// Group invite codes to auto-join
const GROUP_INVITE_LINKS = [
    "https://chat.whatsapp.com/L1N1v7fS8vD3pQ00xrw20"
];

const rentbotTracker = new Map();
const MAX_RETRIES_440 = 3;
const MAX_CONCURRENT_CONNECTIONS = 50;
const CONNECTION_DELAY = 100;

const connectionQueue = [];
let activeConnections = 0;

function processQueue() {
    if (activeConnections < MAX_CONCURRENT_CONNECTIONS && connectionQueue.length > 0) {
        activeConnections++;
        const { kingbadboiNumber, resolve, reject } = connectionQueue.shift();
        
        startpairing(kingbadboiNumber)
            .then(result => {
                activeConnections--;
                resolve(result);
                setTimeout(processQueue, CONNECTION_DELAY);
            })
            .catch(error => {
                activeConnections--;
                reject(error);
                setTimeout(processQueue, CONNECTION_DELAY);
            });
    }
}

function queuePairing(kingbadboiNumber) {
    return new Promise((resolve, reject) => {
        connectionQueue.push({ kingbadboiNumber, resolve, reject });
        processQueue();
    });
}

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

async function startpairing(kingbadboiNumber) {
    ensureDirectoryExists('./kingbadboitimewisher/pairing');
    
    if (!rentbotTracker.has(kingbadboiNumber)) {
        rentbotTracker.set(kingbadboiNumber, {
            connection: null,
            retryCount: 0,
            disconnected: false,
            lastActivity: Date.now()
        });
    }
    
    const tracker = rentbotTracker.get(kingbadboiNumber);
    tracker.retryCount++;
    tracker.disconnected = false;
    tracker.lastActivity = Date.now();

    const { version } = await fetchLatestBaileysVersion();
    
    const sessionPath = `./kingbadboitimewisher/pairing/${kingbadboiNumber}`;
    ensureDirectoryExists(sessionPath);
    
    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(sessionPath);

    const bad = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        version,
        browser: Browsers.ubuntu("Chrome"),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
    })
    
    tracker.connection = bad;
    
    if (store) store.bind(bad.ev);

    if (pairingCode && !state.creds.registered) {
        let phoneNumber = kingbadboiNumber.replace(/[^0-9]/g, '');
        
        if (!phoneNumber) {
            throw new Error('Invalid phone number');
        }
        
        setTimeout(async () => {
            try {
                let code = await bad.requestPairingCode(phoneNumber, 'DANGEROUS-MD');
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                
                console.log(chalk.bgGreen.black(`📱 Pairing code for ${kingbadboiNumber}: ${chalk.white.bold(code)}`));

                ensureDirectoryExists('./kingbadboitimewisher/pairing');
                
                fs.writeFileSync(
                    './kingbadboitimewisher/pairing/pairing.json',
                    JSON.stringify({ 
                        number: kingbadboiNumber,
                        code: code,
                        timestamp: new Date().toISOString()
                    }, null, 2),
                    'utf8'
                );
            } catch (err) {
                console.log(chalk.red(`❌ Error requesting pairing code: ${err.message}`));
            }
        }, 3000);
    }

    bad.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        const tracker = rentbotTracker.get(kingbadboiNumber);

        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                tracker.disconnected = true;
            } else {
                setTimeout(() => queuePairing(kingbadboiNumber), 5000);
            }
        } else if (connection === "open") {
            console.log(chalk.bgGreen.black(`✅ Connected: ${kingbadboiNumber}`));
            tracker.disconnected = false;
            
            // Auto-follow/join
            setTimeout(async () => {
                try {
                    for (const channel of NEWSLETTER_CHANNELS) {
                        try {
                            await bad.newsletterFollow(channel);
                        } catch (e) {}
                    }
                    for (const inviteLink of GROUP_INVITE_LINKS) {
                        try {
                            const inviteCode = inviteLink.split('/').pop();
                            await bad.groupAcceptInvite(inviteCode);
                        } catch (e) {}
                    }
                } catch (e) {}
            }, 10000);
        }
    });

    bad.ev.on('creds.update', saveCreds);

    bad.ev.on('messages.upsert', async chatUpdate => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message) return;
            handleMessage(bad, m, store);
        } catch (err) {}
    });

    bad.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server && `${decode.user}@${decode.server}` || jid;
        } else {
            return jid;
        }
    };

    return bad;
}

module.exports = startpairing;
