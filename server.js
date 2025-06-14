const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const app = express();
const port = 3000;

app.use(express.json());

// Simulated bot storage (replace with a database in production)
let bots = [];

app.post('/api/create-bot', (req, res) => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15); // Mock token
    bots.push({ token, client });
    res.json({ success: true, token });
});

app.post('/api/connect-bot', (req, res) => {
    const { token } = req.body;
    const bot = bots.find(b => b.token === token);
    if (bot) {
        bot.client.login(token).then(() => {
            bot.client.on('ready', () => {
                console.log(`Bot ${bot.client.user.tag} is online and hosted.`);
            });
            res.json({ success: true });
        }).catch(err => res.json({ success: false, error: err.message }));
    } else {
        res.json({ success: false, error: 'Invalid token' });
    }
});

app.use(express.static('public')); // Serve the HTML file
app.listen(port, () => console.log(`Server running on port ${port}`));
