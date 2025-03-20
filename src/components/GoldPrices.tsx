import { useEffect, useState, useRef } from 'react';
import WebSocketService from '../services/WebSocketService';
import { MarketData, WebSocketResponse, CurrencyData } from '../types/GoldData';
import './GoldPrices.css';

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

interface PriceChange {
  [key: string]: 'up' | 'down' | null;
}

const GoldPrices = () => {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [calculatedPrices, setCalculatedPrices] = useState<CalculatedPrices | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceChanges, setPriceChanges] = useState<PriceChange>({});
  const previousPrices = useRef<any>({});
  const [allMarketData, setAllMarketData] = useState<{[key: string]: CurrencyData}>({});
  const [marketPriceChanges, setMarketPriceChanges] = useState<{[key: string]: 'up' | 'down' | null}>({});
  const previousMarketPrices = useRef<{[key: string]: number}>({});
  const lastValidDataRef = useRef<{[key: string]: CurrencyData}>({});
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    // Fiyat değişimlerini kontrol et
    if (calculatedPrices) {
      const changes: PriceChange = {};
      Object.entries(calculatedPrices).forEach(([key, value]) => {
        if (previousPrices.current[key] !== undefined) {
          if (value > previousPrices.current[key]) {
            changes[key] = 'up';
          } else if (value < previousPrices.current[key]) {
            changes[key] = 'down';
          }
        }
      });
      setPriceChanges(changes);
      previousPrices.current = { ...calculatedPrices };

      // 1 saniye sonra renkleri temizle
      setTimeout(() => {
        setPriceChanges({});
      }, 1000);
    }
  }, [calculatedPrices]);

  useEffect(() => {
    // WebSocket bağlantısını kontrol et
    const checkConnection = setInterval(() => {
      if (!WebSocketService.isConnected()) {
        WebSocketService.reconnect();
      }
    }, 5000);

    // Market verisi değiştiğinde
    WebSocketService.subscribe('price_changed', (response: WebSocketResponse) => {
      if (response && response.data) {
        const newMarketData = { ...lastValidDataRef.current };
        const changes: {[key: string]: 'up' | 'down' | null} = {};
        
        Object.entries(response.data).forEach(([key, value]) => {
          // Mevcut veriyi al
          const currentData = lastValidDataRef.current[key] || {
            satis: 0,
            alis: 0,
            dusuk: 0,
            yuksek: 0,
            kapanis: 0,
            tarih: ''
          };

          const currentSatis = Number(value.satis);
          const currentAlis = Number(value.alis);
          const previousSatis = Number(currentData.satis);
          const previousAlis = Number(currentData.alis);

          // Yeni veriyi mevcut verilerle birleştir
          newMarketData[key] = {
            ...currentData, // Mevcut tüm verileri koru
            // Yeni gelen değerleri kontrol et ve geçerliyse güncelle
            satis: currentSatis > 0 ? value.satis : currentData.satis,
            alis: currentAlis > 0 ? value.alis : currentData.alis,
            dusuk: value.dusuk || currentData.dusuk,
            yuksek: value.yuksek || currentData.yuksek,
            kapanis: value.kapanis || currentData.kapanis,
            tarih: value.tarih || currentData.tarih
          };

          // Satış fiyatı değişimi kontrolü
          if (currentSatis > 0 && previousSatis > 0 && currentSatis !== previousSatis) {
            changes[`${key}_satis`] = currentSatis > previousSatis ? 'up' : 'down';
          }

          // Alış fiyatı değişimi kontrolü
          if (currentAlis > 0 && previousAlis > 0 && currentAlis !== previousAlis) {
            changes[`${key}_alis`] = currentAlis > previousAlis ? 'up' : 'down';
          }
        });

        // Verileri güncelle
        setMarketData(newMarketData as MarketData);
        lastValidDataRef.current = newMarketData;
        setAllMarketData(newMarketData);
        
        // Değişimleri ayarla
        setMarketPriceChanges(prev => ({...prev, ...changes}));

        // 1 saniye sonra sadece değişen fiyatların renklerini temizle
        setTimeout(() => {
          setMarketPriceChanges(prev => {
            const newChanges = {...prev};
            Object.keys(changes).forEach(key => {
              delete newChanges[key];
            });
            return newChanges;
          });
        }, 1000);

        setLoading(false);
      }
    });

    // Hesaplanmış fiyatlar değiştiğinde
    WebSocketService.subscribe('calculated_prices', (prices: CalculatedPrices) => {
      setCalculatedPrices(prices);
      setLoading(false);
    });

    return () => {
      clearInterval(checkConnection);
      WebSocketService.unsubscribe('price_changed');
      WebSocketService.unsubscribe('calculated_prices');
    };
  }, []);

  useEffect(() => {
    // Saat güncelleme fonksiyonu
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(`${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
    };

    // İlk güncelleme
    updateTime();

    // Her saniye güncelle
    const intervalId = setInterval(updateTime, 1000);

    // Temizleme işlemi
    return () => clearInterval(intervalId);
  }, []);

  const formatPrice = (price: number) => {
    return `${price.toLocaleString('tr-TR', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    })} TL`;
  };

  const formatDecimal = (value: string | number | undefined, decimals: number) => {
    return `${Number(value || 0).toLocaleString('tr-TR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })} TL`;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return dateStr.replace(/-/g, '.');
  };

  const getPriceClassName = (key: string) => {
    return marketPriceChanges[key] === 'up' ? 'price-up' : 
           marketPriceChanges[key] === 'down' ? 'price-down' : '';
  };

  // Sabit market kodu sıralaması
  const marketOrder = [
    'ALTIN',
    'ONS',
    'USDTRY',
    'EURTRY',
    'GBPTRY',
    'CHFTRY',
    'JPYTRY',
    'AUDTRY',
    'CADTRY',
    'SARTRY',
    'SEKTRY',
    'DKKTRY',
    'NOKTRY',
    'AYAR22',
    'AYAR14',
    'KULCEALTIN',
    'GUMUSTRY',
    'XAUXAG',
    'CEYREK_YENI',
    'CEYREK_ESKI',
    'YARIM_YENI',
    'YARIM_ESKI',
    'TEK_YENI',
    'TEK_ESKI',
    'ATA_YENI',
    'ATA_ESKI',
    'ATA5_YENI',
    'ATA5_ESKI',
    'GREMESE_YENI',
    'GREMESE_ESKI',
    'USDKG',
    'EURKG',
    'USDJPY'
  ];

  // Market kodlarının Türkçe karşılıkları
  const marketNames: { [key: string]: string } = {
    'ALTIN': 'Has Altın',
    'ONS': 'Ons',
    'USDTRY': 'Dolar',
    'EURTRY': 'Euro',
    'GBPTRY': 'İngiliz Sterlini',
    'CHFTRY': 'İsviçre Frangı',
    'JPYTRY': 'Japon Yeni',
    'AUDTRY': 'Avustralya Doları',
    'CADTRY': 'Kanada Doları',
    'SARTRY': 'Suudi Riyali',
    'SEKTRY': 'İsveç Kronu',
    'DKKTRY': 'Danimarka Kronu',
    'NOKTRY': 'Norveç Kronu',
    'AYAR22': '22 Ayar',
    'AYAR14': '14 Ayar',
    'KULCEALTIN': 'Külçe Altın',
    'GUMUSTRY': 'Gümüş',
    'XAUXAG': 'Altın/Gümüş Oranı',
    'CEYREK_YENI': 'Yeni Çeyrek',
    'CEYREK_ESKI': 'Eski Çeyrek',
    'YARIM_YENI': 'Yeni Yarım',
    'YARIM_ESKI': 'Eski Yarım',
    'TEK_YENI': 'Yeni Tam',
    'TEK_ESKI': 'Eski Tam',
    'ATA_YENI': 'Yeni Ata',
    'ATA_ESKI': 'Eski Ata',
    'ATA5_YENI': 'Yeni 5\'li Ata',
    'ATA5_ESKI': 'Eski 5\'li Ata',
    'GREMESE_YENI': 'Yeni Gremese',
    'GREMESE_ESKI': 'Eski Gremese',
    'USDKG': 'USD/KG',
    'EURKG': 'EUR/KG',
    'USDJPY': 'USD/JPY'
  };

  // Ondalık basamak sayıları
  const decimalPlaces: { [key: string]: number } = {
    'JPYTRY': 4,
    'SEKTRY': 3,
    'DKKTRY': 3,
    'NOKTRY': 3,
    'GUMUSTRY': 3,
    'XAUXAG': 2,
    'USDJPY': 3,
    'default': 2
  };

  // Değişim yüzdesini hesaplama fonksiyonu
  const calculateChange = (satis: number | string, kapanis: number | string): string => {
    const satisNum = Number(satis);
    const kapanisNum = Number(kapanis);
    
    if (isNaN(satisNum) || isNaN(kapanisNum) || kapanisNum === 0) {
      return '-';
    }
    
    return ((satisNum - kapanisNum) / kapanisNum * 100).toFixed(2);
  };

  // Değer formatla veya - göster
  const formatValue = (value: string | number | undefined, key: string): string => {
    const num = Number(value);
    if (!value || isNaN(num) || num === 0) {
      return '-';
    }
    const decimals = decimalPlaces[key] || decimalPlaces.default;
    return formatDecimal(value, decimals);
  };

  // Market verilerini gösterirken son geçerli fiyatları kullan
  const getMarketData = (key: string) => {
    return lastValidDataRef.current[key] || {
      satis: 0,
      alis: 0,
      dusuk: 0,
      yuksek: 0,
      kapanis: 0,
      tarih: ''
    };
  };

  // Satır için className oluştur
  const getRowClassName = (key: string, data: CurrencyData) => {
    // Renklendirmeyi kapatmak için boş bir string döndür
    return '';
  };

  // Hücre için className oluştur
  const getCellClassName = (key: string, type: 'alis' | 'satis') => {
    const changeKey = `${key}_${type}`;
    const change = marketPriceChanges[changeKey];
    return change ? `price-${change}` : '';
  };

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner"></div>
        <p>Veriler Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="market-data">
      <h1>İzmir Kuyumcular Odası Tavsiye Edilen Fiyatlarıdır.</h1>
      
      <div className="price-table">
        <table>
          <thead>
            <tr>
              <th>ALTIN</th>
              <th>SATIŞ</th>
              <th>HOŞGELDİNİZ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>22 Ayar</b></td>
              <td className={getPriceClassName('yirmiiki')}>
                {formatPrice(calculatedPrices?.yirmiiki || 0)}
              </td>
              <td rowSpan={5} className="welcome-cell">
                İZMİR KUYUMCULAR ODASI<br />
                TAVSİYE EDİLEN FIYATLARDIR!<br /><br />
                <div className="digital-clock">
                  {currentTime}
                </div>
              </td>
            </tr>
            <tr>
              <td><b>18 Ayar</b></td>
              <td className={getPriceClassName('onsekiz')}>
                {formatPrice(calculatedPrices?.onsekiz || 0)}
              </td>
            </tr>
            <tr>
              <td><b>14 Ayar</b></td>
              <td className={getPriceClassName('ondort')}>
                {formatPrice(calculatedPrices?.ondort || 0)}
              </td>
            </tr>
            <tr>
              <td><b>Gram Altın</b></td>
              <td className={getPriceClassName('gram')}>
                {formatPrice(calculatedPrices?.gram || 0)}
              </td>
            </tr>
            <tr>
              <td><b>Cumhuriyet</b></td>
              <td className={getPriceClassName('ata')}>
                {formatPrice(calculatedPrices?.ata || 0)}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="sub-table">
          <thead>
            <tr>
              <th></th>
              <th>YENİ</th>
              <th>ESKİ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Çeyrek</b></td>
              <td className={getPriceClassName('yeniceyrek')}>
                {formatPrice(calculatedPrices?.yeniceyrek || 0)}
              </td>
              <td className={getPriceClassName('eskiceyrek')}>
                {formatPrice(calculatedPrices?.eskiceyrek || 0)}
              </td>
            </tr>
            <tr>
              <td><b>Yarım</b></td>
              <td className={getPriceClassName('yeniyarim')}>
                {formatPrice(calculatedPrices?.yeniyarim || 0)}
              </td>
              <td className={getPriceClassName('eskiyarim')}>
                {formatPrice(calculatedPrices?.eskiyarim || 0)}
              </td>
            </tr>
            <tr>
              <td><b>Ziynet</b></td>
              <td className={getPriceClassName('yenitam')}>
                {formatPrice(calculatedPrices?.yenitam || 0)}
              </td>
              <td className={getPriceClassName('eskitam')}>
                {formatPrice(calculatedPrices?.eskitam || 0)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="bottom-info">
          <div className="has-altin">
            Has Altın: <span className={getPriceClassName('ALTIN')}>
              {formatDecimal(marketData?.ALTIN?.satis, 2)}
            </span>
          </div>
          <div className="market-info">
            <span>ONS: <span className={getPriceClassName('ONS')}>
              {formatPrice(Number(marketData?.ONS?.satis || 0))}
            </span></span>
            <span>Dolar: <span className={getPriceClassName('USDTRY')}>
              {formatDecimal(Number(marketData?.USDTRY?.satis || 0), 3)}
            </span></span>
            <span>Euro: <span className={getPriceClassName('EURTRY')}>
              {formatDecimal(marketData?.EURTRY?.satis, 2)}
            </span></span>
          </div>
        </div>
      </div>

      {/* Tüm market verileri tablosu */}
      <div className="all-market-data">
        <h2>Tüm Piyasa Verileri</h2>
        <table>
          <thead>
            <tr>
              <th>Kod</th>
              <th>Alış</th>
              <th>Satış</th>
              <th>Düşük</th>
              <th>Yüksek</th>
              <th>Değişim</th>
              <th>Son Güncelleme</th>
            </tr>
          </thead>
          <tbody>
            {marketOrder.map(key => {
              const data = getMarketData(key);
              const degisimYuzdesi = calculateChange(data.satis, data.kapanis);
              const showChange = degisimYuzdesi !== '-' ? `${degisimYuzdesi}%` : '-';

              return (
                <tr key={key} className={getRowClassName(key, data)}>
                  <td>{marketNames[key] || key}</td>
                  <td className={getCellClassName(key, 'alis')}>
                    {formatValue(data.alis, key)}
                  </td>
                  <td className={getCellClassName(key, 'satis')}>
                    {formatValue(data.satis, key)}
                  </td>
                  <td>{formatValue(data.dusuk, key)}</td>
                  <td>{formatValue(data.yuksek, key)}</td>
                  <td className={Number(degisimYuzdesi) > 0 ? 'price-up' : Number(degisimYuzdesi) < 0 ? 'price-down' : ''}>
                    {showChange}
                  </td>
                  <td>{formatDate(data.tarih) || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GoldPrices; 