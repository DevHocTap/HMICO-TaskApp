import { App, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { taoKyDanhGia, type KyMoiInput } from '../api/scorecard';
import { layThongBaoLoi } from '../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Tạo kỳ đánh giá thủ công — chuyển từ màn Kỳ đánh giá (đã bỏ 15/09) sang
 * Cài đặt, cạnh công tắc "Tự sinh kỳ hằng tháng". Chỉ cần khi tắt tự sinh
 * hoặc cần kỳ của tháng đã qua (tác vụ tự sinh KHÔNG bù ngược quá khứ).
 */
export function ModalTaoKy({ open, onClose }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<KyMoiInput>();

  const tao = useMutation({
    mutationFn: (v: KyMoiInput) => taoKyDanhGia(v),
    onSuccess: () => {
      message.success('Đã tạo kỳ đánh giá');
      form.resetFields();
      onClose();
      void queryClient.invalidateQueries({ queryKey: ['periods'] });
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  return (
    <Modal
      open={open}
      title="Tạo kỳ đánh giá thủ công"
      okText="Tạo kỳ"
      cancelText="Huỷ"
      confirmLoading={tao.isPending}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Ngày nhập dạng <b>YYYY-MM-DD</b>; bốn mốc chỉ điền cho kỳ THÁNG.
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ type: 'MONTH' }}
        onFinish={(v) =>
          tao.mutate(
            // Bỏ ô trống thay vì gửi chuỗi rỗng: backend từ chối chuỗi
            // không đúng dạng YYYY-MM-DD, kể cả chuỗi rỗng.
            Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== '')) as KyMoiInput,
          )
        }
      >
        <Form.Item name="code" label="Mã kỳ" rules={[{ required: true }]}>
          <Input placeholder="2026-07" />
        </Form.Item>
        <Form.Item name="name" label="Tên kỳ" rules={[{ required: true }]}>
          <Input placeholder="Tháng 07/2026" />
        </Form.Item>
        <Form.Item name="type" label="Loại kỳ" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'MONTH', label: 'Tháng' },
              { value: 'QUARTER', label: 'Quý' },
              { value: 'YEAR', label: 'Năm' },
            ]}
          />
        </Form.Item>
        <Space size="middle" style={{ display: 'flex' }}>
          <Form.Item name="startDate" label="Từ ngày" rules={[{ required: true }]}>
            <Input placeholder="2026-07-01" />
          </Form.Item>
          <Form.Item name="endDate" label="Đến ngày" rules={[{ required: true }]}>
            <Input placeholder="2026-07-31" />
          </Form.Item>
        </Space>
        <Form.Item noStyle shouldUpdate={(a, b) => a.type !== b.type}>
          {({ getFieldValue }) =>
            getFieldValue('type') === 'MONTH' && (
              <>
                <Space size="middle" style={{ display: 'flex' }}>
                  <Form.Item name="assignDeadline" label="Hạn lên KPI">
                    <Input placeholder="2026-06-25" />
                  </Form.Item>
                  <Form.Item name="selfScoreDeadline" label="Hạn tự đánh giá">
                    <Input placeholder="2026-07-25" />
                  </Form.Item>
                </Space>
                <Space size="middle" style={{ display: 'flex' }}>
                  <Form.Item name="managerScoreDeadline" label="Hạn TP chấm">
                    <Input placeholder="2026-07-29" />
                  </Form.Item>
                  <Form.Item name="submitDeadline" label="Hạn gửi HCNS">
                    <Input placeholder="2026-07-30" />
                  </Form.Item>
                </Space>
              </>
            )
          }
        </Form.Item>
      </Form>
    </Modal>
  );
}
