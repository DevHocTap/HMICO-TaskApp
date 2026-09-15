import { App, Skeleton, Typography } from 'antd';
import { IdcardOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capNhatHoSoCuaToi, layHoSoCuaToi } from '../api/org';
import { layThongBaoLoi } from '../api/client';
import { TieuDeTrang } from '../components/TieuDeTrang';
import { FormHoSo } from '../components/FormHoSo';
import type { HoSoNhanSu } from '../types/org';
import { ngayVN } from '../utils/format';

/**
 * Thông tin cá nhân — nhân viên tự sửa phần liên hệ; phần tài khoản (họ tên,
 * mã, email, phòng, chức danh) và phần HCNS quản lý chỉ đọc. Mở từ menu tài
 * khoản ở header.
 */
export function HoSoPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: hoSo, isLoading } = useQuery({ queryKey: ['profile', 'me'], queryFn: layHoSoCuaToi });

  const luu = useMutation({
    mutationFn: capNhatHoSoCuaToi,
    onSuccess: (moi) => {
      queryClient.setQueryData(['profile', 'me'], moi);
      message.success('Đã lưu thông tin cá nhân');
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  return (
    <div className="hs">
      <TieuDeTrang
        tieuDe="Thông tin cá nhân"
      />
      {isLoading || !hoSo ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <div className="hs-luoi-trang">
          <section className="hs-the">
            <h3 className="hs-the-tieu-de">
              <IdcardOutlined /> Tài khoản & vị trí
            </h3>
            <KhoiChiDoc hoSo={hoSo} />
          </section>
          <section className="hs-the">
            <h3 className="hs-the-tieu-de">Liên hệ — bạn tự cập nhật</h3>
            <FormHoSo hoSo={hoSo} cheDoHr={false} dangLuu={luu.isPending} onLuu={(v) => luu.mutate(v)} />
          </section>
        </div>
      )}
    </div>
  );
}

function KhoiChiDoc({ hoSo }: { hoSo: HoSoNhanSu }) {
  const dong: [string, string | null][] = [
    ['Họ và tên', hoSo.fullName],
    ['Mã nhân viên', hoSo.employeeCode],
    ['Email công ty', hoSo.email],
    ['Phòng ban', hoSo.departmentName],
    ['Chức danh', hoSo.jobTitleName],
    ['Cấp bậc', hoSo.level],
    ['Quản lý trực tiếp', hoSo.managerName],
    ['Ngày vào làm', hoSo.hireDate ? ngayVN(hoSo.hireDate) : null],
    ['Ngày nghỉ việc', hoSo.terminationDate ? ngayVN(hoSo.terminationDate) : null],
    ['Số CCCD', hoSo.nationalId],
  ];
  return (
    <dl className="hs-dl">
      {dong.map(([nhan, gia]) => (
        <div key={nhan}>
          <dt>{nhan}</dt>
          <dd>{gia ?? <Typography.Text type="secondary">—</Typography.Text>}</dd>
        </div>
      ))}
    </dl>
  );
}
