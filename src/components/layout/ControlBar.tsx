import { Card, Stack, Button, DatePicker } from '../ui';
import StoreSwitcher from '../StoreSwitcher';
import type { Location } from '../../types';

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
}

const selectClass =
  'border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text';

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
}: ControlBarProps) {
  return (
    <>
      <Card padded>
        <Stack gap="md">
          {/* Row 1: 店舗スイッチャー */}
          <div>
            {locationsLoading ? (
              <p className="text-sm text-text-muted">店舗情報を取得中...</p>
            ) : (
              <StoreSwitcher
                locations={locations}
                selectedId={selectedLocationId}
                onChange={onLocationChange}
              />
            )}
            {locationsError && (
              <p className="text-sm text-danger mt-2">⚠ {locationsError}</p>
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
                  <label className="text-sm font-medium text-text">営業開始:</label>
                  <select
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
                  <label className="text-sm font-medium text-text">営業終了:</label>
                  <select
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
                <label className="text-sm font-medium text-text">営業開始:</label>
                <select
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
                <label className="text-sm font-medium text-text">営業終了:</label>
                <select
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

          {/* Row 4: 更新 + メタ (PC) */}
          <div className="hidden md:flex items-center justify-between pt-2 border-t border-border">
            <Button
              variant="primary"
              isLoading={loading}
              disabled={loading || !selectedLocationId}
              onClick={onRefresh}
            >
              {loading ? '読み込み中...' : '更新'}
            </Button>
            <div className="text-right">
              <p className="text-xs text-text-muted">{periodLabel}</p>
              <span className="text-xs text-text-muted">
                最終更新: {formattedLastUpdated}
              </span>
            </div>
          </div>

          {/* Row 4: メタのみ (SP) */}
          <div className="md:hidden flex items-center justify-between pt-2 border-t border-border">
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
          {loading ? '更新中...' : '更新'}
        </Button>
      </div>
    </>
  );
}
