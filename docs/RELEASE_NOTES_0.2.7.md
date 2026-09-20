# Interview Studio 0.2.7 alpha

## Windows FFmpeg 실행 수정

- Windows 설치본에서 FFmpeg가 `app.asar.unpacked`에 포함됐지만 `app.asar` 내부 경로로 실행되어 답변 제출 시 `ENOENT`가 발생하던 문제를 수정했습니다.
- 음성 전사와 MP4 내보내기 모두 압축 해제된 실제 FFmpeg 경로를 사용합니다.
- Windows 패키징 후 `ffmpeg.exe` 포함 여부를 자동으로 검사합니다.

## 면접 전 마이크 테스트

- 장치 점검 화면에 실시간 마이크 입력 레벨을 표시합니다.
- `녹음 후 듣기`로 4초 동안 목소리를 녹음하고 즉시 재생합니다.
- 무음 또는 빈 녹음은 통과시키지 않으며 Windows 입력 장치와 음소거 상태를 확인하도록 안내합니다.
- 마이크 녹음 재생을 완료해야 면접을 시작할 수 있습니다.

## 검증

- Windows/macOS `app.asar` → `app.asar.unpacked` 실행 경로 회귀 테스트 통과
- 무음·정상 파형·빈 녹음 판정 테스트 통과
- 전체 타입 검사, 자동 테스트, 프로덕션 빌드 통과
