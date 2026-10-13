// Sinh từ data/services.csv và data/combos.csv bằng `bun scripts/gen-catalog.ts`. Không sửa tay.
// Danh mục ban đầu (PRD §6.8). Chỉ nạp khi DB chưa có mã đó; giá Linh sửa trong app không bị ghi đè.

export type SeedService = {
  code: string
  category: string
  name: string
  priceMode: 'list' | 'custom'
  unit: string
  priceMin: number
  priceMax: number
  hasHardening: boolean
  sortOrder: number
}

export type SeedCombo = {
  code: string
  name: string
  groupName: string
  price: number
  items: string[]
  sortOrder: number
}

export const SEED_SERVICES: SeedService[] = [
  {
    "code": "CB01",
    "category": "Cơ bản",
    "name": "Cắt sửa",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 40000,
    "priceMax": 40000,
    "hasHardening": false,
    "sortOrder": 10
  },
  {
    "code": "CB02",
    "category": "Cơ bản",
    "name": "Sơn gel trơn",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 70000,
    "priceMax": 70000,
    "hasHardening": false,
    "sortOrder": 20
  },
  {
    "code": "CB03",
    "category": "Cơ bản",
    "name": "Cứng móng (2 lớp)",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 50000,
    "priceMax": 50000,
    "hasHardening": true,
    "sortOrder": 30
  },
  {
    "code": "CB04",
    "category": "Cơ bản",
    "name": "Cứng móng tạo cầu",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 70000,
    "priceMax": 70000,
    "hasHardening": true,
    "sortOrder": 40
  },
  {
    "code": "CB05",
    "category": "Cơ bản",
    "name": "Sơn gel >3 màu",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 80000,
    "priceMax": 80000,
    "hasHardening": false,
    "sortOrder": 50
  },
  {
    "code": "CB06",
    "category": "Cơ bản",
    "name": "Sơn nhũ",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 80000,
    "priceMax": 80000,
    "hasHardening": false,
    "sortOrder": 60
  },
  {
    "code": "CB07",
    "category": "Cơ bản",
    "name": "Phá móng cũ",
    "priceMode": "custom",
    "unit": "lần",
    "priceMin": 20000,
    "priceMax": 50000,
    "hasHardening": false,
    "sortOrder": 70
  },
  {
    "code": "CB08",
    "category": "Cơ bản",
    "name": "Nhặt da",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 40000,
    "priceMax": 40000,
    "hasHardening": false,
    "sortOrder": 80
  },
  {
    "code": "DS01",
    "category": "Design",
    "name": "Mắt mèo",
    "priceMode": "custom",
    "unit": "ngón",
    "priceMin": 7000,
    "priceMax": 10000,
    "hasHardening": false,
    "sortOrder": 90
  },
  {
    "code": "DS02",
    "category": "Design",
    "name": "Ombre",
    "priceMode": "custom",
    "unit": "ngón",
    "priceMin": 8000,
    "priceMax": 10000,
    "hasHardening": false,
    "sortOrder": 100
  },
  {
    "code": "DS03",
    "category": "Design",
    "name": "Tráng gương",
    "priceMode": "custom",
    "unit": "ngón",
    "priceMin": 8000,
    "priceMax": 10000,
    "hasHardening": false,
    "sortOrder": 110
  },
  {
    "code": "DS04",
    "category": "Design",
    "name": "French",
    "priceMode": "custom",
    "unit": "ngón",
    "priceMin": 10000,
    "priceMax": 12000,
    "hasHardening": false,
    "sortOrder": 120
  },
  {
    "code": "DS05",
    "category": "Design",
    "name": "Loang",
    "priceMode": "custom",
    "unit": "ngón",
    "priceMin": 8000,
    "priceMax": 12000,
    "hasHardening": false,
    "sortOrder": 130
  },
  {
    "code": "DS06",
    "category": "Design",
    "name": "Vẽ cơ bản",
    "priceMode": "custom",
    "unit": "ngón",
    "priceMin": 5000,
    "priceMax": 30000,
    "hasHardening": false,
    "sortOrder": 140
  },
  {
    "code": "DS07",
    "category": "Design",
    "name": "Thú nổi",
    "priceMode": "custom",
    "unit": "hình",
    "priceMin": 30000,
    "priceMax": 50000,
    "hasHardening": false,
    "sortOrder": 150
  },
  {
    "code": "PK01",
    "category": "Phụ kiện",
    "name": "Đá các loại",
    "priceMode": "custom",
    "unit": "ngón",
    "priceMin": 4000,
    "priceMax": 50000,
    "hasHardening": false,
    "sortOrder": 160
  },
  {
    "code": "PK02",
    "category": "Phụ kiện",
    "name": "Sticker",
    "priceMode": "custom",
    "unit": "ngón",
    "priceMin": 5000,
    "priceMax": 20000,
    "hasHardening": false,
    "sortOrder": 170
  },
  {
    "code": "PK03",
    "category": "Phụ kiện",
    "name": "Charm",
    "priceMode": "custom",
    "unit": "cái",
    "priceMin": 10000,
    "priceMax": 50000,
    "hasHardening": false,
    "sortOrder": 180
  },
  {
    "code": "PK04",
    "category": "Phụ kiện",
    "name": "Phụ kiện",
    "priceMode": "custom",
    "unit": "ngón",
    "priceMin": 4000,
    "priceMax": 30000,
    "hasHardening": false,
    "sortOrder": 190
  },
  {
    "code": "MG01",
    "category": "Móng giả",
    "name": "Úp keo",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 90000,
    "priceMax": 90000,
    "hasHardening": false,
    "sortOrder": 200
  },
  {
    "code": "MG02",
    "category": "Móng giả",
    "name": "Úp base",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 110000,
    "priceMax": 110000,
    "hasHardening": false,
    "sortOrder": 210
  },
  {
    "code": "MG03",
    "category": "Móng giả",
    "name": "Nối móng + đắp gel",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 220000,
    "priceMax": 220000,
    "hasHardening": false,
    "sortOrder": 220
  },
  {
    "code": "MG04",
    "category": "Móng giả",
    "name": "Fill gel",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 100000,
    "priceMax": 100000,
    "hasHardening": false,
    "sortOrder": 230
  },
  {
    "code": "CS01",
    "category": "Chăm sóc",
    "name": "Dưỡng móng",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 30000,
    "priceMax": 30000,
    "hasHardening": false,
    "sortOrder": 240
  },
  {
    "code": "CS02",
    "category": "Chăm sóc",
    "name": "Tẩy da chết, chà gót chân",
    "priceMode": "custom",
    "unit": "lần",
    "priceMin": 80000,
    "priceMax": 100000,
    "hasHardening": false,
    "sortOrder": 250
  },
  {
    "code": "CS03",
    "category": "Chăm sóc",
    "name": "Lấy khoé",
    "priceMode": "custom",
    "unit": "lần",
    "priceMin": 30000,
    "priceMax": 70000,
    "hasHardening": false,
    "sortOrder": 260
  },
  {
    "code": "MI01",
    "category": "Mi",
    "name": "Uốn mi Collagen",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 180000,
    "priceMax": 180000,
    "hasHardening": false,
    "sortOrder": 270
  },
  {
    "code": "MI02",
    "category": "Mi",
    "name": "Uốn mi phủ đen",
    "priceMode": "list",
    "unit": "lần",
    "priceMin": 220000,
    "priceMax": 220000,
    "hasHardening": false,
    "sortOrder": 280
  }
]

export const SEED_COMBOS: SeedCombo[] = [
  {
    "code": "CBO99",
    "name": "Combo móng thật 99k",
    "groupName": "Móng thật",
    "price": 99000,
    "items": [
      "CB08",
      "CB01",
      "CB02"
    ],
    "sortOrder": 10
  },
  {
    "code": "CBO139",
    "name": "Combo móng thật 139k",
    "groupName": "Móng thật",
    "price": 139000,
    "items": [
      "CB08",
      "CB01",
      "CB02",
      "CB03"
    ],
    "sortOrder": 20
  },
  {
    "code": "CBO179",
    "name": "Combo móng giả 179k",
    "groupName": "Móng giả",
    "price": 179000,
    "items": [
      "CB08",
      "CB01",
      "MG01",
      "CB02"
    ],
    "sortOrder": 30
  },
  {
    "code": "CBO199",
    "name": "Combo móng giả 199k",
    "groupName": "Móng giả",
    "price": 199000,
    "items": [
      "CB08",
      "CB01",
      "MG02",
      "CB02"
    ],
    "sortOrder": 40
  }
]
