import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Printer,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  buildTableQrPath,
  buildTableQrUrl,
  scopeTablesByRestaurant,
} from '../../domain/serveqrLogic';
import type { DiningTable, Restaurant } from '../../domain/types';
import { useServeQR } from '../../store/ServeQRStore';
import { downloadTableQrPng, QrCodeDisplay } from '../../components/QrCodeDisplay';
import { ServeQRLogo } from '../../components/ServeQRLogo';

interface QrManagementViewProps {
  restaurant: Restaurant;
  onTestQrRoute: (path: string) => void;
  onGoToTables: () => void;
}

export const QrManagementView: React.FC<QrManagementViewProps> = ({
  restaurant,
  onTestQrRoute,
  onGoToTables,
}) => {
  const { state, qrPathsByTableId, regenerateTableQr } = useServeQR();
  const tables = scopeTablesByRestaurant(state.tables, restaurant.id);
  const mainBranch = restaurant.branches[0];
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://serveqr.demo';

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewTable, setPreviewTable] = useState<DiningTable | null>(null);
  const [regenNoticeId, setRegenNoticeId] = useState<string | null>(null);

  const getPathForTable = (table: DiningTable) =>
    qrPathsByTableId[table.id] ||
    buildTableQrPath(restaurant.slug, table.tableNumber, table.branchId, table.qrVersion);

  const getUrlForTable = (table: DiningTable) =>
    qrPathsByTableId[table.id]
      ? `${origin.replace(/\/+$/, '')}${qrPathsByTableId[table.id]}`
      : buildTableQrUrl(origin, restaurant.slug, table.tableNumber, table.branchId, table.qrVersion);

  const handleCopy = (table: DiningTable) => {
    const url = getUrlForTable(table);
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedId(table.id);
    setTimeout(() => setCopiedId((curr) => (curr === table.id ? null : curr)), 2000);
  };

  const handleDownload = async (table: DiningTable) => {
    await downloadTableQrPng({
      url: getUrlForTable(table),
      restaurantName: restaurant.name,
      branchName: mainBranch?.name ?? restaurant.city,
      tableNumber: table.tableNumber,
    });
  };

  const handleRegenerate = (table: DiningTable) => {
    regenerateTableQr(table.id);
    setRegenNoticeId(table.id);
    setTimeout(() => setRegenNoticeId((curr) => (curr === table.id ? null : curr)), 2200);
  };

  const handlePrintPreview = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#172B4D]">QR Code Management</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            {restaurant.name} · {mainBranch?.name ?? restaurant.city} · Functional scannable QR codes
            bound to each table URL.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToTables}
          className="px-4 py-2 text-xs font-semibold text-[#172B4D] bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          Manage Tables ({tables.length})
        </button>
      </div>

      {tables.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-sm font-semibold text-[#172B4D]">No table QR codes generated yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Add dining tables first to automatically generate scannable table QR codes.
          </p>
          <button
            type="button"
            onClick={onGoToTables}
            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[#087F5B] rounded-lg cursor-pointer"
          >
            Add First Table
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 no-print">
          {tables.map((table) => {
            const fullUrl = getUrlForTable(table);
            const routePath = getPathForTable(table);
            const isCopied = copiedId === table.id;
            const isRegened = regenNoticeId === table.id;

            return (
              <article
                key={table.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 pb-4 border-b border-slate-100">
                    <div>
                      <p className="font-display text-lg font-bold text-[#172B4D]">
                        Table {table.tableNumber}
                      </p>
                      <p className="text-xs text-slate-500">
                        {table.section} · {table.capacity} seats · Rev {table.qrVersion}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-slate-500">{table.id}</span>
                  </div>

                  <div className="py-5 flex flex-col items-center">
                    <QrCodeDisplay
                      value={fullUrl}
                      size={168}
                      alt={`QR code for ${restaurant.name} Table ${table.tableNumber}`}
                    />
                    <p className="mt-3 text-[11px] font-mono text-slate-500 text-center break-all px-2">
                      {routePath}
                    </p>
                    {isRegened && (
                      <p className="mt-1.5 text-xs font-semibold text-[#087F5B]">
                        QR token regenerated (v{table.qrVersion})
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => onTestQrRoute(routePath)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-lg transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Test QR Code (Table {table.tableNumber})
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewTable(table)}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[42px] text-xs font-semibold text-[#172B4D] bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(table)}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[42px] text-xs font-semibold text-[#172B4D] bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(table)}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[42px] text-xs font-semibold text-[#172B4D] bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#087F5B]" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          Copy Link
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerate(table)}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[42px] text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                      Regen QR
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Printable Table-Tent Preview Modal */}
      {previewTable && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-preview-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col max-h-[90dvh] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 no-print">
              <h3 id="qr-preview-title" className="font-display text-base font-bold text-[#172B4D]">
                Table {previewTable.tableNumber} QR Standee Preview
              </h3>
              <button
                type="button"
                onClick={() => setPreviewTable(null)}
                aria-label="Close QR preview"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Standee Card */}
            <div className="p-4 sm:p-6 text-center overflow-y-auto flex-1">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-[#172B4D] text-white py-4 px-4">
                  <p className="font-display text-lg font-bold">{restaurant.name}</p>
                  <p className="text-xs text-emerald-300 mt-0.5">
                    {mainBranch?.name ?? restaurant.city}
                  </p>
                </div>
                <div className="p-4 sm:p-6 flex flex-col items-center bg-white">
                  <QrCodeDisplay
                    value={getUrlForTable(previewTable)}
                    size={190}
                    alt={`Printable QR for Table ${previewTable.tableNumber}`}
                  />
                  <p className="mt-3.5 font-display text-xl sm:text-2xl font-bold text-[#087F5B]">
                    Table {previewTable.tableNumber}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Scan with your smartphone camera to view menu &amp; order directly
                  </p>
                  <div className="mt-4 pt-3 border-t border-slate-100 w-full flex justify-center">
                    <ServeQRLogo size="sm" />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2.5 no-print">
              <button
                type="button"
                onClick={() => handleDownload(previewTable)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] text-xs font-semibold text-[#172B4D] bg-white border border-slate-300 hover:bg-slate-100 rounded-xl cursor-pointer flex-1"
              >
                <Download className="w-3.5 h-3.5" />
                Download PNG
              </button>
              <button
                type="button"
                onClick={handlePrintPreview}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] text-xs font-bold text-white bg-[#087F5B] hover:bg-[#06674A] rounded-xl cursor-pointer flex-1 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Print QR Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
