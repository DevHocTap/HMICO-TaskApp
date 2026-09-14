import { Button, DatePicker, Form, Input, Select, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { NHAN_GIOI_TINH, type GioiTinh, type HoSoHrInput, type HoSoNhanSu } from '../types/org';

interface GiaTriForm {
  phone?: string;
  personalEmail?: string;
  address?: string;
  dateOfBirth?: Dayjs | null;
  gender?: GioiTinh | null;
  emergencyContact?: string;
  hireDate?: Dayjs | null;
  terminationDate?: Dayjs | null;
  nationalId?: string;
}

interface Props {
  hoSo: HoSoNhanSu;
  /** Mở thêm nhóm "HCNS quản lý" (ngày vào làm, ngày nghỉ, CCCD). */
  cheDoHr: boolean;
  dangLuu: boolean;
  onLuu: (input: HoSoHrInput) => void;
  /** Nút phụ bên cạnh "Lưu" — trang hồ sơ để trống, modal HR truyền nút Đóng. */
  nutPhu?: React.ReactNode;
}

const SO_DIEN_THOAI = /^(\+84|0)\d{9,10}$/;
const CCCD = /^\d{9}$|^\d{12}$/;

/** Chuỗi rỗng → null (xoá), có chữ → giữ; giống cách backend hiểu `null`. */
const chuoi = (v?: string): string | null => (v && v.trim() ? v.trim() : null);
const ngay = (v?: Dayjs | null): string | null => (v ? v.format('YYYY-MM-DD') : null);
const dayjsHoac = (v: string | null): Dayjs | null => (v ? dayjs(v) : null);

/**
 * Form hồ sơ dùng chung cho trang "Thông tin cá nhân" (nhân viên tự sửa) và
 * modal "Hồ sơ nhân sự" ở màn Nhân viên (HR). Quy tắc kiểm trùng với DTO
 * backend; backend vẫn là nơi quyết định cuối.
 */
export function FormHoSo({ hoSo, cheDoHr, dangLuu, onLuu, nutPhu }: Props) {
  const [form] = Form.useForm<GiaTriForm>();

  function onFinish(v: GiaTriForm) {
    const tuSua = {
      phone: chuoi(v.phone),
      personalEmail: chuoi(v.personalEmail),
      address: chuoi(v.address),
      dateOfBirth: ngay(v.dateOfBirth),
      gender: v.gender ?? null,
      emergencyContact: chuoi(v.emergencyContact),
    };
    onLuu(
      cheDoHr
        ? {
            ...tuSua,
            hireDate: ngay(v.hireDate),
            terminationDate: ngay(v.terminationDate),
            nationalId: chuoi(v.nationalId),
          }
        : tuSua,
    );
  }

  return (
    <Form<GiaTriForm>
      form={form}
      layout="vertical"
      requiredMark={false}
      onFinish={onFinish}
      initialValues={{
        phone: hoSo.phone ?? '',
        personalEmail: hoSo.personalEmail ?? '',
        address: hoSo.address ?? '',
        dateOfBirth: dayjsHoac(hoSo.dateOfBirth),
        gender: hoSo.gender,
        emergencyContact: hoSo.emergencyContact ?? '',
        hireDate: dayjsHoac(hoSo.hireDate),
        terminationDate: dayjsHoac(hoSo.terminationDate),
        nationalId: hoSo.nationalId ?? '',
      }}
    >
      <div className="hs-luoi">
        <Form.Item
          name="phone"
          label="Số điện thoại"
          rules={[{ pattern: SO_DIEN_THOAI, message: '10 số, bắt đầu bằng 0 (hoặc +84)' }]}
        >
          <Input placeholder="0912 345 678" inputMode="tel" maxLength={13} />
        </Form.Item>
        <Form.Item
          name="personalEmail"
          label="Email cá nhân"
          rules={[{ type: 'email', message: 'Email không đúng định dạng' }]}
        >
          <Input placeholder="ten@gmail.com" inputMode="email" />
        </Form.Item>
        <Form.Item name="dateOfBirth" label="Ngày sinh">
          <DatePicker
            format="DD/MM/YYYY"
            style={{ width: '100%' }}
            placeholder="Chọn ngày"
            disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          />
        </Form.Item>
        <Form.Item name="gender" label="Giới tính">
          <Select
            allowClear
            placeholder="Chọn"
            options={(Object.keys(NHAN_GIOI_TINH) as GioiTinh[]).map((k) => ({ value: k, label: NHAN_GIOI_TINH[k] }))}
          />
        </Form.Item>
        <Form.Item name="address" label="Địa chỉ liên hệ" className="hs-rong">
          <Input placeholder="Số nhà, đường, phường, quận, tỉnh/thành" maxLength={300} />
        </Form.Item>
        <Form.Item
          name="emergencyContact"
          label="Liên hệ khẩn cấp"
          className="hs-rong"
          extra="Tên — quan hệ — số điện thoại. Ví dụ: Nguyễn Văn A — bố — 0903 000 000"
        >
          <Input maxLength={200} />
        </Form.Item>
      </div>

      {cheDoHr && (
        <>
          <Typography.Text className="hs-nhom">HCNS quản lý — nhân viên chỉ xem</Typography.Text>
          <div className="hs-luoi">
            <Form.Item name="hireDate" label="Ngày vào làm">
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} placeholder="Chọn ngày" />
            </Form.Item>
            <Form.Item
              name="terminationDate"
              label="Ngày nghỉ việc"
              dependencies={['hireDate']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, v?: Dayjs | null) =>
                    v && getFieldValue('hireDate') && v.isBefore(getFieldValue('hireDate') as Dayjs, 'day')
                      ? Promise.reject(new Error('Ngày nghỉ phải sau ngày vào làm'))
                      : Promise.resolve(),
                }),
              ]}
            >
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} placeholder="Để trống nếu đang làm" />
            </Form.Item>
            <Form.Item
              name="nationalId"
              label="Số CCCD"
              rules={[{ pattern: CCCD, message: '12 chữ số (CMND cũ 9 số)' }]}
            >
              <Input inputMode="numeric" maxLength={12} placeholder="012345678901" />
            </Form.Item>
          </div>
        </>
      )}

      <div className="hs-nut">
        {nutPhu}
        <Button type="primary" htmlType="submit" shape="round" loading={dangLuu} style={{ fontWeight: 600 }}>
          Lưu thay đổi
        </Button>
      </div>
    </Form>
  );
}
