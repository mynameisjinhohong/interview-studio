# Interview Studio 0.2.3 alpha

Windows 면접실에서 질문 음성 파일을 불러오지 못하던 문제를 수정한 패치 빌드입니다.

주요 변경 사항:

- `interview-media:` 프로토콜에 renderer Fetch API용 CORS 권한을 명시적으로 활성화
- 설정 화면의 음성 샘플은 정상인데 면접실에서만 `Failed to fetch`가 발생하던 문제 수정
- 실제 Electron renderer에서 커스텀 프로토콜을 `fetch()`하는 재현 테스트로 원인 확인
- 프로토콜의 Fetch·CORS 권한 회귀 테스트 추가
- 기존의 중복 음성 샘플 정지·되감기 동작 유지

코드 서명하지 않은 개인용 prerelease입니다. Windows SmartScreen 또는 macOS Gatekeeper 경고가 나타날 수 있습니다.
