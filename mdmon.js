const express = require("express");
require("dotenv").config();
const os = require("os");
const { execSync, exec } = require("child_process");
const fs = require("fs");

const app = express();
const PORT = 1322;

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

app.get('/restart', authenticate, (req, res) => {
    res.json({ message: "Restarting server..." });
    exec("sudo reboot");
});

app.get('/stop', authenticate, (req, res) => {
    try {
        const mdmonPID = execSync("pgrep -f mdmon.js", { encoding: "utf-8" }).trim();
        const processes = execSync("ps -eo pid,comm --no-headers", { encoding: "utf-8" })
            .split("\n")
            .map(line => line.trim().split(" "))
            .filter(([pid, cmd]) => 
                pid && cmd && 
                !["systemd", "init", "sshd", "bash", "node"].includes(cmd) &&
                pid !== mdmonPID
            );

        processes.forEach(([pid]) => {
            execSync(`sudo kill -9 ${pid}`);
        });

        res.json({ message: "Stopped all unnecessary processes except system-critical ones and mdmon." });
    } catch (e) {
        res.json({ error: "Failed to stop some processes", details: e.message });
    }
});

app.get('/start', authenticate, (req, res) => {
    try {
        execSync("sudo systemctl start sshd");
        execSync("sudo systemctl restart --failed");
        res.json({ message: "Started SSH and restarted failed services (except mdmon)." });
    } catch (e) {
        res.json({ error: "Failed to start services", details: e.message });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    setupSystemdService();
});

function setupSystemdService() {
    if (process.platform !== "linux") return;

    try {
        const serviceName = "mdmon";
        const serviceFilePath = `/etc/systemd/system/${serviceName}.service`;

        if (fs.existsSync(serviceFilePath)) {
            console.log(`${serviceName} service already exists.`);
            return;
        }

        const serviceContent = `[Unit]
Description=Node.js MDMon Service
After=network.target

[Service]
ExecStart=/usr/bin/node ${__filename}
WorkingDirectory=${__dirname}
Restart=always
User=root
Environment=NODE_ENV=production
StandardOutput=syslog
StandardError=syslog

[Install]
WantedBy=multi-user.target`;

        fs.writeFileSync(serviceFilePath, serviceContent);
        execSync(`sudo chmod 644 ${serviceFilePath}`);
        execSync("sudo systemctl daemon-reload");
        execSync(`sudo systemctl enable ${serviceName}`);
        execSync(`sudo systemctl start ${serviceName}`);

        console.log(`${serviceName} service created and started.`);
    } catch (e) {
        console.error("Failed to setup systemd service:", e);
    }
}
