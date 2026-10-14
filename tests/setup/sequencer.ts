// Thứ tự file test: mặc định của vitest, riêng tests/ops/demo.test.ts chạy sau cùng vì nó xoá sạch dữ liệu nghiệp vụ
// của DB test (Xoá, bắt đầu dùng thật — S12) rồi nạp gói dữ liệu thử.
import { BaseSequencer, type TestSpecification } from 'vitest/node'

export default class LastDemoSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    const sorted = await super.sort(files)
    const isDemo = (f: TestSpecification) => f.moduleId.replace(/\\/g, '/').endsWith('tests/ops/demo.test.ts')
    return [...sorted.filter((f) => !isDemo(f)), ...sorted.filter(isDemo)]
  }
}
