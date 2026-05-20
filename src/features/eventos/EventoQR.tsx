import { QRCodeSVG } from 'qrcode.react';

type Props = {
  accessToken: string;
  // baseUrl inyectable para tests; en runtime usa env o el origin.
  baseUrl?: string;
};

export function EventoQR({ accessToken, baseUrl }: Props) {
  const base = baseUrl ?? (import.meta.env.VITE_SITE_URL as string | undefined) ?? window.location.origin;
  const url = `${base}/e/${accessToken}`;
  return (
    <div className="flex flex-col items-center gap-2">
      <QRCodeSVG value={url} size={200} />
      <span className="text-xs text-gray-600 select-all break-all">{url}</span>
    </div>
  );
}
