import { useEffect, useState } from 'react';
import { ThanhTab } from '../../components/ThanhTab';
import { App, Button, Card, InputNumber, Spin, Switch, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { layCaiDat, luuCaiDat } from '../../api/settings';
import { layThongBaoLoi } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { coTheSuaCaiDat } from '../../auth/permissions';
import { TieuDeTrang } from '../../components/TieuDeTrang';
import { ReadOnlyNotice } from '../../components/ReadOnlyNotice';
import { ngayGioVN } from '../../utils/format';
import type { CaiDatHeThong, NhomCaiDat } from '../../types/settings';

const CAC_NHOM: NhomCaiDat[] = [
  'lichKy',
  'nguongXepLoai',
  'baoMat',
  'kyDanhGia',
  'chamDiem',
];

/**
 * Cài đặt hệ thống — một form cho cả năm nhóm, lưu CHỈ nhóm đã đổi.
 *
 * Kiểm quan hệ (tự chấm trước trưởng chấm, ngưỡng tăng dần) do backend làm và
 * trả câu tiếng Việt; ở đây chỉ chặn kiểu và khoảng trên từng ô.
 */
export function SettingsPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const suaDuoc = coTheSuaCaiDat(user?.role);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: layCaiDat,
  });
  const [nhap, setNhap] = useState<CaiDatHeThong | null>(null);

  // Nạp bản đang có hiệu lực vào form khi tải xong (và sau mỗi lần lưu)
  useEffect(() => {
    if (data) setNhap(data.caiDat);
  }, [data]);

  const nhomDaDoi = (): NhomCaiDat[] =>
    !data || !nhap
      ? []
      : CAC_NHOM.filter(
          (k) => JSON.stringify(nhap[k]) !== JSON.stringify(data.caiDat[k]),
        );

  const luu = useMutation({
    mutationFn: () => {
      const phan: Partial<CaiDatHeThong> = {};
      for (const k of nhomDaDoi())
        (phan as Record<NhomCaiDat, unknown>)[k] = nhap![k];
      return luuCaiDat(phan);
    },
    onSuccess: () => {
      message.success('Đã lưu cài đặt');
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      // Kỳ và trang chủ đọc mốc từ kỳ, không từ cài đặt — nhưng lịch tháng
      // sau sẽ sinh theo mốc mới, nên làm mới luôn cho chắc.
      void queryClient.invalidateQueries({ queryKey: ['periods'] });
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  if (isLoading || !nhap || !data) return <Spin />;

  const dat = <K extends NhomCaiDat>(
    nhom: K,
    phan: Partial<CaiDatHeThong[K]>,
  ) => setNhap((cu) => (cu ? { ...cu, [nhom]: { ...cu[nhom], ...phan } } : cu));

  const soDoi = nhomDaDoi().length;
  const {
    lichKy: l,
    nguongXepLoai: n,
    baoMat: b,
    kyDanhGia: k,
    chamDiem: c,
  } = nhap;

  /** "Sửa lần cuối bởi X · lúc Y" hoặc "đang dùng mặc định". */
  const ghiChuNhom = (nhom: NhomCaiDat) => {
    const cn = data.capNhat[nhom];
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {cn
          ? `Sửa lần cuối: ${cn.updatedByName ?? '—'} · ${ngayGioVN(cn.updatedAt)}`
          : 'Đang dùng giá trị mặc định'}
      </Typography.Text>
    );
  };

  const oNgay = (giaTri: number, onChange: (v: number) => void) => (
    <InputNumber
      className="cai-dat-o-so"
      size="large"
      min={1}
      max={31}
      precision={0}
      value={giaTri}
      disabled={!suaDuoc}
      onChange={(v) => v !== null && onChange(v)}
    />
  );

  return (
    <div>
      <ThanhTab nhom="he-thong" />
      <TieuDeTrang
        tieuDe="Cài đặt"
        moTa="Cấu hình dùng chung cho toàn công ty. Chỉ quản trị và hành chính sửa được."
        phai={
          suaDuoc && (
            <>
              <Button
                shape="round"
                size="large"
                disabled={soDoi === 0}
                onClick={() => setNhap(data.caiDat)}
              >
                Hoàn tác
              </Button>
              <Button
                type="primary"
                shape="round"
                size="large"
                disabled={soDoi === 0}
                loading={luu.isPending}
                onClick={() => luu.mutate()}
              >
                Lưu {soDoi > 0 ? `${soDoi} nhóm` : 'thay đổi'}
              </Button>
            </>
          )
        }
      />

      {!suaDuoc && <ReadOnlyNotice role={user?.role} />}

      <div className="cai-dat-luoi">
        <Card
          title={
            <span className="ten-va-phu">
              <span>Lịch kỳ đánh giá</span>
              <small>
                Lưu là áp ngay cho kỳ tháng đang mở (từ tháng này trở đi, chưa
                khoá sổ) và mọi kỳ sinh sau. Kỳ quá khứ và kỳ đã khoá giữ
                nguyên.
              </small>
            </span>
          }
          extra={ghiChuNhom('lichKy')}
        >
          <div className="giai-doan-luoi">
            {[
              {
                ten: 'Nhân viên tự chấm',
                phu: 'Cửa tự chấm đóng cuối ngày này — giai đoạn 1',
                v: l.ngayTuCham,
                set: (v: number) => dat('lichKy', { ngayTuCham: v }),
              },
              {
                ten: 'Trưởng bộ phận chấm',
                phu: 'Chốt điểm cho nhân viên — giai đoạn 2',
                v: l.ngayTruongCham,
                set: (v: number) => dat('lichKy', { ngayTruongCham: v }),
              },
              {
                ten: 'Gửi hành chính bản cuối',
                phu: 'Hành chính tiếp nhận và chốt sổ — giai đoạn 3',
                v: l.ngayGuiHcns,
                set: (v: number) => dat('lichKy', { ngayGuiHcns: v }),
              },
              {
                ten: 'Giao KPI tháng sau',
                phu: 'Trưởng bộ phận lên chỉ tiêu cho tháng kế tiếp',
                v: l.ngayLenKpiThangSau,
                set: (v: number) => dat('lichKy', { ngayLenKpiThangSau: v }),
              },
            ].map((d, i) => (
              <div key={d.ten} className="giai-doan-the">
                <div className="giai-doan-the-dau">
                  <span className="eyebrow">Mốc {i + 1}</span>
                  {oNgay(d.v, d.set)}
                </div>
                <div className="giai-doan-the-ten">Ngày {d.v} hằng tháng</div>
                <Typography.Text strong>{d.ten}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {d.phu}
                </Typography.Text>
              </div>
            ))}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Ngày lớn hơn số ngày của tháng (29–31) tự lùi về ngày cuối tháng.
          </Typography.Text>
        </Card>

        <Card
          title={
            <span className="ten-va-phu">
              <span>Quy tắc chấm điểm</span>
              <small>
                Ngưỡng xếp loại, tính trên cột trưởng bộ phận. Chỉ áp cho lần
                chốt SAU khi đổi.
              </small>
            </span>
          }
          extra={ghiChuNhom('nguongXepLoai')}
        >
          <table className="bang-xep-loai">
            <thead>
              <tr>
                <th>Hạng thành tích</th>
                <th>Khoảng điểm</th>
                <th>Điều kiện</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  ten: 'Vượt chỉ tiêu',
                  mo: `> ${n.vuot}`,
                  mau: '#15803d',
                  dk: 'Tổng điểm lớn hơn trần',
                },
                {
                  ten: 'Hoàn thành',
                  mo: `${n.hoanThanh} – ${n.vuot}`,
                  mau: '#1466a0',
                  dk: 'Đạt mức mong đợi',
                },
                {
                  ten: 'Cần cải thiện',
                  mo: `${n.canCaiThien} – ${(n.hoanThanh - 0.01).toFixed(2)}`,
                  mau: '#e0932b',
                  dk: 'Dưới mức hoàn thành',
                },
                {
                  ten: 'Chưa đạt',
                  mo: `< ${n.canCaiThien}`,
                  mau: '#d63b3b',
                  dk: 'Không đạt yêu cầu',
                },
              ].map((d) => (
                <tr key={d.ten}>
                  <td>
                    <span
                      className="xep-loai-o-ten"
                      style={{
                        color: '#111827',
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      <i style={{ background: d.mau }} />
                      {d.ten}
                    </span>
                  </td>
                  <td>
                    <Typography.Text strong>{d.mo}</Typography.Text>
                  </td>
                  <td>
                    <Typography.Text type="secondary">{d.dk}</Typography.Text>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cai-dat-nguong">
            {[
              {
                ten: 'Từ (cần cải thiện)',
                v: n.canCaiThien,
                set: (v: number) => dat('nguongXepLoai', { canCaiThien: v }),
              },
              {
                ten: 'Từ (hoàn thành)',
                v: n.hoanThanh,
                set: (v: number) => dat('nguongXepLoai', { hoanThanh: v }),
              },
              {
                ten: 'Trần (vượt khi lớn hơn)',
                v: n.vuot,
                set: (v: number) => dat('nguongXepLoai', { vuot: v }),
              },
            ].map((d) => (
              <label key={d.ten} className="ten-va-phu">
                <small>{d.ten}</small>
                <InputNumber
                  className="cai-dat-o-so"
                  size="large"
                  min={0}
                  max={200}
                  step={0.5}
                  value={d.v}
                  disabled={!suaDuoc}
                  onChange={(v) => v !== null && d.set(v)}
                />
              </label>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Bảo mật & tài khoản"
        style={{ marginTop: 20 }}
        extra={
          <span style={{ display: 'flex', gap: 16 }}>
            {ghiChuNhom('baoMat')}
          </span>
        }
      >
        <div className="cai-dat-cong-tac-luoi">
          <div className="cai-dat-cong-tac">
            <div className="cai-dat-cong-tac-dau">
              <Typography.Text strong>
                Bắt buộc đổi mật khẩu lần đầu
              </Typography.Text>
              <Switch
                checked={b.batBuocDoiMatKhauLanDau}
                disabled={!suaDuoc}
                onChange={(v) => dat('baoMat', { batBuocDoiMatKhauLanDau: v })}
              />
            </div>
            <small>Mật khẩu tạm chỉ dùng được một lần</small>
          </div>

          <div className="cai-dat-cong-tac">
            <div className="cai-dat-cong-tac-dau">
              <Typography.Text strong>
                Khoá tạm sau {b.soLanSaiToiDa} lần sai
              </Typography.Text>
              <Switch
                checked={b.khoaTamKhiSaiNhieu}
                disabled={!suaDuoc}
                onChange={(v) => dat('baoMat', { khoaTamKhiSaiNhieu: v })}
              />
            </div>
            <small>Mở lại sau {b.phutKhoaTam} phút hoặc do hành chính mở</small>
            <div className="cai-dat-nguong" style={{ marginTop: 10 }}>
              <label className="ten-va-phu">
                <small>Số lần sai</small>
                <InputNumber
                  size="middle"
                  min={3}
                  max={100}
                  precision={0}
                  value={b.soLanSaiToiDa}
                  disabled={!suaDuoc || !b.khoaTamKhiSaiNhieu}
                  onChange={(v) =>
                    v !== null && dat('baoMat', { soLanSaiToiDa: v })
                  }
                />
              </label>
              <label className="ten-va-phu">
                <small>Phút khoá</small>
                <InputNumber
                  size="middle"
                  min={1}
                  max={1440}
                  precision={0}
                  value={b.phutKhoaTam}
                  disabled={!suaDuoc || !b.khoaTamKhiSaiNhieu}
                  onChange={(v) =>
                    v !== null && dat('baoMat', { phutKhoaTam: v })
                  }
                />
              </label>
            </div>
          </div>

          <div className="cai-dat-cong-tac">
            <div className="cai-dat-cong-tac-dau">
              <Typography.Text strong>
                Tự sinh kỳ đánh giá hàng tháng
              </Typography.Text>
              <Switch
                checked={k.tuSinhHangThang}
                disabled={!suaDuoc}
                onChange={(v) => dat('kyDanhGia', { tuSinhHangThang: v })}
              />
            </div>
            <small>
              Chạy 01:00 mỗi ngày và lúc khởi động; tắt thì HCNS tạo kỳ tay
            </small>
            <div style={{ marginTop: 8 }}>{ghiChuNhom('kyDanhGia')}</div>
          </div>

          <div className="cai-dat-cong-tac">
            <div className="cai-dat-cong-tac-dau">
              <Typography.Text strong>
                Cho phép trả lại phiếu đã chốt
              </Typography.Text>
              <Switch
                checked={c.choPhepTraLaiPhieuDaChot}
                disabled={!suaDuoc}
                onChange={(v) =>
                  dat('chamDiem', { choPhepTraLaiPhieuDaChot: v })
                }
              />
            </div>
            <small>
              Trưởng bộ phận rút lại phiếu đã chốt điểm, hành chính trả lại
              phiếu đã tiếp nhận. Vẫn qua bước trả lại, có ghi lịch sử; kỳ đã
              khoá sổ không đụng được.
            </small>
            <div style={{ marginTop: 8 }}>{ghiChuNhom('chamDiem')}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
