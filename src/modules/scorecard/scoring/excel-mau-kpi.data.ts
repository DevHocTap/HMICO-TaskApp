/**
 * SỐ LẤY NGUYÊN VĂN TỪ BỐN FILE EXCEL trong `docs/mau-kpi/`.
 *
 * Sinh bằng máy từ chính file .xlsx, KHÔNG gõ tay. Đây là mốc đối chiếu của
 * tuần 11: điểm hệ thống tính ra phải khớp tuyệt đối với biểu mẫu công ty
 * đang dùng. Lệch 0,05 cũng là công thức sai.
 *
 * QUY ĐỔI DUY NHẤT: Excel lưu trọng số dạng phân số (0.15) rồi định dạng
 * thành "15%"; hệ thống lưu số nguyên phần trăm (15). Nhân 100, không đổi gì
 * khác. Mọi con số còn lại giữ nguyên như trong ô.
 *
 * Ghép tiêu chí cấp 1 của sheet biểu mẫu với nhóm KPI con của sheet chi tiết
 * THEO THỨ TỰ, không theo tên: hai sheet ghi tên khác nhau ở file kỹ sư
 * triển khai và kỹ sư cấu hình — xem docs/no-ky-thuat.md Câu 2.
 */

export interface ConExcel {
  ten: string;
  trongSo: number;
  diemTu: number | null;
  diemQl: number | null;
  /** Cột "Điểm đạt được" của Excel = điểm × trọng số. */
  excelDatDuocTu: number | null;
  excelDatDuocQl: number | null;
}

export interface TieuChiExcel {
  ten: string;
  /** Tên ở sheet chi tiết — lệch với sheet biểu mẫu ở 2/4 file. */
  tenSheetChiTiet: string;
  trongSo: number;
  maxScale: number;
  excelDiemChaTu: number | null;
  excelDiemChaQl: number | null;
  /** Cột "% đóng góp/tổng" của Excel, đã nhân 100. */
  excelDongGopTu: number | null;
  excelDongGopQl: number | null;
  con: ConExcel[];
}

export interface DongMuc2Excel {
  ten: string;
  trongSo: number;
  maxScale: number;
  /** `null` ở CẢ BỐN FILE: mục chấp hành nội quy chưa ai chấm. */
  excelDiemTu: number | null;
  excelDiemQl: number | null;
}

export interface PhieuExcel {
  file: string;
  muc1: TieuChiExcel[];
  muc2: DongMuc2Excel[];
}

export const PHIEU_EXCEL: PhieuExcel[] = [
  {
    "file": "KPI Shop Drawing",
    "muc1": [
      {
        "ten": "Tiến độ hoàn thành Shop Drawing",
        "tenSheetChiTiet": "Tiến độ hoàn thành Shop Drawing",
        "trongSo": 15.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 15.0,
        "excelDongGopQl": 15.0,
        "con": [
          {
            "ten": "Hoàn thành bản vẽ theo kế hoạch được giao.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Đảm bảo thời gian phát hành bản vẽ phục vụ thi công/trình duyệt.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Chủ động cập nhật tiến độ và cảnh báo sớm khi có nguy cơ chậm.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Ưu tiên xử lý các bản vẽ ảnh hưởng trực tiếp đến tiến độ thi công.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Hoàn thành việc chỉnh sửa/re-submit theo thời hạn yêu cầu.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          }
        ]
      },
      {
        "ten": "Độ chính xác của bản vẽ",
        "tenSheetChiTiet": "Độ chính xác của bản vẽ",
        "trongSo": 15.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 15.0,
        "excelDongGopQl": 15.0,
        "con": [
          {
            "ten": "Thể hiện đúng thiết kế, BOQ, thông số kỹ thuật và yêu cầu của dự án.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Chính xác về model, mã thiết bị, số lượng, kích thước, vị trí, cao độ và kết nối.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Các thông tin trên các bản vẽ phải thống nhất với nhau.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          },
          {
            "ten": "Hạn chế lỗi sai phải chỉnh sửa sau khi phát hành.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Không bỏ sót các thay đổi đã được phê duyệt.",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          }
        ]
      },
      {
        "ten": "Tính đầy đủ & đồng bộ của hồ sơ",
        "tenSheetChiTiet": "Tính đầy đủ & đồng bộ của hồ sơ",
        "trongSo": 10.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 10.0,
        "excelDongGopQl": 10.0,
        "con": [
          {
            "ten": "Đầy đủ các bản vẽ theo SOW/yêu cầu dự án.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Bao gồm các bản vẽ cần thiết như Layout, Schematic, Wiring/Connection Diagram, Rack Layout, Detail, Mounting, Cable Routing... tùy phạm vi dự án.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Đồng bộ mã thiết bị, ký hiệu, legend, thông số và revision giữa các bản vẽ.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Thông tin trên Shop Drawing phù hợp với BOQ, thiết kế và hồ sơ liên quan.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          }
        ]
      },
      {
        "ten": "Tính khả thi thi công",
        "tenSheetChiTiet": "Tính khả thi thi công",
        "trongSo": 10.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 10.0,
        "excelDongGopQl": 10.0,
        "con": [
          {
            "ten": "Bản vẽ phải phản ánh được phương án có thể triển khai thực tế",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Kiểm tra không gian lắp đặt, kích thước, cao độ, vị trí thiết bị và khả năng tiếp cận bảo trì.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Thể hiện đầy đủ tuyến cáp, điểm đấu nối, giá đỡ, phụ kiện và phương án mounting khi cần.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Kiểm tra sự phù hợp với hiện trạng và phối hợp với các bộ môn khác.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Chủ động phát hiện các điểm bất khả thi hoặc xung đột trước khi đưa ra công trường.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          }
        ]
      },
      {
        "ten": "Phối hợp & xử lý yêu cầu kỹ thuật",
        "tenSheetChiTiet": "Phối hợp & xử lý yêu cầu kỹ thuật",
        "trongSo": 10.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 10.0,
        "excelDongGopQl": 10.0,
        "con": [
          {
            "ten": "Phối hợp với PM, kỹ sư triển khai, giám sát, tư vấn, khách hàng và các bộ môn liên quan.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          },
          {
            "ten": "Tiếp nhận và xử lý comment trên bản vẽ.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          },
          {
            "ten": "Phản hồi các vấn đề kỹ thuật trong phạm vi công việc.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          },
          {
            "ten": "Chủ động hỏi/xác nhận khi thông tin đầu vào chưa đầy đủ.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Phát hiện và đề xuất giải pháp đối với các điểm xung đột giữa thiết kế và thực tế.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Theo dõi đến khi các comment/yêu cầu được đóng.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          }
        ]
      },
      {
        "ten": "Quản lý hồ sơ & kiểm soát Revision",
        "tenSheetChiTiet": "Quản lý hồ sơ & kiểm soát Revision",
        "trongSo": 10.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 10.0,
        "excelDongGopQl": 10.0,
        "con": [
          {
            "ten": "Tuân thủ quy định đặt tên, mã số và cấu trúc hồ sơ.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Quản lý đúng revision, ngày phát hành và lịch sử thay đổi.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          },
          {
            "ten": "Cập nhật bản vẽ theo các thay đổi đã được phê duyệt.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          },
          {
            "ten": "Đảm bảo đội thi công sử dụng đúng revision mới nhất.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          },
          {
            "ten": "Lưu trữ bản vẽ và file nguồn đầy đủ, dễ truy xuất.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          },
          {
            "ten": "Không phát hành nhầm bản vẽ cũ hoặc bản vẽ chưa được kiểm tra/phê duyệt.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          }
        ]
      }
    ],
    "muc2": [
      {
        "ten": "Số lần đi trễ/ về sớm không phép",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      },
      {
        "ten": "Vi phạm bộ phận chưa xử lý kịp thời",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      },
      {
        "ten": "Giữ gìn văn hóa doanh nghiệp, chấp hành nội quy lao động.",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      }
    ]
  },
  {
    "file": "KPI bảo hành",
    "muc1": [
      {
        "ten": "Tiến độ xử lý yêu cầu",
        "tenSheetChiTiet": "Tiến độ xử lý yêu cầu",
        "trongSo": 20.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 20.0,
        "excelDongGopQl": 20.0,
        "con": [
          {
            "ten": "Tiếp nhận và phản hồi yêu cầu bảo hành/sửa chữa trong thời gian 24h",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Chủ động liên hệ khách hàng để xác nhận tình trạng lỗi và thống nhất lịch xử lý trong vòng 24h",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Có mặt tại hiện trường trong vòng 48h",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Hoàn thành xử lý trong thời gian/SLA được giao.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Chủ động báo cáo khi phát sinh vấn đề có thể ảnh hưởng tiến độ.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          }
        ]
      },
      {
        "ten": "Tỷ lệ xử lý dứt điểm",
        "tenSheetChiTiet": "Tỷ lệ xử lý dứt điểm",
        "trongSo": 10.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 10.0,
        "excelDongGopQl": 10.0,
        "con": [
          {
            "ten": "Xác định đúng nguyên nhân sự cố.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          },
          {
            "ten": "Khắc phục triệt để lỗi thay vì chỉ xử lý tạm thời.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Kiểm tra toàn bộ chức năng liên quan trước khi bàn giao",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Hạn chế việc khách hàng phải gọi lại nhiều lần cho cùng một sự cố.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Chủ động đề xuất thay thế linh kiện/thiết bị hoặc giải pháp kỹ thuật khi cần.",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          }
        ]
      },
      {
        "ten": "Chất lượng sửa chữa & bảo hành",
        "tenSheetChiTiet": "Chất lượng sửa chữa & bảo hành",
        "trongSo": 10.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 10.0,
        "excelDongGopQl": 10.0,
        "con": [
          {
            "ten": "Thực hiện sửa chữa/thay thế đúng quy trình kỹ thuật",
            "trongSo": 40.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 4.0,
            "excelDatDuocQl": 4.0
          },
          {
            "ten": "Không gây phát sinh lỗi mới trong quá trình sửa chữa.",
            "trongSo": 30.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 3.0,
            "excelDatDuocQl": 3.0
          },
          {
            "ten": "Thiết bị sau sửa chữa hoạt động ổn định, hạn chế lỗi tái phát",
            "trongSo": 30.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 3.0,
            "excelDatDuocQl": 3.0
          }
        ]
      },
      {
        "ten": "Chất lượng bảo trì hệ thống",
        "tenSheetChiTiet": "Chất lượng bảo trì hệ thống",
        "trongSo": 10.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 10.0,
        "excelDongGopQl": 10.0,
        "con": [
          {
            "ten": "Thực hiện đầy đủ các hạng mục theo kế hoạch bảo trì/SOW.",
            "trongSo": 30.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 3.0,
            "excelDatDuocQl": 3.0
          },
          {
            "ten": "Kiểm tra thiết bị và hệ thống theo checklist.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Phát hiện sớm các nguy cơ gây lỗi hoặc gián đoạn hệ thống.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Đề xuất các thiết bị/vật tư cần thay thế hoặc bảo trì bổ sung",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          },
          {
            "ten": "Hoàn thành đầy đủ biên bản sau mỗi đợt bảo trì.",
            "trongSo": 15.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.5,
            "excelDatDuocQl": 1.5
          }
        ]
      },
      {
        "ten": "Mức độ hài lòng của khách hàng",
        "tenSheetChiTiet": "Mức độ hài lòng của khách hàng",
        "trongSo": 10.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 10.0,
        "excelDongGopQl": 10.0,
        "con": [
          {
            "ten": "Thái độ và tác phong làm việc chuyên nghiệp.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Giao tiếp, phối hợp tốt với khách hàng.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Giải thích rõ nguyên nhân và phương án xử lý.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Chủ động cập nhật tiến độ cho khách hàng.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Không gây ảnh hưởng không cần thiết đến hoạt động của khách hàng.",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          }
        ]
      },
      {
        "ten": "Quản lý hồ sơ & báo cáo dịch vụ",
        "tenSheetChiTiet": "Quản lý hồ sơ & báo cáo dịch vụ",
        "trongSo": 5.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 5.0,
        "excelDongGopQl": 5.0,
        "con": [
          {
            "ten": "Cập nhật đầy đủ thông tin yêu cầu bảo hành/sửa chữa.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Lập biên bản nghiệm thu/bàn giao sau khi hoàn thành",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Cập nhật lịch sử bảo hành/sửa chữa của thiết bị.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Báo cáo kịp thời các trường hợp chưa xử lý được hoặc cần hỗ trợ từ bộ phận khác.",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          }
        ]
      },
      {
        "ten": "Đánh giá cải tiến",
        "tenSheetChiTiet": "Đánh giá cải tiến",
        "trongSo": 5.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 5.0,
        "excelDongGopQl": 5.0,
        "con": [
          {
            "ten": "Có báo cáo thống kê/đề xuất vật tư/thiết bị dự phòng cho công tác bảo hành, bảo trì",
            "trongSo": 50.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 5.0,
            "excelDatDuocQl": 5.0
          },
          {
            "ten": "Đề xuất sản phẩm mới/ hãng mới cho các giải pháp cụ thể để tránh phát sinh lỗi lặp lại trong quá trình vận hành",
            "trongSo": 50.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 5.0,
            "excelDatDuocQl": 5.0
          }
        ]
      }
    ],
    "muc2": [
      {
        "ten": "Số lần đi trễ/ về sớm không phép",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      },
      {
        "ten": "Vi phạm bộ phận chưa xử lý kịp thời",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      },
      {
        "ten": "Giữ gìn văn hóa doanh nghiệp, chấp hành nội quy lao động.",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      }
    ]
  },
  {
    "file": "KPI kỹ sư cấu hình V1",
    "muc1": [
      {
        "ten": "Tiến độ thi công/ triển khai",
        "tenSheetChiTiet": "Tiến độ triển khai",
        "trongSo": 25.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 25.0,
        "excelDongGopQl": 25.0,
        "con": [
          {
            "ten": "Hoàn thành công việc đúng tiến độ",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Hoàn thành milestone dự án",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Chủ động cảnh báo nguy cơ chậm tiến độ",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Thời gian phản hồi yêu cầu công việc",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Hoàn thành công việc phát sinh",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          }
        ]
      },
      {
        "ten": "Chất lượng thi công công trình",
        "tenSheetChiTiet": "Chất lượng thi công công trình",
        "trongSo": 10.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 10.0,
        "excelDongGopQl": 10.0,
        "con": [
          {
            "ten": "Tỷ lệ nghiệm thu đạt ngay lần đầu",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Tỷ lệ lỗi do cấu hình",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Số lỗi lặp lại sau khi đã xử lý",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Tỷ lệ hoàn thành checklist kỹ thuật",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Tỷ lệ cấu hình đúng theo approved design",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          },
          {
            "ten": "Tỷ lệ bàn giao hệ thống đầy đủ chức năng",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          }
        ]
      },
      {
        "ten": "Năng suất triển khai dự án",
        "tenSheetChiTiet": "Năng suất triển khai dự án",
        "trongSo": 5.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 5.0,
        "excelDongGopQl": 5.0,
        "con": [
          {
            "ten": "Tỷ lệ sử dụng nhân lực đúng kế hoạch",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "OT phát sinh",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Tỷ lệ hoàn thành công việc ngay lần đầu",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Khả năng xử lý nhiều dự án",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          }
        ]
      },
      {
        "ten": "Xử lý hồ sơ dự án",
        "tenSheetChiTiet": "Xử lý hồ sơ dự án",
        "trongSo": 5.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 5.0,
        "excelDongGopQl": 5.0,
        "con": [
          {
            "ten": "Báo cáo tuần",
            "trongSo": 30.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 3.0,
            "excelDatDuocQl": 3.0
          },
          {
            "ten": "Cập nhật serial/model thiết bị",
            "trongSo": 30.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 3.0,
            "excelDatDuocQl": 3.0
          },
          {
            "ten": "Tài liệu hướng dẫn vận hành",
            "trongSo": 40.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 4.0,
            "excelDatDuocQl": 4.0
          }
        ]
      },
      {
        "ten": "Phối hợp & xử lý vấn đề",
        "tenSheetChiTiet": "Phối hợp & xử lý vấn đề",
        "trongSo": 15.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 15.0,
        "excelDongGopQl": 15.0,
        "con": [
          {
            "ten": "Phản hồi vấn đề kỹ thuật",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Thời gian xử lý lỗi thông thường",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Escalate vấn đề đúng thời điểm",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          },
          {
            "ten": "Phối hợp với các bộ phận",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          },
          {
            "ten": "Khiếu nại do thái độ/phối hợp",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Hỗ trợ đồng đội khi cần",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          }
        ]
      },
      {
        "ten": "An toàn, kỷ luật trên công trường",
        "tenSheetChiTiet": "An toàn, kỷ luật trên công trường",
        "trongSo": 5.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 5.0,
        "excelDongGopQl": 5.0,
        "con": [
          {
            "ten": "Vi phạm an toàn lao động",
            "trongSo": 70.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 7.0,
            "excelDatDuocQl": 7.0
          },
          {
            "ten": "Tuân thủ quy định công trường",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          },
          {
            "ten": "Đi làm/đến công trường đúng giờ",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          },
          {
            "ten": "Bảo quản thiết bị & dụng cụ",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          }
        ]
      },
      {
        "ten": "Đánh giá cải tiến",
        "tenSheetChiTiet": "Đánh giá cải tiến",
        "trongSo": 5.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 5.0,
        "excelDongGopQl": 5.0,
        "con": [
          {
            "ten": "Có báo cáo/đề xuất điều chỉnh giải pháp thiết kế",
            "trongSo": 50.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 5.0,
            "excelDatDuocQl": 5.0
          },
          {
            "ten": "Đề xuất sản phẩm mới/ hãng mới cho các giải pháp cụ thể",
            "trongSo": 50.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 5.0,
            "excelDatDuocQl": 5.0
          }
        ]
      }
    ],
    "muc2": [
      {
        "ten": "Số lần đi trễ/ về sớm không phép",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      },
      {
        "ten": "Vi phạm bộ phận chưa xử lý kịp thời",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      },
      {
        "ten": "Giữ gìn văn hóa doanh nghiệp, chấp hành nội quy lao động.",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      }
    ]
  },
  {
    "file": "KPI kỹ sư triển khai V1",
    "muc1": [
      {
        "ten": "Tiến độ thi công/ triển khai",
        "tenSheetChiTiet": "Tiến độ triển khai",
        "trongSo": 20.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 20.0,
        "excelDongGopQl": 20.0,
        "con": [
          {
            "ten": "Hoàn thành công việc đúng tiến độ",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Hoàn thành milestone dự án",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Chủ động cảnh báo nguy cơ chậm tiến độ",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Thời gian phản hồi yêu cầu công việc",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Hoàn thành công việc phát sinh",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          }
        ]
      },
      {
        "ten": "Chất lượng thi công công trình",
        "tenSheetChiTiet": "Chất lượng thi công công trình",
        "trongSo": 15.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 15.0,
        "excelDongGopQl": 15.0,
        "con": [
          {
            "ten": "Tỷ lệ nghiệm thu đạt ngay lần đầu",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Tỷ lệ lỗi do thi công",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Số lỗi lặp lại sau khi đã xử lý",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Tỷ lệ hoàn thành checklist kỹ thuật",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Thiết bị lắp đặt đúng theo thiết kế",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          },
          {
            "ten": "Thiết bị lắp đặt đảm bảo thẩm mỹ",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          }
        ]
      },
      {
        "ten": "Năng suất triển khai dự án",
        "tenSheetChiTiet": "Năng suất triển khai dự án",
        "trongSo": 15.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 15.0,
        "excelDongGopQl": 15.0,
        "con": [
          {
            "ten": "Tỷ lệ sử dụng nhân lực đúng kế hoạch",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "OT phát sinh",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Tỷ lệ hoàn thành công việc ngay lần đầu",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          },
          {
            "ten": "Khả năng xử lý nhiều dự án",
            "trongSo": 25.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.5,
            "excelDatDuocQl": 2.5
          }
        ]
      },
      {
        "ten": "Xử lý hồ sơ dự án",
        "tenSheetChiTiet": "Xử lý hồ sơ dự án",
        "trongSo": 5.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 5.0,
        "excelDongGopQl": 5.0,
        "con": [
          {
            "ten": "Báo cáo tuần",
            "trongSo": 30.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 3.0,
            "excelDatDuocQl": 3.0
          },
          {
            "ten": "Biên bản nghiệm thu, Hồ sơ dự án",
            "trongSo": 30.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 3.0,
            "excelDatDuocQl": 3.0
          },
          {
            "ten": "Hình ảnh hiện trường",
            "trongSo": 40.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 4.0,
            "excelDatDuocQl": 4.0
          }
        ]
      },
      {
        "ten": "Phối hợp & xử lý vấn đề",
        "tenSheetChiTiet": "Phối hợp & xử lý vấn đề",
        "trongSo": 5.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 5.0,
        "excelDongGopQl": 5.0,
        "con": [
          {
            "ten": "Phản hồi vấn đề kỹ thuật",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Thời gian xử lý lỗi thông thường",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Escalate vấn đề đúng thời điểm",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          },
          {
            "ten": "Phối hợp với các bộ phận",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          },
          {
            "ten": "Khiếu nại do thái độ/phối hợp",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          },
          {
            "ten": "Hỗ trợ đồng đội khi cần",
            "trongSo": 20.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 2.0,
            "excelDatDuocQl": 2.0
          }
        ]
      },
      {
        "ten": "An toàn, kỷ luật trên công trường",
        "tenSheetChiTiet": "An toàn, kỷ luật trên công trường",
        "trongSo": 5.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 5.0,
        "excelDongGopQl": 5.0,
        "con": [
          {
            "ten": "Vi phạm an toàn lao động",
            "trongSo": 70.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 7.0,
            "excelDatDuocQl": 7.0
          },
          {
            "ten": "Tuân thủ quy định công trường",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          },
          {
            "ten": "Đi làm/đến công trường đúng giờ",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          },
          {
            "ten": "Bảo quản thiết bị & dụng cụ",
            "trongSo": 10.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 1.0,
            "excelDatDuocQl": 1.0
          }
        ]
      },
      {
        "ten": "Đánh giá cải tiến",
        "tenSheetChiTiet": "Đánh giá cải tiến",
        "trongSo": 5.0,
        "maxScale": 10,
        "excelDiemChaTu": 10.0,
        "excelDiemChaQl": 10.0,
        "excelDongGopTu": 5.0,
        "excelDongGopQl": 5.0,
        "con": [
          {
            "ten": "Có báo cáo/đề xuất điều chỉnh giải pháp thiết kế",
            "trongSo": 50.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 5.0,
            "excelDatDuocQl": 5.0
          },
          {
            "ten": "Đề xuất sản phẩm mới/ hãng mới cho các giải pháp cụ thể",
            "trongSo": 50.0,
            "diemTu": 10.0,
            "diemQl": 10.0,
            "excelDatDuocTu": 5.0,
            "excelDatDuocQl": 5.0
          }
        ]
      }
    ],
    "muc2": [
      {
        "ten": "Số lần đi trễ/ về sớm không phép",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      },
      {
        "ten": "Vi phạm bộ phận chưa xử lý kịp thời",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      },
      {
        "ten": "Giữ gìn văn hóa doanh nghiệp, chấp hành nội quy lao động.",
        "trongSo": 10.0,
        "maxScale": 3,
        "excelDiemTu": null,
        "excelDiemQl": null
      }
    ]
  }
];
