import { io, Socket } from 'socket.io-client';

const viteEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
const SOCKET_ORIGIN =
  viteEnv?.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');

export interface RealtimeOrderEnvelope<T = Record<string, unknown>> {
  schemaVersion: '1.0';
  eventType: string;
  timestamp: string;
  resource: {
    type: 'CustomerOrder';
    id: string;
    orderNumber: string;
    restaurantId: string;
    branchId: string;
  };
  payload: T;
}

class ServeQRSocketClient {
  private socket: Socket | null = null;
  private activeAuthKey: string | null = null;

  connectAsStaff(accessToken: string): Socket {
    return this.connectWithAuth(`staff:${accessToken}`, { token: accessToken });
  }

  connectAsGuest(guestToken: string): Socket {
    return this.connectWithAuth(`guest:${guestToken}`, { guestToken });
  }

  private connectWithAuth(authKey: string, auth: Record<string, string>): Socket {
    if (this.socket && this.activeAuthKey === authKey) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return this.socket;
    }

    this.disconnect();
    this.activeAuthKey = authKey;
    this.socket = io(SOCKET_ORIGIN, {
      auth,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    return this.socket;
  }

  subscribeOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ ok: false, error: 'Socket not connected' });
        return;
      }
      this.socket.emit('subscribe:order', { orderId }, (ack: { ok: boolean; error?: string }) => {
        resolve(ack ?? { ok: false });
      });
    });
  }

  subscribeBranch(
    restaurantId: string,
    branchId: string
  ): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ ok: false, error: 'Socket not connected' });
        return;
      }
      this.socket.emit(
        'subscribe:branch',
        { restaurantId, branchId },
        (ack: { ok: boolean; error?: string }) => {
          resolve(ack ?? { ok: false });
        }
      );
    });
  }

  onEvent<T = Record<string, unknown>>(
    eventName: 'order:created' | 'order:status_updated' | 'order:estimate_updated' | 'payment:updated',
    handler: (event: RealtimeOrderEnvelope<T>) => void
  ): () => void {
    const socket = this.socket;
    if (!socket) return () => undefined;
    socket.on(eventName, handler);
    return () => {
      socket.off(eventName, handler);
    };
  }

  onOrderCreated<T = Record<string, unknown>>(
    handler: (event: RealtimeOrderEnvelope<T>) => void
  ): () => void {
    return this.onEvent('order:created', handler);
  }

  onOrderStatusUpdated<T = Record<string, unknown>>(
    handler: (event: RealtimeOrderEnvelope<T>) => void
  ): () => void {
    return this.onEvent('order:status_updated', handler);
  }

  onOrderEstimateUpdated<T = Record<string, unknown>>(
    handler: (event: RealtimeOrderEnvelope<T>) => void
  ): () => void {
    return this.onEvent('order:estimate_updated', handler);
  }

  onPaymentUpdated<T = Record<string, unknown>>(
    handler: (event: RealtimeOrderEnvelope<T>) => void
  ): () => void {
    return this.onEvent('payment:updated', handler);
  }

  onReconnect(handler: () => void): () => void {
    const socket = this.socket;
    if (!socket) return () => undefined;
    socket.io.on('reconnect', handler);
    return () => {
      socket.io.off('reconnect', handler);
    };
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.activeAuthKey = null;
    }
  }
}

export const serveqrSocket = new ServeQRSocketClient();
