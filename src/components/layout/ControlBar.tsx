import { Card, Stack, Button, DatePicker, ErrorState } from '../ui';
import StoreSwitcher from '../StoreSwitcher';
import type { Location } from '../../types';
import { MSG } from '../../lib/messages';

interface ControlBarProps {
  date: string;
  onDateChange: (d: string) => void;
  startHour: number;
  endHour: number;
  onStartHourChange: (h: number) => void;
  onEndHourChange: (h: number) => void;
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

const selectClass =
  'border border-border rounded px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 bg-surface text-text';

export default function ControlBar({
  date,
  onDateChange,
  startHour,
  endHour,
  onStartHourChange,
  onEndHourChange,
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
            <DatePicker value={date} onChange={onDateChange} startHour={startHour} />
          </div>

          {/* Row 3: 営業時間 */}
          <div>
            {/* SP: 折りたたみ */}
            <details className="md:hidden">
              <summary className="cursor-pointer text-sm font-medium text-text select-none">
                設定
              </summary>
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="sp-start-hour" className="text-sm font-medium text-text">営業開始:</label>
                  <select
                    id="sp-start-hour"
                    value={startHour}
                    onChange={(e) => onStartHourChange(parseInt(e.target.value, 10))}
                    className={selectClass}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={`sp-s-${i}`} value={i}>
                        {String(i).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="sp-end-hour" className="text-sm font-medium text-text">営業終了:</label>
                  <select
                    id="sp-end-hour"
                    value={endHour}
                    onChange={(e) => onEndHourChange(parseInt(e.target.value, 10))}
                    className={selectClass}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={`sp-e-${i}`} value={i}>
                        {String(i).padStart(2, '0')}:59
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </details>

            {/* PC: 常時表示 */}
            <div className="hidden md:flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label htmlFor="pc-start-hour" className="text-sm font-medium text-text">営業開始:</label>
                <select
                  id="pc-start-hour"
                  value={startHour}
                  onChange={(e) => onStartHourChange(parseInt(e.target.value, 10))}
                  className={selectClass}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={`pc-s-${i}`} value={i}>
                      {String(i).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="pc-end-hour" className="text-sm font-medium text-text">営業終了:</label>
                <select
                  id="pc-end-hour"
                  value={endHour}
                  onChange={(e) => onEndHourChange(parseInt(e.target.value, 10))}
                  className={selectClass}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={`pc-e-${i}`} value={i}>
                      {String(i).padStart(2, '0')}:59
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 4: 更新 + YoY トグル + メタ (PC) */}
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

          {/* Row 4: YoY トグル + メタ (SP) */}
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
