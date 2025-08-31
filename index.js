// pages/index.js
import React, { useState } from 'react';
import { FaWhatsapp } from 'react-icons/fa';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fetch from 'node-fetch';
import bcrypt from 'bcryptjs';

const PAYSTACK_SECRET_KEY = 'sk_live_a3b54b93adda7b63c4d63ceefd531b7e9bb22d6f';
const BASE_URL = 'https://your-vercel-domain.vercel.app';

// -------------------- SQLite Helper --------------------
async function openDB() {
  const db = await open({ filename: './datastore.db', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS wallets(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_type TEXT NOT NULL,
      identifier TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      role TEXT DEFAULT 'customer',
      UNIQUE(user_type, identifier)
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS purchases(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      network TEXT,
      bundle_gb INTEGER,
      recipient TEXT,
      amount REAL NOT NULL,
      reference TEXT UNIQUE,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admins(
      id INTEGER PRIMARY KEY CHECK (id=1),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);
  const row = await db.get(SELECT COUNT(*) as cnt FROM admins WHERE id=1);
  if(row.cnt===0){
    const hash = bcrypt.hashSync('Dominic@##@',10);
    await db.run(INSERT INTO admins(id,email,password_hash) VALUES(1,?,?),
      ['adariyadominic@gmail.com', hash]);
  }
  return db;
}

// -------------------- WhatsApp Button --------------------
function WhatsAppButton() {
  const contacts = [
    { name: 'Admin', number: '233247918766' },
    { name: 'Manager', number: '233556429525' }
  ];
  return (
    <div style={{ position:'fixed',bottom:20,right:20,zIndex:1000,display:'flex',flexDirection:'column',gap:10 }}>
      {contacts.map(c => (
        <a key={c.number} href={https://wa.me/${c.number}} target="_blank" rel="noopener noreferrer"
           title={Chat with ${c.name}}
           style={{ backgroundColor:'#25D366',color:'white',borderRadius:'50%',width:60,height:60,
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:30,textDecoration:'none',
                    boxShadow:'0 4px 6px rgba(0,0,0,0.2)' }}>
          <FaWhatsapp />
        </a>
      ))}
    </div>
  );
}

// -------------------- API Functions (Inline) --------------------
async function initPayment(email, amount, type, recipient='') {
  const reference = ${type}-${Date.now()};
  const callbackUrl = ${BASE_URL}/?api=payment_callback&type=${type};

  const r = await fetch('https://api.paystack.co/transaction/initialize', {
    method:'POST',
    headers:{ 'Authorization': Bearer ${PAYSTACK_SECRET_KEY}, 'Content-Type':'application/json' },
    body: JSON.stringify({ email, amount: amount*100, reference, callback_url: callbackUrl })
  });
  const data = await r.json();
  if(!data.status) throw new Error('Paystack initialization failed');

  const db = await openDB();
  await db.run(
    INSERT INTO purchases(type,amount,recipient,reference,status,created_at) VALUES(?,?,?,?,?,datetime('now')),
    [type, amount, recipient || email, reference, 'pending']
  );

  return data.data.authorization_url;
}

async function verifyPayment(reference, type) {
  const r = await fetch(https://api.paystack.co/transaction/verify/${reference}, {
    headers:{ 'Authorization': Bearer ${PAYSTACK_SECRET_KEY} }
  });
  const data = await r.json();
  if(!data.status || data.data.status!=='success') return false;

  const db = await openDB();
  await db.run(UPDATE purchases SET status='paid' WHERE reference=?, [reference]);
  const purchase = await db.get(SELECT type, recipient, amount FROM purchases WHERE reference=?, [reference]);

  if(purchase.type==='deposit'){
    await db.run(INSERT OR IGNORE INTO wallets(user_type,identifier,balance) VALUES('customer',?,0), [purchase.recipient]);
    await db.run(UPDATE wallets SET balance=balance+? WHERE identifier=?, [purchase.amount,purchase.recipient]);
  } else if(purchase.type==='agent_upgrade'){
    await db.run(INSERT OR IGNORE INTO wallets(user_type,identifier,balance,role) VALUES('agent',?,0,'agent'), [purchase.recipient]);
    await db.run(UPDATE wallets SET role='agent', balance=balance-? WHERE identifier=?, [purchase.amount,purchase.recipient]);
  } else if(purchase.type==='bundle'){
    await db.run(INSERT OR IGNORE INTO wallets(user_type,identifier,balance) VALUES('customer',?,0), [purchase.recipient]);
    await db.run(UPDATE wallets SET balance=balance-? WHERE identifier=?, [purchase.amount,purchase.recipient]);
  }
  return true;
}

async function getWalletBalance(email){
  const db = await openDB();
  const row = await db.get(SELECT balance FROM wallets WHERE identifier=?, [email]);
  return row ? row.balance : 0;
}

// -------------------- Frontend App --------------------
export default function App({ query }) {
  const [email,setEmail] = useState('');
  const [amount,setAmount] = useState(0);
  const [bundle,setBundle] = useState(0);
  const [recipient,setRecipient] = useState('');
  const [balance,setBalance] = useState(0);

  const urlParams = new URLSearchParams(typeof window!=='undefined' ? window.location.search : '');
  const api = urlParams.get('api');
  const typeParam = urlParams.get('type');
  const referenceParam = urlParams.get('reference');

  // Handle inline API calls if URL has ?api=...
  if(api==='payment_callback' && referenceParam){
    verifyPayment(referenceParam,typeParam).then(ok=>{
      alert(ok ? '✅ Payment Successful!' : '❌ Payment Failed');
      window.history.replaceState({},'',BASE_URL); // remove query params
    });
  }

  async function handleDeposit(){ const url = await initPayment(email, amount, 'deposit'); window.location.href=url; }
  async function handleBuyBundle(){ const url = await initPayment(email, bundle*5, 'bundle', recipient); window.location.href=url; }
  async function handleUpgrade(){ const url = await initPayment(email, 25, 'agent_upgrade'); window.location.href=url; }
  async function handleCheckBalance(){ const b = await getWalletBalance(email); setBalance(b); }

  return (
    <div style={{ padding:20 }}>
      <h1>📶 Data Wallet App (Single File)</h1>

      <h2>Deposit Funds</h2>
      Email: <input value={email} onChange={e=>setEmail(e.target.value)} /><br/>
      Amount: <input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} /><br/>
      <button onClick={handleDeposit}>Deposit</button>

      <h2>Buy Bundle</h2>
      Recipient: <input value={recipient} onChange={e=>setRecipient(e.target.value)} /><br/>
      Bundle GB: <input type="number" value={bundle} onChange={e=>setBundle(Number(e.target.value))} /><br/>
      <button onClick={handleBuyBundle}>Buy Bundle</button>

      <h2>Upgrade to Agent</h2>
      <button onClick={handleUpgrade}>Upgrade (25 GHS)</button>

      <h2>Wallet</h2>
      <button onClick={handleCheckBalance}>Check Balance</button>
      <p>Balance: {balance} GHS</p>

      <WhatsAppButton />
    </div>
  );
}
