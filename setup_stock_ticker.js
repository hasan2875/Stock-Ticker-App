#!/usr/bin/env node
// setup_stock_ticker.js
// Run: node setup_stock_ticker.js
// It will scaffold the full project with backend + frontend.

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

function run(cmd, cwd) {
  console.log('> ' + cmd);
  execSync(cmd, { stdio: 'inherit', cwd });
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// Root
const root = process.cwd();
console.log('Creating Real-time Stock Ticker project...');

const backendDir = path.join(root, 'backend');
const frontendDir = path.join(root, 'frontend');

// 1. Backend setup
console.log('Setting up backend...');
fs.mkdirSync(backendDir, { recursive: true });
run('npm init -y', backendDir);
run('npm install express socket.io dotenv node-fetch@2', backendDir);

write(`${backendDir}/.env`, `POLL_INTERVAL_MS=3000
PORT=4000
STOCK_API_PROVIDER=
STOCK_API_KEY=
`);

write(`${backendDir}/index.js`, `// --- backend/index.js ---
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
`);

// 2. Frontend setup
console.log('Setting up frontend...');
fs.mkdirSync(frontendDir, { recursive: true });
run('npm init -y', frontendDir);
run('npm install react react-dom socket.io-client', frontendDir);
run('npm install -D vite', frontendDir);

write(`${frontendDir}/index.html`, `<!doctype html>
<html><head><meta charset="utf-8"><title>Stock Ticker</title></head>
<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`);

write(`${frontendDir}/vite.config.js`, `import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5173 } });`);

write(`${frontendDir}/.env`, `VITE_BACKEND_URL=http://localhost:4000`);

write(`${frontendDir}/src/main.jsx`, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
createRoot(document.getElementById('root')).render(<App />);
`);

write(`${frontendDir}/src/App.jsx`, `
import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import Ticker from './Ticker';
import AddSymbol from './AddSymbol';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

export default function App() {
  const [symbols, setSymbols] = useState(['AAPL','MSFT']);
  const [prices, setPrices] = useState({});
  const socketRef = useRef(null);

  useEffect(() => {
    const s = io(BACKEND);
    socketRef.current = s;
    s.on('connect', () => s.emit('subscribe', symbols));
    s.on('price_update', (items) => {
      setPrices(prev => {
        const next = { ...prev };
        for (const it of items) {
          const old = prev[it.symbol]?.price ?? null;
          next[it.symbol] = { price: it.price, prev: old };
        }
        return next;
      });
    });
    return () => s.disconnect();
  }, []);

  useEffect(() => { socketRef.current?.emit('subscribe', symbols); }, [symbols]);

  function addSymbol(sym) {
    const up = sym.toUpperCase();
    if (!symbols.includes(up)) setSymbols(s => [...s, up]);
    socketRef.current?.emit('add_symbol', up);
  }

  function removeSymbol(sym) {
    setSymbols(s => s.filter(x => x !== sym));
    socketRef.current?.emit('remove_symbol', sym);
  }

  return (
    <div className='app'>
      <h1>📈 Real-time Stock Ticker</h1>
      <AddSymbol onAdd={addSymbol}/>
      <div className='list'>
        {symbols.map(s =>
          <Ticker key={s} symbol={s} data={prices[s]} onRemove={()=>removeSymbol(s)}/>
        )}
      </div>
    </div>
  );
}
`);

write(`${frontendDir}/src/Ticker.jsx`, `
import React from 'react';
export default function Ticker({ symbol, data={}, onRemove }) {
  const price = data.price ?? '—';
  const prev = data.prev ?? null;
  const up = prev != null && price > prev;
  const down = prev != null && price < prev;
  return (
    <div className={'ticker ' + (up?'up':down?'down':'')}>
      <span className='sym'>{symbol}</span>
      <span className='price'>{typeof price==='number'?price.toFixed(2):price}</span>
      <button onClick={onRemove}>✕</button>
    </div>
  );
}
`);

write(`${frontendDir}/src/AddSymbol.jsx`, `
import React, { useState } from 'react';
export default function AddSymbol({ onAdd }) {
  const [val, setVal] = useState('');
  return (
    <form onSubmit={e=>{e.preventDefault(); if(val.trim()){onAdd(val.trim()); setVal('');}}}>
      <input value={val} onChange={e=>setVal(e.target.value)} placeholder='Add symbol (TSLA)'/>
      <button>Add</button>
    </form>
  );
}
`);

write(`${frontendDir}/src/styles.css`, `
body { font-family: sans-serif; background: #0b1220; color: #eee; padding: 20px; }
.app { max-width: 700px; margin: auto; }
.ticker { background:#1b2434; margin:8px 0; padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; }
.ticker.up { color:#10b981; }
.ticker.down { color:#ef4444; }
input,button { padding:8px; border:none; border-radius:5px; }
button { background:#1f6feb; color:#fff; cursor:pointer; }
`);

console.log('\\n✅ Project files created successfully!');
console.log('\\nNext steps:');
console.log('1. cd backend && node index.js  (starts backend)');
console.log('2. Open new terminal → cd frontend && npm run dev  (starts frontend)');
console.log('3. Visit http://localhost:5173');
