const express = require("express");
require("dotenv").config();
const os = require("os");
const { execSync } = require("child_process");

const app = express();
const PORT = 1322; // Changed to a port above 1024 to avoid permission issues

function deviceInfo() {
    let storage = 'Unknown';
    try {
        if (process.platform === 'win32') {
            storage = execSync('wmic logicaldisk get size', { encoding: 'utf8' })
                .split('\n')[1].trim() / (1024 ** 3) + ' GB';
        } else {
            storage = execSync("df -BG --output=size / | tail -1", { encoding: 'utf8' }).trim();
        }
    } catch (e) {}

    return {
        RAM: (os.totalmem() / (1024 ** 3)).toFixed(2) + ' GB',
        CPU: {
            model: os.cpus()[0]?.model || 'Unknown',
            cores: os.cpus().length
        },
        hostname: os.hostname(),
        Storage: storage
    };
}

function changePassword(username, newPassword) {
    try {
        if (process.platform === 'win32') {
            execSync(`net user ${username} ${newPassword}`, { stdio: 'ignore' });
        } else {
            execSync(`echo '${username}:${newPassword}' | sudo chpasswd`, { stdio: 'ignore' });

        }
        return 'Password changed successfully';
    } catch (e) {
        return 'Failed to change password';
    }
}

function addUser(username, password) {
    try {
        if (process.platform === 'win32') {
            execSync(`net user ${username} ${password} /add`, { stdio: 'ignore' });
        } else {
            execSync(`sudo useradd -m -p $(openssl passwd -1 ${password}) ${username}`, { stdio: 'ignore' });
        }
        return `User ${username} added successfully`;
    } catch (e) {
        return `Failed to add user ${username}`;
    }
}

function authenticate(req, res, next) {
    if (req.headers.code !== process.env.TOKEN) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
}

app.use(express.json());

app.get('/device-info', authenticate, (req, res) => {
    res.json(deviceInfo());
});

app.get('/change-password', authenticate, (req, res) => {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    res.json({ message: changePassword(username, newPassword) });
});

app.get('/add-user', authenticate, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    res.json({ message: addUser(username, password) });
});

app.listen(PORT,"0.0.0.0",() => {
    console.log(`Server running on port ${PORT}`);
});


// 348u4b3948374937827892