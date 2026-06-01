import 'dotenv/config';
import { GoogleGenAI, Modality } from '@google/genai';

const API_KEY = process.env.GEMINI_API_KEY;

async function test() {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  let session;
  
  try {
    session = await ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' }
          }
        },
        systemInstruction: 'You are a helpful assistant.',
      },
      callbacks: {
        onopen: () => {
          console.log('✅ Connected!');
        },
        onmessage: (m) => {
          if (m.serverContent?.modelTurn?.parts) {
            for (const p of m.serverContent.modelTurn.parts) {
              if (p.text) process.stdout.write(p.text);
              if (p.inlineData?.data) process.stdout.write(`[audio:${p.inlineData.data.length}]`);
            }
          }
          if (m.serverContent?.turnComplete) {
            console.log('\n✅ gemini-2.5-flash-native-audio-preview-09-2025 works!');
            session.close();
            process.exit(0);
          }
        },
        onerror: (err) => {
          console.error('❌ Error:', err);
          process.exit(1);
        },
        onclose: (e) => {
          console.log('Session closed:', e?.reason || 'clean');
        }
      }
    });
    
    session.sendRealtimeInput({ text: 'Say hello briefly' });
    
    setTimeout(() => { console.log('⏱️ Timeout'); session.close(); process.exit(1); }, 15000);
  } catch (err) {
    console.error('❌ Connection failed:', err.message || err);
    process.exit(1);
  }
}

test();
