import { CAI_DAT_MAC_DINH, type CaiDatHeThong } from './cai-dat-mac-dinh.js';

/**
 * Bản giả của `SettingsService` cho test unit: trả mặc định, hoặc bản đã sửa
 * một phần. Dùng `{ provide: SettingsService, useValue: settingsGia() }`.
 */
export function settingsGia(sua: Partial<CaiDatHeThong> = {}) {
  const caiDat: CaiDatHeThong = { ...CAI_DAT_MAC_DINH, ...sua };
  return { lay: () => caiDat };
}
