const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

let botClient = null;

app.post('/start-bot', async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(400).send('Token required.');

  try {
    // If a bot is already running, destroy it
    if (botClient) {
      await botClient.destroy();
    }

    botClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    botClient.once('ready', () => {
      console.log(`✅ Bot ready: ${botClient.user.tag}`);
    });

    botClient.on('messageCreate', msg => {
      if (msg.author.bot) return;
      if (msg.content.toLowerCase() === '!ping') {
        msg.reply('Pong!');
      }
    });

    await botClient.login(token);
    res.send('✅ Bot started');
  } catch (err) {
    console.error('❌ Bot failed:', err);
    res.status(500).send('❌ Invalid token or bot error');
  }
});

app.listen(port, () => {
  console.log(`🌐 Server running at http://localhost:${port}`);
});
