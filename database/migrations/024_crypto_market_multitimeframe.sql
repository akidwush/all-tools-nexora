-- Crypto Market Scanner: analisis candle tertutup multi-timeframe.
-- Aman dijalankan ulang pada database Nexora yang sudah aktif.

update public.tools
set
  description = 'Analisis crypto 15m, 1 jam, mikro, makro, indikator teknikal dan risiko',
  badge = 'MTF LIVE',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"provider":"coingecko","fallback":"coinpaprika","candles":"binance-spot","timeframes":["15m","1h","1d"]}'::jsonb,
  updated_at = now()
where id = 'cryptomarket';

notify pgrst, 'reload schema';
