/**
 * Go WhatsApp (gowa) API Client
 * 
 * Connects to an aldinokemal2104/go-whatsapp-web-multidevice instance
 * running on the VPS. Used as an alternative to the local Baileys provider.
 */

interface GowaDevice {
  id: string;
  display_name?: string;
  state: 'disconnected' | 'connecting' | 'logged_in';
  jid?: string;
  created_at: string;
}

interface GowaLoginResult {
  device_id: string;
  qr_link: string;
  qr_duration: number;
}

interface GowaLoginWithCodeResult {
  device_id: string;
  pair_code: string;
}

interface GowaApiResponse<T> {
  code: string;
  message: string;
  results?: T;
}

interface GowaSession {
  deviceId: string;
  userId: string;
  createdAt: number;
}

export class GowaClient {
  private apiUrl: string;
  private auth: string;
  private sessions = new Map<string, GowaSession>(); // userId → session

  constructor(apiUrl: string, username: string, password: string) {
    this.apiUrl = apiUrl.replace(/\/+$/, '');
    this.auth = btoa(`${username}:${password}`);
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Basic ${this.auth}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(method: string, path: string, body?: any, deviceId?: string): Promise<GowaApiResponse<T>> {
    const url = new URL(`${this.apiUrl}${path}`);
    if (deviceId) url.searchParams.set('device_id', deviceId);

    const res = await fetch(url.toString(), {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gowa API error ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json();
  }

  // ── Device Management ──

  async listDevices(): Promise<GowaDevice[]> {
    const res = await this.request<GowaDevice[]>('GET', '/devices');
    return res.results || [];
  }

  async createDevice(id: string, displayName?: string): Promise<GowaDevice> {
    const res = await this.request<GowaDevice>('POST', '/devices', {
      id,
      display_name: displayName || id,
    });
    if (!res.results) throw new Error(`Failed to create device: ${res.message}`);
    return res.results;
  }

  async getOrCreateDevice(userId: string): Promise<string> {
    // Check existing session first
    const existing = this.sessions.get(userId);
    if (existing) return existing.deviceId;

    // Check if device already exists on gowa
    const devices = await this.listDevices();
    const match = devices.find(d => d.display_name === userId || d.id === userId);
    if (match) {
      this.sessions.set(userId, { deviceId: match.id, userId, createdAt: Date.now() });
      return match.id;
    }

    // Create a new device
    const deviceId = `voxx-${userId}-${Date.now()}`;
    const device = await this.createDevice(deviceId, userId);
    this.sessions.set(userId, { deviceId: device.id, userId, createdAt: Date.now() });
    return device.id;
  }

  // ── Login / QR ──

  async getLoginQR(deviceId: string): Promise<GowaLoginResult> {
    const res = await this.request<GowaLoginResult>('GET', '/app/login', undefined, deviceId);
    if (res.code === 'ALREADY_LOGGED_IN') {
      throw new Error('ALREADY_LOGGED_IN');
    }
    if (!res.results?.qr_link) {
      throw new Error(`QR login failed: ${res.message}`);
    }
    return res.results;
  }

  async getLoginWithCode(deviceId: string, phone: string): Promise<GowaLoginWithCodeResult> {
    const url = new URL(`${this.apiUrl}/app/login-with-code`);
    url.searchParams.set('device_id', deviceId);
    url.searchParams.set('phone', phone);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: this.headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gowa login-with-code error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data: GowaApiResponse<GowaLoginWithCodeResult> = await res.json();
    if (!data.results?.pair_code) {
      throw new Error(`Pair code generation failed: ${data.message}`);
    }
    return data.results;
  }

  async logout(deviceId: string): Promise<void> {
    await this.request('GET', '/app/logout', undefined, deviceId);
  }

  async reconnect(deviceId: string): Promise<void> {
    await this.request('GET', '/app/reconnect', undefined, deviceId);
  }

  // ── Device Status ──

  async getDeviceStatus(deviceId: string): Promise<GowaDevice | null> {
    const devices = await this.listDevices();
    return devices.find(d => d.id === deviceId) || null;
  }

  async getDeviceIdForUser(userId: string): Promise<string | null> {
    const session = this.sessions.get(userId);
    if (session) return session.deviceId;

    const devices = await this.listDevices();
    const match = devices.find(d => d.display_name === userId);
    if (match) {
      this.sessions.set(userId, { deviceId: match.id, userId, createdAt: Date.now() });
      return match.id;
    }
    return null;
  }

  removeSession(userId: string): void {
    this.sessions.delete(userId);
  }

  // ── Send Message ──

  async sendTextMessage(deviceId: string, to: string, text: string): Promise<any> {
    const res = await this.request<any>('POST', '/send/message', {
      phone: to.replace(/[^0-9]/g, ''),
      text,
    }, deviceId);
    return res.results;
  }

  // ── Full status object for the API ──

  async getFullStatus(userId: string): Promise<{
    status: string;
    qrCode?: string;
    phone?: string;
    pairingCode?: string;
    error?: string;
    device_id?: string;
  }> {
    try {
      let deviceId = await this.getDeviceIdForUser(userId);

      // If no device yet, we need to create one
      if (!deviceId) {
        deviceId = await this.getOrCreateDevice(userId);
        return { status: 'init', device_id: deviceId };
      }

      const device = await this.getDeviceStatus(deviceId);
      if (!device) {
        return { status: 'not_found' };
      }

      if (device.state === 'logged_in') {
        return {
          status: 'paired',
          phone: device.jid || undefined,
          device_id: deviceId,
        };
      }

      if (device.state === 'connecting' || device.state === 'disconnected') {
        // Try to generate QR
        try {
          const qr = await this.getLoginQR(deviceId);
          // The qr_link is a URL to the QR PNG on the gowa server
          // Fetch it and convert to base64 data URL
          const qrImageRes = await fetch(`${this.apiUrl}${qr.qr_link}`, {
            headers: this.headers,
            signal: AbortSignal.timeout(10000),
          });
          if (qrImageRes.ok) {
            const blob = await qrImageRes.arrayBuffer();
            const base64 = Buffer.from(blob).toString('base64');
            const qrCode = `data:image/png;base64,${base64}`;
            return {
              status: 'qr_ready',
              qrCode,
              device_id: deviceId,
            };
          }
          return { status: 'qr_ready', device_id: deviceId };
        } catch (err: any) {
          if (err.message === 'ALREADY_LOGGED_IN') {
            const refreshed = await this.getDeviceStatus(deviceId);
            return {
              status: 'paired',
              phone: refreshed?.jid || undefined,
              device_id: deviceId,
            };
          }
          // Session might still be initializing
          return { status: 'init', device_id: deviceId };
        }
      }

      return { status: device.state };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  }

  /**
   * Start pairing by creating/ensuring a device and generating QR.
   * Returns the device status including QR code (as base64 data URL).
   */
  async startPairing(userId: string, phoneNumber?: string): Promise<{
    status: string;
    pairingCode?: string;
    qrCode?: string;
    device_id?: string;
  }> {
    const deviceId = await this.getOrCreateDevice(userId);

    if (phoneNumber) {
      // Pairing code flow
      try {
        const pairResult = await this.getLoginWithCode(deviceId, phoneNumber);
        return {
          status: 'qr_ready',
          pairingCode: pairResult.pair_code,
          device_id: deviceId,
        };
      } catch (err: any) {
        return {
          status: 'error',
          device_id: deviceId,
        };
      }
    }

    // QR flow
    try {
      const fullStatus = await this.getFullStatus(userId);
      return {
        status: fullStatus.status,
        qrCode: fullStatus.qrCode,
        device_id: deviceId,
      };
    } catch (err: any) {
      return { status: 'init', device_id: deviceId };
    }
  }
}
