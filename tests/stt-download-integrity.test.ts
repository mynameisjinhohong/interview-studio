import { describe, expect, it } from 'vitest'
import { validateSttModelArtifact } from '../src/main/services/stt-service.js'

describe('STT model download integrity', () => {
  it('accepts the official small model even when the Xet CDN ETag is different', () => {
    expect(() => validateSttModelArtifact(
      'small',
      487_601_967,
      '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
      'edd29d67e70b000132af65205b99bb774b77abc13d10103e14f80ce2242913e1'
    )).not.toThrow()
  })

  it('rejects truncated and corrupted artifacts against the pinned manifest', () => {
    expect(() => validateSttModelArtifact('small', 10_000, '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b'))
      .toThrow('크기가 일치하지 않습니다')
    expect(() => validateSttModelArtifact('small', 487_601_967, '0'.repeat(64)))
      .toThrow('SHA-256')
  })
})
