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

app.post('/start-bot', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Token required.');

  if (botClients.has(token)) return res.status(200).send('✅ Bot already running');
  if (botClients.size >= 3) return res.status(403).send('❌ Bot limit (3) reached.');

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
