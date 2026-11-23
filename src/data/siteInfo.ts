export interface SiteInfo {
  hospitalName: string;
  serviceHours: string;
  phone: string;
  officialUrl: string;
  disclaimer: string;
}

export const SITE_INFO: SiteInfo = {
  hospitalName: 'AntreanRS',
  serviceHours: 'Senin–Jumat 08.00–16.00 WIB | Sabtu 08.00–12.00 WIB',
  phone: 'Contoh: 0800-xxx-xxxx',
  officialUrl: '#',
  disclaimer:
    'Nomor antrean dan estimasi waktu pada simulasi 3D ini bersifat ilustrasi dan tidak mewakili data antrean secara real-time.',
};
