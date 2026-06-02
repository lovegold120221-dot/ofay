import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import fs from 'fs';

async function test() {
  const { state, saveCreds } = await useMultiFileAuthState('./test_auth');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('QR Code generated:', qr);
    }
  });
}
test();
