import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeDisplayProps {
  value: string;
  size?: number;
  alt: string;
  className?: string;
  onDataUrlReady?: (dataUrl: string) => void;
}

export const QrCodeDisplay: React.FC<QrCodeDisplayProps> = ({
  value,
  size = 180,
  alt,
  className = '',
  onDataUrlReady,
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: Math.max(size * 2, 320),
      margin: 2,
      color: {
        dark: '#172B4D',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!active) return;
        setDataUrl(url);
        setError(false);
        onDataUrlReady?.(url);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
      });

    return () => {
      active = false;
    };
  }, [value, size, onDataUrlReady]);

  if (error) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-slate-100 text-xs text-slate-500 rounded-lg border border-slate-200 ${className}`}
      >
        QR unavailable
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-slate-100 animate-pulse rounded-lg border border-slate-200 ${className}`}
        aria-label="Generating QR code"
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      width={size}
      height={size}
      className={`block rounded-lg border border-slate-200 bg-white ${className}`}
    />
  );
};

export async function downloadTableQrPng(params: {
  url: string;
  restaurantName: string;
  branchName: string;
  tableNumber: string;
}) {
  const qrDataUrl = await QRCode.toDataURL(params.url, {
    width: 600,
    margin: 2,
    color: { dark: '#172B4D', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  });

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 940;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Top header band
  ctx.fillStyle = '#172B4D';
  ctx.fillRect(0, 0, canvas.width, 148);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 34px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(params.restaurantName, canvas.width / 2, 68);

  ctx.fillStyle = '#A7F3D0';
  ctx.font = '500 20px "DM Sans", sans-serif';
  ctx.fillText(params.branchName, canvas.width / 2, 108);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('QR image load failed'));
    img.src = qrDataUrl;
  });

  ctx.drawImage(img, 110, 196, 500, 500);

  ctx.fillStyle = '#087F5B';
  ctx.font = '700 44px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Table ${params.tableNumber}`, canvas.width / 2, 770);

  ctx.fillStyle = '#202938';
  ctx.font = '500 22px "DM Sans", sans-serif';
  ctx.fillText('Scan with your phone camera to order', canvas.width / 2, 822);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 18px "DM Sans", sans-serif';
  ctx.fillText('Powered by ServeQR · Scan. Order. Enjoy.', canvas.width / 2, 886);

  const link = document.createElement('a');
  link.download = `${params.restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-table-${params.tableNumber.toLowerCase()}-qr.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
