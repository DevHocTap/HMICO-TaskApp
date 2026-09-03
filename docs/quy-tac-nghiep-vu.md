# Quy tắc nghiệp vụ đã chốt

> Nguồn sự thật cho mọi quyết định nghiệp vụ. Code mâu thuẫn với file này
> thì file này đúng.
>
> Bản này viết lại dựa trên **biểu mẫu KPI thật** của công ty
> (`BM.01-KPI.KYTHUAT`, bốn chức danh phòng Kỹ thuật, tháng 08/2026).
> Mọi giả định trước đó không khớp biểu mẫu đã bị loại bỏ.
>
> Cập nhật: 30/08/2026 — chốt bảng `Scorecard`, bỏ `KpiDefinition`,
> cắt phạm vi giai đoạn 1, đổi mốc bàn giao.

---

## 1. Bối cảnh và phạm vi

### Hiện trạng
- **Tầng công ty và phòng ban**: đã chạy trên phần mềm BSCkpi, chỉ ban
  giám đốc và trưởng phòng dùng. **Đang chạy ổn — giai đoạn 1 không đụng vào.**
- **Tầng cá nhân**: đang dùng file Excel rời cho từng nhân viên. Đây là
  chỗ phần mềm này thay thế.
- Về lâu dài phần mềm có thể thay luôn BSCkpi, nhưng **không phải mục
  tiêu giai đoạn 1**.

### Phạm vi giai đoạn 1
- Quản lý phòng ban, chức danh, nhân viên (kèm import từ Excel)
- Mẫu KPI theo chức danh
- Giao KPI **cá nhân** theo tháng, có ký nhận đầu kỳ
- Nhân viên tự chấm, trưởng bộ phận chấm, tự tính điểm và xếp loại
- HCNS tiếp nhận, tổng hợp, xuất Excel
- Trang "Việc của tôi" và bảng theo dõi tiến độ nộp

### Không làm ở giai đoạn 1

| Cắt | Lý do |
|---|---|
| Thay thế BSCkpi ở tầng công ty/phòng ban | Đang chạy ổn, BGĐ đang dùng |
| **KPI cấp phòng ban** (`ownerType = DEPARTMENT`) | BSCkpi đang làm. Cắt luôn luồng ký nhận BGĐ ↔ trưởng phòng và phần cộng dồn KPI phòng |
| **Bảng `KpiResult`** (nhập số liệu thô) | Tuỳ chọn mà chưa ai dùng. Thêm bảng mới sau không phá gì |
| **Thông báo trong ứng dụng** | Thay bằng trang "Việc của tôi" — giá trị tương đương, một phần năm công sức |
| Upload file minh chứng | Chỉ dán link |
| Quên mật khẩu qua email, SSO Microsoft | Admin đặt lại mật khẩu |
| Thông báo qua email / Zalo | |
| Tính tiền thưởng | HCNS tự tính ngoài |
| Kiêm nhiệm nhiều phòng, phó phòng | |
| Kỳ quý / năm, biểu đồ nhiều kỳ | Không chặn việc chạy thật |

Cột `ownerType` **vẫn giữ trong schema** cho tương lai, nhưng giai đoạn 1
chỉ viết luồng cho `USER`.

### Ràng buộc thời gian

**Mốc bàn giao: một phòng Kỹ thuật chạy thật tháng 11/2026.**
(Thay cho mốc cũ "toàn công ty ngày 31/12/2026".)

Một lập trình viên duy nhất, đồng thời gánh KPI riêng của phòng R&D — tức
khoảng hai tháng toàn thời gian. Mọi quyết định thiết kế phải ưu tiên
**hoàn thành được** hơn là hoàn hảo. Có người dùng thật sớm quan trọng hơn
đủ tính năng.

---

## 2. Cấu trúc phiếu KPI cá nhân

Mỗi **phiếu** (`Scorecard`) gắn với **một nhân viên, một chức danh, một kỳ
(tháng)**. Ràng buộc `@@unique([userId, periodId])` chặn tạo trùng.

### Hai mục cố định

| Mục | Mã | Trọng số | Thang điểm | Nội dung |
|---|---|---|---|---|
| BSC công việc | `BSC_WORK` | 70% | 10 | 6–7 tiêu chí theo chức danh |
| Chấp hành nội quy | `COMPLIANCE` | 30% | 3 | 3 tiêu chí cố định |

**Mục 2 giống nhau cho mọi chức danh.** Nằm trong một `KpiTemplate` có
`isSystem = true`, hệ thống tự nối vào mọi phiếu:
1. Số lần đi trễ / về sớm không phép (trên 30 phút) — 10%
2. Vi phạm bộ phận chưa xử lý kịp thời — 10%
3. Giữ gìn văn hoá doanh nghiệp, chấp hành nội quy lao động — 10%

### Hai cấp KPI

```
Tiêu chí cấp 1  (VD: "Tiến độ hoàn thành Shop Drawing", trọng số 15%)
└── KPI con      (VD: "Hoàn thành bản vẽ theo kế hoạch", trọng số 20%)
```

- Trọng số **tiêu chí cấp 1** tính trên tổng phiếu (cộng lại = 70 hoặc 30).
- Trọng số **KPI con** tính trong nội bộ tiêu chí cha (cộng lại = 100).

Dùng `ScorecardItem.parentId`. Ràng buộc tổng trọng số áp **theo từng cấp**,
không phải cho toàn phiếu. **Chỉ hai cấp — KPI con không có con.**

### Tiêu chí lá và tiêu chí có con — cấm trộn

Đúng hai trường hợp, không có trường hợp thứ ba:

| Loại | Cách chấm | Ràng buộc trọng số con |
|---|---|---|
| **Có con** | Điểm tính từ con theo công thức mục 3. **Không cho nhập trực tiếp** | Σ con = 100 |
| **Lá** (không con) | Nhập điểm trực tiếp | không áp dụng |

Ba tiêu chí Mục 2 (`COMPLIANCE`) đều là tiêu chí lá.

Service phải chặn: nhập điểm vào tiêu chí có con → lỗi; tiêu chí lá mà lại
có con → lỗi.

### Trọng số cấp 1 và cấp 2 có ngữ nghĩa KHÁC NHAU

Đây là chỗ dễ hiểu nhầm nhất của toàn bộ mô hình.

| Cấp | Ngữ nghĩa | Cộng lại bằng |
|---|---|---|
| Tiêu chí cấp 1 | **Tuyệt đối** — phần trăm của cả phiếu | 70 (BSC) / 30 (nội quy) |
| KPI con | **Tương đối** — phần trăm trong nội bộ tiêu chí cha | 100 |

Một KPI con trọng số `20` **không phải 20% của phiếu**. Nó là 20% của tiêu
chí cha; nếu cha có trọng số 15 thì phần đóng góp thật vào phiếu là:

```
đóng góp thật = trọng số cha × (trọng số con ÷ 100)
              = 15 × (20 ÷ 100) = 3 phần trăm của phiếu
```

Kiểm chứng bằng mẫu Shop Drawing thật: tiêu chí *"Tiến độ hoàn thành Shop
Drawing"* trọng số 15, có 5 KPI con mỗi con 20. Đóng góp thật của mỗi con
là `15 × 0,2 = 3`, năm con cộng lại đúng 15 — bằng trọng số của cha.

**Vì sao tách hai ngữ nghĩa:** trưởng phòng thêm hoặc bớt một KPI con thì
chỉ phải chia lại trong nội bộ tiêu chí đó (nút "Chia đều"), không phải
tính lại toàn bộ phiếu. Nếu dùng trọng số tuyệt đối cho cả hai cấp thì thêm
một dòng là phải sửa cả 37 dòng.

Công thức tính điểm ở mục 3 dựa đúng vào cách chia này.

### Ràng buộc trọng số — kiểm theo LOẠI MẪU

Mục 2 nằm ở một **mẫu hệ thống riêng**, không nằm chung mẫu chức danh. Nên
ràng buộc trọng số phải áp theo loại mẫu, không áp chung cho mọi mẫu:

| Loại mẫu | Kiểm khi xuất bản |
|---|---|
| **Mẫu chức danh** (`isSystem = false`) | Σ tiêu chí cấp 1 = **70** · chỉ chứa `BSC_WORK` · có ít nhất 1 tiêu chí |
| **Mẫu hệ thống** (`isSystem = true`) | Σ tiêu chí cấp 1 = **30** · chỉ chứa `COMPLIANCE` |
| **Cả hai** | Σ trọng số KPI con trong mỗi tiêu chí **có con** = **100** |

> **Ràng buộc "tổng phiếu = 100" thuộc về lúc GHÉP hai mẫu thành phiếu, KHÔNG
> phải lúc xuất bản từng mẫu.**
>
> Đặt nhầm cấp là mọi mẫu đều không xuất bản được: mẫu chức danh có
> `COMPLIANCE` = 0 nên trượt ràng buộc "= 30", còn mẫu hệ thống có
> `BSC_WORK` = 0 nên trượt ràng buộc "phải có ít nhất một tiêu chí
> BSC_WORK". Hai điều kiện không thể cùng đúng trên một mẫu.

Với **phiếu KPI** (lát cắt sau), kiểm khi chuyển `DRAFT` → `PROPOSED`:
tổng đóng góp của cả hai mục cộng lại = 100. Lúc nháp cho phép lệch.

**Kiểm ở tầng service, không dùng CHECK constraint.** CHECK của PostgreSQL
chỉ xét trong phạm vi một dòng, không kiểm được tổng qua nhiều dòng — muốn
ép ở tầng database phải dùng trigger. Có `scorecardId` thì kiểm ở service
là một lần tra theo index, đủ rẻ.

---

## 3. Chấm điểm — hướng A (số hoá cách làm hiện tại)

Người chấm nhập **điểm từ 0 đến thang tối đa** cho từng tiêu chí lá. Hệ
thống không tự suy ra điểm từ số liệu thô ở giai đoạn 1.

### Công thức

```
điểm tiêu chí lá     = điểm nhập trực tiếp
điểm tiêu chí có con = Σ (điểm con × trọng số con ÷ 100)

đóng góp             = (điểm tiêu chí ÷ maxScale) × trọng số tiêu chí

tổng điểm (%)        = Σ đóng góp của tất cả tiêu chí cấp 1
```

Kiểm chứng theo biểu mẫu Shop Drawing: tiêu chí "Tiến độ" có 5 KPI con mỗi
cái trọng số 20%, đều đạt 10/10 → điểm tiêu chí = 10 → đóng góp
= (10 ÷ 10) × 15 = 15. Cộng đủ 6 tiêu chí Mục 1 ra 70, cộng Mục 2 ra 30,
tổng 100%.

### Trần điểm — khác nhau theo mục

| Mục | Thang | Trần cho phép | Tổng đóng góp tối đa |
|---|---|---|---|
| `BSC_WORK` | 10 | **12** (= maxScale × 1,2) | 84 |
| `COMPLIANCE` | 3 | **3** (đúng bằng thang) | 30 |

**Chỉ `BSC_WORK` được vượt thang.** Không ai "vượt chỉ tiêu" ở khoản chấp
hành nội quy — trần đúng bằng 3.

Nghĩa là điểm tiêu chí nằm trong khoảng `0 .. maxScale × 1,2` với
`BSC_WORK`, và `0 .. maxScale` với `COMPLIANCE`. Tổng phiếu tối đa 114%.

> Đừng viết `Math.min(score, maxScale)` — sẽ làm hỏng mức "Vượt chỉ tiêu".

Khi điểm vượt thang thì **bắt buộc nhập ghi chú**.

### Hai cột chấm song song

Biểu mẫu có hai cột: **người lao động tự đánh giá** và **trưởng bộ phận
đánh giá**. Cả hai cùng lưu, cùng hiển thị cạnh nhau.

- `selfScore`, `selfComment` (trên từng dòng), `selfScoredAt` (trên phiếu)
- `managerScore`, `managerComment` (trên từng dòng), `managerScoredAt` (trên phiếu)
- Người chấm chốt ở `Scorecard.evaluatorId`

**Điểm chính thức lấy theo cột trưởng bộ phận.** Biểu mẫu ghi rõ: xếp loại
tính theo "Tổng điểm KPI - QL đánh giá".

Cột tự đánh giá vẫn phải lưu — chênh lệch giữa hai cột là thông tin có giá
trị khi trưởng phòng trao đổi với nhân viên.

### Chuẩn bị sẵn cho hướng B

`ScorecardItem.scoringMode`:

| Giá trị | Ý nghĩa |
|---|---|
| `MANUAL` | Người chấm nhập điểm trực tiếp — **mặc định, và là cách duy nhất ở giai đoạn 1** |
| `CALCULATED` | Hệ thống tính điểm từ số liệu thô — chưa dùng |

Bảng `KpiResult` **không dựng ở giai đoạn 1** (xem mục 1). Nhưng hàm tính
điểm hướng B **viết sẵn kèm test ngay** — một file, rất rẻ, và là chỗ dễ
sai nhất khi cần đến.

### Công thức hướng B (viết sẵn, có test, chưa bật)

```
HIGHER_BETTER:  tỷ lệ = thực tế ÷ mục tiêu
LOWER_BETTER:   tỷ lệ = mục tiêu ÷ thực tế
điểm = min(tỷ lệ, 1,2) × maxScale
```

**Ba ca đặc biệt bắt buộc có test** — mục tiêu trong biểu mẫu thật có cả
giá trị `0`:

| Ca | Quy tắc |
|---|---|
| `LOWER_BETTER`, mục tiêu = 0 | thực tế = 0 → **điểm tối đa**; thực tế > 0 → **0 điểm**. (Đúng cho "0 tai nạn lao động") |
| `LOWER_BETTER`, mục tiêu > 0, thực tế = 0 | tốt hơn mục tiêu vô hạn → **chặn trần ở 1,2** |
| `HIGHER_BETTER`, mục tiêu = 0 | **vô nghĩa — chặn lúc validate, không cho lưu** |

Ngoài ra: `minValue` nếu có giá trị và thực tế < `minValue` → 0 điểm.

`direction = RANGE` **không làm ở giai đoạn 1** (không thêm `maxValue`).

---

## 4. Xếp loại

Tính trên tổng điểm cột trưởng bộ phận:

| Xếp loại | Ngưỡng | Hằng số |
|---|---|---|
| Chưa đạt | < 80% | `NOT_MET` |
| Cần cải thiện | 80 – 89% | `NEEDS_IMPROVEMENT` |
| Hoàn thành | 90 – 100% | `COMPLETED` |
| Vượt chỉ tiêu | > 100% (tham chiếu 100–120%) | `EXCEEDED` |

Hệ thống **không tính tiền thưởng**. Chỉ cung cấp điểm và xếp loại, HCNS
tự tính thưởng bên ngoài.

---

## 5. Luồng trạng thái

Có **hai luồng độc lập** trên cùng một `Scorecard`.

### 5.0 Ai chấm KPI của trưởng bộ phận — HCNS đã chốt

**Ban giám đốc (`EXECUTIVE`) chấm và duyệt KPI của trưởng bộ phận.**

Không dùng `Department.parentId` để suy ra người chấm — hướng đó đã bỏ.

Quy tắc: nếu `ownerUserId` chính là `managerId` của phòng người đó, thì
`evaluatorId` **bắt buộc** là người có vai trò `EXECUTIVE`. Hệ thống từ
chối sinh phiếu nếu người chấm không thuộc ban giám đốc.

Công ty có **đúng một** người vai trò `EXECUTIVE` thì hệ thống tự gán; **từ
hai người trở lên** thì ADMIN/HR phải chọn rõ ai chấm lúc sinh phiếu — đoán
bừa ai trong ban giám đốc là sai.

**Chức danh trưởng bộ phận KHÔNG có mẫu KPI.** Ban giám đốc **nhập KPI
trực tiếp vào phiếu** của họ, qua đường sinh phiếu rỗng
(`POST /scorecards` với `emptyTemplate: true`): phiếu chỉ dựng sẵn Mục 2,
Mục 1 để trống.

**Đường này KHÔNG chỉ dành cho trưởng bộ phận (HCNS chốt 03/09/2026, câu
C3).** Mẫu KPI chỉ là **điểm khởi đầu**: trưởng phòng đưa ra tiêu chí lớn
và các tiêu chí con cho từng nhân viên, tự thêm và chỉnh sửa theo việc thật
của tháng đó.

- `MANAGER` sinh được phiếu rỗng cho nhân viên phòng mình.
- **Không chặn khi chức danh đã có mẫu.** Ép dùng mẫu là ép trưởng phòng
  quay về Excel để làm phần mẫu không diễn đạt được.
- `STAFF` vẫn không sinh được phiếu — không ai tự giao KPI cho mình.

Sửa nội dung phiếu qua `PUT /scorecards/:id/items`, thay **cả cây** một lần:
gửi thiếu Mục 2 là mất Mục 2, và kiểm trọng số sẽ chặn ngay lúc lưu.

> **Đã chốt hết 03/09/2026 — không còn chỗ mơ hồ.**
>
> **Công ty chỉ có MỘT cấp quản lý: Trưởng phòng.** Không có tổ trưởng.
> `Department.managerId` vì vậy luôn là một trưởng phòng, và
> `nguoiChamDuKien()` không phải phân biệt cấp nào với cấp nào.
>
> **Phó phòng chỉ là chức danh** — quyền như nhân viên thường, KHÔNG chấm
> điểm, và có phiếu KPI như mọi nhân viên khác.
>
> **Shop Drawing và Bảo hành bảo trì là CHỨC DANH**, không phải đơn vị tổ
> chức. Hai đơn vị `KT-SD` và `KT-BT` đã bỏ khỏi cây phòng ban.
>
> **Ban giám đốc không bị chấm điểm** — `ADMIN` và `EXECUTIVE` không có
> phiếu KPI. Nhưng ban giám đốc vẫn là NGƯỜI CHẤM của trưởng phòng; hai
> việc khác nhau, đừng gộp.

Người nhập là ban giám đốc, **không phải trưởng bộ phận tự nhập cho mình**.
Nhập xong, hai bên trao đổi và chốt theo đúng luồng `PROPOSED → ACCEPTED`
như mọi phiếu khác. Cuối kỳ ban giám đốc chấm dựa trên chính KPI đã chốt đó.

Cấu trúc **70/30 áp dụng cho tất cả**, kể cả trưởng bộ phận. Phiếu rỗng
không qua được kiểm trọng số cho tới khi Mục 1 đủ 70 — đó là hành vi đúng,
không phải lỗi.

Nhân viên thường vẫn dùng bốn mẫu Excel như cũ. Nút "sao chép từ kỳ trước"
giữ nguyên giá trị.

### 5.1 Luồng giao KPI (đầu kỳ)

```
DRAFT → PROPOSED → ACCEPTED
                 ↘ DISPUTED → (quay lại DRAFT)
```

| Chuyển | Ai làm |
|---|---|
| `DRAFT` → `PROPOSED` | Trưởng bộ phận (`evaluatorId` của phiếu), hoặc ADMIN/HR |
| `PROPOSED` → `ACCEPTED` | **Chỉ chủ sở hữu phiếu.** Không ai ký thay được |
| `PROPOSED` → `DISPUTED` | **Chỉ chủ sở hữu phiếu**, bắt buộc nêu lý do |
| `DISPUTED` → `DRAFT` | **Trưởng bộ phận**, bằng cách sửa lại cây item của phiếu |

**`DISPUTED` KHÔNG phải ngõ cụt.** Có đúng hai đường ra, cả hai đều do
trưởng bộ phận thực hiện:

| Đường ra | Khi nào | Ghi nhận |
|---|---|---|
| **Sửa KPI rồi gửi lại** | Ý kiến của nhân viên hợp lý, có chỗ để sửa | Lưu cây item đưa phiếu về `DRAFT`, rồi `/propose` như bình thường |
| **Gửi lại nguyên trạng** | Đã trao đổi trực tiếp và thống nhất giữ nguyên | `/propose` gọi thẳng từ `DISPUTED`, **bắt buộc nhập ghi chú**, ghi `ScorecardEvent` kiểu `RE_PROPOSED_UNCHANGED` |

Trường hợp thứ hai là bình thường và hay gặp: hai bên nói chuyện với nhau,
nhân viên hiểu ra và đồng ý, không có gì phải sửa — nhưng phiếu vẫn phải đi
tiếp. Không có đường này thì phiếu kẹt vĩnh viễn ở `DISPUTED`, hoặc trưởng
bộ phận phải sửa vu vơ một ký tự để thoát ra.

**Không có nút "chuyển về nháp" trần.** Một nút như vậy cho phép xoá trạng
thái `DISPUTED` mà không sửa gì và không giải thích gì — ý kiến của nhân
viên biến mất không dấu vết. Cả hai đường ra ở trên đều để lại dấu: một
đằng là nội dung phiếu đổi, một đằng là ghi chú bắt buộc.

Lịch sử ý kiến luôn còn trong `ScorecardEvent`, kể cả sau khi phiếu đã được
ký lại.

Giai đoạn 1 chỉ có một cấp ký nhận: **trưởng phòng ↔ nhân viên**. Cấp
BGĐ ↔ trưởng phòng để BSCkpi lo.

Chỉ phiếu ở trạng thái `ACCEPTED` mới chấm điểm được.

### 5.2 Luồng chấm điểm (cuối kỳ)

```
PENDING → SELF_SCORED → MANAGER_SCORED → RECEIVED
                      ↘ REJECTED → (quay lại SELF_SCORED)
```

| Chuyển | Ai làm |
|---|---|
| `PENDING` → `SELF_SCORED` | Nhân viên tự chấm |
| `SELF_SCORED` → `MANAGER_SCORED` | Trưởng bộ phận chấm |
| `SELF_SCORED` → `REJECTED` | Trưởng bộ phận trả lại để chấm lại |
| `MANAGER_SCORED` → `RECEIVED` | HCNS tiếp nhận |

**HCNS chỉ tiếp nhận và tổng hợp, không có quyền trả lại.** Trạng thái
`RECEIVED` chỉ đánh dấu đã nộp về HCNS, kèm `receivedAt` và `receivedById`.

Tổng điểm và xếp loại chốt vào phiếu khi chuyển sang `MANAGER_SCORED`.

### 5.3 Sửa KPI sau khi đã ký nhận

Cho sửa, nhưng:
- Phiếu **quay về `PROPOSED`** và phải **ký lại**
- Ghi `AuditLog`
- **Cấm sửa khi `resultStatus` đã khác `PENDING`** — đã bắt đầu chấm thì
  không đổi đề bài nữa

### 5.4 Nhân viên nghỉ việc giữa kỳ

Giữ nguyên phiếu để tra cứu, đặt `User.isActive = false`. Không chuyển KPI
cho người khác.

Người đã vô hiệu hoá không đăng nhập tự chấm được, nên: **trưởng phòng chấm
một cột `managerScore`**, `selfScore` để trống, **bắt buộc ghi lý do** vào
`Scorecard.noSelfScoreReason`. Phiếu vẫn nộp về HCNS bình thường.

### 5.5 Lịch trong tháng — bốn mốc

**HCNS chốt 03/09/2026 (câu A2). Toàn bộ chu trình nằm TRONG chính tháng
đó, không tràn sang tháng sau.**

| Ngày | Việc | Ai | Cột |
|---|---|---|---|
| 25 | Lên KPI cho **tháng sau** | Trưởng phòng | `assignDeadline` của kỳ sau |
| 25 | Tự đánh giá KPI tháng này | Nhân viên | `selfScoreDeadline` |
| 27–29 | Chấm điểm, chốt, giải quyết tranh chấp | Trưởng phòng | `managerScoreDeadline` |
| 30 | Gửi HCNS tổng hợp | Trưởng phòng | `submitDeadline` |

Vì việc lên KPI tháng sau làm vào ngày 25 tháng này, **`assignDeadline` của
một kỳ nằm ở THÁNG TRƯỚC kỳ đó.** Kỳ tháng 09 có `assignDeadline = 25/08`.

**Tháng ngắn thì kẹp về ngày cuối tháng.** Tháng 02/2027 có 28 ngày nên
`managerScoreDeadline` và `submitDeadline` đều là 28/02. Không kẹp thì
`Date.UTC(2027, 1, 30)` lặng lẽ trôi sang 02/03 — hạn nộp của tháng 2 rơi
vào tháng 3 mà không ai nhìn ra cho tới lúc đối chiếu số.

**CHỈ kỳ THÁNG có bốn mốc này.** Kỳ quý và kỳ năm để `NULL`.

Lý do: phiếu KPI luôn gắn với kỳ tháng, không có phiếu nào gắn trực tiếp
vào kỳ quý hay kỳ năm — hai loại đó chỉ để tổng hợp. Đặt hạn cho chúng là
tạo ra một cái mốc không ai phải đáp ứng, rồi bảng theo dõi tiến độ sẽ báo
"quá hạn" cho thứ chưa từng có ai được giao.

Bốn cột vì vậy đều **nullable**.

#### Ngữ nghĩa đếm ngược

Mọi hạn tính là **HẾT ngày đó** — chính ngày hạn vẫn còn làm được:

| Hôm nay | Hiển thị (hạn 30/09) |
|---|---|
| Ngày 29 | còn 2 ngày |
| **Ngày 30** | **còn 1 ngày** — vẫn nộp được |
| Ngày 01/10 | **quá hạn** |

Không được hiện "hết hạn hôm nay" hay số âm.
`tinhTinhTrangHanNop()` trong `src/modules/period/period-calendar.ts` trả
`daysUntilDeadline` (không bao giờ âm) và `isOverdue` tách riêng.

So NGÀY LỊCH theo giờ Việt Nam, không so mốc thời gian — xem comment tại
hàm đó để biết vì sao `hanNop` không được quy đổi múi giờ còn `bayGio` thì
bắt buộc phải quy đổi.

#### Nhắc việc

Giai đoạn 1 "nhắc" nghĩa là **hiện trên trang "Việc của tôi"**, không phải
gửi thông báo. HCNS xem được phòng nào chưa nộp, không phải đi đòi từng phòng.

Đây là chỗ hệ thống tạo giá trị rõ nhất so với Excel.

> **Lịch cũ đã BỎ:** trước 03/09/2026 tài liệu ghi hạn nộp là "hết ngày 02
> tháng kế tiếp" (`NGAY_HAN_NOP = 2`). Sai hẳn một tháng so với thực tế.

### 5.6 Khoá kỳ

**HCNS chốt 03/09/2026 (câu A5): `ADMIN`, `HR` và `EXECUTIVE` khoá/mở kỳ.**

Chốt sổ tháng là quyết định **nghiệp vụ**, không phải thao tác kỹ thuật —
người quyết định thời điểm chốt phải là HCNS hoặc ban giám đốc. `ADMIN` giữ
quyền theo câu A4 (tài khoản quản trị có toàn quyền).

Trưởng phòng muốn sửa điểm của kỳ đã chốt thì **gửi yêu cầu cho HCNS hoặc
ban giám đốc** mở lại. Kỳ đã khoá thì không sửa được điểm. Mọi lần khoá và
mở đều ghi `AuditLog` cùng transaction với thao tác.

**Chỉ kỳ THÁNG khoá được.** Khoá kỳ quý hay kỳ năm không chặn được gì —
điểm quý là trung bình cộng ba tháng, và khoá kỳ cha KHÔNG lan xuống kỳ con.
Để bấm được một nút không có tác dụng là mời người dùng hiểu nhầm rằng sổ
đã chốt.

**Khoá kỳ CHỈ ảnh hưởng đúng kỳ đó, không lan xuống kỳ con.**

Khoá "Quý 3/2026" **không** khoá tháng 07, 08, 09 bên trong. Phiếu KPI luôn
gắn với kỳ THÁNG, nên kiểm khoá cũng chỉ nhìn đúng kỳ tháng của phiếu —
không đi ngược lên cây `parentId`.

Lý do: kỳ quý và kỳ năm chỉ để **tổng hợp**, không có phiếu nào gắn trực
tiếp vào chúng. Cho khoá lan xuống nghĩa là một thao tác trên kỳ tổng hợp
lại chặn việc chấm điểm của ba tháng — hậu quả lớn hơn nhiều so với thứ
người bấm nút nghĩ mình đang làm.

Muốn chốt sổ cả quý thì khoá lần lượt ba kỳ tháng.

**Giao diện: nút khoá ở kỳ quý và kỳ năm phải VÔ HIỆU HOÁ** cho tới khi có
KPI cấp quý. Cột `isLocked` vẫn tồn tại cho tương lai, nhưng khoá một kỳ
không có phiếu nào thì không chặn được gì — để nút bấm được là mời người
dùng hiểu nhầm rằng mình vừa chốt sổ cả quý.

### 5.7 Tự sinh kỳ đánh giá

Tài liệu chốt ADMIN khoá/mở kỳ nhưng không nói ai TẠO kỳ. Tạo tay 12 lần
một năm, quên đúng một lần là chặn cả công ty vào hạn nộp mùng 02. Nên hệ
thống tự sinh.

**Quy tắc bù kỳ — chỉ TIẾN, không LÙI:**

| | |
|---|---|
| Luôn bảo đảm tồn tại | Kỳ **tháng hiện tại** và **tháng kế tiếp** |
| Kèm theo | Kỳ quý và kỳ năm chứa hai tháng đó |
| **Không bao giờ** | Bù ngược kỳ đã qua |

Vì sao không bù ngược: khởi động lại máy chủ vào tháng 9 mà sinh ngược 8 kỳ
đầu năm thì tạo ra 8 kỳ **rỗng không ai điền**, làm rác ô chọn kỳ, và khiến
bảng theo dõi tiến độ nộp báo "chưa nộp" cho những tháng công ty chưa từng
dùng phần mềm. Kỳ quá khứ nếu thật sự cần thì HCNS tạo tay.

Chạy ở **hai nơi, cùng một hàm** `ensurePeriodsExist()`:
- 01:00 hằng ngày, múi giờ `Asia/Ho_Chi_Minh`
- mỗi lần máy chủ khởi động

Máy chủ tắt đúng lúc 01:00 thì lần bật lên sau bù ngay, không phải đợi hôm
sau. Hàm **idempotent** nhờ khoá `Period.code`, nên chạy lại bao nhiêu lần
— kể cả nhiều tiến trình song song — cũng chỉ ra một kỳ.

Kỳ do hệ thống tạo có `createdById = NULL`; kỳ do người tạo tay thì mang id
người đó.

---

## 6. Mô hình dữ liệu

### 6.1 Quyết định lớn: bỏ `KpiDefinition`

Ở tầng cá nhân, tiêu chí gắn chặt với chức danh, gần như không dùng chéo
giữa các phòng. Vai trò "thư viện dùng lại nhiều kỳ" đã chuyển hẳn sang
`KpiTemplate`.

Giữ cả hai bảng nghĩa là người tạo mẫu phải qua hai bước — đúng chỗ người
không rành máy tính bỏ cuộc (xem mục 9.2).

**Vậy: `KpiTemplateItem` tự chứa toàn bộ nội dung** (tên, mô tả, cách đo,
mục tiêu, trọng số, `section`). Bớt một bảng, bớt một màn hình, bớt một lớp
join.

Khi nào mở rộng lên tầng phòng ban thay BSCkpi thì thêm lại thư viện.

### 6.2 Quyết định lớn: phiếu `Scorecard` chụp lại mọi thứ

`ScorecardItem` **chụp lại (snapshot) toàn bộ nội dung** từ
`KpiTemplateItem` tại thời điểm tạo phiếu, không trỏ FK để đọc ngược.

**Lý do: sửa mẫu không được làm đổi phiếu đã chấm.** Sai ở đây là sai vào
lương của người thật.

Chụp lại gồm: `name`, `description`, `measurementUnit`, `targetValue`,
`direction`, `scoringMode`, `weight`, `section`, và **`maxScale`** — nếu
công ty đổi thang điểm sang 100 vào năm sau, phiếu cũ phải giữ nguyên thang 10.

Phiếu cũng chụp `jobTitleName`, `departmentName`, `level` và chốt
`templateVersion` — người đổi chức danh giữa năm thì phiếu tháng 03 phải
giữ chức danh **lúc đó**.

`maxScale` **suy ra từ `section`** bằng hằng số trong code
(`BSC_WORK: 10`, `COMPLIANCE: 3`), không cho người dùng nhập — rồi chụp
xuống `ScorecardItem`. Không để `maxScale` rải trên từng định nghĩa, tránh
dữ liệu mâu thuẫn kiểu `section = COMPLIANCE` mà `maxScale = 10`.

### 6.3 Mười một bảng

| Bảng | Vai trò |
|---|---|
| `Department` | Cây phòng ban, `parentId` tự trỏ, `managerId` trỏ trưởng bộ phận |
| `JobTitle` | Chức danh |
| `User` | Nhân viên |
| `RefreshToken` | Phiên đăng nhập |
| `Period` | Kỳ đánh giá, `parentId` cho tháng → quý → năm |
| `KpiTemplate` | Mẫu KPI theo chức danh, có `version` và cờ `isSystem` |
| `KpiTemplateItem` | Dòng trong mẫu, `parentId` tạo hai cấp, **tự chứa nội dung** |
| `Scorecard` | **Phiếu KPI** — một người, một kỳ. Trạng thái, tổng điểm, xếp loại |
| `ScorecardItem` | Dòng trong phiếu, **snapshot** nội dung + hai cột điểm |
| `ScorecardEvent` | Lịch sử ký nhận / chấm / trả lại, kèm lý do |
| `AuditLog` | Nhật ký mọi thao tác sửa đổi, không có khoá ngoại |

**Bảng bị bỏ so với bản trước:** `KpiDefinition`, `KpiAssignment`,
`KpiResult`, `Approval`.

`ScorecardEvent` thay `Approval`: một phiếu có thể bị trả lại nhiều lần, mỗi
lần một lý do — một cột `comment` sẽ bị ghi đè.

### 6.4 Vì sao trạng thái nằm trên phiếu chứ không trên từng dòng

200 người × 12 tháng × ~35 dòng ≈ **80.000 dòng `ScorecardItem`/năm**,
trong khi chỉ có **2.400 phiếu/năm**. Ký nhận, tiếp nhận, xếp loại đều là
thao tác cấp phiếu — đặt ở đúng cấp là chênh lệch 33 lần, và tránh được
trạng thái nửa vời (dòng `ACCEPTED`, dòng `DRAFT`).

### 6.5 `AuditLog` không có khoá ngoại

Cố ý không ràng buộc tới bảng nghiệp vụ. Khi một phiếu bị xoá, log vẫn phải
còn — đó chính là lúc cần tra cứu nhất.

---

## 7. Xác thực và phân quyền

### Đăng nhập
- Bằng **email** (tên miền `hmico.vn`)
- Mật khẩu băm bằng **argon2**
- Admin đặt mật khẩu ban đầu, `mustChangePassword = true`, bắt đổi ở lần
  đăng nhập đầu
- Chưa làm "quên mật khẩu" ở giai đoạn 1
- JWT **15 phút** + RefreshToken **7 ngày**

### RefreshToken — quy tắc cụ thể

- Lưu **SHA-256** của token, không lưu thô. Không cần argon2 vì token đã có
  entropy cao (32 byte ngẫu nhiên)
- **Xoay vòng**: mỗi lần refresh cấp token mới, thu hồi token cũ ngay
  (`revokedAt`, `replacedById`)
- Đổi mật khẩu hoặc `isActive = false` → **thu hồi toàn bộ** token của
  người đó
- **Bỏ qua phát hiện tái sử dụng token** ở giai đoạn 1, chưa cần

### Năm vai trò

| Vai trò | Quyền |
|---|---|
| `ADMIN` | Toàn quyền, khoá/mở kỳ, quản lý mẫu KPI và chức danh |
| `EXECUTIVE` | **Xem toàn công ty ở mọi màn hình, bao gồm cả màn quản trị. Không có quyền ghi ở module `org`.** Không chấm điểm |
| `HR` | Xem toàn công ty + quản lý nhân sự, chức danh, tiếp nhận kết quả, xuất Excel |
| `MANAGER` | Giao KPI, chấm điểm, xem trong phạm vi phòng mình |
| `STAFF` | Chỉ KPI bản thân, tự chấm |

> **Về `EXECUTIVE`:** ban giám đốc phải xem được cơ cấu tổ chức, chức danh
> và danh sách nhân sự toàn công ty — giấu những màn hình đó đi thì họ đăng
> nhập vào chỉ thấy trang trống. Backend vốn đã cho họ đọc toàn công ty;
> giao diện chỉ ẩn nút ghi, không ẩn màn hình.
>
> Quyền **nghiệp vụ** của EXECUTIVE (ký duyệt, soát xét, khoá kỳ) là chuyện
> khác, chưa chốt — xem `docs/no-ky-thuat.md`.

### Phạm vi dữ liệu — quy tắc quan trọng nhất

**Đi theo cây phòng ban (`Department.parentId`), KHÔNG theo
`User.managerId`.**

MANAGER thấy phòng mình và mọi phòng con. `User.managerId` chỉ dùng hiển thị
quan hệ báo cáo, không quyết định quyền xem.

Viết **một hàm duy nhất** `getAccessibleDepartmentIds(user)` dùng ở mọi nơi
cần lọc dữ liệu. Không để mỗi module tự kiểm một kiểu — đây là chỗ dễ sinh
lỗ hổng nhất của hệ thống này.

### Cây tổ chức

```
Công ty HMICO
├── Hà Nội (trụ sở)
│   ├── Ban giám đốc
│   ├── Phòng Truyền thông Marketing
│   ├── Phòng Kinh doanh
│   ├── Phòng Dự án
│   ├── Phòng Mua hàng
│   ├── Phòng R&D
│   ├── Phòng Kỹ thuật
│   │   ├── Tổ Bảo trì bảo hành
│   │   └── Tổ Shop Drawing
│   ├── Phòng Tài chính kế toán
│   └── Phòng Hành chính nhân sự
└── Chi nhánh HCM
    └── (cơ cấu phòng ban tương tự Hà Nội)
```

Bốn tầng, `parentId` xử lý được. **Cần chốt**: trưởng chi nhánh HCM có xem
được dữ liệu Hà Nội không (mặc định: không).

---

## 8. Kỳ đánh giá

- **Kỳ vận hành: THÁNG.** Chấm và thưởng theo tháng.
- Kỳ **QUÝ** và **NĂM** dùng `Period.parentId` để tổng hợp.
  **Điểm quý = trung bình cộng ba tháng.** Không phải tổng.
  (Cột `parentId` dựng sẵn, nhưng luồng tổng hợp quý/năm hoãn sau tháng 11.)
- Kỳ tháng tạo tự động (tháng này + tháng kế tiếp), kèm bốn mốc ở mục 5.5.

Chu kỳ tháng nghĩa là 200 người × 12 tháng = **2.400 phiếu mỗi năm**. Điều
này khiến các tính năng ở mục 10 trở thành bắt buộc, không phải tuỳ chọn.

---

## 9. Chờ HR xác nhận — KHÔNG tự quyết

### 9.1 Điểm vượt thang
Bảng xếp loại có mức "> 100% Vượt chỉ tiêu (tham chiếu 100–120%)" nhưng
thang tối đa là 10, về số học không vượt được 100%.

Ba khả năng: (a) cho chấm quá thang, (b) có điểm thưởng riêng ngoài phiếu,
(c) mức này chỉ có trên giấy, chưa ai dùng.

Tạm thời: `BSC_WORK` cho nhập tới 12/10 và bắt buộc ghi chú khi vượt;
`COMPLIANCE` trần đúng bằng 3.

### 9.2 Mẫu KPI các phòng khác
Mới có bốn chức danh phòng Kỹ thuật. Các phòng khác chưa rõ đã có biểu mẫu
chưa. Nếu chưa, phần mềm sẽ là nơi họ xây lần đầu → công cụ tạo mẫu KPI
phải dễ dùng cho người không rành máy tính. **Một màn hình duy nhất**, không
bắt qua hai bước.

### 9.3 Quyền xem giữa hai chi nhánh
Trưởng chi nhánh HCM có xem được dữ liệu Hà Nội không?

### 9.4 Số lượng nhân sự thực tế
Chưa có con số từng phòng.

### 9.5 File Excel nhân sự
Cần xin file mẫu của HR **trước khi viết module `org`** — đừng đoán cột.

---

## 10. Bốn tính năng bắt buộc

Không ai yêu cầu nhưng thiếu thì phần mềm sẽ bị bỏ dùng.

1. **Sao chép KPI từ kỳ trước.** Nút "Tạo tháng 09 từ tháng 08" copy toàn
   bộ, trưởng phòng chỉ sửa con số. Với chu kỳ tháng, thiếu nút này thì
   trưởng phòng bỏ dùng sau tháng thứ hai.
2. **Mẫu KPI theo chức danh.** Giao KPI cho người mới = chọn mẫu rồi chỉnh.
   Bốn file Excel phòng Kỹ thuật chính là bốn mẫu đầu tiên.
3. **Import nhân sự từ Excel.** Nhập tay 200 người mất cả tuần và chắc chắn
   sai sót.
4. **Trang "Việc của tôi"** — liệt kê phiếu chưa xử lý kèm số ngày còn lại.
   Không cần bảng thông báo, không chuông đếm, không đánh dấu đã đọc.

Thêm một tính năng nhỏ nhưng giá trị cao: **bảng theo dõi tiến độ nộp** cho
HCNS — phòng nào đã nộp, phòng nào chưa, còn mấy ngày tới hạn.

Hoãn sau tháng 11: biểu đồ điểm qua nhiều kỳ, tổng hợp quý/năm.

---

## 11. Lịch triển khai theo lát cắt dọc

**Không làm backend trước frontend sau.** Mỗi lát cắt xong là có thứ mở lên
xem được — nếu trễ vẫn có thứ để trình sếp.

| Tuần | Lát cắt |
|---|---|
| 1–2 | **Auth**: backend + màn đăng nhập + đổi mật khẩu lần đầu |
| 3–4 | **Org**: phòng ban, chức danh, nhân viên, import Excel + màn quản trị |
| 5–6 | **Mẫu KPI**: một màn hình duy nhất tạo cây hai cấp + nhập 4 mẫu phòng Kỹ thuật |
| 7–8 | **Giao KPI** tháng, ký nhận, sao chép từ kỳ trước + màn của trưởng phòng |
| 9–10 | **Chấm điểm** hai cột, tính điểm, xếp loại + màn chấm |
| **11** | **Đối chiếu với Excel tháng thật — số phải khớp tuyệt đối** |
| 12 | Trang "Việc của tôi", theo dõi tiến độ nộp cho HCNS, xuất Excel |
| 13+ | Chạy thật một phòng, sửa theo phản hồi |

### Tuần 11 là mốc quan trọng nhất

Lấy một phiếu KPI thật đã chấm tháng 08/2026 của phòng Kỹ thuật, nhập vào
hệ thống, so tổng điểm với file Excel.

**Lệch dù 0,05 cũng là công thức sai — và sai ở đây là sai vào lương của
người thật.** Phải khớp tuyệt đối trước khi mở rộng ra phòng khác.
