const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const activeBots = {};

app.post('/start-bot', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ success: false, message: 'No token provided.' });
    }

    try {
        const client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
        });

        client.on('ready', () => {
            console.log(`Bot logged in as ${client.user.tag}`);
        });

        client.on('messageCreate', msg => {
            if (msg.content === '!ping') {
                msg.reply('Pong!');
            }
        });

        await client.login(token);
        activeBots[token] = client;

        return res.json({ success: true, message: 'Bot connected.' });
    } catch (error) {
        console.error('Error logging in bot:', error);
        return res.status(401).json({ success: false, message: 'Invalid token or bot failed to start.' });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));
