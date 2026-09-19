# Interview Studio 0.2.2 alpha

Windows 면접 질문 음성 재생과 설정 화면의 샘플 재생을 수정한 패치 빌드입니다.

주요 변경 사항:

- `interview-media:` 커스텀 프로토콜을 renderer의 `connect-src`에 명시적으로 허용
- 면접 화면에서 생성된 WAV 파일을 Web Audio로 불러올 때 발생하던 `Failed to fetch` 수정
- 음성 샘플을 다시 누르면 기존 재생을 즉시 정지하고 처음으로 되감기
- TTS 생성 요청이 겹쳐도 가장 최근 클릭의 결과만 재생
- 설정 화면을 벗어날 때 재생 중인 샘플과 대기 중인 결과 정리
- CSP 및 독점 오디오 재생 회귀 테스트 추가

코드 서명하지 않은 개인용 prerelease입니다. Windows SmartScreen 또는 macOS Gatekeeper 경고가 나타날 수 있습니다.
