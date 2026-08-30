/**
 * Bốn mẫu KPI thật của phòng Kỹ thuật.
 *
 * SINH TỰ ĐỘNG từ bốn file Excel trong `docs/mau-kpi/` — không chép tay.
 * Nội dung giữ NGUYÊN VĂN: tên tiêu chí, tên KPI con, mục tiêu, cách đo,
 * trọng số đều đúng như trong file, kể cả những chỗ không nhất quán.
 *
 * KHÔNG tự sửa cho gọn, KHÔNG chuẩn hoá định dạng mục tiêu. Mốc đối chiếu
 * ở tuần 11 yêu cầu điểm tính ra khớp tuyệt đối với file Excel; sửa dữ liệu
 * cho đẹp là làm hỏng chính phép đối chiếu đó.
 *
 * Trọng số trong file lưu dạng thập phân (0.2 = 20%), ở đây đã nhân 100.
 *
 * Các chỗ dữ liệu gốc không nhất quán đã liệt kê trong `docs/no-ky-thuat.md`
 * để hỏi lại HCNS. Chưa sửa chỗ nào.
 */

export interface MauKpiItem {
  name: string;
  description?: string;
  /** Cột "Mục tiêu" — nguyên văn, có thể là "≥ 95%", "0.95", "2 giờ", "Đạt". */
  measurementText?: string;
  /** Cột "Cách đo". */
  measureMethod?: string;
  /** Phần trăm. Tiêu chí cấp 1 cộng lại = 70; KPI con trong một tiêu chí = 100. */
  weight: number;
  children?: MauKpiItem[];
}

export interface MauKpi {
  code: string;
  name: string;
  jobTitleCode: string;
  /** File Excel gốc, để tra ngược khi cần đối chiếu. */
  sourceFile: string;
  criteria: MauKpiItem[];
}

export const MAU_KPI_PHONG_KY_THUAT: MauKpi[] = [
    {
      "code": "TPL-KT-SD",
      "name": "KPI Nhân viên Shop Drawing",
      "jobTitleCode": "KT-SD-NV",
      "sourceFile": "KPI Shop Drawing.xlsx",
      "criteria": [
        {
          "name": "Tiến độ hoàn thành Shop Drawing",
          "weight": 15.0,
          "description": "Hoàn thành bản vẽ đúng kế hoạch; đáp ứng tiến độ phát hành, trình duyệt và điều chỉnh theo yêu cầu dự án. Chủ động cảnh báo khi có nguy cơ chậm tiến độ.",
          "children": [
            {
              "name": "Hoàn thành bản vẽ theo kế hoạch được giao.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ bản vẽ hoàn thành đúng thời hạn = Số bản vẽ hoàn thành đúng hạn / Tổng số bản vẽ được giao × 100%",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Đảm bảo thời gian phát hành bản vẽ phục vụ thi công/trình duyệt.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ bản vẽ hoàn thành đúng thời hạn = Số bản vẽ hoàn thành đúng hạn / Tổng số bản vẽ được giao × 100%",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Chủ động cập nhật tiến độ và cảnh báo sớm khi có nguy cơ chậm.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ bản vẽ hoàn thành đúng thời hạn = Số bản vẽ hoàn thành đúng hạn / Tổng số bản vẽ được giao × 100%",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Ưu tiên xử lý các bản vẽ ảnh hưởng trực tiếp đến tiến độ thi công.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ bản vẽ hoàn thành đúng thời hạn = Số bản vẽ hoàn thành đúng hạn / Tổng số bản vẽ được giao × 100%",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Hoàn thành việc chỉnh sửa/re-submit theo thời hạn yêu cầu.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ bản vẽ hoàn thành đúng thời hạn = Số bản vẽ hoàn thành đúng hạn / Tổng số bản vẽ được giao × 100%",
              "measurementText": "≥ 95%"
            }
          ]
        },
        {
          "name": "Độ chính xác của bản vẽ",
          "weight": 15.0,
          "description": "90% bản vẽ thể hiện đúng thiết kế, BOQ, thông số thiết bị, kích thước, vị trí lắp đặt, kết nối và các yêu cầu kỹ thuật. Hạn chế sai sót phải sửa lại.",
          "children": [
            {
              "name": "Thể hiện đúng thiết kế, BOQ, thông số kỹ thuật và yêu cầu của dự án.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ bản vẽ đạt  = Số bản vẽ không có lỗi nghiêm trọng / Tổng số bản vẽ được kiểm tra × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Chính xác về model, mã thiết bị, số lượng, kích thước, vị trí, cao độ và kết nối.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ bản vẽ đạt  = Số bản vẽ không có lỗi nghiêm trọng / Tổng số bản vẽ được kiểm tra × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Các thông tin trên các bản vẽ phải thống nhất với nhau.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ bản vẽ đạt  = Số bản vẽ không có lỗi nghiêm trọng / Tổng số bản vẽ được kiểm tra × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Hạn chế lỗi sai phải chỉnh sửa sau khi phát hành.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ bản vẽ đạt  = Số bản vẽ không có lỗi nghiêm trọng / Tổng số bản vẽ được kiểm tra × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Không bỏ sót các thay đổi đã được phê duyệt.",
              "weight": 10.0,
              "measureMethod": "Tỷ lệ bản vẽ đạt  = Số bản vẽ không có lỗi nghiêm trọng / Tổng số bản vẽ được kiểm tra × 100%.",
              "measurementText": "≥ 95%"
            }
          ]
        },
        {
          "name": "Tính đầy đủ & đồng bộ của hồ sơ",
          "weight": 10.0,
          "description": "Đầy đủ các bản vẽ cần thiết: layout, detail, schematic, wiring/connection, mounting, rack layout... Các bản vẽ thống nhất thông tin, ký hiệu, mã thiết bị và revision.",
          "children": [
            {
              "name": "Đầy đủ các bản vẽ theo SOW/yêu cầu dự án.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ hồ sơ đầy đủ = Số bộ hồ sơ đáp ứng đầy đủ yêu cầu / Tổng số bộ hồ sơ × 100%.\n\nKiểm tra bằng checklist trước khi phát hành.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Bao gồm các bản vẽ cần thiết như Layout, Schematic, Wiring/Connection Diagram, Rack Layout, Detail, Mounting, Cable Routing... tùy phạm vi dự án.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ hồ sơ đầy đủ = Số bộ hồ sơ đáp ứng đầy đủ yêu cầu / Tổng số bộ hồ sơ × 100%.\n\nKiểm tra bằng checklist trước khi phát hành.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Đồng bộ mã thiết bị, ký hiệu, legend, thông số và revision giữa các bản vẽ.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ hồ sơ đầy đủ = Số bộ hồ sơ đáp ứng đầy đủ yêu cầu / Tổng số bộ hồ sơ × 100%.\n\nKiểm tra bằng checklist trước khi phát hành.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Thông tin trên Shop Drawing phù hợp với BOQ, thiết kế và hồ sơ liên quan.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ hồ sơ đầy đủ = Số bộ hồ sơ đáp ứng đầy đủ yêu cầu / Tổng số bộ hồ sơ × 100%.\n\nKiểm tra bằng checklist trước khi phát hành.",
              "measurementText": "≥ 95%"
            }
          ]
        },
        {
          "name": "Tính khả thi thi công",
          "weight": 10.0,
          "description": "Bản vẽ phải thể hiện được phương án có thể triển khai thực tế: vị trí, kích thước, cao độ, tuyến cáp, giá đỡ, khoảng không gian lắp đặt, phương án đấu nối... Hạn chế tình trạng bản vẽ đúng trên giấy nhưng khó/không thể thi công.",
          "children": [
            {
              "name": "Bản vẽ phải phản ánh được phương án có thể triển khai thực tế",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ bản vẽ không phát sinh lỗi thi công = Số bản vẽ không gây lỗi / Tổng số bản vẽ × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Kiểm tra không gian lắp đặt, kích thước, cao độ, vị trí thiết bị và khả năng tiếp cận bảo trì.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ bản vẽ không phát sinh lỗi thi công = Số bản vẽ không gây lỗi / Tổng số bản vẽ × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Thể hiện đầy đủ tuyến cáp, điểm đấu nối, giá đỡ, phụ kiện và phương án mounting khi cần.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ bản vẽ không phát sinh lỗi thi công = Số bản vẽ không gây lỗi / Tổng số bản vẽ × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Kiểm tra sự phù hợp với hiện trạng và phối hợp với các bộ môn khác.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ bản vẽ không phát sinh lỗi thi công = Số bản vẽ không gây lỗi / Tổng số bản vẽ × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Chủ động phát hiện các điểm bất khả thi hoặc xung đột trước khi đưa ra công trường.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ bản vẽ không phát sinh lỗi thi công = Số bản vẽ không gây lỗi / Tổng số bản vẽ × 100%.",
              "measurementText": "≥ 95%"
            }
          ]
        },
        {
          "name": "Phối hợp & xử lý yêu cầu kỹ thuật",
          "weight": 10.0,
          "description": "Phối hợp với Project Manager, kỹ thuật triển khai, tư vấn, khách hàng và các bộ môn liên quan; tiếp nhận và cập nhật comment; xử lý các vấn đề xung đột giữa bản vẽ và thực tế.",
          "children": [
            {
              "name": "Phối hợp với PM, kỹ sư triển khai, giám sát, tư vấn, khách hàng và các bộ môn liên quan.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ yêu cầu xử lý đúng hạn = Số yêu cầu/comment xử lý đúng hạn / Tổng số yêu cầu × 100%.\n\nTheo dõi thêm số trường hợp chậm do không phản hồi hoặc không chủ động phối hợp.",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Tiếp nhận và xử lý comment trên bản vẽ.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ yêu cầu xử lý đúng hạn = Số yêu cầu/comment xử lý đúng hạn / Tổng số yêu cầu × 100%.\n\nTheo dõi thêm số trường hợp chậm do không phản hồi hoặc không chủ động phối hợp.",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Phản hồi các vấn đề kỹ thuật trong phạm vi công việc.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ yêu cầu xử lý đúng hạn = Số yêu cầu/comment xử lý đúng hạn / Tổng số yêu cầu × 100%.\n\nTheo dõi thêm số trường hợp chậm do không phản hồi hoặc không chủ động phối hợp.",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Chủ động hỏi/xác nhận khi thông tin đầu vào chưa đầy đủ.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ yêu cầu xử lý đúng hạn = Số yêu cầu/comment xử lý đúng hạn / Tổng số yêu cầu × 100%.\n\nTheo dõi thêm số trường hợp chậm do không phản hồi hoặc không chủ động phối hợp.",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Phát hiện và đề xuất giải pháp đối với các điểm xung đột giữa thiết kế và thực tế.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ yêu cầu xử lý đúng hạn = Số yêu cầu/comment xử lý đúng hạn / Tổng số yêu cầu × 100%.\n\nTheo dõi thêm số trường hợp chậm do không phản hồi hoặc không chủ động phối hợp.",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Theo dõi đến khi các comment/yêu cầu được đóng.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ yêu cầu xử lý đúng hạn = Số yêu cầu/comment xử lý đúng hạn / Tổng số yêu cầu × 100%.\n\nTheo dõi thêm số trường hợp chậm do không phản hồi hoặc không chủ động phối hợp.",
              "measurementText": "≥ 90%"
            }
          ]
        },
        {
          "name": "Quản lý hồ sơ & kiểm soát Revision",
          "weight": 10.0,
          "description": "Đặt tên file, mã bản vẽ, revision, ngày phát hành, lưu trữ và cập nhật hồ sơ đúng quy định. Đảm bảo sử dụng đúng phiên bản mới nhất và không phát hành nhầm bản cũ.",
          "children": [
            {
              "name": "Tuân thủ quy định đặt tên, mã số và cấu trúc hồ sơ.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ hồ sơ quản lý đúng quy định = Hồ sơ đạt yêu cầu / Tổng hồ sơ kiểm tra × 100%.\n\nTheo dõi số lỗi liên quan đến tên file, revision, phát hành nhầm bản vẽ hoặc thiếu file nguồn.",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Quản lý đúng revision, ngày phát hành và lịch sử thay đổi.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ hồ sơ quản lý đúng quy định = Hồ sơ đạt yêu cầu / Tổng hồ sơ kiểm tra × 100%.\n\nTheo dõi số lỗi liên quan đến tên file, revision, phát hành nhầm bản vẽ hoặc thiếu file nguồn.",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Cập nhật bản vẽ theo các thay đổi đã được phê duyệt.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ hồ sơ quản lý đúng quy định = Hồ sơ đạt yêu cầu / Tổng hồ sơ kiểm tra × 100%.\n\nTheo dõi số lỗi liên quan đến tên file, revision, phát hành nhầm bản vẽ hoặc thiếu file nguồn.",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Đảm bảo đội thi công sử dụng đúng revision mới nhất.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ hồ sơ quản lý đúng quy định = Hồ sơ đạt yêu cầu / Tổng hồ sơ kiểm tra × 100%.\n\nTheo dõi số lỗi liên quan đến tên file, revision, phát hành nhầm bản vẽ hoặc thiếu file nguồn.",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Lưu trữ bản vẽ và file nguồn đầy đủ, dễ truy xuất.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ hồ sơ quản lý đúng quy định = Hồ sơ đạt yêu cầu / Tổng hồ sơ kiểm tra × 100%.\n\nTheo dõi số lỗi liên quan đến tên file, revision, phát hành nhầm bản vẽ hoặc thiếu file nguồn.",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Không phát hành nhầm bản vẽ cũ hoặc bản vẽ chưa được kiểm tra/phê duyệt.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ hồ sơ quản lý đúng quy định = Hồ sơ đạt yêu cầu / Tổng hồ sơ kiểm tra × 100%.\n\nTheo dõi số lỗi liên quan đến tên file, revision, phát hành nhầm bản vẽ hoặc thiếu file nguồn.",
              "measurementText": "≥ 90%"
            }
          ]
        }
      ]
    },
    {
      "code": "TPL-KT-BH",
      "name": "KPI Nhân viên Bảo hành",
      "jobTitleCode": "KT-BH-NV",
      "sourceFile": "KPI bảo hành.xlsx",
      "criteria": [
        {
          "name": "Tiến độ xử lý yêu cầu",
          "weight": 20.0,
          "description": "90% yêu cầu được xử lý đúng thời hạn cam kết",
          "children": [
            {
              "name": "Tiếp nhận và phản hồi yêu cầu bảo hành/sửa chữa trong thời gian 24h",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ yêu cầu xử lý đúng hạn = Số yêu cầu hoàn thành đúng hạn / Tổng số yêu cầu × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Chủ động liên hệ khách hàng để xác nhận tình trạng lỗi và thống nhất lịch xử lý trong vòng 24h",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ yêu cầu xử lý đúng hạn = Số yêu cầu hoàn thành đúng hạn / Tổng số yêu cầu × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Có mặt tại hiện trường trong vòng 48h",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ yêu cầu xử lý đúng hạn = Số yêu cầu hoàn thành đúng hạn / Tổng số yêu cầu × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Hoàn thành xử lý trong thời gian/SLA được giao.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ yêu cầu xử lý đúng hạn = Số yêu cầu hoàn thành đúng hạn / Tổng số yêu cầu × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Chủ động báo cáo khi phát sinh vấn đề có thể ảnh hưởng tiến độ.",
              "weight": 20.0,
              "measureMethod": "% công việc phát sinh hoàn thành đúng cam kết",
              "measurementText": "≥ 90%"
            }
          ]
        },
        {
          "name": "Tỷ lệ xử lý dứt điểm",
          "weight": 10.0,
          "description": "90% sự cố được xử lý hoàn tất, không phải xử lý lại",
          "children": [
            {
              "name": "Xác định đúng nguyên nhân sự cố.",
              "weight": 15.0,
              "measureMethod": "Tỷ lệ xử lý  = Số yêu cầu được / Tổng số yêu cầu × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Khắc phục triệt để lỗi thay vì chỉ xử lý tạm thời.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ xử lý  = Số yêu cầu được / Tổng số yêu cầu × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Kiểm tra toàn bộ chức năng liên quan trước khi bàn giao",
              "weight": 25.0,
              "measureMethod": "Kiểm tra lại thiết bị/hệ thống sau khi sửa chữa, bảo hành",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Hạn chế việc khách hàng phải gọi lại nhiều lần cho cùng một sự cố.",
              "weight": 25.0,
              "measureMethod": "Số lần phản hồi lỗi từ khách hàng",
              "measurementText": "≤ 10%"
            },
            {
              "name": "Chủ động đề xuất thay thế linh kiện/thiết bị hoặc giải pháp kỹ thuật khi cần.",
              "weight": 10.0,
              "measureMethod": "Số lần đề xuất cải tiến trong tháng",
              "measurementText": "≥ 2"
            }
          ]
        },
        {
          "name": "Chất lượng sửa chữa & bảo hành",
          "weight": 10.0,
          "description": "90% thiết bị/hệ thống không phát sinh lại cùng lỗi trong 6 tháng",
          "children": [
            {
              "name": "Thực hiện sửa chữa/thay thế đúng quy trình kỹ thuật",
              "weight": 40.0,
              "measureMethod": "Thực hiện sửa chữa, thay thế và cấu hình thiết bị đúng hướng dẫn kỹ thuật của nhà sản xuất và quy trình của công ty; sử dụng đúng linh kiện/vật tư được phê duyệt; kiểm tra và chạy thử đầy đủ trước khi bàn giao.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Không gây phát sinh lỗi mới trong quá trình sửa chữa.",
              "weight": 30.0,
              "measureMethod": "Lựa chọn đơn vị sửa chữa uy tín, tin cậy",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Thiết bị sau sửa chữa hoạt động ổn định, hạn chế lỗi tái phát",
              "weight": 30.0,
              "measurementText": "≥ 2"
            }
          ]
        },
        {
          "name": "Chất lượng bảo trì hệ thống",
          "weight": 10.0,
          "description": "100% hạng mục bảo trì hoàn thành đúng kế hoạch + checklist đầy đủ",
          "children": [
            {
              "name": "Thực hiện đầy đủ các hạng mục theo kế hoạch bảo trì/SOW.",
              "weight": 30.0,
              "measureMethod": "Tỷ lệ hoàn thành bảo trì = Số hạng mục hoàn thành / Tổng hạng mục được giao × 100%.",
              "measurementText": "0.95"
            },
            {
              "name": "Kiểm tra thiết bị và hệ thống theo checklist.",
              "weight": 20.0,
              "measureMethod": "Tỷ lệ hoàn thành bảo trì = Số hạng mục hoàn thành / Tổng hạng mục được giao × 100%.",
              "measurementText": "0.95"
            },
            {
              "name": "Phát hiện sớm các nguy cơ gây lỗi hoặc gián đoạn hệ thống.",
              "weight": 20.0,
              "measurementText": "1"
            },
            {
              "name": "Đề xuất các thiết bị/vật tư cần thay thế hoặc bảo trì bổ sung",
              "weight": 15.0,
              "measurementText": "≥ 2"
            },
            {
              "name": "Hoàn thành đầy đủ biên bản sau mỗi đợt bảo trì.",
              "weight": 15.0,
              "measurementText": "1"
            }
          ]
        },
        {
          "name": "Mức độ hài lòng của khách hàng",
          "weight": 10.0,
          "description": "Điểm đánh giá khách hàng / số phản ánh, khiếu nại",
          "children": [
            {
              "name": "Thái độ và tác phong làm việc chuyên nghiệp.",
              "weight": 20.0,
              "measureMethod": "Mức độ hài lòng của khách hàng, phản hồi qua mail/zalo/kênh thông tin khác của sales, kỹ thuật",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Giao tiếp, phối hợp tốt với khách hàng.",
              "weight": 20.0,
              "measureMethod": "Mức độ hài lòng của khách hàng, phản hồi qua mail/zalo/kênh thông tin khác của sales, kỹ thuật",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Giải thích rõ nguyên nhân và phương án xử lý.",
              "weight": 20.0,
              "measureMethod": "Mức độ hài lòng của khách hàng, phản hồi qua mail/zalo/kênh thông tin khác của sales, kỹ thuật",
              "measurementText": "1"
            },
            {
              "name": "Chủ động cập nhật tiến độ cho khách hàng.",
              "weight": 20.0,
              "measureMethod": "Mức độ hài lòng của khách hàng, phản hồi qua mail/zalo/kênh thông tin khác của sales, kỹ thuật",
              "measurementText": "≥ 90%"
            },
            {
              "name": "Không gây ảnh hưởng không cần thiết đến hoạt động của khách hàng.",
              "weight": 20.0,
              "measureMethod": "Mức độ hài lòng của khách hàng, phản hồi qua mail/zalo/kênh thông tin khác của sales, kỹ thuật",
              "measurementText": "≥ 90%"
            }
          ]
        },
        {
          "name": "Quản lý hồ sơ & báo cáo dịch vụ",
          "weight": 5.0,
          "description": "90% hồ sơ hoàn thành đúng quy định và đúng hạn",
          "children": [
            {
              "name": "Cập nhật đầy đủ thông tin yêu cầu bảo hành/sửa chữa.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ hồ sơ hoàn chỉnh = Hồ sơ đầy đủ và đúng quy định / Tổng hồ sơ × 100%.",
              "measurementText": "1"
            },
            {
              "name": "Lập biên bản nghiệm thu/bàn giao sau khi hoàn thành",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ hồ sơ hoàn chỉnh = Hồ sơ đầy đủ và đúng quy định / Tổng hồ sơ × 100%.",
              "measurementText": "1"
            },
            {
              "name": "Cập nhật lịch sử bảo hành/sửa chữa của thiết bị.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ hồ sơ hoàn chỉnh = Hồ sơ đầy đủ và đúng quy định / Tổng hồ sơ × 100%.",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Báo cáo kịp thời các trường hợp chưa xử lý được hoặc cần hỗ trợ từ bộ phận khác.",
              "weight": 25.0,
              "measureMethod": "Tỷ lệ báo cáo = số trường hợp / Tổng số lỗi (thiết bị) × 100%.",
              "measurementText": "≥ 95%"
            }
          ]
        },
        {
          "name": "Đánh giá cải tiến",
          "weight": 5.0,
          "description": "Đưa ra ý kiến, đề xuất để cải thiện quy trình, nâng cao hiệu suất, giảm tỷ lệ lỗi, dự phòng rủi ro",
          "children": [
            {
              "name": "Có báo cáo thống kê/đề xuất vật tư/thiết bị dự phòng cho công tác bảo hành, bảo trì",
              "weight": 50.0,
              "measureMethod": "Số đề xuất/tháng",
              "measurementText": "1"
            },
            {
              "name": "Đề xuất sản phẩm mới/ hãng mới cho các giải pháp cụ thể để tránh phát sinh lỗi lặp lại trong quá trình vận hành",
              "weight": 50.0,
              "measureMethod": "Số đề xuất/tháng",
              "measurementText": "1"
            }
          ]
        }
      ]
    },
    {
      "code": "TPL-KT-KSCH",
      "name": "KPI Kỹ sư cấu hình",
      "jobTitleCode": "KT-KSCH",
      "sourceFile": "KPI kỹ sư cấu hình V1.xlsx",
      "criteria": [
        {
          "name": "Tiến độ thi công/ triển khai",
          "weight": 25.0,
          "description": ">=90% công trình đúng hạn",
          "children": [
            {
              "name": "Hoàn thành công việc đúng tiến độ",
              "weight": 20.0,
              "measureMethod": "% đầu việc hoàn thành đúng hạn",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Hoàn thành milestone dự án",
              "weight": 20.0,
              "measureMethod": "% milestone đúng kế hoạch",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Chủ động cảnh báo nguy cơ chậm tiến độ",
              "weight": 20.0,
              "measureMethod": "Số vấn đề được cảnh báo trước",
              "measurementText": "1"
            },
            {
              "name": "Thời gian phản hồi yêu cầu công việc",
              "weight": 20.0,
              "measureMethod": "Thời gian từ khi nhận yêu cầu đến phản hồi",
              "measurementText": "2 giờ"
            },
            {
              "name": "Hoàn thành công việc phát sinh",
              "weight": 20.0,
              "measureMethod": "% công việc phát sinh hoàn thành đúng cam kết",
              "measurementText": "≥ 90%"
            }
          ]
        },
        {
          "name": "Chất lượng thi công công trình",
          "weight": 10.0,
          "description": "Công trình không xảy ra mất mát tài sản\nLắp đặt thiết bị đảm bảo thẩm mỹ, kỹ thuật",
          "children": [
            {
              "name": "Tỷ lệ nghiệm thu đạt ngay lần đầu",
              "weight": 20.0,
              "measurementText": "≥ 95%"
            },
            {
              "name": "Tỷ lệ lỗi do cấu hình",
              "weight": 20.0,
              "measurementText": "≤ 3%"
            },
            {
              "name": "Số lỗi lặp lại sau khi đã xử lý",
              "weight": 20.0,
              "measurementText": "≤ 1 lỗi/tháng"
            },
            {
              "name": "Tỷ lệ hoàn thành checklist kỹ thuật",
              "weight": 20.0,
              "measurementText": "1"
            },
            {
              "name": "Tỷ lệ cấu hình đúng theo approved design",
              "weight": 10.0,
              "measurementText": "≥ 95%"
            },
            {
              "name": "Tỷ lệ bàn giao hệ thống đầy đủ chức năng",
              "weight": 10.0,
              "measurementText": "≥ 95%"
            }
          ]
        },
        {
          "name": "Năng suất triển khai dự án",
          "weight": 5.0,
          "description": "So sánh thời gian triển khai dự án với thời gian của HĐ",
          "children": [
            {
              "name": "Tỷ lệ sử dụng nhân lực đúng kế hoạch",
              "weight": 25.0,
              "measureMethod": "Thời gian triển khai thực tế / kế hoạch",
              "measurementText": "1"
            },
            {
              "name": "OT phát sinh",
              "weight": 25.0,
              "measureMethod": "Số giờ OT / Tổng thời gian thực tế",
              "measurementText": "0.03"
            },
            {
              "name": "Tỷ lệ hoàn thành công việc ngay lần đầu",
              "weight": 25.0,
              "measurementText": "1"
            },
            {
              "name": "Khả năng xử lý nhiều dự án",
              "weight": 25.0,
              "measureMethod": "Số project/work package phụ trách",
              "measurementText": "2"
            }
          ]
        },
        {
          "name": "Xử lý hồ sơ dự án",
          "weight": 5.0,
          "description": "Hồ sơ hoàn thành đúng theo thời gian, kế hoạch của dự án\nĐủ hồ sơ hoàn công, checklist, Biên bản nghiệm thu",
          "children": [
            {
              "name": "Báo cáo tuần",
              "weight": 30.0,
              "measurementText": "1"
            },
            {
              "name": "Cập nhật serial/model thiết bị",
              "weight": 30.0,
              "measurementText": "1"
            },
            {
              "name": "Tài liệu hướng dẫn vận hành",
              "weight": 40.0,
              "measurementText": "1"
            }
          ]
        },
        {
          "name": "Phối hợp & xử lý vấn đề",
          "weight": 15.0,
          "description": "Xử lý, khắc phục các vướng mắc, sai khác giữa Thiết kế và thực tế",
          "children": [
            {
              "name": "Phản hồi vấn đề kỹ thuật",
              "weight": 20.0,
              "measurementText": "≤ 4 giờ"
            },
            {
              "name": "Thời gian xử lý lỗi thông thường",
              "weight": 20.0,
              "measurementText": "≤ 24 giờ"
            },
            {
              "name": "Escalate vấn đề đúng thời điểm",
              "weight": 10.0,
              "measurementText": "1"
            },
            {
              "name": "Phối hợp với các bộ phận",
              "weight": 10.0,
              "measurementText": "≥ 90%"
            },
            {
              "name": "Khiếu nại do thái độ/phối hợp",
              "weight": 20.0,
              "measurementText": "0"
            },
            {
              "name": "Hỗ trợ đồng đội khi cần",
              "weight": 20.0,
              "measurementText": "Đạt"
            }
          ]
        },
        {
          "name": "An toàn, kỷ luật trên công trường",
          "weight": 5.0,
          "description": "Đảm bảo an toàn trong thi công\nKhông bị nhắc nhở, biên bản phạt từ BQLDA, CĐT",
          "children": [
            {
              "name": "Vi phạm an toàn lao động",
              "weight": 70.0,
              "measurementText": "0"
            },
            {
              "name": "Tuân thủ quy định công trường",
              "weight": 10.0,
              "measurementText": "≥ 98%"
            },
            {
              "name": "Đi làm/đến công trường đúng giờ",
              "weight": 10.0,
              "measurementText": "≥ 95%"
            },
            {
              "name": "Bảo quản thiết bị & dụng cụ",
              "weight": 10.0,
              "measurementText": "Không mất/hư hỏng do chủ quan"
            }
          ]
        },
        {
          "name": "Đánh giá cải tiến",
          "weight": 5.0,
          "description": "Đưa ra ý kiến, đề xuất để cải thiện quy trình, cải tiến thiết kế",
          "children": [
            {
              "name": "Có báo cáo/đề xuất điều chỉnh giải pháp thiết kế",
              "weight": 50.0
            },
            {
              "name": "Đề xuất sản phẩm mới/ hãng mới cho các giải pháp cụ thể",
              "weight": 50.0
            }
          ]
        }
      ]
    },
    {
      "code": "TPL-KT-KSTK",
      "name": "KPI Kỹ sư triển khai",
      "jobTitleCode": "KT-KSTK",
      "sourceFile": "KPI kỹ sư triển khai V1.xlsx",
      "criteria": [
        {
          "name": "Tiến độ thi công/ triển khai",
          "weight": 20.0,
          "description": ">=90% công trình đúng hạn",
          "children": [
            {
              "name": "Hoàn thành công việc đúng tiến độ",
              "weight": 20.0,
              "measureMethod": "% đầu việc hoàn thành đúng hạn",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Hoàn thành milestone dự án",
              "weight": 20.0,
              "measureMethod": "% milestone đúng kế hoạch",
              "measurementText": "≥ 95%"
            },
            {
              "name": "Chủ động cảnh báo nguy cơ chậm tiến độ",
              "weight": 20.0,
              "measureMethod": "Số vấn đề được cảnh báo trước",
              "measurementText": "1"
            },
            {
              "name": "Thời gian phản hồi yêu cầu công việc",
              "weight": 20.0,
              "measureMethod": "Thời gian từ khi nhận yêu cầu đến phản hồi",
              "measurementText": "2 giờ"
            },
            {
              "name": "Hoàn thành công việc phát sinh",
              "weight": 20.0,
              "measureMethod": "% công việc phát sinh hoàn thành đúng cam kết",
              "measurementText": "≥ 90%"
            }
          ]
        },
        {
          "name": "Chất lượng thi công công trình",
          "weight": 15.0,
          "description": "Công trình không xảy ra mất mát tài sản\nLắp đặt thiết bị đảm bảo thẩm mỹ, kỹ thuật",
          "children": [
            {
              "name": "Tỷ lệ nghiệm thu đạt ngay lần đầu",
              "weight": 20.0,
              "measurementText": "≥ 95%"
            },
            {
              "name": "Tỷ lệ lỗi do thi công",
              "weight": 20.0,
              "measurementText": "≤ 3%"
            },
            {
              "name": "Số lỗi lặp lại sau khi đã xử lý",
              "weight": 20.0,
              "measurementText": "≤ 1 lỗi/tháng"
            },
            {
              "name": "Tỷ lệ hoàn thành checklist kỹ thuật",
              "weight": 20.0,
              "measurementText": "1"
            },
            {
              "name": "Thiết bị lắp đặt đúng theo thiết kế",
              "weight": 10.0,
              "measurementText": "≥ 95%"
            },
            {
              "name": "Thiết bị lắp đặt đảm bảo thẩm mỹ",
              "weight": 10.0,
              "measurementText": "≥ 95%"
            }
          ]
        },
        {
          "name": "Năng suất triển khai dự án",
          "weight": 15.0,
          "description": "So sánh thời gian triển khai dự án với thời gian của HĐ\nTỷ lệ chi phí triển khai/PAKD",
          "children": [
            {
              "name": "Tỷ lệ sử dụng nhân lực đúng kế hoạch",
              "weight": 25.0,
              "measureMethod": "Thời gian triển khai thực tế / kế hoạch",
              "measurementText": "1"
            },
            {
              "name": "OT phát sinh",
              "weight": 25.0,
              "measureMethod": "Số giờ OT / Tổng thời gian thực tế",
              "measurementText": "0.03"
            },
            {
              "name": "Tỷ lệ hoàn thành công việc ngay lần đầu",
              "weight": 25.0,
              "measurementText": "1"
            },
            {
              "name": "Khả năng xử lý nhiều dự án",
              "weight": 25.0,
              "measureMethod": "Số project/work package phụ trách",
              "measurementText": "2"
            }
          ]
        },
        {
          "name": "Xử lý hồ sơ dự án",
          "weight": 5.0,
          "description": "Hồ sơ hoàn thành đúng theo thời gian, kế hoạch của dự án\nĐủ hồ sơ hoàn công, checklist, Biên bản nghiệm thu",
          "children": [
            {
              "name": "Báo cáo tuần",
              "weight": 30.0,
              "measurementText": "1"
            },
            {
              "name": "Biên bản nghiệm thu, Hồ sơ dự án",
              "weight": 30.0,
              "measurementText": "1"
            },
            {
              "name": "Hình ảnh hiện trường",
              "weight": 40.0,
              "measurementText": "1"
            }
          ]
        },
        {
          "name": "Phối hợp & xử lý vấn đề",
          "weight": 5.0,
          "description": "Xử lý, khắc phục các vướng mắc, sai khác giữa Thiết kế và thực tế",
          "children": [
            {
              "name": "Phản hồi vấn đề kỹ thuật",
              "weight": 20.0,
              "measurementText": "≤ 4 giờ"
            },
            {
              "name": "Thời gian xử lý lỗi thông thường",
              "weight": 20.0,
              "measurementText": "≤ 24 giờ"
            },
            {
              "name": "Escalate vấn đề đúng thời điểm",
              "weight": 10.0,
              "measurementText": "1"
            },
            {
              "name": "Phối hợp với các bộ phận",
              "weight": 10.0,
              "measurementText": "≥ 90%"
            },
            {
              "name": "Khiếu nại do thái độ/phối hợp",
              "weight": 20.0,
              "measurementText": "0"
            },
            {
              "name": "Hỗ trợ đồng đội khi cần",
              "weight": 20.0,
              "measurementText": "Đạt"
            }
          ]
        },
        {
          "name": "An toàn, kỷ luật trên công trường",
          "weight": 5.0,
          "description": "Đảm bảo an toàn trong thi công\nKhông bị nhắc nhở, biên bản phạt từ BQLDA, CĐT",
          "children": [
            {
              "name": "Vi phạm an toàn lao động",
              "weight": 70.0,
              "measurementText": "0"
            },
            {
              "name": "Tuân thủ quy định công trường",
              "weight": 10.0,
              "measurementText": "≥ 98%"
            },
            {
              "name": "Đi làm/đến công trường đúng giờ",
              "weight": 10.0,
              "measurementText": "≥ 95%"
            },
            {
              "name": "Bảo quản thiết bị & dụng cụ",
              "weight": 10.0,
              "measurementText": "Không mất/hư hỏng do chủ quan"
            }
          ]
        },
        {
          "name": "Đánh giá cải tiến",
          "weight": 5.0,
          "description": "Đưa ra ý kiến, đề xuất để cải thiện quy trình, cải tiến thiết kế",
          "children": [
            {
              "name": "Có báo cáo/đề xuất điều chỉnh giải pháp thiết kế",
              "weight": 50.0
            },
            {
              "name": "Đề xuất sản phẩm mới/ hãng mới cho các giải pháp cụ thể",
              "weight": 50.0
            }
          ]
        }
      ]
    }
  ];
