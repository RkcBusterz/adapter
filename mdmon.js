const {express} = require("express")
const {dotenv} =require("dotenv");
const {os} = require("os");
const { execSync } = require('child_process');

dotenv.config();

const app = express();
const PORT = 322;

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

function authenticate(req, res, next) {
    if (req.headers.code !== process.env.TOKEN) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
}

app.get('/device-info', authenticate, (req, res) => {
    res.json(deviceInfo());
});

app.post('/change-password', authenticate, express.json(), (req, res) => {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    res.json({ message: changePassword(username, newPassword) });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
