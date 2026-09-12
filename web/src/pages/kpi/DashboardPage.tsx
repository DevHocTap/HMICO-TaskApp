import { useState } from 'react';
import { App, Button, Card, Empty, Select, Table, Tag, Typography } from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { docLoiBlob, layXuHuong, taiExcelTongHop } from '../../api/report';
import { layKyDanhGia, layViecCuaToi } from '../../api/scorecard';
import { layThongBaoLoi } from '../../api/client';
import type { DiemXuHuong } from '../../types/report';
import { TieuDeTrang } from '../../components/TieuDeTrang';
import { ThanhTab } from '../../components/ThanhTab';
import { BangDieuHanhKy } from '../../components/BangDieuHanhKy';
import { Duong } from '../../components/bieu-do/Duong';
import { kyChuaHomNay } from '../../utils/period';
import { phanTram } from '../../utils/format';
import { mauChuDao, mauXanhLa } from '../../config/theme';

/** "Tháng 09/2026" -> "09/26" cho trục thời gian. */
const nhanThang = (ten: string) => {
  const m = /(\d{2})\/(\d{4})/.exec(ten);
  return m ? `${m[1]}/${m[2]!.slice(2)}` : ten;
};

/**
 * Báo cáo kỳ — chọn kỳ bất kỳ. Khối điều hành (stepper, thẻ, xếp loại,
 * phòng) dùng chung với Tổng quan qua `BangDieuHanhKy`; màn này thêm xu
 * hướng sáu tháng và việc cần xử lý. Biểu đồ vẽ SVG tay, không thêm thư viện.
 */
export function DashboardPage() {
  const { message } = App.useApp();
  const [periodId, setPeriodId] = useState<string | undefined>();
  const [xemBangXuHuong, setXemBangXuHuong] = useState(false);

  const { data: cacKy = [] } = useQuery({
    queryKey: ['periods', 'MONTH'],
    queryFn: () => layKyDanhGia('MONTH'),
  });
  // Mặc định là kỳ chứa hôm nay — kỳ mới nhất thường là tháng sau, chưa có gì
  const kyDangXem = periodId ?? kyChuaHomNay(cacKy)?.id ?? cacKy[0]?.id;
  const ky = cacKy.find((k) => k.id === kyDangXem);

  const { data: xuHuong = [] } = useQuery({
    queryKey: ['reports', 'trend', kyDangXem],
    queryFn: () => layXuHuong(kyDangXem!, 6),
    enabled: Boolean(kyDangXem),
  });
  const { data: viec = [] } = useQuery({
    queryKey: ['scorecards', 'pending-my-action'],
    queryFn: layViecCuaToi,
  });

  const xuat = useMutation({
    mutationFn: () => taiExcelTongHop(kyDangXem!),
    onSuccess: (ten) => message.success(`Đã tải ${ten}`),
    onError: async (e) =>
      message.error((await docLoiBlob(e)) ?? layThongBaoLoi(e)),
  });

  const cotXuHuong: ColumnsType<DiemXuHuong> = [
    { title: 'Kỳ', dataIndex: ['period', 'name'] },
    { title: 'Phiếu', dataIndex: 'soPhieuTrongKy', align: 'right', width: 90 },
    { title: 'Đã chốt', dataIndex: 'soPhieuDaChot', align: 'right', width: 90 },
    {
      title: 'Điểm TB',
      dataIndex: 'diemTrungBinh',
      align: 'right',
      width: 100,
      render: (v: string | null) => (v === null ? '—' : v.replace('.', ',')),
    },
  ];

  const tieuDeThe = (ten: string, phu?: string) => (
    <span className="viec-tieu-de">
      {ten}
      {phu && (
        <Typography.Text
          type="secondary"
          style={{ fontSize: 13, fontWeight: 400 }}
        >
          {phu}
        </Typography.Text>
      )}
    </span>
  );

  return (
    <div>
      <ThanhTab nhom="bao-cao" />
      <TieuDeTrang
        eyebrow="Báo cáo kỳ"
        tieuDe={
          <>
            {ky ? `Kỳ đánh giá ${ky.name.toLowerCase()}` : 'Kỳ đánh giá'}{' '}
            {ky && (
              <Tag
                color={ky.isLocked ? 'default' : 'success'}
                style={{ verticalAlign: 'middle', marginInlineStart: 8 }}
              >
                {ky.isLocked ? 'Đã chốt sổ' : 'Đang vận hành'}
              </Tag>
            )}
          </>
        }
        moTa="Theo dõi tiến độ chấm, phân bố xếp loại và hiệu suất theo phòng trong phạm vi bạn được xem."
        phai={
          <>
            <Select
              className="chon-tron"
              size="large"
              style={{ width: 200 }}
              value={kyDangXem}
              onChange={setPeriodId}
              options={cacKy.map((k) => ({ value: k.id, label: k.name }))}
            />
            <Button
              type="primary"
              shape="round"
              size="large"
              icon={<DownloadOutlined />}
              loading={xuat.isPending}
              disabled={!kyDangXem}
              onClick={() => xuat.mutate()}
            >
              Xuất báo cáo
            </Button>
          </>
        }
      />

      {ky && (
        <>
          <BangDieuHanhKy ky={ky} />

          <div className="dashboard-luoi">
            <Card
              title={tieuDeThe(
                'Xu hướng sáu tháng',
                'điểm trung bình các phiếu đã chốt',
              )}
              extra={
                xuHuong.length > 0 && (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setXemBangXuHuong((v) => !v)}
                  >
                    {xemBangXuHuong ? 'Xem biểu đồ' : 'Xem bảng'}
                  </Button>
                )
              }
            >
              {xuHuong.length === 0 ? (
                <Empty description="Chưa có kỳ nào" />
              ) : xemBangXuHuong ? (
                <Table
                  rowKey={(r) => r.period.id}
                  size="small"
                  pagination={false}
                  columns={cotXuHuong}
                  dataSource={xuHuong}
                />
              ) : (
                <>
                  <Duong
                    yMin={0}
                    yMax={100}
                    mau={mauChuDao}
                    vach={[{ giaTri: 90, nhan: 'Hoàn thành ≥ 90' }]}
                    diem={xuHuong.map((x) => ({
                      nhan: nhanThang(x.period.name),
                      giaTri:
                        x.diemTrungBinh === null
                          ? null
                          : Number(x.diemTrungBinh),
                      phu: `${x.soPhieuDaChot}/${x.soPhieuTrongKy} phiếu đã chốt`,
                    }))}
                  />
                  <Typography.Text
                    strong
                    style={{ display: 'block', marginTop: 12 }}
                  >
                    Tiến độ chốt điểm (%)
                  </Typography.Text>
                  <Duong
                    yMin={0}
                    yMax={100}
                    donVi="%"
                    mau="#1466a0"
                    diem={xuHuong.map((x) => ({
                      nhan: nhanThang(x.period.name),
                      giaTri:
                        x.soPhieuTrongKy === 0
                          ? null
                          : phanTram(x.soPhieuDaChot, x.soPhieuTrongKy),
                      phu: `${x.soPhieuDaChot}/${x.soPhieuTrongKy} phiếu`,
                    }))}
                  />
                </>
              )}
            </Card>

            <Card
              title={tieuDeThe(
                'Việc cần xử lý',
                viec.length > 0
                  ? `${viec.length} việc đang chờ bạn`
                  : 'không có việc nào',
              )}
              extra={<Link to="/">Xem tổng quan</Link>}
            >
              {viec.length === 0 ? (
                <Empty
                  image={
                    <CheckCircleOutlined
                      style={{ fontSize: 36, color: mauXanhLa }}
                    />
                  }
                  styles={{ image: { height: 44 } }}
                  description="Không có việc nào đang chờ bạn"
                />
              ) : (
                <div className="viec-danh-sach">
                  {viec.map((v) => (
                    <div
                      key={v.type}
                      className={
                        v.isOverdue
                          ? 'viec-dong viec-dong-qua-han'
                          : 'viec-dong'
                      }
                    >
                      <Typography.Text strong style={{ flex: 1 }}>
                        {v.message}
                      </Typography.Text>
                      {v.isOverdue ? (
                        <Tag color="error">Quá hạn</Tag>
                      ) : v.daysUntilDeadline !== null ? (
                        <Tag
                          color={v.daysUntilDeadline <= 5 ? 'gold' : 'default'}
                        >
                          Còn {v.daysUntilDeadline} ngày
                        </Tag>
                      ) : null}
                      <Link to={v.link}>
                        <Button
                          shape="round"
                          size="small"
                          icon={<ArrowRightOutlined />}
                          iconPosition="end"
                        >
                          Xử lý
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
