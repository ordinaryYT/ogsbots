// Save as: server.js
const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve index.html and static files

const bots = {};

app.post('/start-bot', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'No token provided.' });

  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ]
    });

    client.once('ready', () => {
      console.log(`Bot ready as ${client.user.tag}`);
    });

    client.on('messageCreate', msg => {
      if (msg.content === '!ping') {
        msg.reply('Pong!');
      }
    });

    await client.login(token);
    bots[token] = client;

    return res.json({ success: true, message: 'Bot connected.' });
  } catch (err) {
    console.error('Bot login failed:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid token or login error.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`App running on port ${PORT}`);
});
