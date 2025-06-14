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

// DB pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Ensure tables exist
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bots (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      username TEXT,
      avatar_url TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS modules (
      id SERIAL PRIMARY KEY,
      bot_token TEXT REFERENCES bots(token) ON DELETE CASCADE,
      ping_enabled BOOLEAN DEFAULT false,
      welcome_enabled BOOLEAN DEFAULT false,
      embed_enabled BOOLEAN DEFAULT false,
      autoresponder_enabled BOOLEAN DEFAULT false
    );
  `);
})();

let botClient = null;
let currentToken = null;

// Serve UI
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (_, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

// Start bot
app.post('/start-bot', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Token required.');

  try {
    if (botClient) await botClient.destroy();

    botClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
      partials: [Partials.Channel],
    });

    botClient.once('ready', async () => {
      const user = botClient.user;
      currentToken = token;

      await pool.query(`
        INSERT INTO bots (token, username, avatar_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (token) DO UPDATE
        SET username = EXCLUDED.username,
            avatar_url = EXCLUDED.avatar_url
      `, [token, user.username, user.displayAvatarURL()]);

      await pool.query(`
        INSERT INTO modules (bot_token)
        VALUES ($1)
        ON CONFLICT (bot_token) DO NOTHING
      `, [token]);

      console.log(`✅ Bot ready: ${user.tag}`);
      res.json({ success: true });
    });

    botClient.on('messageCreate', async msg => {
      if (msg.author.bot) return;
      const mod = await pool.query('SELECT * FROM modules WHERE bot_token = $1', [currentToken]);
      const m = mod.rows[0];

      if (!m) return;

      if (m.ping_enabled && msg.content === '!ping') {
        msg.reply('Pong!');
      }

      if (m.welcome_enabled && msg.content === '!join') {
        msg.channel.send(`Welcome, ${msg.author.username}!`);
      }

      if (m.embed_enabled && msg.content === '!embed') {
        msg.channel.send({ embeds: [{ title: 'Cool Embed', description: 'Hello World!', color: 0xffb800 }] });
      }

      if (m.autoresponder_enabled && msg.content.toLowerCase().includes('help')) {
        msg.reply('Need help? Contact an admin!');
      }
    });

    await botClient.login(token);
  } catch (err) {
    console.error('❌ Bot startup error:', err);
    res.status(500).send('❌ Invalid token or error connecting');
  }
});

// Get bot + module info
app.get('/bot-info', async (_, res) => {
  try {
    const b = await pool.query('SELECT * FROM bots ORDER BY id DESC LIMIT 1');
    const m = await pool.query('SELECT * FROM modules WHERE bot_token = $1', [b.rows[0].token]);
    res.json({ ...b.rows[0], ...m.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});

// Toggle modules
app.post('/update-module', async (req, res) => {
  const { module, enabled } = req.body;
  const valid = ['ping', 'welcome', 'embed', 'autoresponder'];

  if (!valid.includes(module)) return res.status(400).send('Invalid module');

  try {
    await pool.query(
      `UPDATE modules SET ${module}_enabled = $1 WHERE bot_token = $2`,
      [enabled, currentToken]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.listen(port, () => console.log(`🌍 Running on http://localhost:${port}`));
