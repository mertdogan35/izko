import { io, Socket } from 'socket.io-client';

interface PriceCalculator {
  profit: number;
  number: number;
}

interface CalculatedPrices {
  yirmiiki: number;
  ondort: number;
  onsekiz: number;
  gram: number;
  yeniceyrek: number;
  eskiceyrek: number;
  yeniyarim: number;
  eskiyarim: number;
  yenitam: number;
  eskitam: number;
  ata: number;
}

class WebSocketService {
  private socket: WebSocket;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPrices: CalculatedPrices | null = null;
  private lastMarketData: any = null;
  private lastOns: string = '0';
  private lastUsdTry: string = '0';
  private lastEurTry: string = '0';

  constructor() {
    this.socket = this.createWebSocket();
  }

  private createWebSocket(): WebSocket {
    const socket = new WebSocket('wss://socket.haremaltin.com/socket.io/?EIO=4&transport=websocket');
    this.setupSocketListeners(socket);
    return socket;
  }

  private setupSocketListeners(socket: WebSocket) {
    socket.onopen = () => {
      console.log('WebSocket bağlantısı açıldı');
      
      setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send("40");
          this.startPing(socket);
        }
      }, 1000);
    };

    socket.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (typeof data === 'string') {
        if (data.startsWith('42')) {
          try {
            const jsonStr = data.substring(2);
            const jsonData = JSON.parse(jsonStr);
             console.log('Çekilen Veriler:', jsonData);
            if (jsonData[0] === 'price_changed' && jsonData[1]?.data) {
              const marketData = jsonData[1].data;

              // Geçerli değerleri sakla
              if (marketData.ONS?.satis && Number(marketData.ONS.satis) > 0) {
                this.lastOns = marketData.ONS.satis;
              }
              if (marketData.USDTRY?.satis && Number(marketData.USDTRY.satis) > 0) {
                this.lastUsdTry = marketData.USDTRY.satis;
              }
              if (marketData.EURTRY?.satis && Number(marketData.EURTRY.satis) > 0) {
                this.lastEurTry = marketData.EURTRY.satis;
              }
              
              if (this.isValidMarketData(marketData)) {
                const gramAltin = Number(marketData.ALTIN?.satis || 0);
                this.calculateAndPublishPrices(marketData, gramAltin);
              }
            }
          } catch (e) {
            console.error('Veri işleme hatası:', e);
          }
        }
      }
    };

    socket.onclose = (event: CloseEvent) => {
      console.log('WebSocket bağlantısı kapandı', event.code, event.reason);
      this.stopPing();
      this.scheduleReconnect();
    };

    socket.onerror = (event: Event) => {
      console.error('WebSocket hatası:', event);
      this.stopPing();
      this.scheduleReconnect();
    };
  }

  private isValidMarketData(marketData: any): boolean {
    // Gerekli alanların varlığını ve geçerliliğini kontrol et
    return (
      marketData &&
      marketData.ALTIN?.satis &&
      !isNaN(Number(marketData.ALTIN.satis)) &&
      Number(marketData.ALTIN.satis) > 0
    );
  }

  private startPing(socket: WebSocket) {
    this.stopPing(); // Önceki ping interval'ı temizle
    
    this.pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send("2");
      } else {
        this.stopPing();
      }
    }, 25000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      if (this.socket.readyState === WebSocket.CLOSED) {
        this.socket = this.createWebSocket();
      }
    }, 5000);
  }

  private calculateAndPublishPrices(marketData: any, gramAltin: number) {
    if (gramAltin <= 0 && this.lastMarketData) {
      marketData = this.lastMarketData;
      gramAltin = Number(this.lastMarketData.ALTIN?.satis || 0);
    }

    try {
      // Hesaplama fonksiyonu
      const calculatePrice = (profit: number, number: number, altin: number) => {
        const result = (altin * profit) + number;
        return Math.ceil(result / 10) * 10; // En yakın 10'a yuvarlama
      };

      // Tam/Ziynet altını için özel hesaplama
      const calculateTam = (ceyrekFiyat: number) => {
        return Math.ceil((ceyrekFiyat * 4) / 10) * 10;
      };

      const newPrices: CalculatedPrices = {
        gram: calculatePrice(0.925, 180, gramAltin),
        yirmiiki: calculatePrice(0.925, 180, gramAltin),
        ondort: calculatePrice(0.8, 0, gramAltin),
        onsekiz: calculatePrice(0.85, 0, gramAltin),
        yeniceyrek: calculatePrice(1.65, 230, gramAltin),
        eskiceyrek: calculatePrice(1.65, 220, gramAltin),
        ata: calculatePrice(6.7, 650, gramAltin), // Cumhuriyet/Ata altını hesaplaması
        yeniyarim: 0,
        eskiyarim: 0,
        yenitam: 0,
        eskitam: 0
      };

      // Yarım ve tam hesaplamaları
      newPrices.yeniyarim = Math.ceil((newPrices.yeniceyrek * 2) / 10) * 10;
      newPrices.eskiyarim = Math.ceil((newPrices.eskiceyrek * 2) / 10) * 10;
      newPrices.yenitam = calculateTam(newPrices.yeniceyrek); // Tam/ziynet = çeyrek * 4
      newPrices.eskitam = calculateTam(newPrices.eskiceyrek); // Eski tam/ziynet = çeyrek * 4

      // Fiyatların geçerliliğini kontrol et
      if (this.areValidPrices(newPrices)) {
        this.lastPrices = newPrices;
        this.lastMarketData = marketData;

        const event = new CustomEvent('calculated_prices', { detail: newPrices });
        window.dispatchEvent(event);

        // Market verisini işle ve yayınla
        const processedMarketData = {
          ...marketData,
          ONS: {
            ...marketData.ONS,
            satis: Number(marketData.ONS?.satis || this.lastOns || 0).toFixed(0)
          },
          USDTRY: {
            ...marketData.USDTRY,
            satis: Number(marketData.USDTRY?.satis || this.lastUsdTry || 0).toFixed(3)
          },
          EURTRY: {
            ...marketData.EURTRY,
            satis: Number(marketData.EURTRY?.satis || this.lastEurTry || 0).toFixed(2)
          }
        };

        const marketEvent = new CustomEvent('price_changed', { 
          detail: { 
            data: processedMarketData 
          } 
        });
        window.dispatchEvent(marketEvent);
      } else if (this.lastPrices && this.lastMarketData) {
        // Geçersiz fiyatlar gelirse son geçerli fiyatları kullan
        const event = new CustomEvent('calculated_prices', { detail: this.lastPrices });
        window.dispatchEvent(event);

        const marketEvent = new CustomEvent('price_changed', { 
          detail: { 
            data: this.lastMarketData 
          } 
        });
        window.dispatchEvent(marketEvent);
      }
    } catch (e) {
      console.error('Fiyat hesaplama hatası:', e);
      if (this.lastPrices && this.lastMarketData) {
        // Hata durumunda son fiyatları kullan
        const event = new CustomEvent('calculated_prices', { detail: this.lastPrices });
        window.dispatchEvent(event);

        const marketEvent = new CustomEvent('price_changed', { 
          detail: { 
            data: this.lastMarketData 
          } 
        });
        window.dispatchEvent(marketEvent);
      }
    }
  }

  private areValidPrices(prices: CalculatedPrices): boolean {
    return Object.values(prices).every(price => 
      typeof price === 'number' && 
      !isNaN(price) && 
      price > 0
    );
  }

  public subscribe(event: string, callback: (data: any) => void) {
    if (event === 'calculated_prices' || event === 'price_changed') {
      window.addEventListener(event, ((e: CustomEvent) => {
        callback(e.detail);
      }) as EventListener);
    }
  }

  public unsubscribe(event: string) {
    if (event === 'calculated_prices' || event === 'price_changed') {
      window.removeEventListener(event, (() => {}) as EventListener);
    }
  }

  // Bağlantı durumunu kontrol etmek için yeni metod
  public isConnected(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  // Bağlantıyı yeniden başlatmak için yeni metod
  public reconnect(): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      this.socket = this.createWebSocket();
    }
  }
}

export default new WebSocketService(); 