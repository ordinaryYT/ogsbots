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

const botClients = new Map(); // token => Discord client
const enabledCommands = new Map(); // token => Set of enabled commands

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/active-bots', (req, res) => {
  res.json({ count: botClients.size, tokens: Array.from(botClients.keys()) });
});

app.post('/start-bot', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Token required.');

  if (botClients.has(token)) return res.status(200).send('✅ Bot already running');
  if (botClients.size >= 3) return res.status(403).send('❌ Maximum of 3 running bots reached.');

  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ],
      partials: [Partials.Channel],
    });

    client.once('ready', () => {
      console.log(`✅ Bot ready: ${client.user.tag}`);
      saveLog(`Bot started as ${client.user.tag}`);
    });

    client.on('messageCreate', async msg => {
      if (msg.author.bot) return;
      const allowed = enabledCommands.get(token) || new Set();
      const content = msg.content.toLowerCase();

      if (content === '!ping' && allowed.has('ping')) {
        return msg.reply('Pong!');
      }

      if (content.startsWith('!say') && allowed.has('say')) {
        const message = msg.content.slice(5).trim();
        if (message) msg.channel.send(message);
      }

      if (content === '!uptime' && allowed.has('uptime')) {
        const uptime = process.uptime();
        msg.channel.send(`🕒 Bot uptime: ${Math.floor(uptime)}s`);
      }

      if (content === '!help' && allowed.has('help')) {
        msg.channel.send(`Available commands: ${Array.from(allowed).map(c => `!${c}`).join(', ')}`);
      }
    });

    await client.login(token);
    botClients.set(token, client);
    enabledCommands.set(token, new Set());

    res.send('✅ Bot started');
  } catch (err) {
    console.error('❌ Bot failed:', err);
    res.status(500).send('❌ Invalid token or bot error');
  }
});

app.post('/enable-command', (req, res) => {
  const { token, command } = req.body;
  if (!token || !command) return res.status(400).send('Token and command are required');
  if (!botClients.has(token)) return res.status(404).send('❌ Bot not running');

  if (!enabledCommands.has(token)) enabledCommands.set(token, new Set());
  enabledCommands.get(token).add(command);

  res.send(`✅ '${command}' enabled`);
});

app.post('/disable-command', (req, res) => {
  const { token, command } = req.body;
  const set = enabledCommands.get(token);
  if (set) set.delete(command);
  res.send(`✅ '${command}' disabled`);
});

app.post('/stop-bot', async (req, res) => {
  const { token } = req.body;
  const client = botClients.get(token);

  if (!client) return res.status(404).send('❌ Bot not found');

  try {
    await client.destroy();
    botClients.delete(token);
    enabledCommands.delete(token);
    res.send('🛑 Bot stopped');
  } catch (err) {
    console.error('Failed to stop bot:', err);
    res.status(500).send('❌ Error stopping bot');
  }
});

app.get('/api/logs', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 20');
  res.json(rows);
});

async function saveLog(message) {
  await pool.query('INSERT INTO logs (message) VALUES ($1)', [message]);
}

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
