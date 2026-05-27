import { Card, Stack, Button, DatePicker, ErrorState } from '../ui';
import StoreSwitcher from '../StoreSwitcher';
import type { Location } from '../../types';
import { MSG } from '../../lib/messages';

interface ControlBarProps {
  date: string;
  onDateChange: (d: string) => void;
  locations: Location[];
  selectedLocationId: string;
  onLocationChange: (id: string) => void;
  locationsLoading: boolean;
  locationsError: string | null;
  loading: boolean;
  onRefresh: () => void;
  periodLabel: string;
  formattedLastUpdated: string;
  /** 前年比 (YoY) 表示 ON/OFF (Phase 4)。default true。 */
  showYoY: boolean;
  onShowYoYChange: (v: boolean) => void;
}

// 営業時間は 10:00 起点で固定 (SABABA 共通運用)
const FIXED_START_HOUR = 10;

export default function ControlBar({
  date,
  onDateChange,
  locations,
  selectedLocationId,
  onLocationChange,
  locationsLoading,
  locationsError,
  loading,
  onRefresh,
  periodLabel,
  formattedLastUpdated,
  showYoY,
  onShowYoYChange,
}: ControlBarProps) {
  return (
    <>
      <Card padded>
        <Stack gap="md">
          {/* Row 1: 店舗スイッチャー */}
          <div>
            {locationsLoading ? (
              <p className="text-sm text-text-muted">{MSG.loading.locations}</p>
            ) : (
              <StoreSwitcher
                locations={locations}
                selectedId={selectedLocationId}
                onChange={onLocationChange}
              />
            )}
            {locationsError && (
              <div className="mt-2">
                <ErrorState variant="inline" tone="danger" title="店舗情報の取得エラー" description={locationsError} />
              </div>
            )}
          </div>

          {/* Row 2: 日付 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <DatePicker value={date} onChange={onDateChange} startHour={FIXED_START_HOUR} />
          </div>

          {/* Row 3: 更新 + YoY トグル + メタ (PC) */}
          <div className="hidden md:flex items-center justify-between pt-2 border-t border-border gap-4">
            <Button
              variant="primary"
              isLoading={loading}
              disabled={loading || !selectedLocationId}
              onClick={onRefresh}
            >
              {loading ? MSG.loading.generic : MSG.cta.refresh}
            </Button>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                role="switch"
                aria-label="前年比較表示"
                aria-checked={showYoY}
                checked={showYoY}
                onChange={(e) => onShowYoYChange(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
              />
              <span className="text-text">前年比較</span>
            </label>
            <div className="text-right ml-auto">
              <p className="text-xs text-text-muted">{periodLabel}</p>
              <span className="text-xs text-text-muted">
                最終更新: {formattedLastUpdated}
              </span>
            </div>
          </div>

          {/* Row 3: YoY トグル + メタ (SP) */}
          <div className="md:hidden flex flex-col gap-2 pt-2 border-t border-border">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                role="switch"
                aria-label="前年比較表示"
                aria-checked={showYoY}
                checked={showYoY}
                onChange={(e) => onShowYoYChange(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
              />
              <span className="text-text">前年比較</span>
            </label>
            <div className="text-xs text-text-muted">
              <div>{periodLabel}</div>
              <div>最終更新: {formattedLastUpdated}</div>
            </div>
          </div>
        </Stack>
      </Card>

      {/* SP 右下 FAB */}
      <div className="md:hidden fixed bottom-4 right-4 z-30">
        <Button
          variant="primary"
          isLoading={loading}
          disabled={loading || !selectedLocationId}
          onClick={onRefresh}
          className="shadow-lg"
        >
          {loading ? MSG.loading.refresh : MSG.cta.refresh}
        </Button>
      </div>
    </>
  );
}
