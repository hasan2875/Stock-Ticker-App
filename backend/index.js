// --- backend/index.js ---
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 4000;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 3000;

function createSimulatedPriceGenerator(startPrice = 100) {
  let price = startPrice;
  return () => {
    const pct = (Math.random() - 0.48) * 0.02;
    price = Math.max(0.01, price * (1 + pct));
    return Number(price.toFixed(2));
  };
}

const generators = new Map();
const watchlists = new Map();

function getPrice(symbol) {
  symbol = symbol.toUpperCase();
  if (!generators.has(symbol))
    generators.set(symbol, createSimulatedPriceGenerator(100 + Math.random() * 100));
  return generators.get(symbol)();
}

setInterval(() => {
  const all = new Set();
  for (const s of watchlists.values()) for (const sym of s) all.add(sym);
  if (!all.size) return;
  const prices = [...all].map((s) => ({ symbol: s, price: getPrice(s) }));
  for (const [id, list] of watchlists.entries()) {
    const sock = io.sockets.sockets.get(id);
    if (sock) sock.emit('price_update', prices.filter(p => list.has(p.symbol)));
  }
}, POLL_INTERVAL_MS);

io.on('connection', (socket) => {
  watchlists.set(socket.id, new Set(['AAPL']));
  socket.on('subscribe', (syms) => watchlists.set(socket.id, new Set(syms.map(s => s.toUpperCase()))));
  socket.on('add_symbol', (s) => watchlists.get(socket.id).add(s.toUpperCase()));
  socket.on('remove_symbol', (s) => watchlists.get(socket.id).delete(s.toUpperCase()));
  socket.on('disconnect', () => watchlists.delete(socket.id));
});

app.get('/', (req, res) => res.send({ status: 'ok' }));
server.listen(PORT, () => console.log('Backend running on port', PORT));
