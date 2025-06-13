const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(express.json());
app.use(express.static(__dirname));

let botClient = null;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/start-bot', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Token required.');

  try {
    if (botClient) await botClient.destroy();

    botClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
      partials: [Partials.Channel],
    });

    botClient.once('ready', () => {
      console.log(`✅ Bot ready: ${botClient.user.tag}`);
      saveLog(`Bot started as ${botClient.user.tag}`);
    });

    botClient.on('messageCreate', async msg => {
      if (msg.author.bot) return;
      if (msg.content.toLowerCase() === '!ping') {
        await msg.reply('Pong!');
        await saveLog(`User ${msg.author.tag} used !ping`);
      }
    });

    await botClient.login(token);
    res.send('✅ Bot started');
  } catch (err) {
    console.error('❌ Bot failed:', err);
    res.status(500).send('❌ Invalid token or bot error');
  }
});

// === COMMANDS ===
app.get('/api/commands', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM commands ORDER BY id DESC');
  res.json(rows);
});

app.post('/api/commands', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).send('Command required');
  await pool.query('INSERT INTO commands (command) VALUES ($1)', [command]);
  res.send('✅ Command saved');
});

// === SETTINGS ===
app.get('/api/settings', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM settings LIMIT 1');
  res.json(rows[0]);
});

app.post('/api/settings', async (req, res) => {
  const { prefix, exampleSetting } = req.body;
  await pool.query('UPDATE settings SET prefix = $1, example_setting = $2 WHERE id = 1', [prefix, exampleSetting]);
  res.send('✅ Settings updated');
});

// === LOGS ===
app.get('/api/logs', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 20');
  res.json(rows);
});

async function saveLog(message) {
  await pool.query('INSERT INTO logs (message) VALUES ($1)', [message]);
}

// === Ensure tables exist ===
async function createTablesIfNotExist() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commands (
        id SERIAL PRIMARY KEY,
        command TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        prefix TEXT DEFAULT '!',
        example_setting TEXT DEFAULT 'on'
      );

      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO settings (prefix, example_setting)
      SELECT '!', 'on'
      WHERE NOT EXISTS (SELECT 1 FROM settings);
    `);
    console.log('✅ Database tables checked/created');
  } catch (err) {
    console.error('❌ Failed to initialize tables:', err);
  }
}

app.listen(port, async () => {
  await createTablesIfNotExist();
  console.log(`🌐 Server running at http://localhost:${port}`);
});
