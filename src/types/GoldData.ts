export interface Direction {
  alis_dir: string;
  satis_dir: string;
}

export interface CurrencyData {
  code: string;
  alis: string | number;
  satis: string | number;
  tarih: string;
  dir: Direction;
  dusuk: number;
  yuksek: number;
  kapanis: number;
}

export interface MarketData {
  ALTIN: CurrencyData;
  USDTRY: CurrencyData;
  EURTRY: CurrencyData;
  ONS: CurrencyData;
  [key: string]: CurrencyData;
}

export interface WebSocketResponse {
  meta: {
    time: number;
    tarih: string;
  };
  data: MarketData;
} 