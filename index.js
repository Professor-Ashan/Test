/**
   * Create By SHADOW OFFICIAL
   * Contact Me on 923271054080
*/

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const figlet = require('figlet');

const PAIRING_DIR = './kingbadboitimewisher/pairing/';
const startpairing = require('./pair');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const userSockets = {};

// Serve the web pairing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

// Socket.io for web pairing
io.on('connection', (socket) => {
    console.log(chalk.blue('🌐 New web connection established'));

    socket.on('set-user', (userId) => {
        userSockets[userId] = socket.id;
        console.log(chalk.green(`👤 User set: ${userId}`));
    });

    socket.on('pair-request', async ({ userId, number }) => {
        console.log(chalk.cyan(`📲 Pairing request for ${number} from user ${userId}`));
        try {
            // Trigger the pairing process
            await startpairing(number);
            
            // Watch for the pairing code in pairing.json
            const checkPairingCode = setInterval(() => {
                const pairingFile = path.join(PAIRING_DIR, 'pairing.json');
                if (fs.existsSync(pairingFile)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(pairingFile, 'utf8'));
                        if (data.number === number && data.code) {
                            socket.emit('pairing-code', data.code);
                            clearInterval(checkPairingCode);
                            console.log(chalk.green(`🔑 Pairing code sent to web: ${data.code}`));
                            // Optional: remove file after sending code
                            // fs.removeSync(pairingFile);
                        }
                    } catch (e) {}
                }
            }, 1000);

            // Timeout after 60 seconds
            setTimeout(() => clearInterval(checkPairingCode), 60000);

        } catch (error) {
            console.log(chalk.red(`❌ Pairing error: ${error.message}`));
            socket.emit('pair-error', error.message);
        }
    });

    socket.on('disconnect', () => {
        for (const [userId, socketId] of Object.entries(userSockets)) {
            if (socketId === socket.id) {
                delete userSockets[userId];
                break;
            }
        }
    });
});

const autoLoadPairs = async () => {
    console.log(chalk.cyan('🔄 Auto-loading all paired users...'));
    
    if (!fs.existsSync(PAIRING_DIR)) {
        console.log(chalk.red('❌ Pairing directory not found.'));
        return;
    }

    const pairedUsers = fs.readdirSync(PAIRING_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(name => name.endsWith('@s.whatsapp.net'));

    if (pairedUsers.length === 0) {
        console.log(chalk.yellow('ℹ️  No paired users found.'));
        return;
    }

    console.log(chalk.green(`✅ Found ${pairedUsers.length} paired users. Starting connections...`));
    
    for (let i = 0; i < pairedUsers.length; i++) {
        const userNumber = pairedUsers[i];
        try {
            console.log(chalk.blue(`🔄 Connecting user ${i + 1}/${pairedUsers.length}: ${userNumber}`));
            await startpairing(userNumber);
            if (i < pairedUsers.length - 1) await delay(2000);
        } catch (error) {
            console.log(chalk.red(`❌ Failed for ${userNumber}: ${error.message}`));
        }
    }
};

const initializeBot = async () => {
    console.clear();
    console.log(chalk.cyan(figlet.textSync('DANGEROUS', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default'
    })));
    
    console.log(chalk.yellow('\n═══════════════════════════════════════════════'));
    console.log(chalk.green('   𝙳𝙰𝙽𝙶𝙴𝚁𝙾𝚄𝚂 𝚆𝙴𝙱 𝙿𝙰𝙸𝚁𝙸𝙽𝙶 𝚂𝚈𝚂𝚃𝙴𝙼       '));
    console.log(chalk.yellow('═══════════════════════════════════════════════\n'));

    server.listen(PORT, () => {
        console.log(chalk.green(`🌍 Web Pairing Server running on port ${PORT}`));
    });

    await autoLoadPairs();
    launchBot();
};

function launchBot() {
    console.log(chalk.green('🚀 Starting Dangerous Md System...\n'));
    const drenoxPath = path.join(__dirname, 'drenox.js');
    if (fs.existsSync(drenoxPath)) {
        try {
            require('./drenox');
            console.log(chalk.green('✅ WhatsApp commands loaded successfully!'));
        } catch (error) {
            console.log(chalk.red('❌ Failed to load WhatsApp commands (drenox.js)'));
        }
    }

    console.log(chalk.cyan('\n═══════════════════════════════════════════════'));
    console.log(chalk.bold.white('DANGEROUS MD BOT INITIALIZATION SUMMARY          '));
    console.log(chalk.cyan('═══════════════════════════════════════════════'));
    console.log(chalk.green('✅ Web Pairing System: Active'));
    console.log(chalk.red('❌ Telegram Pairing: Disabled'));
    console.log(chalk.green('✅ WhatsApp Commands: Active'));
    console.log(chalk.cyan('═══════════════════════════════════════════════\n'));

    process.on('unhandledRejection', () => {});
    process.on('uncaughtException', () => {});
    console.log(chalk.blue('📊 Bot monitoring active...'));
}

process.on('SIGINT', () => process.exit(0));

initializeBot().catch(() => process.exit(1));
