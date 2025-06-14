const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { Pool } = require('pg');
const cors = require('cors');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// PostgreSQL pool (Render SQL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Ensure table exists on boot
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bots (
        id SERIAL PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        username TEXT,
        avatar_url TEXT,
        ping_enabled BOOLEAN DEFAULT true,
        welcome_enabled BOOLEAN DEFAULT false
      );
    `);
    console.log('✅ Table check complete');
  } catch (err) {
    console.error('❌ DB init error:', err);
  }
})();

let botClient = null;
let currentToken = null;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.post('/start-bot', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Token required.');

  try {
    if (botClient) await botClient.destroy();

    botClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    botClient.once('ready', async () => {
      const user = botClient.user;
      currentToken = token;

      await pool.query(`
        INSERT INTO bots (token, username, avatar_url, ping_enabled, welcome_enabled)
        VALUES ($1, $2, $3, true, false)
        ON CONFLICT (token) DO UPDATE
        SET username = EXCLUDED.username,
            avatar_url = EXCLUDED.avatar_url
      `, [token, user.username, user.displayAvatarURL()]);

      console.log(`✅ Bot ready: ${user.tag}`);
      res.send('✅ Bot started');
    });

    botClient.on('messageCreate', async msg => {
      if (msg.author.bot) return;

      const result = await pool.query('SELECT ping_enabled, welcome_enabled FROM bots WHERE token = $1', [currentToken]);
      const { ping_enabled, welcome_enabled } = result.rows[0];

      if (ping_enabled && msg.content.toLowerCase() === '!ping') {
        msg.reply('Pong!');
      }

      if (welcome_enabled && msg.content.toLowerCase() === '!join') {
        msg.channel.send(`Welcome, ${msg.author.username}!`);
      }
    });

    await botClient.login(token);
  } catch (err) {
    console.error('❌ Bot error:', err);
    res.status(500).send('❌ Invalid token or bot error');
  }
});

app.get('/bot-info', async (req, res) => {
  try {
    const result = await pool.query('SELECT username, avatar_url, ping_enabled, welcome_enabled FROM bots ORDER BY id DESC LIMIT 1');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bot info' });
  }
});

app.post('/update-module', async (req, res) => {
  const { module, enabled } = req.body;

  if (!['ping', 'welcome'].includes(module)) {
    return res.status(400).json({ error: 'Invalid module name' });
  }

  const column = module === 'ping' ? 'ping_enabled' : 'welcome_enabled';

  try {
    await pool.query(`UPDATE bots SET ${column} = $1 WHERE token = $2`, [enabled, currentToken]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update module' });
  }
});

app.listen(port, () => {
  console.log(`🌐 Server running at http://localhost:${port}`);
});
