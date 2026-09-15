import { useEffect, useState } from 'react';
import { App, Button, InputNumber, Select, Skeleton, Switch, Tag, Tooltip } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloudDownloadOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  ExclamationCircleFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ThanhTab } from '../../components/ThanhTab';
import { TieuDeTrang } from '../../components/TieuDeTrang';
import { laySaoLuu, saoLuuNgay, taiBanSaoLuu } from '../../api/backup';
import { layCaiDat, luuCaiDat } from '../../api/settings';
import { docLoiBlob } from '../../api/report';
import { layThongBaoLoi } from '../../api/client';
import { ngayGioVN } from '../../utils/format';
import type { CaiDatHeThong } from '../../types/settings';
import './sao-luu.css';

const dungLuong = (b: number | null): string => {
  if (b === null) return '—';
  if (b < 1_048_576) return `${Math.round(b / 1024)} KB`;
  if (b < 1_073_741_824) return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1_073_741_824).toFixed(1)} GB`;
};
const GIO = Array.from({ length: 24 }, (_, i) => ({ value: i, label: `${String(i).padStart(2, '0')}:00` }));

/**
 * Sao lưu database — chỉ ADMIN (chốt 15/09/2026). Thẻ trạng thái · lịch sử
 * (từ thư mục file) · cài đặt lịch. KHÔNG có nút khôi phục: làm bằng
 * `scripts/khoi-phuc.sh` trên máy chủ, có người ngồi trước bàn phím.
 */
export function BackupsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['backups'], queryFn: laySaoLuu, refetchInterval: 30_000 });
  const { data: caiDat } = useQuery({ queryKey: ['settings'], queryFn: layCaiDat });
  const [s, setS] = useState<CaiDatHeThong['saoLuu'] | null>(null);
  useEffect(() => {
    if (caiDat) setS(caiDat.caiDat.saoLuu);
  }, [caiDat]);
  const daDoi = Boolean(s && caiDat && JSON.stringify(s) !== JSON.stringify(caiDat.caiDat.saoLuu));

  const lamMoi = () => {
    void queryClient.invalidateQueries({ queryKey: ['backups'] });
    void queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
  };
  const chay = useMutation({
    mutationFn: saoLuuNgay,
    onSuccess: (b) => {
      message.success(`Đã sao lưu ${b.tenFile} (${dungLuong(b.kichThuoc)})`);
      lamMoi();
    },
    onError: (e) => {
      message.error(layThongBaoLoi(e));
      lamMoi();
    },
  });
  const tai = useMutation({
    mutationFn: taiBanSaoLuu,
    onSuccess: (ten) => message.success(`Đã tải ${ten}`),
    onError: async (e) => message.error((await docLoiBlob(e)) ?? layThongBaoLoi(e)),
  });
  const luu = useMutation({
    mutationFn: () => luuCaiDat({ saoLuu: s! }),
    onSuccess: () => {
      message.success('Đã lưu lịch sao lưu');
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      lamMoi();
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  const tt = data?.trangThai;
  return (
    <div>
      <ThanhTab nhom="he-thong" />
      <TieuDeTrang
        tieuDe="Sao lưu database"
        phai={
          <Button
            type="primary"
            shape="round"
            size="large"
            icon={<DatabaseOutlined />}
            loading={chay.isPending || tt?.dangChay}
            onClick={() => chay.mutate()}
          >
            Sao lưu ngay
          </Button>
        }
      />

      {isLoading || !tt ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <>
          {/* ===== trạng thái */}
          <div className="sl-the-luoi">
            <div className={`sl-the${tt.quaHan ? ' sl-the-do' : ' sl-the-xanh-la'}`}>
              <p className="sl-nhan">Bản gần nhất</p>
              {tt.banGanNhat ? (
                <>
                  <p className="sl-so">{ngayGioVN(tt.banGanNhat.taoLuc)}</p>
                  <p className="sl-phu">
                    {tt.quaHan ? <ExclamationCircleFilled /> : <CheckCircleFilled />}{' '}
                    {tt.quaHan ? 'Quá 36 giờ chưa có bản mới' : `${dungLuong(tt.banGanNhat.kichThuoc)} · ${tt.banGanNhat.nguon === 'TU_DONG' ? 'tự động' : 'thủ công'}`}
                  </p>
                </>
              ) : (
                <>
                  <p className="sl-so">Chưa có</p>
                  <p className="sl-phu"><ExclamationCircleFilled /> Chưa từng sao lưu</p>
                </>
              )}
            </div>
            <div className="sl-the">
              <p className="sl-nhan">Lần tự động kế tiếp</p>
              <p className="sl-so">{tt.lanKeTiep ? ngayGioVN(tt.lanKeTiep) : 'Đã tắt'}</p>
              <p className="sl-phu">{tt.lanKeTiep ? 'Chạy trong giờ đã đặt, bù khi máy chủ khởi động' : 'Bật lại ở phần Lịch bên dưới'}</p>
            </div>
            <div className="sl-the">
              <p className="sl-nhan">Đang giữ</p>
              <p className="sl-so">{tt.soBan} bản</p>
              <p className="sl-phu">{dungLuong(tt.tongKichThuoc)} · còn trống {dungLuong(tt.dungLuongTrong)}</p>
            </div>
            <div className={`sl-the${tt.thuMucMirror ? '' : ' sl-the-vang'}`}>
              <p className="sl-nhan">Bản thứ hai</p>
              <p className="sl-so">{tt.thuMucMirror ? 'Đang chép' : 'Chưa cấu hình'}</p>
              <p className="sl-phu sl-mono">{tt.thuMucMirror ?? 'Đặt BACKUP_MIRROR_DIR trỏ tới ổ ngoài / NAS'}</p>
            </div>
          </div>

          {tt.loiGanNhat && (
            <div className="sl-loi">
              <CloseCircleFilled /> Lần chạy gần nhất thất bại lúc {ngayGioVN(tt.loiGanNhat.luc)}: {tt.loiGanNhat.thongDiep}
            </div>
          )}

          <div className="sl-2">
            {/* ===== lịch sử */}
            <div className="sl-khoi">
              <div className="sl-khoi-dau">
                <h3>Lịch sử sao lưu</h3>
                <span className="sl-mono sl-phu">{tt.thuMuc}</span>
              </div>
              {data!.danhSach.length === 0 ? (
                <p className="sl-rong">Chưa có bản nào. Bấm "Sao lưu ngay" để tạo bản đầu tiên.</p>
              ) : (
                <div className="sl-cuon">
                  <table className="sl-table">
                    <thead>
                      <tr>
                        <th>Thời điểm</th>
                        <th>Nguồn</th>
                        <th style={{ textAlign: 'right' }}>Kích thước</th>
                        <th>Kiểm tra</th>
                        <th>Bản 2</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.danhSach.map((b) => (
                        <tr key={b.tenFile}>
                          <td>
                            <b>{ngayGioVN(b.taoLuc)}</b>
                            <div className="sl-mono sl-phu">{b.tenFile}</div>
                          </td>
                          <td>
                            {b.nguon === 'TU_DONG' ? <Tag>Tự động</Tag> : <Tag color="blue">Thủ công</Tag>}
                            {b.nguoiBamTen && <div className="sl-phu">{b.nguoiBamTen}</div>}
                          </td>
                          <td style={{ textAlign: 'right' }}>{dungLuong(b.kichThuoc)}</td>
                          <td>
                            {b.daKiemTra ? (
                              <Tooltip title={`pg_restore đọc được · migration ${b.migrationMoiNhat ?? '?'}`}>
                                <span className="sl-ok"><CheckCircleFilled /> Lành</span>
                              </Tooltip>
                            ) : (
                              <span className="sl-phu">Chưa kiểm</span>
                            )}
                          </td>
                          <td>{b.daChepSangMirror ? <span className="sl-ok"><CheckCircleFilled /></span> : <span className="sl-phu">—</span>}</td>
                          <td style={{ textAlign: 'right' }}>
                            <Button
                              size="small"
                              icon={<DownloadOutlined />}
                              loading={tai.isPending && tai.variables === b.tenFile}
                              onClick={() => tai.mutate(b.tenFile)}
                            >
                              Tải về
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ===== lịch + cách khôi phục */}
            <div className="sl-cot-phai">
              <div className="sl-khoi">
                <div className="sl-khoi-dau">
                  <h3>Lịch sao lưu</h3>
                </div>
                {s && (
                  <div className="sl-lich">
                    <div className="sl-lich-dong">
                      <span>Tự động hằng đêm</span>
                      <Switch checked={s.tuDongHangDem} onChange={(v) => setS({ ...s, tuDongHangDem: v })} />
                    </div>
                    <div className="sl-lich-dong">
                      <span>Giờ chạy</span>
                      <Select size="small" style={{ width: 96 }} value={s.gioChay} options={GIO} disabled={!s.tuDongHangDem} onChange={(v) => setS({ ...s, gioChay: v })} />
                    </div>
                    <div className="sl-lich-dong">
                      <span>Giữ bản ngày</span>
                      <InputNumber size="small" min={3} max={90} value={s.giuBanNgay} onChange={(v) => v !== null && setS({ ...s, giuBanNgay: v })} addonAfter="ngày" style={{ width: 120 }} />
                    </div>
                    <div className="sl-lich-dong">
                      <span>Giữ bản cuối tháng</span>
                      <InputNumber size="small" min={0} max={120} value={s.giuBanThang} onChange={(v) => v !== null && setS({ ...s, giuBanThang: v })} addonAfter="tháng" style={{ width: 120 }} />
                    </div>
                    <div className="sl-lich-dong sl-phu">
                      <span>Bản cuối năm</span>
                      <span>giữ vĩnh viễn</span>
                    </div>
                    <Button type="primary" shape="round" block disabled={!daDoi} loading={luu.isPending} onClick={() => luu.mutate()}>
                      Lưu lịch
                    </Button>
                  </div>
                )}
              </div>

              <div className="sl-khoi sl-khoi-toi">
                <div className="sl-khoi-dau">
                  <h3><CloudDownloadOutlined /> Khôi phục</h3>
                </div>
                <p>
                  Cố ý <b>không có nút</b> trên giao diện — khôi phục là ghi đè toàn bộ dữ liệu. Chạy trên máy chủ:
                </p>
                <pre>./scripts/khoi-phuc.sh &lt;file.dump&gt;{'\n'}./scripts/khoi-phuc.sh &lt;file.dump&gt; --vao kpi_dientap</pre>
                <p className="sl-phu">Dòng hai khôi phục vào database riêng để diễn tập hoặc xem lại năm cũ, không đụng hệ thống đang chạy. Nên diễn tập mỗi quý.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
